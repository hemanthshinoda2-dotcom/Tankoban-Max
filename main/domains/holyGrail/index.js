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

function stopFrameLoopInternal() {
  __state.frameLoopRunning = false;
  __state.eventLoopRunning = false;
  __state.frameSendInFlight = false;
  clearFrameLoopTimer();
  clearEventLoopTimer();
}

function loadAddonOrThrow(ctx) {
  if (__state.addon) return __state.addon;
  const addonPath = resolveAddonPath(ctx);
  if (!addonPath) throw new Error('holy_grail.node not found');
  __state.addonPath = addonPath;
  __state.addon = require(addonPath);
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
      emitToOwner(EVENT.HG_PROPERTY_CHANGE, {
        name: eventItem && eventItem.name ? String(eventItem.name) : '',
        value: eventItem ? eventItem.value : undefined,
      });
      continue;
    }
    if (eventName === 'file-loaded') {
      emitToOwner(EVENT.HG_FILE_LOADED, { ok: true });
      continue;
    }
    if (eventName === 'end-file') {
      emitToOwner(EVENT.HG_EOF, { ok: true });
      continue;
    }
    if (eventName === 'shutdown') continue;
  }
}

function scheduleNextFrameLoop(ctx, delayMs) {
  if (!__state.frameLoopRunning) return;
  clearFrameLoopTimer();
  __state.frameLoopTimer = setTimeout(() => {
    void frameLoopTick(ctx);
  }, Math.max(0, Number(delayMs) || 0));
}

function scheduleNextEventLoop(ctx, delayMs) {
  if (!__state.eventLoopRunning) return;
  clearEventLoopTimer();
  __state.eventLoopTimer = setTimeout(() => {
    void eventLoopTick(ctx);
  }, Math.max(4, Number(delayMs) || 16));
}

async function eventLoopTick(ctx) {
  if (!__state.eventLoopRunning) return;

  try {
    if (!__state.addon || !__state.initialized) {
      stopFrameLoopInternal();
      return;
    }

    if (!ensureLiveOwner(ctx)) {
      stopFrameLoopInternal();
      try { __state.addon.destroyPlayer && __state.addon.destroyPlayer(); } catch {}
      __state.initialized = false;
      __state.observedProperties.clear();
      return;
    }

    if (typeof __state.addon.pollEvents === 'function') {
      const events = __state.addon.pollEvents();
      handleAddonEvents(events);
    }
  } catch (err) {
    emitToOwner(EVENT.HG_PROPERTY_CHANGE, {
      name: '__error__',
      value: toErrorString(err),
    });
  }

  // Build 2: event polling stays responsive even if frame sending stalls.
  scheduleNextEventLoop(ctx, 12);
}

async function frameLoopTick(ctx) {
  if (!__state.frameLoopRunning) return;

  try {
    if (!__state.addon || !__state.initialized) {
      stopFrameLoopInternal();
      return;
    }

    if (!ensureLiveOwner(ctx)) {
      stopFrameLoopInternal();
      try { __state.addon.destroyPlayer && __state.addon.destroyPlayer(); } catch {}
      __state.initialized = false;
      __state.observedProperties.clear();
      return;
    }

    // Build 2: do not overlap sends on the same shared texture handle.
    // If a send is still in flight, retry soon but don't hammer.
    if (__state.frameSendInFlight) {
      scheduleNextFrameLoop(ctx, 2);
      return;
    }

    // Build 2: cheap native atomic peek to avoid unnecessary renderFrame() calls.
    if (__state.addon && typeof __state.addon.hasFrameReady === 'function') {
      let ready = false;
      try { ready = !!__state.addon.hasFrameReady(); } catch {}
      if (!ready) {
        // Back off when idle (no frame pending)
        scheduleNextFrameLoop(ctx, 8);
        return;
      }
    }

    const handleBuf = (__state.addon.renderFrame && __state.addon.renderFrame()) || null;

    if (!handleBuf) {
      // No frame was actually produced (race or no update flag). Back off a bit.
      scheduleNextFrameLoop(ctx, 8);
      return;
    }

    if (sharedTexture && isLiveFrame(__state.ownerFrame)) {
      const size = (__state.addon.getSize && __state.addon.getSize()) || {};
      const width = Number(size.width) || 0;
      const height = Number(size.height) || 0;

      if (width > 0 && height > 0) {
        const imported = sharedTexture.importSharedTexture({
          textureInfo: {
            pixelFormat: 'bgra',
            codedSize: { width, height },
            visibleRect: { x: 0, y: 0, width, height },
            handle: { ntHandle: handleBuf },
          },
          allReferencesReleased: () => {},
        });

        __state.frameSendInFlight = true;
        try {
          await sharedTexture.sendSharedTexture({
            frame: __state.ownerFrame,
            importedSharedTexture: imported,
          });
        } finally {
          __state.frameSendInFlight = false;
          try { imported.release(); } catch {}
        }

        // If we just delivered a frame, run again quickly.
        scheduleNextFrameLoop(ctx, 1);
        return;
      }
    }

    // Shared texture unavailable or invalid size → retry, but don't busy-spin.
    scheduleNextFrameLoop(ctx, 8);
    return;
  } catch (err) {
    emitToOwner(EVENT.HG_PROPERTY_CHANGE, {
      name: '__error__',
      value: toErrorString(err),
    });
  }

  // Error path backoff
  scheduleNextFrameLoop(ctx, 16);
}

function teardownPlayerOnly() {
  stopFrameLoopInternal();
  if (__state.addon) {
    try {
      if (typeof __state.addon.destroyPlayer === 'function') __state.addon.destroyPlayer();
      else if (typeof __state.addon.destroy === 'function') __state.addon.destroy();
    } catch {}
  }
  __state.initialized = false;
  __state.observedProperties.clear();
}

function teardownEverything() {
  stopFrameLoopInternal();
  if (__state.addon) {
    try {
      if (typeof __state.addon.destroyAll === 'function') __state.addon.destroyAll();
      else if (typeof __state.addon.destroy === 'function') __state.addon.destroy();
    } catch {}
  }
  __state.initialized = false;
  __state.observedProperties.clear();
}

async function probe(ctx, evt) {
  try {
    setOwnerFromEvent(ctx, evt);

    const addonPath = resolveAddonPath(ctx);
    const mpvPath = resolveMpvDllPath(ctx);
    const { eglPath, glesPath } = resolveAngleDlls();
    const hasSharedTexture = !!sharedTexture;
    const ok = !!(addonPath && mpvPath && eglPath && glesPath && hasSharedTexture);

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

    addon.initGpu({
      mpvPath,
      eglPath,
      glesPath,
      width,
      height,
    });

    __state.initialized = true;
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
    if (!__state.initialized) return { ok: false, error: 'not_initialized' };
    const target = String(filePath || '');
    if (!target) return { ok: false, error: 'missing_file_path' };
    addon.loadFile(target);
    return { ok: true };
  } catch (err) {
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

    __state.frameLoopRunning = true;
    __state.eventLoopRunning = true;
    __state.frameSendInFlight = false;

    void frameLoopTick(ctx);
    void eventLoopTick(ctx);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: toErrorString(err) };
  }
}

async function stopFrameLoop() {
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
};
