/*
Tankoban Max - Holy Grail Domain

Main-process bridge for the native mpv + sharedTexture pipeline.
Owns addon lifecycle, frame loop, property event forwarding, and IPC-safe wrappers.
*/

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, sharedTexture } = require('electron');
const { EVENT } = require('../../../shared/ipc');

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

// === TEMPORARY DIAGNOSTIC LOGGING ===
const _HG_LOG_PATH = path.join(require('os').tmpdir(), 'tanko_hg_diag.log');
function _hgLog(msg) {
  try { fs.appendFileSync(_HG_LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}
try { fs.writeFileSync(_HG_LOG_PATH, `=== HG Diagnostic Log Started ${new Date().toISOString()} ===\n`); } catch {}
// === END TEMPORARY ===

const DEFAULT_OBSERVED_PROPERTIES = [
  'time-pos',
  'duration',
  'pause',
  'eof-reached',
  'volume',
  'mute',
  'speed',
  'audio-delay',
  'sub-delay',
  'sub-visibility',
  'track-list',
  'chapter-list',
  'video-aspect-override',
];

const __boundOwnerWebContents = new WeakSet();

const __state = {
  addon: null,
  addonPath: '',
  initialized: false,

  frameLoopRunning: false,
  frameLoopTimer: null,

  // Build 2: decouple event polling from frame sending
  eventLoopRunning: false,
  eventLoopTimer: null,

  // Build 2: prevent overlapping sendSharedTexture() calls on the same shared texture
  frameSendInFlight: false,

  // Build 4: renderer visibility / presentation hint
  presentationActive: true,
  playbackPaused: false,
  playbackEof: false,
  forcePresentOnce: false,

  // Build 4: cache imported shared texture to avoid per-frame import/release churn
  importedSharedTexture: null,
  importedSharedTextureKey: '',
  importedSharedTextureMeta: null,
  frameSendErrorStreak: 0,

  // Build 4: main-side coalescing for hot property events
  hotPropFlushTimer: null,
  hotPropQueue: Object.create(null),
  hotPropFlushScheduled: false,
  hotPropMinIntervalMs: 33,
  lastHotPropFlushAt: 0,

  // Build 5: lifecycle hardening
  runToken: 0,
  frameLoopToken: 0,
  eventLoopToken: 0,
  isTearingDown: false,

  // Build 5: diagnostics
  diagEnabled: false,
  diagEmitTimer: null,
  diagLastEmitAt: 0,
  diag: {
    startedAt: 0,
    lastResetAt: 0,
    frameLoopTicks: 0,
    eventLoopTicks: 0,
    frameReadyFalse: 0,
    renderFrameNull: 0,
    framesProduced: 0,
    framesSent: 0,
    frameSendErrors: 0,
    frameSendSkippedHidden: 0,
    frameSendSkippedBusy: 0,
    importCacheHits: 0,
    importCacheMisses: 0,
    importCacheResets: 0,
    pollEventsCalls: 0,
    pollEventsErrors: 0,
    propertyEventsTotal: 0,
    hotPropsQueued: 0,
    hotPropsFlushed: 0,
    ownerLostCount: 0,
    teardownCount: 0,
    destroyPlayerCalls: 0,
    destroyPlayerErrors: 0,
    lastError: '',
    lastErrorAt: 0,
    lastFrameSentAt: 0,
    lastEventPollAt: 0,
  },

  ownerWebContents: null,
  ownerFrame: null,
  observedProperties: new Set(),
};

function toErrorString(err) {
  return String((err && err.message) || err || 'unknown_error');
}

function firstExisting(candidates) {
  for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return '';
}

function resolveAddonPath(ctx) {
  const appRoot = String((ctx && ctx.APP_ROOT) || process.cwd());
  const devPath = path.join(appRoot, 'native', 'holy_grail', 'build', 'Release', 'holy_grail.node');

  const packedPathPrimary = path.join(process.resourcesPath, 'native', 'holy_grail', 'holy_grail.node');
  const packedPathFallback = path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'holy_grail', 'build', 'Release', 'holy_grail.node');

  const candidates = (app && app.isPackaged)
    ? [packedPathPrimary, packedPathFallback, devPath]
    : [devPath, packedPathPrimary, packedPathFallback];
  return firstExisting(candidates);
}

function resolveMpvDllPath(ctx) {
  const appRoot = String((ctx && ctx.APP_ROOT) || process.cwd());
  return firstExisting([
    path.join(appRoot, 'resources', 'mpv', 'windows', 'libmpv-2.dll'),
    path.join(process.resourcesPath, 'mpv', 'windows', 'libmpv-2.dll'),
  ]);
}

function resolveElectronDistDir() {
  try {
    const electronEntry = require.resolve('electron/index.js');
    const electronDir = path.dirname(electronEntry);
    return path.join(electronDir, 'dist');
  } catch {
    return '';
  }
}

function resolveAngleDlls() {
  const execDir = path.dirname(process.execPath);
  const electronDist = resolveElectronDistDir();

  const eglPath = firstExisting([
    path.join(execDir, 'libEGL.dll'),
    electronDist ? path.join(electronDist, 'libEGL.dll') : '',
  ]);

  const glesPath = firstExisting([
    path.join(execDir, 'libGLESv2.dll'),
    electronDist ? path.join(electronDist, 'libGLESv2.dll') : '',
  ]);

  return { eglPath, glesPath };
}

function isLiveWebContents(wc) {
  try {
    return !!(wc && !wc.isDestroyed());
  } catch {
    return false;
  }
}

function isLiveFrame(frame) {
  try {
    return !!(frame && !frame.isDestroyed());
  } catch {
    return false;
  }
}

function setOwnerFromEvent(ctx, evt) {
  let wc = null;
  let frame = null;

  try { wc = evt && evt.sender ? evt.sender : null; } catch {}
  try { frame = evt && evt.senderFrame ? evt.senderFrame : null; } catch {}

  if (!isLiveWebContents(wc)) {
    try { wc = ctx && ctx.win ? ctx.win.webContents : null; } catch {}
  }
  if (!isLiveFrame(frame) && isLiveWebContents(wc)) {
    try { frame = wc.mainFrame; } catch {}
  }

  if (isLiveWebContents(wc)) __state.ownerWebContents = wc;
  if (isLiveFrame(frame)) __state.ownerFrame = frame;
  if (isLiveWebContents(wc) && !__boundOwnerWebContents.has(wc)) {
    __boundOwnerWebContents.add(wc);
    try {
      wc.once('destroyed', () => {
        teardownPlayerOnly();
        __state.ownerWebContents = null;
        __state.ownerFrame = null;
      });
    } catch {}
  }
}

function ensureLiveOwner(ctx) {
  if (!isLiveWebContents(__state.ownerWebContents)) {
    try { __state.ownerWebContents = ctx && ctx.win ? ctx.win.webContents : null; } catch { __state.ownerWebContents = null; }
  }
  if (!isLiveFrame(__state.ownerFrame) && isLiveWebContents(__state.ownerWebContents)) {
    try { __state.ownerFrame = __state.ownerWebContents.mainFrame; } catch { __state.ownerFrame = null; }
  }
  return isLiveWebContents(__state.ownerWebContents) && isLiveFrame(__state.ownerFrame);
}

function emitToOwner(channel, payload) {
  if (!isLiveWebContents(__state.ownerWebContents)) return;
  try {
    __state.ownerWebContents.send(channel, payload);
  } catch {}
}

// Build 4: hot-property coalescing (time-pos, duration → batch at 33ms)
const HOT_PROPERTIES = new Set(['time-pos', 'duration']);

function emitHotPropertyChangeNow(name, value) {
  emitToOwner(EVENT.HG_PROPERTY_CHANGE, { name: String(name), value: value });
}

function flushHotPropertyChanges() {
  __state.hotPropFlushScheduled = false;
  __state.hotPropFlushTimer = null;
  const queue = __state.hotPropQueue;
  const keys = Object.keys(queue);
  if (!keys.length) return;
  __state.lastHotPropFlushAt = Date.now();
  for (const key of keys) {
    emitHotPropertyChangeNow(key, queue[key]);
  }
  __state.hotPropQueue = Object.create(null);
  diagBump('hotPropsFlushed', keys.length);
}

function scheduleHotPropertyFlush() {
  if (__state.hotPropFlushScheduled) return;
  __state.hotPropFlushScheduled = true;
  const now = Date.now();
  const elapsed = now - __state.lastHotPropFlushAt;
  const delay = Math.max(0, __state.hotPropMinIntervalMs - elapsed);
  __state.hotPropFlushTimer = setTimeout(flushHotPropertyChanges, delay);
}

function queueHotPropertyChange(name, value) {
  __state.hotPropQueue[name] = value;
  diagBump('hotPropsQueued');
  scheduleHotPropertyFlush();
}

function normalizeState(rawState) {
  const s = (rawState && typeof rawState === 'object') ? rawState : {};
  return {
    timePos: Number(s.timePos) || 0,
    duration: Number(s.duration) || 0,
    paused: !!s.paused,
    eofReached: !!s.eofReached,
    volume: Number.isFinite(Number(s.volume)) ? Number(s.volume) : 100,
    muted: !!s.muted,
    speed: Number.isFinite(Number(s.speed)) ? Number(s.speed) : 1,
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
  };
}

function clearFrameLoopTimer() {
  if (!__state.frameLoopTimer) return;
  try { clearTimeout(__state.frameLoopTimer); } catch {}
  __state.frameLoopTimer = null;
}

function clearEventLoopTimer() {
  if (!__state.eventLoopTimer) return;
  try { clearTimeout(__state.eventLoopTimer); } catch {}
  __state.eventLoopTimer = null;
}

// Build 4: hot-property flush timer
function clearHotPropFlushTimer() {
  if (!__state.hotPropFlushTimer) return;
  try { clearTimeout(__state.hotPropFlushTimer); } catch {}
  __state.hotPropFlushTimer = null;
  __state.hotPropFlushScheduled = false;
}

function resetHotPropQueue() {
  __state.hotPropQueue = Object.create(null);
  clearHotPropFlushTimer();
  __state.lastHotPropFlushAt = 0;
}

// Build 4: imported shared texture cache
function makeImportedTextureKey(handleBuf, width, height) {
  let handleKey = '';
  try {
    if (Buffer.isBuffer(handleBuf)) {
      handleKey = handleBuf.toString('hex');
    } else if (handleBuf && typeof handleBuf === 'object' && typeof handleBuf.byteLength === 'number') {
      handleKey = Buffer.from(handleBuf).toString('hex');
    } else {
      handleKey = String(handleBuf || '');
    }
  } catch {
    handleKey = '';
  }
  return String(width) + 'x' + String(height) + ':' + handleKey;
}

function releaseImportedSharedTextureCache() {
  if (__state.importedSharedTexture) {
    try { __state.importedSharedTexture.release(); } catch {}
  }
  __state.importedSharedTexture = null;
  __state.importedSharedTextureKey = '';
  __state.importedSharedTextureMeta = null;
}

function getFrameSendErrorDelayMs() {
  const n = Number(__state.frameSendErrorStreak) || 0;
  if (!__state.presentationActive) return 100;
  if (n <= 0) return getActiveFrameLoopDelayMs();
  if (n === 1) return 16;
  if (n === 2) return 33;
  if (n === 3) return 66;
  return 100;
}

// Build 5: diagnostics helpers
function resetDiagnostics() {
  const now = Date.now();
  const d = __state.diag;
  d.startedAt = d.startedAt || now;
  d.lastResetAt = now;
  d.frameLoopTicks = 0;
  d.eventLoopTicks = 0;
  d.frameReadyFalse = 0;
  d.renderFrameNull = 0;
  d.framesProduced = 0;
  d.framesSent = 0;
  d.frameSendErrors = 0;
  d.frameSendSkippedHidden = 0;
  d.frameSendSkippedBusy = 0;
  d.importCacheHits = 0;
  d.importCacheMisses = 0;
  d.importCacheResets = 0;
  d.pollEventsCalls = 0;
  d.pollEventsErrors = 0;
  d.propertyEventsTotal = 0;
  d.hotPropsQueued = 0;
  d.hotPropsFlushed = 0;
  d.ownerLostCount = 0;
  d.teardownCount = 0;
  d.destroyPlayerCalls = 0;
  d.destroyPlayerErrors = 0;
  d.lastError = '';
  d.lastErrorAt = 0;
  d.lastFrameSentAt = 0;
  d.lastEventPollAt = 0;
}

function diagBump(field, delta) {
  if (!__state.diagEnabled) return;
  if (typeof __state.diag[field] === 'number') __state.diag[field] += (delta || 1);
}

function diagError(msg) {
  if (!__state.diagEnabled) return;
  __state.diag.lastError = String(msg || '').slice(0, 200);
  __state.diag.lastErrorAt = Date.now();
}

function getDiagnosticsSnapshot() {
  return Object.assign({
    frameLoopRunning: __state.frameLoopRunning,
    eventLoopRunning: __state.eventLoopRunning,
    frameSendInFlight: __state.frameSendInFlight,
    presentationActive: __state.presentationActive,
    initialized: __state.initialized,
    runToken: __state.runToken,
    frameLoopToken: __state.frameLoopToken,
    eventLoopToken: __state.eventLoopToken,
    isTearingDown: __state.isTearingDown,
  }, __state.diag);
}

// Build 5: diagnostics emit timer
function clearDiagEmitTimer() {
  if (!__state.diagEmitTimer) return;
  try { clearTimeout(__state.diagEmitTimer); } catch {}
  __state.diagEmitTimer = null;
}

function scheduleDiagEmit() {
  if (!__state.diagEnabled) return;
  clearDiagEmitTimer();
  __state.diagEmitTimer = setTimeout(() => {
    if (!__state.diagEnabled) return;
    __state.diagLastEmitAt = Date.now();
    emitToOwner(EVENT.HG_DIAGNOSTICS, getDiagnosticsSnapshot());
    scheduleDiagEmit();
  }, 1000);
}

// Build 5: lifecycle token helpers
function nextRunToken() {
  __state.runToken = (__state.runToken + 1) | 0;
  return __state.runToken;
}

function isLiveToken(token) {
  return token === __state.runToken && !__state.isTearingDown;
}

// Build 5: hardened teardown entry point
function beginTeardown() {
  if (__state.isTearingDown) return;
  __state.isTearingDown = true;
  diagBump('teardownCount');

  // Invalidate all loop tokens so stale callbacks exit immediately
  __state.frameLoopToken = (__state.frameLoopToken + 1) | 0;
  __state.eventLoopToken = (__state.eventLoopToken + 1) | 0;

  stopFrameLoopInternal();
  clearDiagEmitTimer();
  // Flush any pending hot props before teardown
  try { flushHotPropertyChanges(); } catch {}
  resetHotPropQueue();
}

function stopFrameLoopInternal() {
  __state.frameLoopRunning = false;
  __state.eventLoopRunning = false;
  __state.frameSendInFlight = false;
  clearFrameLoopTimer();
  clearEventLoopTimer();
  clearHotPropFlushTimer();
  releaseImportedSharedTextureCache();
  __state.frameSendErrorStreak = 0;
}

function loadAddonOrThrow(ctx) {
  if (__state.addon) { _hgLog('loadAddonOrThrow: already loaded'); return __state.addon; }
  const addonPath = resolveAddonPath(ctx);
  _hgLog(`loadAddonOrThrow: addonPath=${addonPath || 'NOT FOUND'}`);
  if (!addonPath) throw new Error('holy_grail.node not found');
  __state.addonPath = addonPath;
  try {
    __state.addon = require(addonPath);
    _hgLog(`loadAddonOrThrow: SUCCESS, addon keys=${Object.keys(__state.addon).join(',')}`);
  } catch (loadErr) {
    _hgLog(`loadAddonOrThrow: REQUIRE FAILED: ${loadErr.message}`);
    throw loadErr;
  }
  return __state.addon;
}

async function observeDefaults() {
  if (!__state.addon || typeof __state.addon.observeProperty !== 'function') return;
  for (const propName of DEFAULT_OBSERVED_PROPERTIES) {
    if (__state.observedProperties.has(propName)) continue;
    try {
      __state.addon.observeProperty(propName);
      __state.observedProperties.add(propName);
    } catch {}
  }
}

function handleAddonEvents(events) {
  const list = Array.isArray(events) ? events : [];
  for (const eventItem of list) {
    const eventName = String((eventItem && eventItem.event) || '');
    if (eventName === 'property-change') {
      const propName = eventItem && eventItem.name ? String(eventItem.name) : '';
      const propValue = eventItem ? eventItem.value : undefined;
      diagBump('propertyEventsTotal');

      // Build 4: track playback state for adaptive pacing
      if (propName === 'pause') __state.playbackPaused = !!propValue;
      if (propName === 'eof-reached') __state.playbackEof = !!propValue;

      // Build 4: coalesce hot properties, emit others immediately
      if (HOT_PROPERTIES.has(propName)) {
        queueHotPropertyChange(propName, propValue);
      } else {
        emitToOwner(EVENT.HG_PROPERTY_CHANGE, { name: propName, value: propValue });
      }
      continue;
    }
    if (eventName === 'file-loaded') {
      releaseImportedSharedTextureCache();
      __state.frameSendErrorStreak = 0;
      __state.playbackEof = false;
      emitToOwner(EVENT.HG_FILE_LOADED, { ok: true });
      continue;
    }
    if (eventName === 'end-file') {
      releaseImportedSharedTextureCache();
      __state.frameSendErrorStreak = 0;
      emitToOwner(EVENT.HG_EOF, { ok: true });
      continue;
    }
    if (eventName === 'shutdown') continue;
  }
}

// Build 4: adaptive pacing helpers
function getNextEventLoopDelayMs() {
  if (!__state.presentationActive) return 100;
  if (__state.playbackPaused && __state.playbackEof) return 100;
  if (__state.playbackPaused) return 66;
  // Slightly slower poll rate reduces main-process timer churn while playback is active.
  return 16;
}

function getIdleFrameLoopDelayMs() {
  if (!__state.presentationActive) return 100;
  if (__state.playbackPaused && __state.playbackEof) return 100;
  if (__state.playbackPaused) return 32;
  return 8;
}

function getActiveFrameLoopDelayMs() {
  if (!__state.presentationActive) return 100;
  if (__state.playbackPaused && __state.playbackEof) return 100;
  if (__state.playbackPaused) return 16;
  // 3ms keeps the loop responsive without hammering 1ms timers continuously.
  return 3;
}

// Build 4: imported shared texture reuse
function getOrCreateImportedSharedTexture(handleBuf, width, height) {
  const key = makeImportedTextureKey(handleBuf, width, height);

  if (__state.importedSharedTexture && __state.importedSharedTextureKey === key) {
    diagBump('importCacheHits');
    return __state.importedSharedTexture;
  }

  // Release previous cached import
  if (__state.importedSharedTexture) {
    diagBump('importCacheResets');
    try { __state.importedSharedTexture.release(); } catch {}
    __state.importedSharedTexture = null;
  }

  diagBump('importCacheMisses');

  const imported = sharedTexture.importSharedTexture({
    textureInfo: {
      pixelFormat: 'bgra',
      codedSize: { width, height },
      visibleRect: { x: 0, y: 0, width, height },
      handle: { ntHandle: handleBuf },
    },
    allReferencesReleased: () => {},
  });

  __state.importedSharedTexture = imported;
  __state.importedSharedTextureKey = key;
  __state.importedSharedTextureMeta = { width, height };

  return imported;
}

// Build 5: token-aware scheduling
function scheduleNextFrameLoop(ctx, delayMs, token) {
  if (!__state.frameLoopRunning) return;
  if (token !== undefined && token !== __state.frameLoopToken) return;
  clearFrameLoopTimer();
  const capturedToken = __state.frameLoopToken;
  __state.frameLoopTimer = setTimeout(() => {
    void frameLoopTick(ctx, capturedToken);
  }, Math.max(0, Number(delayMs) || 0));
}

function scheduleNextEventLoop(ctx, delayMs, token) {
  if (!__state.eventLoopRunning) return;
  if (token !== undefined && token !== __state.eventLoopToken) return;
  clearEventLoopTimer();
  const capturedToken = __state.eventLoopToken;
  __state.eventLoopTimer = setTimeout(() => {
    void eventLoopTick(ctx, capturedToken);
  }, Math.max(4, Number(delayMs) || 16));
}

async function eventLoopTick(ctx, token) {
  if (!__state.eventLoopRunning) return;
  if (token !== __state.eventLoopToken) return;

  diagBump('eventLoopTicks');

  try {
    if (!__state.addon || !__state.initialized) {
      stopFrameLoopInternal();
      return;
    }

    if (!ensureLiveOwner(ctx)) {
      diagBump('ownerLostCount');
      stopFrameLoopInternal();
      try { __state.addon.destroyPlayer && __state.addon.destroyPlayer(); } catch {}
      __state.initialized = false;
      __state.observedProperties.clear();
      return;
    }

    if (typeof __state.addon.pollEvents === 'function') {
      diagBump('pollEventsCalls');
      if (__state.diagEnabled) __state.diag.lastEventPollAt = Date.now();
      const events = __state.addon.pollEvents();
      handleAddonEvents(events);
    }
  } catch (err) {
    diagBump('pollEventsErrors');
    diagError(toErrorString(err));
    emitToOwner(EVENT.HG_PROPERTY_CHANGE, {
      name: '__error__',
      value: toErrorString(err),
    });
  }

  // Build 4: adaptive event polling delay
  scheduleNextEventLoop(ctx, getNextEventLoopDelayMs(), token);
}

async function frameLoopTick(ctx, token) {
  if (!__state.frameLoopRunning) return;
  if (token !== __state.frameLoopToken) return;

  diagBump('frameLoopTicks');
  if (__state.diag && (__state.diag.frameLoopTicks <= 5 || __state.diag.frameLoopTicks % 500 === 0)) {
    _hgLog(`frameLoopTick #${__state.diag.frameLoopTicks}: addon=${!!__state.addon} init=${__state.initialized} presentActive=${__state.presentationActive} inFlight=${__state.frameSendInFlight} produced=${__state.diag.framesProduced || 0} sent=${__state.diag.framesSent || 0} renderNull=${__state.diag.renderFrameNull || 0} readyFalse=${__state.diag.frameReadyFalse || 0}`);
  }

  try {
    if (!__state.addon || !__state.initialized) {
      _hgLog('frameLoopTick: STOPPED - addon or init missing');
      stopFrameLoopInternal();
      return;
    }

    if (!ensureLiveOwner(ctx)) {
      diagBump('ownerLostCount');
      stopFrameLoopInternal();
      try { __state.addon.destroyPlayer && __state.addon.destroyPlayer(); } catch {}
      __state.initialized = false;
      __state.observedProperties.clear();
      return;
    }

    // Build 4: skip frame production when renderer is hidden (unless force-once)
    if (!__state.presentationActive && !__state.forcePresentOnce) {
      diagBump('frameSendSkippedHidden');
      scheduleNextFrameLoop(ctx, 100, token);
      return;
    }
    if (__state.forcePresentOnce) __state.forcePresentOnce = false;

    // Build 2: do not overlap sends on the same shared texture handle.
    if (__state.frameSendInFlight) {
      diagBump('frameSendSkippedBusy');
      scheduleNextFrameLoop(ctx, 8, token);
      return;
    }

    // Build 2: cheap native atomic peek to avoid unnecessary renderFrame() calls.
    if (__state.addon && typeof __state.addon.hasFrameReady === 'function') {
      let ready = false;
      try { ready = !!__state.addon.hasFrameReady(); } catch {}
      if (!ready) {
        diagBump('frameReadyFalse');
        scheduleNextFrameLoop(ctx, getIdleFrameLoopDelayMs(), token);
        return;
      }
    }

    const handleBuf = (__state.addon.renderFrame && __state.addon.renderFrame()) || null;

    if (!handleBuf) {
      diagBump('renderFrameNull');
      scheduleNextFrameLoop(ctx, getIdleFrameLoopDelayMs(), token);
      return;
    }

    diagBump('framesProduced');
    if (__state.diag && __state.diag.framesProduced <= 3) {
      _hgLog(`frameLoopTick: frame PRODUCED (#${__state.diag.framesProduced}), sharedTex=${!!sharedTexture}, liveFrame=${isLiveFrame(__state.ownerFrame)}`);
    }

    if (sharedTexture && isLiveFrame(__state.ownerFrame)) {
      const size = (__state.addon.getSize && __state.addon.getSize()) || {};
      const width = Number(size.width) || 0;
      const height = Number(size.height) || 0;

      if (width > 0 && height > 0) {
        // Build 4: reuse cached imported shared texture
        const imported = getOrCreateImportedSharedTexture(handleBuf, width, height);

        __state.frameSendInFlight = true;
        let sendFailed = false;
        try {
          await sharedTexture.sendSharedTexture({
            frame: __state.ownerFrame,
            importedSharedTexture: imported,
          });
          diagBump('framesSent');
          __state.frameSendErrorStreak = 0;
          if (__state.diagEnabled) __state.diag.lastFrameSentAt = Date.now();
        } catch (err) {
          sendFailed = true;
          __state.frameSendErrorStreak += 1;
          diagBump('frameSendErrors');
          diagError(toErrorString(err));
          // Cache may be stale — release so next tick re-imports
          releaseImportedSharedTextureCache();
        } finally {
          __state.frameSendInFlight = false;
          // NOTE: Do NOT release imported here — it's cached for reuse
        }

        scheduleNextFrameLoop(ctx, sendFailed ? getFrameSendErrorDelayMs() : getActiveFrameLoopDelayMs(), token);
        return;
      }
    }

    // Shared texture unavailable or invalid size → retry with adaptive backoff.
    scheduleNextFrameLoop(ctx, getIdleFrameLoopDelayMs(), token);
    return;
  } catch (err) {
    diagBump('frameSendErrors');
    diagError(toErrorString(err));
    emitToOwner(EVENT.HG_PROPERTY_CHANGE, {
      name: '__error__',
      value: toErrorString(err),
    });
  }

  // Error path backoff
  scheduleNextFrameLoop(ctx, 16, token);
}

function teardownPlayerOnly() {
  beginTeardown();
  diagBump('destroyPlayerCalls');
  if (__state.addon) {
    try {
      if (typeof __state.addon.destroyPlayer === 'function') __state.addon.destroyPlayer();
      else if (typeof __state.addon.destroy === 'function') __state.addon.destroy();
    } catch (err) {
      diagBump('destroyPlayerErrors');
      diagError(toErrorString(err));
    }
  }
  __state.initialized = false;
  __state.observedProperties.clear();
  __state.isTearingDown = false;
}

function teardownEverything() {
  beginTeardown();
  if (__state.addon) {
    try {
      if (typeof __state.addon.destroyAll === 'function') __state.addon.destroyAll();
      else if (typeof __state.addon.destroy === 'function') __state.addon.destroy();
    } catch {}
  }
  __state.initialized = false;
  __state.observedProperties.clear();
  __state.isTearingDown = false;
}

async function probe(ctx, evt) {
  try {
    setOwnerFromEvent(ctx, evt);

    const addonPath = resolveAddonPath(ctx);
    const mpvPath = resolveMpvDllPath(ctx);
    const { eglPath, glesPath } = resolveAngleDlls();
    const hasSharedTexture = !!sharedTexture;
    const ok = !!(addonPath && mpvPath && eglPath && glesPath && hasSharedTexture);

    _hgLog(`probe: ok=${ok} addon=${!!addonPath} mpv=${!!mpvPath} egl=${!!eglPath} gles=${!!glesPath} sharedTex=${hasSharedTexture}`);
    _hgLog(`probe paths: addon=${addonPath} mpv=${mpvPath} egl=${eglPath} gles=${glesPath}`);

    return {
      ok,
      addonPath,
      mpvPath,
      eglPath,
      glesPath,
      sharedTexture: hasSharedTexture,
      error: ok ? '' : 'missing_required_component',
    };
  } catch (err) {
    _hgLog(`probe: EXCEPTION: ${toErrorString(err)}`);
    return {
      ok: false,
      error: toErrorString(err),
    };
  }
}

async function initGpu(ctx, evt, args) {
  try {
    setOwnerFromEvent(ctx, evt);
    const addon = loadAddonOrThrow(ctx);
    const a = (args && typeof args === 'object') ? args : {};
    const width = Number.isFinite(Number(a.width)) ? Math.max(16, Number(a.width)) : DEFAULT_WIDTH;
    const height = Number.isFinite(Number(a.height)) ? Math.max(16, Number(a.height)) : DEFAULT_HEIGHT;

    const mpvPath = resolveMpvDllPath(ctx);
    if (!mpvPath) throw new Error('libmpv-2.dll not found');

    const { eglPath, glesPath } = resolveAngleDlls();
    if (!eglPath) throw new Error('libEGL.dll not found');
    if (!glesPath) throw new Error('libGLESv2.dll not found');

    _hgLog(`initGpu: calling addon.initGpu w=${width} h=${height} mpv=${mpvPath} egl=${eglPath} gles=${glesPath}`);
    addon.initGpu({
      mpvPath,
      eglPath,
      glesPath,
      width,
      height,
    });
    _hgLog('initGpu: SUCCESS');

    __state.initialized = true;

    // Build 4+5: reset transport/lifecycle state on init
    __state.presentationActive = true;
    __state.playbackPaused = false;
    __state.playbackEof = false;
    __state.forcePresentOnce = false;
    __state.isTearingDown = false;
    releaseImportedSharedTextureCache();
    __state.frameSendErrorStreak = 0;
    resetHotPropQueue();

    await observeDefaults();

    return {
      ok: true,
      width,
      height,
      addonPath: __state.addonPath,
    };
  } catch (err) {
    return { ok: false, error: toErrorString(err) };
  }
}

async function loadFile(ctx, evt, filePath) {
  try {
    setOwnerFromEvent(ctx, evt);
    const addon = loadAddonOrThrow(ctx);
    if (!__state.initialized) { _hgLog('loadFile: NOT INITIALIZED'); return { ok: false, error: 'not_initialized' }; }
    const target = String(filePath || '');
    if (!target) { _hgLog('loadFile: MISSING FILE PATH'); return { ok: false, error: 'missing_file_path' }; }
    releaseImportedSharedTextureCache();
    __state.frameSendErrorStreak = 0;
    _hgLog(`loadFile: loading "${target}"`);
    addon.loadFile(target);
    _hgLog('loadFile: SUCCESS');
    return { ok: true };
  } catch (err) {
    _hgLog(`loadFile: EXCEPTION: ${toErrorString(err)}`);
    return { ok: false, error: toErrorString(err) };
  }
}

async function resizeSurface(ctx, evt, args) {
  try {
    setOwnerFromEvent(ctx, evt);
    if (!__state.addon || !__state.initialized) return { ok: false, error: 'not_initialized' };
    if (typeof __state.addon.resizeSurface !== 'function') return { ok: false, error: 'resize_not_supported' };

    const a = (args && typeof args === 'object') ? args : {};
    const width = Number.isFinite(Number(a.width)) ? Math.max(16, Number(a.width)) : 0;
    const height = Number.isFinite(Number(a.height)) ? Math.max(16, Number(a.height)) : 0;
    if (!width || !height) return { ok: false, error: 'invalid_size' };

    const res = __state.addon.resizeSurface({ width, height });
    if (res && typeof res === 'object') return res;
    return { ok: !!res, width, height };
  } catch (err) {
    return { ok: false, error: toErrorString(err) };
  }
}

async function startFrameLoop(ctx, evt) {
  try {
    setOwnerFromEvent(ctx, evt);
    if (!__state.addon || !__state.initialized) return { ok: false, error: 'not_initialized' };

    if (__state.frameLoopRunning && __state.eventLoopRunning) {
      return { ok: true, alreadyRunning: true };
    }

    // Build 5: fresh tokens for this run
    __state.frameLoopToken = (__state.frameLoopToken + 1) | 0;
    __state.eventLoopToken = (__state.eventLoopToken + 1) | 0;
    __state.isTearingDown = false;

    __state.frameLoopRunning = true;
    __state.eventLoopRunning = true;
    __state.frameSendInFlight = false;

    // Build 5: reset diagnostics on start
    if (__state.diagEnabled) {
      resetDiagnostics();
      __state.diag.startedAt = Date.now();
    }

    const frameToken = __state.frameLoopToken;
    const eventToken = __state.eventLoopToken;
    _hgLog('startFrameLoop: starting frame + event loops');
    void frameLoopTick(ctx, frameToken);
    void eventLoopTick(ctx, eventToken);

    return { ok: true };
  } catch (err) {
    _hgLog(`startFrameLoop: EXCEPTION: ${toErrorString(err)}`);
    return { ok: false, error: toErrorString(err) };
  }
}

async function stopFrameLoop(ctx, evt) {
  if (ctx && evt) setOwnerFromEvent(ctx, evt);
  stopFrameLoopInternal();
  return { ok: true };
}

async function command(ctx, evt, args) {
  try {
    setOwnerFromEvent(ctx, evt);
    if (!__state.addon || !__state.initialized) return { ok: false, error: 'not_initialized' };
    const list = Array.isArray(args) ? args.map((x) => String(x)) : [];
    if (!list.length) return { ok: false, error: 'missing_command' };
    __state.addon.command(list);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toErrorString(err) };
  }
}

async function getProperty(ctx, evt, name) {
  try {
    setOwnerFromEvent(ctx, evt);
    if (!__state.addon || !__state.initialized) return { ok: false, error: 'not_initialized' };
    const propName = String(name || '');
    if (!propName) return { ok: false, error: 'missing_property_name' };
    const value = __state.addon.getProperty(propName);
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: toErrorString(err) };
  }
}

async function setProperty(ctx, evt, name, value) {
  try {
    setOwnerFromEvent(ctx, evt);
    if (!__state.addon || !__state.initialized) return { ok: false, error: 'not_initialized' };
    const propName = String(name || '');
    if (!propName) return { ok: false, error: 'missing_property_name' };
    __state.addon.setProperty(propName, String(value == null ? '' : value));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toErrorString(err) };
  }
}

async function getState(ctx, evt) {
  try {
    setOwnerFromEvent(ctx, evt);
    if (!__state.addon || !__state.initialized) return { ok: false, error: 'not_initialized', state: null };
    const state = normalizeState(__state.addon.getState && __state.addon.getState());
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: toErrorString(err), state: null };
  }
}

async function getTrackList(ctx, evt) {
  try {
    setOwnerFromEvent(ctx, evt);
    if (!__state.addon || !__state.initialized) return { ok: false, error: 'not_initialized', tracks: [] };
    let tracks = [];
    if (typeof __state.addon.getPropertyNode === 'function') {
      const result = __state.addon.getPropertyNode('track-list');
      if (Array.isArray(result)) tracks = result;
    }
    return { ok: true, tracks };
  } catch (err) {
    return { ok: false, error: toErrorString(err), tracks: [] };
  }
}

async function observeProperty(ctx, evt, name) {
  try {
    setOwnerFromEvent(ctx, evt);
    if (!__state.addon || !__state.initialized) return { ok: false, error: 'not_initialized' };
    const propName = String(name || '');
    if (!propName) return { ok: false, error: 'missing_property_name' };

    // Build 1: idempotent observe to avoid duplicate mpv subscriptions
    // (main default observers + renderer observers can overlap).
    if (__state.observedProperties.has(propName)) {
      return { ok: true, id: null, alreadyObserved: true };
    }

    const id = __state.addon.observeProperty(propName);
    __state.observedProperties.add(propName);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: toErrorString(err) };
  }
}

// Build 4: presentation visibility hint from renderer
async function setPresentationActive(ctx, evt, active) {
  setOwnerFromEvent(ctx, evt);
  const wasActive = __state.presentationActive;
  __state.presentationActive = !!active;

  // When becoming active again, force one frame send so the renderer gets a fresh frame
  if (!wasActive && __state.presentationActive) {
    __state.forcePresentOnce = true;
  }

  // When becoming inactive, release cached texture to free GPU memory
  if (wasActive && !__state.presentationActive) {
    releaseImportedSharedTextureCache();
  }

  return { ok: true, presentationActive: __state.presentationActive };
}

// Build 5: diagnostics IPC methods
async function getDiagnostics(ctx, evt) {
  setOwnerFromEvent(ctx, evt);
  return { ok: true, diagnostics: getDiagnosticsSnapshot() };
}

async function setDiagnosticsEnabled(ctx, evt, enabled) {
  setOwnerFromEvent(ctx, evt);
  const wasEnabled = __state.diagEnabled;
  __state.diagEnabled = !!enabled;

  if (!wasEnabled && __state.diagEnabled) {
    resetDiagnostics();
    __state.diag.startedAt = Date.now();
    scheduleDiagEmit();
  }
  if (wasEnabled && !__state.diagEnabled) {
    clearDiagEmitTimer();
  }

  return { ok: true, diagEnabled: __state.diagEnabled };
}

async function resetDiagnosticsCommand(ctx, evt) {
  setOwnerFromEvent(ctx, evt);
  resetDiagnostics();
  return { ok: true };
}

async function destroy(_ctx, _evt) {
  teardownPlayerOnly();
  return { ok: true };
}

async function destroyAll(_ctx, _evt) {
  teardownEverything();
  return { ok: true };
}

module.exports = {
  probe,
  initGpu,
  resizeSurface,
  loadFile,
  startFrameLoop,
  stopFrameLoop,
  command,
  getProperty,
  setProperty,
  getState,
  getTrackList,
  observeProperty,
  destroy,
  destroyAll,
  setPresentationActive,
  getDiagnostics,
  setDiagnosticsEnabled,
  resetDiagnostics: resetDiagnosticsCommand,
};
