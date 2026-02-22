/*
Holy Grail Video Adapter

Renderer-side adapter that matches the existing video.js player contract.
Backed by Tanko.api.holyGrail (main process holy grail domain + sharedTexture).
*/

(function () {
  'use strict';

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n)));

  const HG_PARITY_CONTRACT_VERSION = 'hg-parity-build1';
  const HG_PARITY_EVENT_NAMES = [
    'ready', 'file-loaded', 'loadedmetadata', 'duration', 'time', 'play', 'pause', 'ended',
    'volume', 'speed', 'delays', 'transforms', 'tracks', 'chapters', 'first-frame', 'shutdown', 'error',
  ];

  function toErrorString(err) {
    return String((err && err.message) || err || 'unknown_error');
  }

  function toFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeTrack(rawTrack) {
    const t = (rawTrack && typeof rawTrack === 'object') ? rawTrack : {};
    const typeRaw = String((t.type != null ? t.type : t.trackType) || '').trim().toLowerCase();
    const type = (typeRaw === 'sub' || typeRaw === 'subtitle') ? 'sub' : ((typeRaw === 'audio') ? 'audio' : typeRaw);
    return {
      id: (t.id != null) ? String(t.id) : '',
      type,
      lang: (t.lang != null) ? String(t.lang) : '',
      title: (t.title != null) ? String(t.title) : (t.name != null ? String(t.name) : ''),
      codec: (t.codec != null) ? String(t.codec) : '',
      external: !!t.external,
      selected: !!t.selected,
      raw: t,
    };
  }

  function createEmitter() {
    const listeners = new Map();
    return {
      on(eventName, handler) {
        const name = String(eventName || '');
        if (!name || typeof handler !== 'function') return () => {};
        let set = listeners.get(name);
        if (!set) {
          set = new Set();
          listeners.set(name, set);
        }
        set.add(handler);
        return () => {
          try { set.delete(handler); } catch {}
        };
      },
      emit(eventName, payload) {
        const name = String(eventName || '');
        const set = listeners.get(name);
        if (!set || !set.size) return;
        for (const fn of set) {
          try { fn(payload); } catch {}
        }
      },
      clear() {
        listeners.clear();
      },
    };
  }

  function createDefaultState() {
    return {
      ready: false,
      paused: true,
      timeSec: 0,
      durationSec: 0,
      volume: 1,
      muted: false,
      speed: 1,
      eofReached: false,
      subtitlesVisible: true,
      subtitleTrackId: null,
      audioTrackId: null,
      audioDelaySec: 0,
      subtitleDelaySec: 0,
      width: 0,
      height: 0,
      aspectRatio: 'auto',
      crop: 'none',
      renderQuality: 'auto',
      subtitleHudLiftPx: 40,
      trackList: [],
      chapterList: [],
    };
  }

  function pickMpvString(value) {
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (value == null) return '';
    return String(value);
  }

  async function safeInvoke(hg, method, ...args) {
    if (!hg || typeof hg[method] !== 'function') {
      return { ok: false, error: `holy_grail_method_missing:${String(method || '')}` };
    }
    try {
      const res = await hg[method](...args);
      if (res && typeof res === 'object') return res;
      return { ok: true, value: res };
    } catch (err) {
      return { ok: false, error: toErrorString(err) };
    }
  }

  function createHolyGrailAdapter({ hostEl, renderQuality, videoSyncDisplayResample } = {}) {
    if (!hostEl) {
      throw new Error('createHolyGrailAdapter requires hostEl');
    }

    const hg = window && window.Tanko && window.Tanko.api && window.Tanko.api.holyGrail
      ? window.Tanko.api.holyGrail
      : null;
    if (!hg) {
      throw new Error('Tanko.api.holyGrail is not available');
    }

    const emitter = createEmitter();
    const state = createDefaultState();
    const initialRenderQuality = String(renderQuality || '').trim().toLowerCase();
    if (initialRenderQuality === 'auto' || initialRenderQuality === 'high' || initialRenderQuality === 'extreme' || initialRenderQuality === 'balanced') {
      state.renderQuality = initialRenderQuality;
    }
    let videoSyncResampleEnabled = !!videoSyncDisplayResample;

    let destroyed = false;
    let gpuInitialized = false;
    let pendingStartSeekSec = 0;
    let currentFilePath = '';
    let lastSubtitleTrackId = null;
    let readyEmitted = false;
    let loadedMetaEmitted = false;
    let suppressEofSignals = true;
    let resizeDebounceTimer = null;
    let resizeInFlight = false;
    let resizeFailureStreak = 0;
    let lastResizeWidth = 0;
    let lastResizeHeight = 0;
    let lastHostCssWidth = 0;
    let lastHostCssHeight = 0;
    let lastHostDpr = 1;
    let resizeQueuedReason = '';
    let resizeQueuedForce = false;
    let resizePromiseResolvers = [];
    let pendingResizeAfterFlight = null;

    let canvas = null;
    let ctx2d = null;
    let resizeObserver = null;
    let hudObserver = null;
    let statePollTimer = null;
    const cleanupFns = [];

    // Lightweight render diagnostics for the in-app overlay.
    const renderStats = {
      createdAtMs: Date.now(),
      frameCount: 0,
      propertyUpdateCount: 0,
      drawTimeTotalMs: 0,
      lastDrawTimeMs: 0,
      sourceWidth: 0,
      sourceHeight: 0,
      droppedFrameCount: 0,
      framePumpDrawCount: 0,
      lastFrameAtMs: 0,
      frameCloseErrorCount: 0,
    };
    let respectSubtitleStyles = true;
    let pendingVideoFrame = null;
    let framePumpRaf = 0;
    let framePumpBusy = false;

    const parityTrace = [];
    const PARITY_TRACE_MAX = 180;
    let paritySeq = 0;
    let loadSeq = 0;
    let currentLoadId = 0;
    let currentLoadStartedAtMs = 0;
    let firstFrameEmittedForLoad = false;
    let lastTrackSignature = '';
    let lastChapterSignature = '';

    function isParityDebugEnabled() {
      try {
        if (window && window.__TANKO_HG_PARITY_DEBUG__) return true;
        if (window && window.localStorage && window.localStorage.getItem('tanko:hg:parityDebug') === '1') return true;
      } catch {}
      return false;
    }

    function sanitizeParityPayload(payload) {
      if (payload == null) return null;
      if (typeof payload !== 'object') return payload;
      try {
        return JSON.parse(JSON.stringify(payload, (key, value) => {
          if (key === 'raw') return undefined;
          if (typeof value === 'number') return Number.isFinite(value) ? (Math.round(value * 1000) / 1000) : null;
          if (typeof value === 'string' && value.length > 260) return value.slice(0, 260) + '…';
          return value;
        }));
      } catch {
        return { note: 'unserializable_payload' };
      }
    }

    function pushParityTrace(tag, payload) {
      const entry = {
        seq: ++paritySeq,
        atMs: Date.now(),
        tag: String(tag || 'event'),
        loadId: currentLoadId || 0,
        data: sanitizeParityPayload(payload),
      };
      parityTrace.push(entry);
      if (parityTrace.length > PARITY_TRACE_MAX) parityTrace.splice(0, parityTrace.length - PARITY_TRACE_MAX);
      if (isParityDebugEnabled()) {
        try { console.log('[hg-parity]', entry); } catch {}
      }
      return entry;
    }

    function emit(eventName, payload) {
      pushParityTrace(`emit:${String(eventName || '')}`, payload);
      emitter.emit(eventName, payload);
    }

    function isHudVisible() {
      try {
        const stage = document && document.getElementById ? document.getElementById('videoStage') : null;
        return !!(stage && stage.classList && stage.classList.contains('showHud'));
      } catch {
        return false;
      }
    }

    async function applySubtitleSafeMargin() {
      const hudLift = clamp(toFiniteNumber(state.subtitleHudLiftPx, 40), 0, 300);
      const controlsVisible = isHudVisible();
      const margin = controlsVisible ? Math.round(90 + hudLift) : 28;
      const clampedMargin = clamp(margin, 0, 400);
      const hostHeight = Math.max(1, Math.round(toFiniteNumber((hostEl && hostEl.clientHeight) || 0, 720)));
      const coverPct = controlsVisible ? ((90 + hudLift) / hostHeight) * 100 : 5;
      const subPos = clamp(Math.round(100 - coverPct), 55, 98);
      const assMode = controlsVisible ? 'force' : (respectSubtitleStyles ? 'no' : 'strip');

      await safeInvoke(hg, 'setProperty', 'sub-ass-force-margins', 'yes');
      await safeInvoke(hg, 'setProperty', 'sub-use-margins', 'yes');
      await safeInvoke(hg, 'setProperty', 'sub-ass-override', assMode);
      await safeInvoke(hg, 'setProperty', 'sub-margin-y', String(clampedMargin));
      await safeInvoke(hg, 'setProperty', 'sub-pos', String(subPos));
      return { ok: true };
    }

    async function applyVideoSyncPreference(enabled) {
      const on = !!enabled;
      videoSyncResampleEnabled = on;
      if (on) {
        await safeInvoke(hg, 'setProperty', 'video-sync', 'display-resample');
        await safeInvoke(hg, 'setProperty', 'interpolation', 'yes');
        await safeInvoke(hg, 'setProperty', 'tscale', 'oversample');
      } else {
        await safeInvoke(hg, 'setProperty', 'interpolation', 'no');
        await safeInvoke(hg, 'setProperty', 'video-sync', 'audio');
      }
      return { ok: true, value: on };
    }

function readHostSurfaceMetrics({ preserveLastOnHidden = true } = {}) {
  if (!hostEl) return null;
  const rect = hostEl.getBoundingClientRect ? hostEl.getBoundingClientRect() : null;
  const rectW = Math.round(toFiniteNumber(rect && rect.width, 0));
  const rectH = Math.round(toFiniteNumber(rect && rect.height, 0));
  const clientW = Math.round(toFiniteNumber(hostEl.clientWidth, 0));
  const clientH = Math.round(toFiniteNumber(hostEl.clientHeight, 0));
  const offsetW = Math.round(toFiniteNumber(hostEl.offsetWidth, 0));
  const offsetH = Math.round(toFiniteNumber(hostEl.offsetHeight, 0));
  let cssW = Math.max(rectW, clientW, offsetW);
  let cssH = Math.max(rectH, clientH, offsetH);
  const dpr = Math.max(1, toFiniteNumber(window.devicePixelRatio, 1));
  const hidden = cssW <= 1 || cssH <= 1;
  if (hidden && preserveLastOnHidden && lastHostCssWidth > 1 && lastHostCssHeight > 1) {
    cssW = lastHostCssWidth;
    cssH = lastHostCssHeight;
  }
  cssW = Math.max(16, Math.round(toFiniteNumber(cssW, 1280)));
  cssH = Math.max(16, Math.round(toFiniteNumber(cssH, 720)));
  const pxW = Math.max(16, Math.round(cssW * dpr));
  const pxH = Math.max(16, Math.round(cssH * dpr));
  return { cssW, cssH, pxW, pxH, dpr, hidden };
}

function setCanvasSizeFromHost(opts = {}) {
  if (!canvas || !hostEl) return null;
  const metrics = readHostSurfaceMetrics(opts);
  if (!metrics) return null;
  const cssWText = `${metrics.cssW}px`;
  const cssHText = `${metrics.cssH}px`;
  if (canvas.style.width !== cssWText) canvas.style.width = cssWText;
  if (canvas.style.height !== cssHText) canvas.style.height = cssHText;
  if (canvas.width !== metrics.pxW) canvas.width = metrics.pxW;
  if (canvas.height !== metrics.pxH) canvas.height = metrics.pxH;
  lastHostCssWidth = metrics.cssW;
  lastHostCssHeight = metrics.cssH;
  lastHostDpr = metrics.dpr;
  return metrics;
}

    async function applyRenderFidelityDefaults() {
      // Keep this conservative: prioritize motion stability/sharpness without forcing risky vo rewrites.
      await safeInvoke(hg, 'setProperty', 'scale', 'ewa_lanczossharp');
      await safeInvoke(hg, 'setProperty', 'cscale', 'spline36');
      await safeInvoke(hg, 'setProperty', 'dscale', 'mitchell');
      await safeInvoke(hg, 'setProperty', 'correct-downscaling', 'yes');
      await safeInvoke(hg, 'setProperty', 'sigmoid-upscaling', 'yes');
      await safeInvoke(hg, 'setProperty', 'deband', 'yes');
      await safeInvoke(hg, 'setProperty', 'dither-depth', 'auto');
    }

    function createCanvasSurface() {
      hostEl.innerHTML = '';
      canvas = document.createElement('canvas');
      canvas.className = 'holyGrailCanvas';
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.background = '#000';
      canvas.setAttribute('aria-label', 'Video');
      hostEl.appendChild(canvas);

      ctx2d = canvas.getContext('2d', { alpha: false, desynchronized: false });
      if (ctx2d) {
        ctx2d.imageSmoothingEnabled = true;
        try { ctx2d.imageSmoothingQuality = 'high'; } catch {}
      }
      setCanvasSizeFromHost({ preserveLastOnHidden: true });

      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => {
          const prevCssW = lastHostCssWidth;
          const prevCssH = lastHostCssHeight;
          const prevDpr = lastHostDpr;
          const metrics = setCanvasSizeFromHost({ preserveLastOnHidden: true });
          if (!metrics) return;
          const cssChanged = metrics.cssW !== prevCssW || metrics.cssH !== prevCssH;
          const dprChanged = Math.abs(toFiniteNumber(metrics.dpr, 1) - toFiniteNumber(prevDpr, 1)) > 1e-4;
          if (metrics.hidden && lastResizeWidth > 0 && lastResizeHeight > 0) {
            pushParityTrace('resize:observer-hidden', { cssW: metrics.cssW, cssH: metrics.cssH });
            return;
          }
          if (cssChanged || dprChanged || !lastResizeWidth || !lastResizeHeight) {
            void requestSurfaceResize('host-resize');
          }
        });
        resizeObserver.observe(hostEl);
      } else {
        const onResize = () => {
          setCanvasSizeFromHost({ preserveLastOnHidden: true });
          void requestSurfaceResize('window-resize');
        };
        window.addEventListener('resize', onResize);
        cleanupFns.push(() => {
          try { window.removeEventListener('resize', onResize); } catch {}
        });
      }

      const onResizeAlways = () => {
        setCanvasSizeFromHost({ preserveLastOnHidden: true });
        void requestSurfaceResize('window-resize-always');
      };
      try { window.addEventListener('resize', onResizeAlways, { passive: true }); } catch {}
      cleanupFns.push(() => { try { window.removeEventListener('resize', onResizeAlways); } catch {} });

      const onVisibilityChange = () => {
        try {
          if (document.visibilityState === 'visible') {
            setCanvasSizeFromHost({ preserveLastOnHidden: true });
            void requestSurfaceResize('document-visible', { force: true });
          }
        } catch {}
      };
      try { document.addEventListener('visibilitychange', onVisibilityChange); } catch {}
      cleanupFns.push(() => { try { document.removeEventListener('visibilitychange', onVisibilityChange); } catch {} });

      const onHostTransitionEnd = (ev) => {
        const prop = String((ev && ev.propertyName) || '');
        if (prop && !/width|height|top|left|right|bottom|transform|flex|padding|margin/.test(prop)) return;
        void requestSurfaceResize('host-transition-end');
      };
      try { hostEl.addEventListener('transitionend', onHostTransitionEnd, { passive: true }); } catch {}
      cleanupFns.push(() => { try { hostEl.removeEventListener('transitionend', onHostTransitionEnd); } catch {} });

      if (typeof MutationObserver === 'function') {
        const stage = document && document.getElementById ? document.getElementById('videoStage') : null;
        if (stage) {
          hudObserver = new MutationObserver(() => {
            void applySubtitleSafeMargin();
          });
          hudObserver.observe(stage, { attributes: true, attributeFilter: ['class'] });
          const onStageTransitionEnd = (ev) => {
            const prop = String((ev && ev.propertyName) || '');
            if (prop && !/width|height|top|left|right|bottom|transform|flex|padding|margin/.test(prop)) return;
            void requestSurfaceResize('stage-transition-end');
          };
          try { stage.addEventListener('transitionend', onStageTransitionEnd, { passive: true }); } catch {}
          cleanupFns.push(() => { try { stage.removeEventListener('transitionend', onStageTransitionEnd); } catch {} });
        }
      }
    }

    function normalizeCurrentTrackSelections() {
      const tracks = Array.isArray(state.trackList) ? state.trackList : [];
      const audioSel = tracks.find((t) => t && t.type === 'audio' && t.selected);
      const subSel = tracks.find((t) => t && t.type === 'sub' && t.selected);
      state.audioTrackId = audioSel ? String(audioSel.id) : null;
      state.subtitleTrackId = subSel ? String(subSel.id) : null;
      if (subSel) lastSubtitleTrackId = String(subSel.id);
      if (!subSel) {
        // If no subtitle track selected, treat subtitles as off.
        state.subtitlesVisible = false;
      } else if (state.subtitlesVisible == null) {
        state.subtitlesVisible = true;
      }
    }

    function normalizeAndStoreTrackList(list) {
      const next = (Array.isArray(list) ? list : []).map(normalizeTrack).filter((t) => t.id);
      state.trackList = next;
      normalizeCurrentTrackSelections();

      const sig = JSON.stringify(next.map((t) => ({
        id: String(t.id || ''),
        type: String(t.type || ''),
        selected: !!t.selected,
        lang: String(t.lang || ''),
        title: String(t.title || ''),
      })));
      if (sig !== lastTrackSignature) {
        lastTrackSignature = sig;
        emit('tracks', {
          loadId: currentLoadId || 0,
          tracks: next.slice(),
          audioTracks: next.filter((t) => t.type === 'audio'),
          subtitleTracks: next.filter((t) => t.type === 'sub'),
          audioTrackId: state.audioTrackId,
          subtitleTrackId: state.subtitleTrackId,
          subtitlesVisible: !!state.subtitlesVisible,
        });
      }
    }

    function normalizeAndStoreChapterList(list) {
      const out = [];
      for (const item of (Array.isArray(list) ? list : [])) {
        const t = toFiniteNumber(item && (item.time ?? item.timeSec ?? item.start ?? item.start_time), NaN);
        if (!Number.isFinite(t)) continue;
        out.push({
          timeSec: t,
          title: String((item && (item.title || item.name)) || ''),
        });
      }
      out.sort((a, b) => a.timeSec - b.timeSec);
      state.chapterList = out;

      const sig = JSON.stringify(out.map((c) => ({ timeSec: c.timeSec, title: c.title })));
      if (sig !== lastChapterSignature) {
        lastChapterSignature = sig;
        emit('chapters', { loadId: currentLoadId || 0, chapters: out.slice(), count: out.length });
      }
    }

    function applyPropertyChange(name, value) {
      renderStats.propertyUpdateCount += 1;
      const prop = String(name || '');
      if (!prop) return;

      if (prop === 'time-pos') {
        const next = Math.max(0, toFiniteNumber(value, state.timeSec));
        if (next !== state.timeSec) {
          state.timeSec = next;
          emit('time', { value: next });
        }
        return;
      }

      if (prop === 'duration') {
        const next = Math.max(0, toFiniteNumber(value, state.durationSec));
        if (next !== state.durationSec) {
          state.durationSec = next;
          emit('duration', { value: next });
          if (!loadedMetaEmitted && next > 0) {
            loadedMetaEmitted = true;
            emit('loadedmetadata', { durationSec: next });
          }
        }
        return;
      }

      if (prop === 'pause') {
        const wasPaused = !!state.paused;
        const nextPaused = !!value;
        state.paused = nextPaused;
        if (wasPaused !== nextPaused) emit(nextPaused ? 'pause' : 'play', { paused: nextPaused });
        return;
      }

      if (prop === 'eof-reached') {
        const was = !!state.eofReached;
        const next = !!value;
        if (suppressEofSignals) {
          state.eofReached = false;
          return;
        }
        state.eofReached = next;
        if (!was && next) emit('ended', { eof: true });
        return;
      }

      if (prop === 'volume') {
        const next = clamp(toFiniteNumber(value, state.volume * 100), 0, 100) / 100;
        if (next !== state.volume) {
          state.volume = next;
          emit('volume', { volume: next, muted: !!state.muted });
        }
        return;
      }

      if (prop === 'mute') {
        const next = !!value;
        if (next !== state.muted) {
          state.muted = next;
          emit('volume', { volume: state.volume, muted: next });
        }
        return;
      }

      if (prop === 'speed') {
        const next = clamp(toFiniteNumber(value, state.speed), 0.1, 8);
        if (next !== state.speed) {
          state.speed = next;
          emit('speed', { speed: next });
        }
        return;
      }

      if (prop === 'audio-delay') {
        state.audioDelaySec = toFiniteNumber(value, state.audioDelaySec);
        emit('delays', {
          audioDelaySec: state.audioDelaySec,
          subtitleDelaySec: state.subtitleDelaySec,
        });
        return;
      }

      if (prop === 'sub-delay') {
        state.subtitleDelaySec = toFiniteNumber(value, state.subtitleDelaySec);
        emit('delays', {
          audioDelaySec: state.audioDelaySec,
          subtitleDelaySec: state.subtitleDelaySec,
        });
        return;
      }

      if (prop === 'sub-visibility') {
        state.subtitlesVisible = !!value;
        return;
      }

      if (prop === 'track-list') {
        normalizeAndStoreTrackList(value);
        return;
      }

      if (prop === 'chapter-list') {
        normalizeAndStoreChapterList(value);
        return;
      }

      if (prop === 'video-aspect-override') {
        const v = String((value == null) ? '' : value).trim();
        state.aspectRatio = (!v || v === 'no' || v === '0' || v === '-1') ? 'auto' : v;
        emit('transforms', { aspectRatio: state.aspectRatio, crop: state.crop });
        return;
      }

      if (prop === 'video-crop') {
        const v = String((value == null) ? '' : value).trim();
        state.crop = (!v || v === 'no' || v === '0' || v === '-1') ? 'none' : v;
        emit('transforms', { aspectRatio: state.aspectRatio, crop: state.crop });
        return;
      }

      if (prop === '__error__') {
        emit('error', { reason: 'render_loop', message: String(value || 'unknown_error') });
      }
    }


    function closeVideoFrameSafe(frame, reason) {
      if (!frame) return;
      try {
        if (typeof frame.close === 'function') frame.close();
      } catch {
        renderStats.frameCloseErrorCount += 1;
        pushParityTrace('frame:close-error', { reason: String(reason || 'unknown') });
      }
    }

    function flushPendingVideoFrame(reason) {
      if (!pendingVideoFrame) return;
      const frame = pendingVideoFrame;
      pendingVideoFrame = null;
      closeVideoFrameSafe(frame, reason || 'flush');
    }

    function stopFramePump(reason) {
      if (framePumpRaf) {
        try { cancelAnimationFrame(framePumpRaf); } catch {}
      }
      framePumpRaf = 0;
      framePumpBusy = false;
      flushPendingVideoFrame(reason || 'stop-frame-pump');
    }

    function scheduleFramePump() {
      if (framePumpRaf || framePumpBusy || destroyed) return;
      framePumpRaf = requestAnimationFrame(() => {
        framePumpRaf = 0;
        if (destroyed) {
          flushPendingVideoFrame('destroyed-before-draw');
          return;
        }
        const frame = pendingVideoFrame;
        pendingVideoFrame = null;
        if (!frame) return;
        framePumpBusy = true;
        try {
          drawFrame(frame);
          renderStats.framePumpDrawCount += 1;
          renderStats.lastFrameAtMs = Date.now();
        } finally {
          closeVideoFrameSafe(frame, 'frame-pump-draw');
          framePumpBusy = false;
          if (pendingVideoFrame && !destroyed) scheduleFramePump();
        }
      });
    }

    function queueIncomingVideoFrame(videoFrame) {
      if (!videoFrame) return;
      if (destroyed || !gpuInitialized) {
        closeVideoFrameSafe(videoFrame, destroyed ? 'destroyed' : 'gpu-not-ready');
        return;
      }
      if (pendingVideoFrame) {
        renderStats.droppedFrameCount += 1;
        closeVideoFrameSafe(pendingVideoFrame, 'superseded');
      }
      pendingVideoFrame = videoFrame;
      scheduleFramePump();
    }

    function drawFrame(videoFrame) {
      if (!videoFrame) return;
      if (!ctx2d || !canvas) return;

      setCanvasSizeFromHost();

      const srcW = Math.max(1, toFiniteNumber(videoFrame.displayWidth || videoFrame.codedWidth, 1));
      const srcH = Math.max(1, toFiniteNumber(videoFrame.displayHeight || videoFrame.codedHeight, 1));
      const dstW = Math.max(1, canvas.width);
      const dstH = Math.max(1, canvas.height);

      const scale = Math.min(dstW / srcW, dstH / srcH);
      const drawW = Math.max(1, Math.round(srcW * scale));
      const drawH = Math.max(1, Math.round(srcH * scale));
      const dx = Math.floor((dstW - drawW) / 2);
      const dy = Math.floor((dstH - drawH) / 2);

      const t0 = performance.now();
      ctx2d.fillStyle = '#000';
      ctx2d.fillRect(0, 0, dstW, dstH);
      // SharedTexture -> VideoFrame arrives inverted on this pipeline.
      // Flip vertically so embedded playback matches expected orientation.
      ctx2d.save();
      ctx2d.translate(0, dstH);
      ctx2d.scale(1, -1);
      ctx2d.drawImage(videoFrame, dx, dstH - dy - drawH, drawW, drawH);
      ctx2d.restore();
      const drawMs = performance.now() - t0;

      renderStats.frameCount += 1;
      renderStats.drawTimeTotalMs += drawMs;
      renderStats.lastDrawTimeMs = drawMs;
      renderStats.sourceWidth = srcW;
      renderStats.sourceHeight = srcH;

      if (!firstFrameEmittedForLoad && currentLoadId > 0) {
        firstFrameEmittedForLoad = true;
        const sinceLoadMs = currentLoadStartedAtMs ? Math.max(0, Date.now() - currentLoadStartedAtMs) : null;
        emit('first-frame', {
          loadId: currentLoadId,
          sinceLoadMs,
          frameCount: renderStats.frameCount,
          sourceWidth: srcW,
          sourceHeight: srcH,
          canvasWidth: dstW,
          canvasHeight: dstH,
          drawTimeMs: drawMs,
        });
      }
      state.width = srcW;
      state.height = srcH;
    }

    async function refreshStateSnapshot() {
      if (destroyed) return;
      const res = await safeInvoke(hg, 'getState');
      if (!res || res.ok === false || !res.state || typeof res.state !== 'object') return;

      const s = res.state;
      applyPropertyChange('time-pos', s.timePos);
      applyPropertyChange('duration', s.duration);
      applyPropertyChange('pause', !!s.paused);
      applyPropertyChange('volume', s.volume);
      applyPropertyChange('mute', !!s.muted);
      applyPropertyChange('speed', s.speed);

      state.width = toFiniteNumber(s.width, state.width);
      state.height = toFiniteNumber(s.height, state.height);
    }

    async function refreshTrackList() {
      const res = await safeInvoke(hg, 'getTrackList');
      if (!res || res.ok === false || !Array.isArray(res.tracks)) return { ok: false, tracks: [] };
      normalizeAndStoreTrackList(res.tracks);
      return { ok: true, tracks: state.trackList };
    }

    async function observeDefaultProperties() {
      const observed = [
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
        'video-crop',
      ];
      for (const prop of observed) {
        // eslint-disable-next-line no-await-in-loop
        await safeInvoke(hg, 'observeProperty', prop);
      }
    }

    function startStatePoll() {
      if (statePollTimer) return;
      statePollTimer = setInterval(() => {
        void refreshStateSnapshot();
      }, 250);
    }

    function stopStatePoll() {
      if (!statePollTimer) return;
      clearInterval(statePollTimer);
      statePollTimer = null;
    }

    async function ensureGpuInitialized() {
      if (gpuInitialized) return { ok: true };

      const probeRes = await safeInvoke(hg, 'probe');
      if (!probeRes || probeRes.ok === false) {
        return { ok: false, error: probeRes && probeRes.error ? String(probeRes.error) : 'probe_failed' };
      }
      if (!probeRes.ok) {
        return { ok: false, error: probeRes.error || 'holy_grail_unavailable' };
      }

      setCanvasSizeFromHost();
      const initRes = await safeInvoke(hg, 'initGpu', { width: canvas ? canvas.width : 1280, height: canvas ? canvas.height : 720 });
      if (!initRes || initRes.ok === false) {
        return { ok: false, error: initRes && initRes.error ? String(initRes.error) : 'init_failed' };
      }

      gpuInitialized = true;
      lastResizeWidth = canvas ? canvas.width : 0;
      lastResizeHeight = canvas ? canvas.height : 0;
      await observeDefaultProperties();
      return { ok: true };
    }

    async function restorePlaybackStateAfterReinit() {
      if (!currentFilePath) return { ok: false, error: 'missing_file_path' };
      const st = getState();
      const seekSec = Math.max(0, toFiniteNumber(st.timeSec, 0));
      const paused = !!st.paused;
      const volume = clamp(toFiniteNumber(st.volume, 1), 0, 1);
      const muted = !!st.muted;
      const speed = clamp(toFiniteNumber(st.speed, 1), 0.1, 8);
      const audioDelay = toFiniteNumber(st.audioDelaySec, 0);
      const subDelay = toFiniteNumber(st.subtitleDelaySec, 0);
      const audioTrackId = st.audioTrackId == null ? null : String(st.audioTrackId);
      const subtitleTrackId = st.subtitleTrackId == null ? null : String(st.subtitleTrackId);
      const subtitlesVisible = !!st.subtitlesVisible;

      const loadRes = await safeInvoke(hg, 'loadFile', currentFilePath);
      if (!loadRes || loadRes.ok === false) return { ok: false, error: loadRes && loadRes.error ? String(loadRes.error) : 'reload_failed' };
      const loopRes = await safeInvoke(hg, 'startFrameLoop');
      if (!loopRes || loopRes.ok === false) return { ok: false, error: loopRes && loopRes.error ? String(loopRes.error) : 'restart_loop_failed' };

      if (seekSec > 0.25) await safeInvoke(hg, 'command', ['seek', String(seekSec), 'absolute', 'exact']);
      await applyRenderFidelityDefaults();
      await safeInvoke(hg, 'setProperty', 'pause', paused ? 'yes' : 'no');
      await safeInvoke(hg, 'setProperty', 'volume', String(volume * 100));
      await safeInvoke(hg, 'setProperty', 'mute', muted ? 'yes' : 'no');
      await safeInvoke(hg, 'setProperty', 'speed', String(speed));
      await safeInvoke(hg, 'setProperty', 'audio-delay', String(audioDelay));
      await safeInvoke(hg, 'setProperty', 'sub-delay', String(subDelay));
      await applyRenderFidelityDefaults();
      if (audioTrackId) await safeInvoke(hg, 'command', ['set', 'aid', audioTrackId]);
      if (subtitleTrackId && subtitlesVisible) {
        await safeInvoke(hg, 'command', ['set', 'sid', subtitleTrackId]);
      } else {
        await safeInvoke(hg, 'command', ['set', 'sid', 'no']);
      }
      await refreshStateSnapshot();
      await refreshTrackList();
      await applySubtitleSafeMargin();
      pushParityTrace('load:ok', { durationSec: toFiniteNumber(state.durationSec, 0), trackCount: Array.isArray(state.trackList) ? state.trackList.length : 0, chapterCount: Array.isArray(state.chapterList) ? state.chapterList.length : 0 });
      return { ok: true };
    }

    async function forceReinitForResize() {
      try { await safeInvoke(hg, 'stopFrameLoop'); } catch {}
      try { await safeInvoke(hg, 'destroy'); } catch {}
      gpuInitialized = false;
      const initRes = await ensureGpuInitialized();
      if (!initRes || initRes.ok === false) return { ok: false, error: initRes && initRes.error ? String(initRes.error) : 'reinit_failed' };
      return restorePlaybackStateAfterReinit();
    }

async function requestSurfaceResize(reason, { force = false } = {}) {
  if (destroyed) return { ok: false, error: 'adapter_destroyed' };
  if (!gpuInitialized) return { ok: true, skipped: true, reason: 'not_initialized' };

  const nextReason = String(reason || '');
  if (resizeInFlight) {
    const existing = pendingResizeAfterFlight || {};
    pendingResizeAfterFlight = {
      reason: nextReason || existing.reason || 'resize-after-flight',
      force: !!(existing.force || force),
    };
    pushParityTrace('resize:queued-inflight', { reason: nextReason, force: !!force });
    return { ok: true, queued: true, reason: 'resize_in_flight' };
  }

  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = null;
  }
  resizeQueuedReason = nextReason || resizeQueuedReason || 'resize';
  resizeQueuedForce = !!(resizeQueuedForce || force);

  return new Promise((resolve) => {
    resizePromiseResolvers.push(resolve);
    pushParityTrace('resize:queued', { reason: nextReason, force: !!force });

    resizeDebounceTimer = setTimeout(async () => {
      resizeDebounceTimer = null;
      const queuedResolvers = resizePromiseResolvers.splice(0, resizePromiseResolvers.length);
      const queuedReason = resizeQueuedReason || nextReason || 'resize';
      const queuedForce = !!resizeQueuedForce;
      resizeQueuedReason = '';
      resizeQueuedForce = false;
      const resolveAll = (payload) => { for (const fn of queuedResolvers) { try { fn(payload); } catch {} } };

      if (destroyed || !gpuInitialized) {
        pushParityTrace('resize:skipped', { reason: queuedReason, destroyed: !!destroyed, gpuInitialized: !!gpuInitialized });
        return resolveAll({ ok: true, skipped: true, reason: 'not_ready' });
      }

      const metrics = setCanvasSizeFromHost({ preserveLastOnHidden: true }) || readHostSurfaceMetrics({ preserveLastOnHidden: true });
      const width = Math.max(16, canvas ? canvas.width : 0);
      const height = Math.max(16, canvas ? canvas.height : 0);

      if (metrics && metrics.hidden && lastResizeWidth > 0 && lastResizeHeight > 0 && !queuedForce) {
        pushParityTrace('resize:hidden-skip', { width, height, reason: queuedReason, cssW: metrics.cssW, cssH: metrics.cssH });
        return resolveAll({ ok: true, skipped: true, reason: 'host_hidden' });
      }

      if (!queuedForce && width === lastResizeWidth && height === lastResizeHeight) {
        pushParityTrace('resize:unchanged', { width, height, reason: queuedReason });
        return resolveAll({ ok: true, unchanged: true, width, height });
      }

      resizeInFlight = true;
      try {
        const res = await safeInvoke(hg, 'resizeSurface', { width, height, reason: queuedReason });
        if (res && res.ok !== false) {
          lastResizeWidth = width;
          lastResizeHeight = height;
          resizeFailureStreak = 0;
          void applySubtitleSafeMargin();
          pushParityTrace('resize:ok', { width, height, reason: queuedReason, resized: true });
          resolveAll({ ok: true, width, height, resized: true });
        } else {
          resizeFailureStreak += 1;
          if (resizeFailureStreak >= 3) {
            const retry = await forceReinitForResize();
            if (retry && retry.ok) {
              resizeFailureStreak = 0;
              lastResizeWidth = width;
              lastResizeHeight = height;
              void applySubtitleSafeMargin();
              pushParityTrace('resize:reinit-ok', { width, height, reason: queuedReason, reinit: true });
              resolveAll({ ok: true, width, height, reinit: true });
            } else {
              pushParityTrace('resize:fail', { width, height, reason: queuedReason, error: res && res.error ? String(res.error) : 'resize_failed' });
              resolveAll({ ok: false, error: res && res.error ? String(res.error) : 'resize_failed' });
            }
          } else {
            pushParityTrace('resize:fail', { width, height, reason: queuedReason, error: res && res.error ? String(res.error) : 'resize_failed' });
            resolveAll({ ok: false, error: res && res.error ? String(res.error) : 'resize_failed' });
          }
        }
      } finally {
        resizeInFlight = false;
        if (pendingResizeAfterFlight && !destroyed && gpuInitialized) {
          const pending = pendingResizeAfterFlight;
          pendingResizeAfterFlight = null;
          setTimeout(() => { void requestSurfaceResize(pending.reason || 'resize-after-flight', { force: !!pending.force }); }, 0);
        }
      }
    }, 80);
  });
}

    async function applyPendingStartSeek() {
      if (!pendingStartSeekSec || pendingStartSeekSec <= 0) return;
      const sec = Number(pendingStartSeekSec);
      pendingStartSeekSec = 0;
      await safeInvoke(hg, 'command', ['seek', String(sec), 'absolute', 'exact']);
      applyPropertyChange('time-pos', sec);
      emit('time', { value: sec });
    }

    async function load(filePath, opts = {}) {
      const fp = String(filePath || '');
      if (!fp) return { ok: false, error: 'missing_file_path' };
      if (destroyed) return { ok: false, error: 'adapter_destroyed' };
      currentFilePath = fp;
      currentLoadId = ++loadSeq;
      currentLoadStartedAtMs = Date.now();
      firstFrameEmittedForLoad = false;
      lastTrackSignature = '';
      lastChapterSignature = '';
      pushParityTrace('load:start', { filePath: fp, startSeconds: toFiniteNumber(opts.startSeconds, 0) });

      const initRes = await ensureGpuInitialized();
      if (!initRes.ok) {
        emit('error', { reason: 'init', message: initRes.error || 'init_failed' });
        pushParityTrace('load:init-fail', { error: initRes.error || 'init_failed' });
        return initRes;
      }

      const syncPref = Object.prototype.hasOwnProperty.call(opts, 'videoSyncDisplayResample')
        ? !!opts.videoSyncDisplayResample
        : videoSyncResampleEnabled;
      await applyVideoSyncPreference(syncPref);

      pendingStartSeekSec = Math.max(0, toFiniteNumber(opts.startSeconds, 0));
      readyEmitted = false;
      loadedMetaEmitted = false;
      suppressEofSignals = true;
      state.ready = false;
      state.eofReached = false;
      state.chapterList = [];
      state.trackList = [];
      state.audioTrackId = null;
      state.subtitleTrackId = null;
      state.subtitlesVisible = true;

      const loadRes = await safeInvoke(hg, 'loadFile', fp);
      if (!loadRes || loadRes.ok === false) {
        emit('error', { reason: 'load', message: loadRes && loadRes.error ? String(loadRes.error) : 'load_failed' });
        pushParityTrace('load:file-fail', { error: loadRes && loadRes.error ? String(loadRes.error) : 'load_failed' });
        return { ok: false, error: loadRes && loadRes.error ? String(loadRes.error) : 'load_failed' };
      }

      const loopRes = await safeInvoke(hg, 'startFrameLoop');
      if (!loopRes || loopRes.ok === false) {
        emit('error', { reason: 'frame_loop', message: loopRes && loopRes.error ? String(loopRes.error) : 'frame_loop_failed' });
        pushParityTrace('load:frame-loop-fail', { error: loopRes && loopRes.error ? String(loopRes.error) : 'frame_loop_failed' });
        return { ok: false, error: loopRes && loopRes.error ? String(loopRes.error) : 'frame_loop_failed' };
      }

      startStatePoll();
      await requestSurfaceResize('post-load', { force: true });
      await refreshStateSnapshot();
      await refreshTrackList();
      await applySubtitleSafeMargin();
      return { ok: true };
    }

    async function unload() {
      pushParityTrace('unload:start', { filePath: currentFilePath || '' });
      pendingStartSeekSec = 0;
      currentFilePath = '';
      suppressEofSignals = true;
      state.ready = false;
      state.eofReached = false;
      stopStatePoll();
      stopFramePump('unload');
      if (resizeDebounceTimer) {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = null;
      }
      await safeInvoke(hg, 'stopFrameLoop');
      await safeInvoke(hg, 'destroy');
      gpuInitialized = false;
      firstFrameEmittedForLoad = false;
      pushParityTrace('unload:ok', {});
      return { ok: true };
    }

    async function destroy() {
      if (destroyed) return { ok: true };
      pushParityTrace('destroy:start', {});
      destroyed = true;
      suppressEofSignals = true;

      stopStatePoll();
      stopFramePump('destroy');
      if (resizeDebounceTimer) {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = null;
      }
      await safeInvoke(hg, 'stopFrameLoop');
      await safeInvoke(hg, 'destroy');

      for (const fn of cleanupFns) {
        try { fn(); } catch {}
      }
      cleanupFns.length = 0;

      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch {}
        resizeObserver = null;
      }
      if (hudObserver) {
        try { hudObserver.disconnect(); } catch {}
        hudObserver = null;
      }

      if (canvas && canvas.parentNode === hostEl) {
        try { hostEl.removeChild(canvas); } catch {}
      }
      canvas = null;
      ctx2d = null;
      emitter.clear();
      pushParityTrace('destroy:ok', {});
      return { ok: true };
    }

    async function getAudioTracks() {
      await refreshTrackList();
      const tracks = state.trackList.filter((t) => t.type === 'audio');
      return { ok: true, tracks, selectedId: state.audioTrackId };
    }

    async function getSubtitleTracks() {
      await refreshTrackList();
      const tracks = state.trackList.filter((t) => t.type === 'sub');
      return { ok: true, tracks, selectedId: state.subtitleTrackId };
    }

    async function setAudioTrack(trackId) {
      const target = (trackId == null || String(trackId).trim() === '' || String(trackId).trim().toLowerCase() === 'auto')
        ? 'auto'
        : String(trackId).trim();
      const res = await safeInvoke(hg, 'command', ['set', 'aid', target]);
      await refreshTrackList();
      return res && res.ok === false ? res : { ok: true };
    }

    async function setSubtitleTrack(trackId) {
      const raw = (trackId == null) ? '' : String(trackId).trim();
      const off = !raw || raw === 'no' || raw === 'false' || raw.toLowerCase() === 'auto';
      if (off) {
        const res = await safeInvoke(hg, 'command', ['set', 'sid', 'no']);
        state.subtitlesVisible = false;
        state.subtitleTrackId = null;
        return res && res.ok === false ? res : { ok: true };
      }
      const res = await safeInvoke(hg, 'command', ['set', 'sid', raw]);
      await safeInvoke(hg, 'setProperty', 'sub-visibility', 'yes');
      state.subtitlesVisible = true;
      state.subtitleTrackId = raw;
      lastSubtitleTrackId = raw;
      await refreshTrackList();
      return res && res.ok === false ? res : { ok: true };
    }

    async function cycleAudioTrack() {
      const listRes = await getAudioTracks();
      if (!listRes.ok) return listRes;
      const tracks = Array.isArray(listRes.tracks) ? listRes.tracks : [];
      if (!tracks.length) return { ok: false, error: 'no_audio_tracks' };

      const ids = tracks.map((t) => String(t.id));
      const cur = state.audioTrackId == null ? '' : String(state.audioTrackId);
      const idx = ids.indexOf(cur);
      const next = ids[(idx + 1) % ids.length];
      return setAudioTrack(next);
    }

    async function cycleSubtitleTrack() {
      const listRes = await getSubtitleTracks();
      if (!listRes.ok) return listRes;
      const tracks = Array.isArray(listRes.tracks) ? listRes.tracks : [];
      if (!tracks.length) return { ok: false, error: 'no_subtitle_tracks' };

      const ids = ['__off__', ...tracks.map((t) => String(t.id))];
      const cur = (state.subtitlesVisible && state.subtitleTrackId != null) ? String(state.subtitleTrackId) : '__off__';
      const idx = ids.indexOf(cur);
      const next = ids[(idx + 1) % ids.length];
      if (next === '__off__') return setSubtitleTrack(null);
      return setSubtitleTrack(next);
    }

    async function toggleSubtitles() {
      const currentlyOn = !!state.subtitlesVisible && !!state.subtitleTrackId;
      if (currentlyOn) return setSubtitleTrack(null);

      let target = lastSubtitleTrackId;
      if (!target) {
        const listRes = await getSubtitleTracks();
        if (listRes.ok && Array.isArray(listRes.tracks) && listRes.tracks.length) {
          target = String(listRes.tracks[0].id);
        }
      }
      if (!target) return { ok: false, error: 'no_subtitle_tracks' };
      return setSubtitleTrack(target);
    }

    async function getCurrentAudioTrack() {
      await refreshTrackList();
      return { ok: true, value: state.audioTrackId };
    }

    async function getCurrentSubtitleTrack() {
      await refreshTrackList();
      if (!state.subtitlesVisible) return { ok: true, value: null };
      return { ok: true, value: state.subtitleTrackId };
    }

    async function getAudioDelay() {
      const res = await safeInvoke(hg, 'getProperty', 'audio-delay');
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'get_audio_delay_failed' };
      const value = toFiniteNumber(res.value, state.audioDelaySec);
      state.audioDelaySec = value;
      return { ok: true, value };
    }

    async function getSubtitleDelay() {
      const res = await safeInvoke(hg, 'getProperty', 'sub-delay');
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'get_sub_delay_failed' };
      const value = toFiniteNumber(res.value, state.subtitleDelaySec);
      state.subtitleDelaySec = value;
      return { ok: true, value };
    }

    async function setAudioDelay(value) {
      const n = toFiniteNumber(value, 0);
      const res = await safeInvoke(hg, 'setProperty', 'audio-delay', pickMpvString(n));
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'set_audio_delay_failed' };
      state.audioDelaySec = n;
      emit('delays', { audioDelaySec: state.audioDelaySec, subtitleDelaySec: state.subtitleDelaySec });
      return { ok: true };
    }

    async function setSubtitleDelay(value) {
      const n = toFiniteNumber(value, 0);
      const res = await safeInvoke(hg, 'setProperty', 'sub-delay', pickMpvString(n));
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'set_sub_delay_failed' };
      state.subtitleDelaySec = n;
      emit('delays', { audioDelaySec: state.audioDelaySec, subtitleDelaySec: state.subtitleDelaySec });
      return { ok: true };
    }

    async function setAspectRatio(value) {
      const next = String(value || 'auto').trim().toLowerCase();
      const mpvValue = (next === 'auto') ? 'no' : String(value || 'auto');
      const res = await safeInvoke(hg, 'setProperty', 'video-aspect-override', mpvValue);
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'set_aspect_failed' };
      state.aspectRatio = (next === 'auto') ? 'auto' : String(value || 'auto');
      emit('transforms', { aspectRatio: state.aspectRatio, crop: state.crop });
      return { ok: true };
    }

    async function getAspectRatio() {
      const res = await safeInvoke(hg, 'getProperty', 'video-aspect-override');
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'get_aspect_failed' };
      const raw = String((res.value == null) ? '' : res.value).trim();
      state.aspectRatio = (!raw || raw === 'no' || raw === '0' || raw === '-1') ? 'auto' : raw;
      return { ok: true, value: state.aspectRatio };
    }

    async function setCrop(value) {
      const next = String(value || 'none').trim().toLowerCase();
      const mpvValue = (next === 'none') ? 'no' : String(value || 'none');
      const res = await safeInvoke(hg, 'setProperty', 'video-crop', mpvValue);
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'set_crop_failed' };
      state.crop = (next === 'none') ? 'none' : String(value || 'none');
      emit('transforms', { aspectRatio: state.aspectRatio, crop: state.crop });
      return { ok: true };
    }

    async function getCrop() {
      const res = await safeInvoke(hg, 'getProperty', 'video-crop');
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'get_crop_failed' };
      const raw = String((res.value == null) ? '' : res.value).trim();
      state.crop = (!raw || raw === 'no' || raw === '0' || raw === '-1') ? 'none' : raw;
      return { ok: true, value: state.crop };
    }

    async function resetVideoTransforms() {
      await setAspectRatio('auto');
      await setCrop('none');
      return { ok: true };
    }

    async function addExternalSubtitle(filePath) {
      const fp = String(filePath || '');
      if (!fp) return { ok: false, error: 'missing_subtitle_path' };
      const res = await safeInvoke(hg, 'command', ['sub-add', fp, 'select']);
      await refreshTrackList();
      return res && res.ok === false ? res : { ok: true };
    }

    async function getChapters() {
      return { ok: true, chapters: Array.isArray(state.chapterList) ? state.chapterList.slice() : [] };
    }

    async function getDuration() {
      await refreshStateSnapshot();
      return { ok: true, value: state.durationSec };
    }

    function getState() {
      return {
        ready: !!state.ready,
        paused: !!state.paused,
        timeSec: toFiniteNumber(state.timeSec, 0),
        durationSec: toFiniteNumber(state.durationSec, 0),
        volume: clamp(toFiniteNumber(state.volume, 1), 0, 1),
        muted: !!state.muted,
        speed: clamp(toFiniteNumber(state.speed, 1), 0.1, 8),
        eofReached: !!state.eofReached,
        audioDelaySec: toFiniteNumber(state.audioDelaySec, 0),
        subtitleDelaySec: toFiniteNumber(state.subtitleDelaySec, 0),
        subtitlesVisible: !!state.subtitlesVisible,
        subtitleTrackId: state.subtitleTrackId == null ? null : String(state.subtitleTrackId),
        audioTrackId: state.audioTrackId == null ? null : String(state.audioTrackId),
        subtitleHudLiftPx: toFiniteNumber(state.subtitleHudLiftPx, 40),
      };
    }

    function setBounds(opts = {}) {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const force = !!o.force;
      const reason = o.reason ? String(o.reason) : 'set-bounds';
      const metrics = setCanvasSizeFromHost({ preserveLastOnHidden: true });
      if (metrics && metrics.hidden && !force && lastResizeWidth > 0 && lastResizeHeight > 0) {
        pushParityTrace('bounds:hidden-skip', { reason, cssW: metrics.cssW, cssH: metrics.cssH });
        return { ok: true, skipped: true, reason: 'host_hidden' };
      }
      void requestSurfaceResize(reason, { force });
      return { ok: true };
    }

    function setRenderQuality(mode) {
      const m = String(mode || '').trim().toLowerCase();
      state.renderQuality = (m === 'auto' || m === 'high' || m === 'extreme') ? m : 'balanced';
      void (async () => {
        await safeInvoke(hg, 'command', ['apply-profile', 'gpu-hq']);
        if (state.renderQuality === 'high' || state.renderQuality === 'extreme') {
          await safeInvoke(hg, 'setProperty', 'scale', 'ewa_lanczossharp');
        }
        if (state.renderQuality === 'extreme') {
          await safeInvoke(hg, 'setProperty', 'cscale', 'ewa_lanczossharp');
        }
      })();
      return { ok: true };
    }

    async function setRespectSubtitleStyles(enabled) {
      respectSubtitleStyles = !!enabled;
      await applySubtitleSafeMargin();
      return { ok: true };
    }

    async function setSubtitleHudLift(px) {
      const next = clamp(toFiniteNumber(px, state.subtitleHudLiftPx), 0, 300);
      state.subtitleHudLiftPx = next;
      await applySubtitleSafeMargin();
      return { ok: true, value: next };
    }

    async function takeScreenshot() {
      const res = await safeInvoke(hg, 'command', ['screenshot']);
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'screenshot_failed' };
      return { ok: true };
    }

    function getRenderStats() {
      const elapsedSec = Math.max(1, (Date.now() - renderStats.createdAtMs) / 1000);
      const avgDraw = renderStats.frameCount > 0 ? (renderStats.drawTimeTotalMs / renderStats.frameCount) : 0;
      return {
        frameCount: renderStats.frameCount,
        quality: state.renderQuality,
        sharedBufferEnabled: true,
        surfaceWidth: canvas ? canvas.width : 0,
        surfaceHeight: canvas ? canvas.height : 0,
        sourceWidth: renderStats.sourceWidth || state.width || 0,
        sourceHeight: renderStats.sourceHeight || state.height || 0,
        effectiveMaxPixelsCap: 0,
        devicePixelRatio: toFiniteNumber(window.devicePixelRatio, 1),
        updatesPerSecond: renderStats.propertyUpdateCount / elapsedSec,
        drawsPerSecond: renderStats.frameCount / elapsedSec,
        averageDrawTimeMs: avgDraw,
        lastDrawTimeMs: renderStats.lastDrawTimeMs,
      };
    }

    async function command(args) {
      const arr = Array.isArray(args) ? args.map((x) => String(x)) : [];
      if (!arr.length) return { ok: false, error: 'missing_command' };
      return safeInvoke(hg, 'command', arr);
    }

    async function getProperty(name) {
      return safeInvoke(hg, 'getProperty', String(name || ''));
    }

    async function setProperty(name, value) {
      return safeInvoke(hg, 'setProperty', String(name || ''), pickMpvString(value));
    }

    async function play() {
      const res = await safeInvoke(hg, 'setProperty', 'pause', 'no');
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'play_failed' };
      state.paused = false;
      emit('play', { paused: false });
      return { ok: true };
    }

    async function pause() {
      const res = await safeInvoke(hg, 'setProperty', 'pause', 'yes');
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'pause_failed' };
      state.paused = true;
      emit('pause', { paused: true });
      return { ok: true };
    }

    async function togglePlay() {
      const res = await safeInvoke(hg, 'command', ['cycle', 'pause']);
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'toggle_play_failed' };
      await refreshStateSnapshot();
      emit(state.paused ? 'pause' : 'play', { paused: state.paused });
      return { ok: true };
    }

    async function seekTo(seconds) {
      const sec = Math.max(0, toFiniteNumber(seconds, 0));
      const res = await safeInvoke(hg, 'command', ['seek', String(sec), 'absolute', 'exact']);
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'seek_failed' };
      state.timeSec = sec;
      emit('time', { value: sec });
      return { ok: true };
    }

    async function seekToFast(seconds) {
      const sec = Math.max(0, toFiniteNumber(seconds, 0));
      const res = await safeInvoke(hg, 'command', ['seek', String(sec), 'absolute+keyframes']);
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'seek_failed' };
      state.timeSec = sec;
      emit('time', { value: sec });
      return { ok: true };
    }

    async function seekBy(seconds) {
      const sec = toFiniteNumber(seconds, 0);
      const res = await safeInvoke(hg, 'command', ['seek', String(sec), 'relative']);
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'seek_by_failed' };
      await refreshStateSnapshot();
      emit('time', { value: state.timeSec });
      return { ok: true };
    }

    async function setVolume(volume01) {
      const v = clamp(toFiniteNumber(volume01, state.volume), 0, 1);
      const res = await safeInvoke(hg, 'setProperty', 'volume', String(v * 100));
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'set_volume_failed' };
      state.volume = v;
      emit('volume', { volume: v, muted: !!state.muted });
      return { ok: true };
    }

    async function setMuted(nextMuted) {
      const v = !!nextMuted;
      const res = await safeInvoke(hg, 'setProperty', 'mute', v ? 'yes' : 'no');
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'set_muted_failed' };
      state.muted = v;
      emit('volume', { volume: state.volume, muted: v });
      return { ok: true };
    }

    async function setSpeed(nextSpeed) {
      const v = clamp(toFiniteNumber(nextSpeed, state.speed), 0.1, 8);
      const res = await safeInvoke(hg, 'setProperty', 'speed', String(v));
      if (!res || res.ok === false) return { ok: false, error: res && res.error ? String(res.error) : 'set_speed_failed' };
      state.speed = v;
      emit('speed', { speed: v });
      return { ok: true };
    }

    async function stop() {
      await pause();
      await seekTo(0);
      return { ok: true };
    }

    // Event wiring
    if (typeof hg.onPropertyChange === 'function') {
      cleanupFns.push(hg.onPropertyChange((payload) => {
        const p = (payload && typeof payload === 'object') ? payload : {};
        applyPropertyChange(p.name, p.value);
      }));
    }

    if (typeof hg.onFileLoaded === 'function') {
      cleanupFns.push(hg.onFileLoaded(() => {
        state.ready = true;
        state.eofReached = false;
        suppressEofSignals = false;
        if (!readyEmitted) {
          readyEmitted = true;
          emit('ready', { ok: true });
        }
        pushParityTrace('hg:file-loaded', {});
        emit('file-loaded', { ok: true, loadId: currentLoadId });
        void refreshStateSnapshot();
        void refreshTrackList();
        void applyPendingStartSeek();
        void applySubtitleSafeMargin();
      }));
    }

    if (typeof hg.onEof === 'function') {
      cleanupFns.push(hg.onEof((payload) => {
        const reason = String((payload && payload.reason) || '').toLowerCase();
        if (reason === 'shutdown') return;
        if (suppressEofSignals || !state.ready) return;
        if (!state.eofReached) {
          state.eofReached = true;
          emit('ended', { eof: true });
        }
      }));
    }

    if (typeof hg.onVideoFrame === 'function') {
      cleanupFns.push(hg.onVideoFrame((videoFrame) => {
        queueIncomingVideoFrame(videoFrame);
      }));
    }

    createCanvasSurface();
    startStatePoll();

    function getRecentEvents(limit) {
      const n = Math.max(1, Math.min(200, Math.floor(toFiniteNumber(limit, 80))));
      return parityTrace.slice(-n).map((e) => ({ ...e }));
    }

    function getParitySnapshot() {
      const rs = getRenderStats();
      const st = getState();
      return {
        contractVersion: HG_PARITY_CONTRACT_VERSION,
        eventNames: HG_PARITY_EVENT_NAMES.slice(),
        kind: 'mpv',
        windowMode: 'embedded-libmpv',
        filePath: currentFilePath || '',
        loadId: currentLoadId || 0,
        ready: !!state.ready,
        gpuInitialized: !!gpuInitialized,
        videoSyncDisplayResample: !!videoSyncResampleEnabled,
        state: st,
        renderStats: rs,
        tracks: {
          count: Array.isArray(state.trackList) ? state.trackList.length : 0,
          audioTrackId: state.audioTrackId == null ? null : String(state.audioTrackId),
          subtitleTrackId: state.subtitleTrackId == null ? null : String(state.subtitleTrackId),
          subtitlesVisible: !!state.subtitlesVisible,
        },
        chapters: { count: Array.isArray(state.chapterList) ? state.chapterList.length : 0 },
        recentEvents: getRecentEvents(40),
      };
    }

    const adapter = {
      kind: 'mpv',
      windowMode: 'embedded-libmpv',
      capabilities: {
        tracks: true,
        delays: true,
        transforms: true,
        externalSubtitles: true,
        screenshots: true,
      },
      parityContractVersion: HG_PARITY_CONTRACT_VERSION,
      parityEventNames: HG_PARITY_EVENT_NAMES.slice(),

      on: emitter.on,

      load,
      play,
      pause,
      togglePlay,
      seekTo,
      seekToFast,
      seekBy,
      stop,
      unload,
      destroy,

      command,
      getProperty,
      setProperty,
      getState,
      getDuration,
      getChapters,

      setVolume,
      setMuted,
      setSpeed,
      setBounds,
      setRenderQuality,
      getRenderStats,
      takeScreenshot,
      setSubtitleHudLift,
      getParitySnapshot,
      getRecentEvents,

      getAudioTracks,
      getSubtitleTracks,
      getCurrentAudioTrack,
      getCurrentSubtitleTrack,
      setAudioTrack,
      setSubtitleTrack,
      selectSubtitleTrack: setSubtitleTrack,
      cycleAudioTrack,
      cycleSubtitleTrack,
      toggleSubtitles,
      addExternalSubtitle,

      getAudioDelay,
      setAudioDelay,
      getSubtitleDelay,
      setSubtitleDelay,

      getAspectRatio,
      setAspectRatio,
      getCrop,
      setCrop,
      resetVideoTransforms,
      setRespectSubtitleStyles,
    };

    return adapter;
  }

  window.createHolyGrailAdapter = createHolyGrailAdapter;
})();
