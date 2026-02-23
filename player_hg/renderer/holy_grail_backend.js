// Holy Grail adapter backend.
// Implements the VideoAdapter interface using the mpv + D3D11 + sharedTexture pipeline.
// Replaces <video> with a <canvas> that receives GPU VideoFrames via the preload bridge.
(function () {
  'use strict';

  var utils = window.TankoPlayer.utils;
  var toFiniteNumber = utils.toFiniteNumber;
  var clamp = utils.clamp;

  function createHolyGrailBackend(opts) {
    var hg = (opts && opts.bridge) || window.HolyGrailBridge;
    if (!hg) throw new Error('holy_grail_backend: no HolyGrailBridge available (pass opts.bridge or set window.HolyGrailBridge)');

    var hostEl = opts.hostElement || opts.hostEl;
    if (!hostEl) throw new Error('holy_grail_backend: opts.hostElement is required');

    // ── Internal state ──

    var listeners = new Map();
    var destroyed = false;
    var gpuInitialized = false;
    var frameLoopStarted = false;
    var loadSeq = 0;
    var firstFrameEmitted = false;
    var loadStartedAtMs = 0;
    var suppressEof = false;
    var lastTrackSig = '';
    var lastChapterSig = '';
    var lastSubtitleTrackId = null;
    var resizeObserver = null;
    var resizeTimer = null;
    var lastResizeW = 0;
    var lastResizeH = 0;
    var cleanupFns = [];
    var destroyPromise = null;

    // Build 1 audit state
    var canvasSizeDirty = true;

    // Deduplicate ended() per load cycle (HG_EOF + eof-reached can both fire)
    var endedEmittedForLoadSeq = 0;

    // Property-event health tracking (for adaptive polling fallback)
    var propertyEventsSeen = 0;
    var lastPropertyEventAt = 0;
    var trackListEverSeen = false;
    var chapterListEverSeen = false;

    // Adaptive polling (replace always-on fixed 250ms interval)
    var pollTimer = null;
    var pollInFlight = false;
    var pollTrackCounter = 0;

    // Build 3 audit state (renderer presentation)
    var pageVisible = (typeof document !== 'undefined') ? (document.visibilityState !== 'hidden') : true;

    // Build 5: diagnostics state
    var diagOverlay = null;
    var diagEnabled = false;
    var offDiagnostics = null;
    var lastDiagSnapshot = null;

    var drawCache = {
      valid: false,
      canvasW: 0,
      canvasH: 0,
      srcW: 0,
      srcH: 0,
      aspectRatio: null,
      crop: null,
      dx: 0,
      dy: 0,
      dw: 0,
      dh: 0,
      needsClear: true,
      flipY: true,
    };

    var renderPressure = {
      droppedFrames: 0,
      lastDropAt: 0,
      consecutiveReplacements: 0,
    };

    var hotPublish = {
      timer: null,
      queued: false,
      lastUiPushAt: 0,
      minIntervalMs: 80,
    };

    // Pending seek state (TankobanPlus pattern): queue a seek target that the
    // poll loop retries every 200ms until the position lands within tolerance.
    var _pendingSeekSec = null;
    var _pendingSeekIssuedAt = 0;
    var _pendingSeekAttempts = 0;
    var _pendingSeekUnpause = false;
    var _pendingSeekStartMs = 0;
    var _resumeOverlay = null;

    function showResumeOverlay() {
      if (_resumeOverlay || !hostEl) return;
      _resumeOverlay = document.createElement('div');
      _resumeOverlay.style.cssText = 'position:absolute;inset:0;z-index:10;background:#000;display:flex;align-items:center;justify-content:center;pointer-events:none;';
      _resumeOverlay.innerHTML = '<div style="color:rgba(255,255,255,0.6);font:500 14px/1 system-ui,sans-serif;letter-spacing:0.5px;">Resuming\u2026</div>';
      hostEl.appendChild(_resumeOverlay);
    }

    function hideResumeOverlay() {
      if (!_resumeOverlay) return;
      try { _resumeOverlay.remove(); } catch (e) {}
      _resumeOverlay = null;
    }

    var canvas = null;
    var ctx2d = null;
    var pendingFrame = null;
    var framePumpRaf = 0;

    var renderStats = {
      frameCount: 0,
      droppedFrames: 0,
      lastDrawTimeMs: 0,
      sourceWidth: 0,
      sourceHeight: 0,
    };

    // ── Performance logger (2-second intervals) ──
    var perfLog = {
      intervalId: null,
      lastFrameCount: 0,
      lastDropped: 0,
      lastTimestamp: 0,
      drawTimes: [],       // collect draw times per interval
      arrivalTimes: [],    // track frame arrival timestamps for jitter analysis
    };

    function startPerfLog() {
      perfLog.lastFrameCount = renderStats.frameCount;
      perfLog.lastDropped = renderStats.droppedFrames;
      perfLog.lastTimestamp = performance.now();
      perfLog.drawTimes = [];
      perfLog.arrivalTimes = [];
      if (perfLog.intervalId) clearInterval(perfLog.intervalId);
      perfLog.intervalId = setInterval(function () {
        var now = performance.now();
        var elapsed = (now - perfLog.lastTimestamp) / 1000;
        var frames = renderStats.frameCount - perfLog.lastFrameCount;
        var dropped = renderStats.droppedFrames - perfLog.lastDropped;
        var fps = elapsed > 0 ? (frames / elapsed).toFixed(1) : '0';
        var avgDraw = perfLog.drawTimes.length > 0
          ? (perfLog.drawTimes.reduce(function (a, b) { return a + b; }, 0) / perfLog.drawTimes.length).toFixed(2)
          : '—';
        var maxDraw = perfLog.drawTimes.length > 0
          ? Math.max.apply(null, perfLog.drawTimes).toFixed(2)
          : '—';

        // Frame interval jitter: std deviation of inter-frame arrival times
        var jitter = '—';
        if (perfLog.arrivalTimes.length > 2) {
          var intervals = [];
          for (var i = 1; i < perfLog.arrivalTimes.length; i++) {
            intervals.push(perfLog.arrivalTimes[i] - perfLog.arrivalTimes[i - 1]);
          }
          var mean = intervals.reduce(function (a, b) { return a + b; }, 0) / intervals.length;
          var variance = intervals.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / intervals.length;
          jitter = Math.sqrt(variance).toFixed(2);
        }

        console.log(
          '%c[HG PERF]%c FPS: ' + fps +
          ' | Drawn: ' + frames +
          ' | Dropped: ' + dropped +
          ' | Draw avg: ' + avgDraw + 'ms, max: ' + maxDraw + 'ms' +
          ' | Jitter: ' + jitter + 'ms' +
          ' | Pressure: ' + renderPressure.droppedFrames + ' total, ' + renderPressure.consecutiveReplacements + ' consec' +
          ' | Total: ' + renderStats.frameCount + ' frames, ' + renderStats.droppedFrames + ' dropped' +
          ' | Canvas: ' + (canvas ? canvas.width + 'x' + canvas.height : '—') +
          ' | Source: ' + renderStats.sourceWidth + 'x' + renderStats.sourceHeight,
          'color: #0f0; font-weight: bold;', 'color: inherit;'
        );

        emit('perf', {
          droppedFrames: renderPressure.droppedFrames,
          consecutiveReplacements: renderPressure.consecutiveReplacements,
          lastDropAt: renderPressure.lastDropAt,
        });

        perfLog.lastFrameCount = renderStats.frameCount;
        perfLog.lastDropped = renderStats.droppedFrames;
        perfLog.lastTimestamp = now;
        perfLog.drawTimes = [];
        perfLog.arrivalTimes = [];
      }, 2000);
    }

    function stopPerfLog() {
      if (perfLog.intervalId) { clearInterval(perfLog.intervalId); perfLog.intervalId = null; }
    }

    var state = {
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

    // ── Emitter ──

    function on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return function off() {
        var set = listeners.get(event);
        if (set) set.delete(handler);
      };
    }

    function emit(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      var set = listeners.get(event);
      if (!set) return;
      set.forEach(function (fn) {
        try { fn.apply(null, args); } catch (e) { console.error('[hg-backend] event error:', event, e); }
      });
    }

    // ── Canvas creation & frame rendering ──

    function createCanvas() {
      if (canvas) return;
      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.background = '#000';
      canvas.setAttribute('aria-label', 'Video');

      ctx2d = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (ctx2d) {
        ctx2d.imageSmoothingEnabled = true;
        try { ctx2d.imageSmoothingQuality = 'low'; } catch (e) {}
        ctx2d.fillStyle = '#000';
      }

      hostEl.appendChild(canvas);
      canvasSizeDirty = true;
      syncCanvasSize(true);
      setupResizeObserver();
      setupVisibilityObserver();
    }

    function markCanvasSizeDirty() {
      canvasSizeDirty = true;
    }

    function syncCanvasSize(force) {
      if (!canvas || !hostEl) return;
      if (!force && !canvasSizeDirty) return;

      var rect = hostEl.getBoundingClientRect();
      var cssW = Math.max(16, Math.round(rect.width || hostEl.clientWidth || 1280));
      var cssH = Math.max(16, Math.round(rect.height || hostEl.clientHeight || 720));
      var dpr = Math.max(1, toFiniteNumber(window.devicePixelRatio, 1));
      var pxW = Math.max(16, Math.round(cssW * dpr));
      var pxH = Math.max(16, Math.round(cssH * dpr));

      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';

      var changed = false;
      if (canvas.width !== pxW) { canvas.width = pxW; changed = true; }
      if (canvas.height !== pxH) { canvas.height = pxH; changed = true; }

      canvasSizeDirty = false;
      if (changed) invalidateDrawCache();
      return changed;
    }

    function setupResizeObserver() {
      if (typeof ResizeObserver !== 'function') {
        var onResize = function () {
          markCanvasSizeDirty();
          syncCanvasSize(true);
          requestSurfaceResize();
        };
        window.addEventListener('resize', onResize, { passive: true });
        cleanupFns.push(function () { window.removeEventListener('resize', onResize); });
        return;
      }
      resizeObserver = new ResizeObserver(function () {
        markCanvasSizeDirty();
        syncCanvasSize(true);
        requestSurfaceResize();
      });
      resizeObserver.observe(hostEl);
    }

    function requestSurfaceResize() {
      if (!gpuInitialized) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeTimer = null;
        if (!canvas || destroyed) return;
        var w = canvas.width;
        var h = canvas.height;
        if (w === lastResizeW && h === lastResizeH) return;
        if (w < 16 || h < 16) return;
        lastResizeW = w;
        lastResizeH = h;
        hg.resizeSurface({ width: w, height: h }).catch(function () {});
      }, 80);
    }

    // ── Build 3: Visibility observer ──

    function onVisibilityChange() {
      pageVisible = (document.visibilityState !== 'hidden');
      // Build 4: notify main process of visibility change
      hg.setPresentationActive(pageVisible).catch(function () {});
      if (pageVisible && pendingFrame && !framePumpRaf) {
        scheduleFramePump();
      }
    }

    function setupVisibilityObserver() {
      if (typeof document === 'undefined' || !document.addEventListener) return;
      document.addEventListener('visibilitychange', onVisibilityChange);
      cleanupFns.push(function () {
        try { document.removeEventListener('visibilitychange', onVisibilityChange); } catch (e) {}
      });
    }

    // ── Build 3: Geometry cache ──

    function invalidateDrawCache() {
      drawCache.valid = false;
    }

    function parseAspectOverride(aspect) {
      if (!aspect || aspect === 'auto') return 0;
      var parts = String(aspect).split(':');
      if (parts.length === 2) {
        var w = Number(parts[0]);
        var h = Number(parts[1]);
        if (Number.isFinite(w) && Number.isFinite(h) && h > 0) return w / h;
      }
      var n = Number(aspect);
      if (Number.isFinite(n) && n > 0) return n;
      return 0;
    }

    function getOrComputeDrawGeometry(srcW, srcH) {
      if (!canvas) return null;

      var canvasW = canvas.width || 0;
      var canvasH = canvas.height || 0;
      if (canvasW <= 0 || canvasH <= 0 || srcW <= 0 || srcH <= 0) return null;

      var aspect = state.aspectRatio || 'auto';
      var crop = state.crop || 'none';

      if (drawCache.valid &&
          drawCache.canvasW === canvasW &&
          drawCache.canvasH === canvasH &&
          drawCache.srcW === srcW &&
          drawCache.srcH === srcH &&
          drawCache.aspectRatio === aspect &&
          drawCache.crop === crop) {
        return drawCache;
      }

      // Compute destination rect (letterbox/pillarbox fit)
      var videoAspect = srcW / srcH;
      var targetAspect = videoAspect;

      if (aspect && aspect !== 'auto') {
        var parsed = parseAspectOverride(aspect);
        if (parsed > 0) targetAspect = parsed;
      }

      var dx = 0, dy = 0, dw = canvasW, dh = canvasH;
      var canvasAspect = canvasW / canvasH;
      if (canvasAspect > targetAspect) {
        // pillarbox
        dh = canvasH;
        dw = Math.max(1, Math.round(dh * targetAspect));
        dx = Math.round((canvasW - dw) / 2);
        dy = 0;
      } else if (canvasAspect < targetAspect) {
        // letterbox
        dw = canvasW;
        dh = Math.max(1, Math.round(dw / targetAspect));
        dx = 0;
        dy = Math.round((canvasH - dh) / 2);
      }

      drawCache.valid = true;
      drawCache.canvasW = canvasW;
      drawCache.canvasH = canvasH;
      drawCache.srcW = srcW;
      drawCache.srcH = srcH;
      drawCache.aspectRatio = aspect;
      drawCache.crop = crop;
      drawCache.dx = dx;
      drawCache.dy = dy;
      drawCache.dw = dw;
      drawCache.dh = dh;
      drawCache.needsClear = !(dx === 0 && dy === 0 && dw === canvasW && dh === canvasH);
      drawCache.flipY = true;

      return drawCache;
    }

    // ── Build 3: Hot UI publish throttle ──

    function flushHotUiPublish() {
      hotPublish.timer = null;
      hotPublish.queued = false;
      hotPublish.lastUiPushAt = Date.now();
      window.TankoPlayer.state.set({
        timeSec: state.timeSec,
        durationSec: state.durationSec,
        paused: state.paused,
      });
    }

    function scheduleHotUiPublish() {
      if (destroyed) return;
      var now = Date.now();
      var dueIn = hotPublish.minIntervalMs - (now - hotPublish.lastUiPushAt);
      if (dueIn <= 0 && !hotPublish.timer) {
        flushHotUiPublish();
        return;
      }
      if (hotPublish.timer) {
        hotPublish.queued = true;
        return;
      }
      hotPublish.queued = true;
      hotPublish.timer = setTimeout(function () {
        flushHotUiPublish();
      }, Math.max(0, dueIn));
    }

    // ── Build 5: Diagnostics overlay (F8 toggle) ──

    function createDiagOverlay() {
      if (diagOverlay || !hostEl) return;
      diagOverlay = document.createElement('div');
      diagOverlay.style.cssText = 'position:absolute;top:8px;left:8px;z-index:100;background:rgba(0,0,0,0.75);color:#0f0;font:11px/1.4 monospace;padding:6px 10px;pointer-events:none;white-space:pre;border-radius:4px;max-width:420px;overflow:hidden;';
      diagOverlay.textContent = '[HG DIAG] waiting…';
      hostEl.appendChild(diagOverlay);
    }

    function removeDiagOverlay() {
      if (!diagOverlay) return;
      try { diagOverlay.remove(); } catch (e) {}
      diagOverlay = null;
    }

    function updateDiagOverlay(snap) {
      if (!diagOverlay || !snap) return;
      var lines = [
        'FLoop: ' + (snap.frameLoopTicks || 0) + '  ELoop: ' + (snap.eventLoopTicks || 0),
        'Produced: ' + (snap.framesProduced || 0) + '  Sent: ' + (snap.framesSent || 0) + '  Errors: ' + (snap.frameSendErrors || 0),
        'Hidden: ' + (snap.frameSendSkippedHidden || 0) + '  Busy: ' + (snap.frameSendSkippedBusy || 0),
        'Cache H/M/R: ' + (snap.importCacheHits || 0) + '/' + (snap.importCacheMisses || 0) + '/' + (snap.importCacheResets || 0),
        'HotQ: ' + (snap.hotPropsQueued || 0) + '  HotF: ' + (snap.hotPropsFlushed || 0),
        'Props: ' + (snap.propertyEventsTotal || 0) + '  Poll: ' + (snap.pollEventsCalls || 0),
        'Active: ' + (snap.presentationActive ? 'Y' : 'N') + '  Token: ' + (snap.runToken || 0) + '/' + (snap.frameLoopToken || 0),
      ];
      if (snap.lastError) lines.push('ERR: ' + snap.lastError);
      diagOverlay.textContent = lines.join('\n');
    }

    function toggleDiagnostics() {
      diagEnabled = !diagEnabled;
      if (diagEnabled) {
        createDiagOverlay();
        hg.setDiagnosticsEnabled(true).catch(function () {});
        offDiagnostics = hg.onDiagnostics(function (snap) {
          lastDiagSnapshot = snap;
          updateDiagOverlay(snap);
        });
      } else {
        hg.setDiagnosticsEnabled(false).catch(function () {});
        if (typeof offDiagnostics === 'function') { offDiagnostics(); offDiagnostics = null; }
        removeDiagOverlay();
        lastDiagSnapshot = null;
      }
    }

    function onDiagKeydown(e) {
      if (e.key === 'F8' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        toggleDiagnostics();
      }
    }

    // Wire F8 key listener
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', onDiagKeydown);
      cleanupFns.push(function () {
        try { document.removeEventListener('keydown', onDiagKeydown); } catch (e) {}
      });
    }

    function drawFrame(videoFrame) {
      if (!videoFrame) return;
      if (!ctx2d || !canvas) { closeFrameSafe(videoFrame); return; }

      // Build 3: hidden page — drop frame quickly
      if (!pageVisible) {
        closeFrameSafe(videoFrame);
        return;
      }

      var srcW = Math.max(1, toFiniteNumber(videoFrame.displayWidth || videoFrame.codedWidth, 1));
      var srcH = Math.max(1, toFiniteNumber(videoFrame.displayHeight || videoFrame.codedHeight, 1));

      var geom = getOrComputeDrawGeometry(srcW, srcH);
      if (!geom) {
        closeFrameSafe(videoFrame);
        return;
      }

      var t0 = performance.now();

      try {
        // Build 3: only clear when bars / uncovered regions exist
        if (geom.needsClear) {
          ctx2d.fillRect(0, 0, canvas.width, canvas.height);
        }

        // SharedTexture → VideoFrame arrives vertically inverted. Flip it.
        ctx2d.save();
        ctx2d.translate(0, canvas.height);
        ctx2d.scale(1, -1);
        var flippedDy = canvas.height - (geom.dy + geom.dh);
        ctx2d.drawImage(videoFrame, geom.dx, flippedDy, geom.dw, geom.dh);
        ctx2d.restore();
      } catch (err) {
        console.error('[hg-backend] draw error:', err);
      } finally {
        closeFrameSafe(videoFrame);
      }

      var drawMs = performance.now() - t0;
      renderStats.frameCount += 1;
      renderStats.lastDrawTimeMs = drawMs;
      if (perfLog.intervalId) perfLog.drawTimes.push(drawMs);
      renderStats.sourceWidth = srcW;
      renderStats.sourceHeight = srcH;

      state.width = srcW;
      state.height = srcH;

      if (!firstFrameEmitted && loadSeq > 0) {
        firstFrameEmitted = true;

        // Build 1: "ready" means first frame is actually visible.
        state.ready = true;
        emit('ready');
        window.TankoPlayer.state.set({ ready: true, fileLoaded: true });

        emit('first-frame', {
          sinceLoadMs: loadStartedAtMs ? Math.max(0, Date.now() - loadStartedAtMs) : null,
          frameCount: renderStats.frameCount,
          sourceWidth: srcW,
          sourceHeight: srcH,
        });
      }
    }

    function closeFrameSafe(frame) {
      try { if (frame && typeof frame.close === 'function') frame.close(); } catch (e) {}
    }

    function scheduleFramePump() {
      if (framePumpRaf || destroyed) return;
      if (!pageVisible) return;
      framePumpRaf = requestAnimationFrame(function () {
        framePumpRaf = 0;
        if (destroyed) {
          if (pendingFrame) { closeFrameSafe(pendingFrame); pendingFrame = null; }
          return;
        }
        var frame = pendingFrame;
        pendingFrame = null;
        if (frame) drawFrame(frame);
        if (pendingFrame && pageVisible && !framePumpRaf && !destroyed) {
          scheduleFramePump();
        }
      });
    }

    function queueVideoFrame(videoFrame) {
      if (!videoFrame) return;
      if (destroyed || !gpuInitialized) {
        closeFrameSafe(videoFrame);
        return;
      }
      if (perfLog.intervalId) perfLog.arrivalTimes.push(performance.now());
      if (pendingFrame) {
        renderStats.droppedFrames += 1;
        renderPressure.droppedFrames += 1;
        renderPressure.lastDropAt = Date.now();
        renderPressure.consecutiveReplacements += 1;
        closeFrameSafe(pendingFrame);
      } else {
        renderPressure.consecutiveReplacements = 0;
      }
      pendingFrame = videoFrame;

      // Build 3: when hidden, close frame immediately instead of drawing
      if (!pageVisible) {
        closeFrameSafe(pendingFrame);
        pendingFrame = null;
        return;
      }
      scheduleFramePump();
    }

    // ── GPU init ──

    function ensureGpu() {
      if (gpuInitialized) return Promise.resolve({ ok: true });
      var w = canvas ? canvas.width : 1920;
      var h = canvas ? canvas.height : 1080;
      return hg.initGpu({ width: w, height: h }).then(function (res) {
        if (res && res.ok) {
          gpuInitialized = true;
          lastResizeW = w;
          lastResizeH = h;
          applyRenderDefaults();
          observeProperties();
          startStatePoll();
        }
        return res;
      });
    }

    function applyRenderDefaults() {
      // Conservative fidelity defaults matching the old adapter
      hg.setProperty('scale', 'ewa_lanczossharp').catch(function () {});
      hg.setProperty('cscale', 'spline36').catch(function () {});
      hg.setProperty('dscale', 'mitchell').catch(function () {});
      hg.setProperty('correct-downscaling', 'yes').catch(function () {});
      hg.setProperty('sigmoid-upscaling', 'yes').catch(function () {});
      hg.setProperty('deband', 'yes').catch(function () {});
      hg.setProperty('dither-depth', 'auto').catch(function () {});
    }

    var propertiesObserved = false;
    function observeProperties() {
      if (propertiesObserved) return;
      propertiesObserved = true;
      var props = [
        'time-pos', 'duration', 'pause', 'eof-reached',
        'volume', 'mute', 'speed', 'audio-delay', 'sub-delay',
        'sub-visibility', 'track-list', 'chapter-list',
        'video-aspect-override', 'video-crop',
      ];
      for (var i = 0; i < props.length; i++) {
        hg.observeProperty(props[i]).catch(function () {});
      }
    }

    // ── Wire HG events ──

    var offPropertyChange = hg.onPropertyChange(function (data) {
      if (destroyed) return;
      var name = (data && data.name) ? String(data.name) : '';
      var value = data ? data.value : undefined;

      if (name) {
        propertyEventsSeen += 1;
        lastPropertyEventAt = Date.now();
      }

      applyPropertyChange(name, value);
    });

    function emitEndedOnce(payload) {
      if (destroyed || suppressEof) return false;
      if (loadSeq <= 0) return false;
      if (endedEmittedForLoadSeq === loadSeq) return false;

      endedEmittedForLoadSeq = loadSeq;
      state.eofReached = true;
      state.paused = true;
      emit('ended', payload || { eof: true });
      window.TankoPlayer.state.set({ eofReached: true, paused: true });
      return true;
    }

    var offEof = hg.onEof(function () {
      emitEndedOnce({ eof: true, source: 'event' });
    });

    var offFileLoaded = hg.onFileLoaded(function () {
      if (destroyed) return;

      // Build 1: file is loaded, but do not mark ready until the first frame is drawn.
      emit('file-loaded');
      window.TankoPlayer.state.set({ fileLoaded: true });

      console.log('[hg-backend] file loaded');
      startPerfLog();
    });

    var offVideoFrame = hg.onVideoFrame(function (videoFrame) {
      queueVideoFrame(videoFrame);
    });

    // ── State polling fallback (adaptive) ──
    // Build 1: keep fallback polling, but do not run a hard 250ms loop forever.
    // Use polling only when:
    // - startup / bootstrapping (before property events are confirmed)
    // - pending resume-seek recovery
    // - property events appear stale / unavailable
    //
    // Once property-change events are healthy, back off heavily.

    function hasHealthyPropertyEvents() {
      if (propertyEventsSeen <= 0) return false;
      var ageMs = Date.now() - lastPropertyEventAt;
      return ageMs < 1500;
    }

    function scheduleNextPoll(delayMs) {
      if (destroyed) return;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(pollStateTick, Math.max(50, delayMs || 250));
    }

    function startStatePoll() {
      if (destroyed) return;
      if (pollTimer) return;
      scheduleNextPoll(150);
    }

    function stopStatePoll() {
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
      pollInFlight = false;
      pollTrackCounter = 0;
    }

    function getNextPollDelay() {
      // Fast while resume-seek is in progress
      if (_pendingSeekSec !== null) return 120;

      // Fast until property events are confirmed healthy
      if (!hasHealthyPropertyEvents()) return 250;

      // Property events are flowing → only occasional safety fallback
      return 1500;
    }

    function shouldPollTrackListThisTick() {
      // During seek/startup, allow quicker track/chapter fallback.
      if (_pendingSeekSec !== null) return true;
      if (!trackListEverSeen || !chapterListEverSeen) return true;

      // If property events look unhealthy, poll track-list more often.
      if (!hasHealthyPropertyEvents()) return true;

      // Otherwise keep it sparse (~ every few fallback ticks).
      return false;
    }

    function pollStateTick() {
      if (destroyed || !gpuInitialized) {
        pollTimer = null;
        return;
      }
      if (pollInFlight) {
        scheduleNextPoll(getNextPollDelay());
        return;
      }

      pollInFlight = true;
      pollTimer = null;

      hg.getState().then(function (res) {
        if (!res || !res.ok || !res.state || destroyed) return;
        var s = res.state;

        // Synthesize property-change updates as fallback
        if (s.timePos !== undefined) applyPropertyChange('time-pos', s.timePos);
        if (s.duration !== undefined) applyPropertyChange('duration', s.duration);
        if (s.paused !== undefined) applyPropertyChange('pause', s.paused);
        if (s.eofReached !== undefined) applyPropertyChange('eof-reached', s.eofReached);
        if (s.volume !== undefined) applyPropertyChange('volume', s.volume);
        if (s.muted !== undefined) applyPropertyChange('mute', s.muted);
        if (s.speed !== undefined) applyPropertyChange('speed', s.speed);

        // Build 1: also keep transform state in sync during fallback mode
        if (s.aspectOverride !== undefined) applyPropertyChange('video-aspect-override', s.aspectOverride);
        if (s.videoCrop !== undefined) applyPropertyChange('video-crop', s.videoCrop);

        // Pending seek retry: re-issue seek every 200ms until position lands
        // within 1s of target. Modeled on TankobanPlus video_player_adapter.
        try {
          if (_pendingSeekSec !== null) {
            var tgt = Number(_pendingSeekSec);
            var nowMs = Date.now();
            var durSec = toFiniteNumber(s.duration, 0);
            var timeSec = toFiniteNumber(s.timePos, 0);
            var readyForSeek = durSec > 0;

            if (readyForSeek && tgt > durSec - 2) tgt = Math.max(0, durSec - 5);

            if (readyForSeek && Number.isFinite(tgt)) {
              if (_pendingSeekIssuedAt === 0 || (nowMs - _pendingSeekIssuedAt > 200)) {
                _pendingSeekIssuedAt = nowMs;
                _pendingSeekAttempts += 1;
                hg.command(['seek', String(Math.max(0, tgt)), 'absolute']).catch(function () {});
              }

              if (Number.isFinite(timeSec) && Math.abs(timeSec - tgt) < 1) {
                var shouldUnpause = _pendingSeekUnpause;
                _pendingSeekSec = null;
                _pendingSeekIssuedAt = 0;
                _pendingSeekAttempts = 0;
                _pendingSeekUnpause = false;
                hideResumeOverlay();
                if (shouldUnpause) hg.setProperty('pause', 'no').catch(function () {});
              }
            }

            if (_pendingSeekSec !== null && _pendingSeekStartMs > 0 && (Date.now() - _pendingSeekStartMs > 4000)) {
              _pendingSeekSec = null;
              _pendingSeekStartMs = 0;
              _pendingSeekIssuedAt = 0;
              _pendingSeekAttempts = 0;
              hideResumeOverlay();
              if (_pendingSeekUnpause) {
                _pendingSeekUnpause = false;
                hg.setProperty('pause', 'no').catch(function () {});
              }
            }
          }
        } catch (e) {}
      }).catch(function () {
        // Ignore; fallback scheduler will keep running
      }).finally(function () {
        // Poll track-list/chapter-list sparsely as fallback
        pollTrackCounter += 1;
        var doTrackPoll = shouldPollTrackListThisTick();

        // In healthy mode, only every ~4 ticks (~6s with 1500ms base)
        if (!doTrackPoll && (pollTrackCounter % 4 === 0)) {
          doTrackPoll = true;
        }

        if (doTrackPoll && !destroyed && gpuInitialized) {
          hg.getTrackList().then(function (res) {
            if (!res || !res.ok || !Array.isArray(res.tracks) || destroyed) return;
            applyPropertyChange('track-list', res.tracks);
          }).catch(function () {});
        }

        pollInFlight = false;
        if (!destroyed && gpuInitialized) {
          scheduleNextPoll(getNextPollDelay());
        }
      });
    }

    // ── Property change dispatch ──

    function applyPropertyChange(name, value) {
      if (!name) return;

      if (name === 'time-pos') {
        var t = Math.max(0, toFiniteNumber(value, state.timeSec));
        if (t !== state.timeSec) {
          state.timeSec = t;
          emit('time', t);
          scheduleHotUiPublish();
        }
        return;
      }

      if (name === 'duration') {
        var d = Math.max(0, toFiniteNumber(value, state.durationSec));
        if (d !== state.durationSec) {
          state.durationSec = d;
          emit('duration', d);
          scheduleHotUiPublish();
        }
        return;
      }

      if (name === 'pause') {
        var wasPaused = !!state.paused;
        var nowPaused = !!value;
        state.paused = nowPaused;
        if (wasPaused !== nowPaused) {
          emit(nowPaused ? 'pause' : 'play');
          window.TankoPlayer.state.set({ paused: nowPaused });
        }
        return;
      }

      if (name === 'eof-reached') {
        if (suppressEof) { state.eofReached = false; return; }
        var was = !!state.eofReached;
        var next = !!value;
        state.eofReached = next;

        if (!was && next) {
          emitEndedOnce({ eof: true, source: 'property' });
        }
        return;
      }

      if (name === 'volume') {
        var vol = clamp(toFiniteNumber(value, state.volume * 100), 0, 100) / 100;
        if (vol !== state.volume) {
          state.volume = vol;
          emit('volume', vol, state.muted);
          window.TankoPlayer.state.set({ volume: vol });
        }
        return;
      }

      if (name === 'mute') {
        var m = !!value;
        if (m !== state.muted) {
          state.muted = m;
          emit('volume', state.volume, m);
          window.TankoPlayer.state.set({ muted: m });
        }
        return;
      }

      if (name === 'speed') {
        var spd = clamp(toFiniteNumber(value, state.speed), 0.1, 8);
        if (spd !== state.speed) {
          state.speed = spd;
          emit('speed', spd);
          window.TankoPlayer.state.set({ speed: spd });
        }
        return;
      }

      if (name === 'audio-delay') {
        state.audioDelaySec = toFiniteNumber(value, state.audioDelaySec);
        emit('delays', { audioDelaySec: state.audioDelaySec, subtitleDelaySec: state.subtitleDelaySec });
        return;
      }

      if (name === 'sub-delay') {
        state.subtitleDelaySec = toFiniteNumber(value, state.subtitleDelaySec);
        emit('delays', { audioDelaySec: state.audioDelaySec, subtitleDelaySec: state.subtitleDelaySec });
        return;
      }

      if (name === 'sub-visibility') {
        state.subtitlesVisible = !!value;
        return;
      }

      if (name === 'track-list') {
        trackListEverSeen = true;
        normalizeAndStoreTrackList(value);
        return;
      }

      if (name === 'chapter-list') {
        chapterListEverSeen = true;
        normalizeAndStoreChapterList(value);
        return;
      }

      if (name === 'video-aspect-override') {
        var nextAspect = 'auto';

        if (typeof value === 'number') {
          if (Number.isFinite(value) && value !== 0 && value !== -1) {
            nextAspect = String(value);
          }
        } else {
          var v = String(value == null ? '' : value).trim().toLowerCase();
          if (v && v !== 'no' && v !== '0' && v !== '-1' && v !== 'auto') {
            nextAspect = String(value).trim();
          }
        }

        if (nextAspect !== state.aspectRatio) {
          state.aspectRatio = nextAspect;
          invalidateDrawCache();
          emit('transforms', { aspectRatio: state.aspectRatio, crop: state.crop });
        }
        return;
      }

      if (name === 'video-crop') {
        var cropRaw = String(value == null ? '' : value).trim();
        var nextCrop = cropRaw ? cropRaw : 'none';

        if (nextCrop !== state.crop) {
          state.crop = nextCrop;
          invalidateDrawCache();
          emit('transforms', { aspectRatio: state.aspectRatio, crop: state.crop });
        }
        return;
      }

      if (name === '__error__') {
        console.error('[hg-backend] addon error:', value);
        emit('error', String(value || 'Unknown error'));
        return;
      }
    }

    // ── Track normalization ──

    function normalizeTrack(raw) {
      if (!raw || typeof raw !== 'object') return { id: '' };
      return {
        id: String(raw.id != null ? raw.id : ''),
        type: String(raw.type || ''),
        lang: String(raw.lang || raw.language || ''),
        title: String(raw.title || ''),
        codec: String(raw.codec || ''),
        external: !!raw.external,
        selected: !!raw.selected,
      };
    }

    function normalizeAndStoreTrackList(list) {
      var tracks = (Array.isArray(list) ? list : []).map(normalizeTrack).filter(function (t) { return !!t.id; });
      state.trackList = tracks;

      // Update current selections
      var audioSel = null;
      var subSel = null;
      for (var i = 0; i < tracks.length; i++) {
        if (tracks[i].type === 'audio' && tracks[i].selected) audioSel = tracks[i];
        if (tracks[i].type === 'sub' && tracks[i].selected) subSel = tracks[i];
      }
      state.audioTrackId = audioSel ? String(audioSel.id) : null;
      state.subtitleTrackId = subSel ? String(subSel.id) : null;
      if (subSel) lastSubtitleTrackId = String(subSel.id);
      state.subtitlesVisible = !!subSel;

      var sig = JSON.stringify(tracks.map(function (t) {
        return { id: t.id, type: t.type, selected: t.selected, lang: t.lang, title: t.title };
      }));
      if (sig !== lastTrackSig) {
        lastTrackSig = sig;
        emit('tracks', {
          tracks: tracks.slice(),
          audioTracks: tracks.filter(function (t) { return t.type === 'audio'; }),
          subtitleTracks: tracks.filter(function (t) { return t.type === 'sub'; }),
          audioTrackId: state.audioTrackId,
          subtitleTrackId: state.subtitleTrackId,
          subtitlesVisible: state.subtitlesVisible,
        });
      }
    }

    function normalizeAndStoreChapterList(list) {
      var out = [];
      var items = Array.isArray(list) ? list : [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var t = toFiniteNumber(item && (item.time != null ? item.time : item.timeSec != null ? item.timeSec : item.start), NaN);
        if (!isFinite(t)) continue;
        out.push({
          timeSec: t,
          title: String((item && (item.title || item.name)) || ''),
        });
      }
      out.sort(function (a, b) { return a.timeSec - b.timeSec; });
      state.chapterList = out;

      var sig = JSON.stringify(out.map(function (c) { return { timeSec: c.timeSec, title: c.title }; }));
      if (sig !== lastChapterSig) {
        lastChapterSig = sig;
        emit('chapters', { chapters: out.slice(), count: out.length });
      }
    }

    // ── Adapter methods ──

    function load(filePath, loadOpts) {
      loadSeq += 1;
      endedEmittedForLoadSeq = 0;
      trackListEverSeen = false;
      chapterListEverSeen = false;
      propertyEventsSeen = 0;
      lastPropertyEventAt = 0;
      pollTrackCounter = 0;
      firstFrameEmitted = false;
      loadStartedAtMs = Date.now();
      state.ready = false;
      state.eofReached = false;
      state.timeSec = 0;
      state.durationSec = 0;
      invalidateDrawCache();
      window.TankoPlayer.state.set({ ready: false, fileLoaded: false, filePath: filePath });

      // Build 4: ensure main knows we're visible for frame production
      hg.setPresentationActive(pageVisible).catch(function () {});

      createCanvas();

      suppressEof = true;
      setTimeout(function () { suppressEof = false; }, 500);

      // Queue pending seek if startSeconds is provided (TankobanPlus pattern).
      // The poll loop will retry seeking every 200ms until the position lands.
      var startSec = (loadOpts && Number.isFinite(Number(loadOpts.startSeconds)))
        ? Number(loadOpts.startSeconds) : 0;
      _pendingSeekSec = (startSec > 2) ? startSec : null;
      _pendingSeekStartMs = (startSec > 2) ? Date.now() : 0;
      _pendingSeekIssuedAt = 0;
      _pendingSeekAttempts = 0;
      _pendingSeekUnpause = (startSec > 2);
      if (_pendingSeekSec !== null) showResumeOverlay();
      else hideResumeOverlay();

      return ensureGpu().then(function (gpuRes) {
        if (!gpuRes || !gpuRes.ok) {
          return { ok: false, error: 'GPU init failed: ' + ((gpuRes && gpuRes.error) || 'unknown') };
        }
        // Pause before load to avoid briefly playing from 00:00 before seek lands.
        if (_pendingSeekSec !== null) {
          hg.setProperty('pause', 'yes').catch(function () {});
        }
        return hg.loadFile(filePath);
      }).then(function (loadRes) {
        if (!loadRes || !loadRes.ok) {
          return { ok: false, error: (loadRes && loadRes.error) || 'load failed' };
        }
        if (!frameLoopStarted) {
          frameLoopStarted = true;
          hg.startFrameLoop().catch(function () {});
        }
        // Re-apply volume/mute/speed after GPU init (they may have been set
        // before the domain was ready, causing silent IPC failures)
        hg.setProperty('volume', String(Math.round(state.volume * 100))).catch(function () {});
        hg.setProperty('mute', state.muted ? 'yes' : 'no').catch(function () {});
        if (state.speed !== 1) {
          hg.setProperty('speed', String(state.speed)).catch(function () {});
        }
        // Request resize to match current canvas
        requestSurfaceResize();
        return { ok: true };
      });
    }

    function play() {
      state.paused = false;
      emit('play');
      window.TankoPlayer.state.set({ paused: false });
      return hg.setProperty('pause', 'no').then(function () { return { ok: true }; });
    }

    function pause() {
      state.paused = true;
      emit('pause');
      window.TankoPlayer.state.set({ paused: true });
      return hg.setProperty('pause', 'yes').then(function () { return { ok: true }; });
    }

    function togglePlay() {
      if (state.paused) return play();
      return pause();
    }

    function seekTo(seconds) {
      var sec = toFiniteNumber(seconds, 0);
      if (sec < 0) sec = 0;
      if (state.durationSec > 0 && sec > state.durationSec) sec = state.durationSec;
      state.eofReached = false;
      return hg.command(['seek', String(sec), 'absolute']).then(function () { return { ok: true }; });
    }

    function seekToFast(seconds) {
      var sec = toFiniteNumber(seconds, 0);
      if (sec < 0) sec = 0;
      if (state.durationSec > 0 && sec > state.durationSec) sec = state.durationSec;
      state.eofReached = false;
      return hg.command(['seek', String(sec), 'absolute+keyframes']).then(function () { return { ok: true }; });
    }

    function seekBy(deltaSec) {
      state.eofReached = false;
      return hg.command(['seek', String(deltaSec), 'relative']).then(function () { return { ok: true }; });
    }

    function stop() {
      return pause().then(function () {
        return seekTo(0);
      });
    }

    function unload() {
      return hg.command(['stop']).then(function () {
        state.ready = false;
        state.timeSec = 0;
        state.durationSec = 0;
        endedEmittedForLoadSeq = 0;
        invalidateDrawCache();
        window.TankoPlayer.state.set({ ready: false, fileLoaded: false, filePath: null });
        return { ok: true };
      });
    }

    function destroy() {
      if (destroyPromise) return destroyPromise;

      console.debug('[hg-backend] destroy start');
      destroyed = true;
      stopPerfLog();
      hideResumeOverlay();

      if (hotPublish.timer) { clearTimeout(hotPublish.timer); hotPublish.timer = null; }
      hotPublish.queued = false;

      // Build 5: clean up diagnostics
      if (typeof offDiagnostics === 'function') { offDiagnostics(); offDiagnostics = null; }
      removeDiagOverlay();
      diagEnabled = false;

      // Build 4: notify main we're going away
      hg.setPresentationActive(false).catch(function () {});

      emit('shutdown');

      if (framePumpRaf) { try { cancelAnimationFrame(framePumpRaf); } catch (e) {} }
      framePumpRaf = 0;
      if (pendingFrame) { closeFrameSafe(pendingFrame); pendingFrame = null; }
      if (resizeTimer) clearTimeout(resizeTimer);
      if (resizeObserver) { try { resizeObserver.disconnect(); } catch (e) {} }
      stopStatePoll();

      // Disconnect HG event listeners
      if (typeof offPropertyChange === 'function') offPropertyChange();
      if (typeof offEof === 'function') offEof();
      if (typeof offFileLoaded === 'function') offFileLoaded();
      if (typeof offVideoFrame === 'function') offVideoFrame();

      // Run cleanup functions
      for (var i = 0; i < cleanupFns.length; i++) {
        try { cleanupFns[i](); } catch (e) {}
      }
      cleanupFns = [];

      // Remove canvas
      if (canvas && canvas.parentNode) {
        try { canvas.parentNode.removeChild(canvas); } catch (e) {}
      }
      canvas = null;
      ctx2d = null;

      listeners.clear();

      var bridgeTeardownOps = [
        Promise.resolve().then(function () { return hg.stopFrameLoop(); }).catch(function (err) {
          console.warn('[hg-backend] stopFrameLoop failed during destroy', err);
          return err;
        }),
        Promise.resolve().then(function () { return hg.destroy(); }).catch(function (err) {
          console.warn('[hg-backend] hg.destroy failed during destroy', err);
          return err;
        }),
      ];

      destroyPromise = Promise.allSettled(bridgeTeardownOps).then(function (results) {
        console.debug('[hg-backend] destroy finish', results);
        return results;
      });

      return destroyPromise;
    }

    // ── Query state ──

    function getState() {
      return Object.assign({}, state);
    }

    function getDuration() {
      return state.durationSec;
    }

    function getChapters() {
      return state.chapterList.slice();
    }

    // ── Volume / Speed ──

    function setVolume(vol) {
      var v = clamp(toFiniteNumber(vol, 1), 0, 1);
      state.volume = v;
      return hg.setProperty('volume', String(Math.round(v * 100))).then(function () { return { ok: true }; });
    }

    function setMuted(muted) {
      state.muted = !!muted;
      return hg.setProperty('mute', muted ? 'yes' : 'no').then(function () { return { ok: true }; });
    }

    function setSpeed(speed) {
      var s = clamp(toFiniteNumber(speed, 1), 0.25, 4);
      state.speed = s;
      return hg.setProperty('speed', String(s)).then(function () { return { ok: true }; });
    }

    // ── Tracks ──

    function getAudioTracks() {
      return state.trackList.filter(function (t) { return t.type === 'audio'; });
    }

    function getSubtitleTracks() {
      return state.trackList.filter(function (t) { return t.type === 'sub'; });
    }

    function getCurrentAudioTrack() {
      return state.audioTrackId;
    }

    function getCurrentSubtitleTrack() {
      return state.subtitleTrackId;
    }

    function setAudioTrack(id) {
      return hg.setProperty('aid', String(id)).then(function () {
        state.audioTrackId = String(id);
        return { ok: true };
      });
    }

    function setSubtitleTrack(id) {
      if (id === 'off' || id === 'no' || id === false || id === null) {
        return hg.setProperty('sid', 'no').then(function () {
          state.subtitleTrackId = null;
          state.subtitlesVisible = false;
          return { ok: true };
        });
      }
      return hg.setProperty('sid', String(id)).then(function () {
        state.subtitleTrackId = String(id);
        state.subtitlesVisible = true;
        lastSubtitleTrackId = String(id);
        return { ok: true };
      });
    }

    function cycleAudioTrack() {
      return hg.command(['cycle', 'audio']).then(function () { return { ok: true }; });
    }

    function cycleSubtitleTrack() {
      return hg.command(['cycle', 'sub']).then(function () { return { ok: true }; });
    }

    function toggleSubtitles() {
      if (state.subtitlesVisible) {
        return setSubtitleTrack('no');
      }
      // Re-enable last known subtitle track
      var id = lastSubtitleTrackId || 'auto';
      return setSubtitleTrack(id);
    }

    function addExternalSubtitle(path) {
      return hg.command(['sub-add', String(path)]).then(function () { return { ok: true }; });
    }

    // ── Delays ──

    function getAudioDelay() { return state.audioDelaySec; }

    function setAudioDelay(sec) {
      state.audioDelaySec = toFiniteNumber(sec, 0);
      return hg.setProperty('audio-delay', String(state.audioDelaySec)).then(function () { return { ok: true }; });
    }

    function getSubtitleDelay() { return state.subtitleDelaySec; }

    function setSubtitleDelay(sec) {
      state.subtitleDelaySec = toFiniteNumber(sec, 0);
      return hg.setProperty('sub-delay', String(state.subtitleDelaySec)).then(function () { return { ok: true }; });
    }

    // ── Transforms ──

    function getAspectRatio() { return state.aspectRatio; }

    function setAspectRatio(value) {
      var v = String(value || 'auto');
      if (v === 'auto') v = '-1';
      state.aspectRatio = value || 'auto';
      return hg.setProperty('video-aspect-override', v).then(function () {
        emit('transforms', { aspectRatio: state.aspectRatio, crop: state.crop });
        return { ok: true };
      });
    }

    function getCrop() { return state.crop; }

    function setCrop(value) {
      state.crop = String(value || 'none');
      return hg.setProperty('video-crop', state.crop === 'none' ? '' : state.crop).then(function () {
        emit('transforms', { aspectRatio: state.aspectRatio, crop: state.crop });
        return { ok: true };
      });
    }

    function resetVideoTransforms() {
      state.aspectRatio = 'auto';
      state.crop = 'none';
      return Promise.all([
        hg.setProperty('video-aspect-override', '-1'),
        hg.setProperty('video-crop', ''),
      ]).then(function () {
        emit('transforms', { aspectRatio: 'auto', crop: 'none' });
        return { ok: true };
      });
    }

    // ── Rendering / mpv-only methods ──

    function setBounds() {
      // Canvas fills hostEl automatically via ResizeObserver; no-op
      return Promise.resolve({ ok: true });
    }

    function setRenderQuality(quality) {
      state.renderQuality = String(quality || 'auto');
      return Promise.resolve({ ok: true });
    }

    function getRenderStats() {
      return {
        fps: renderStats.frameCount,
        droppedFrames: renderStats.droppedFrames,
        lastDrawTimeMs: renderStats.lastDrawTimeMs,
        sourceWidth: renderStats.sourceWidth,
        sourceHeight: renderStats.sourceHeight,
      };
    }

    function takeScreenshot() {
      // Capture from mpv directly via command
      return hg.command(['screenshot-to-file', '', 'video']).then(function (res) {
        if (res && res.ok) return { ok: true };
        // Fallback: capture from canvas
        if (!canvas) return { ok: false, error: 'No canvas' };
        try {
          var dataUrl = canvas.toDataURL('image/png');
          return { ok: true, dataUrl: dataUrl };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      });
    }

    function setSubtitleHudLift(px) {
      state.subtitleHudLiftPx = toFiniteNumber(px, 40);
      var marginY = Math.max(0, Math.round(state.subtitleHudLiftPx));
      return hg.setProperty('sub-margin-y', String(marginY)).then(function () { return { ok: true }; });
    }

    function setRespectSubtitleStyles(respect) {
      var mode = respect ? 'no' : 'force';
      return hg.setProperty('sub-ass-override', mode).then(function () { return { ok: true }; });
    }

    function mpvCommand() {
      var args = Array.prototype.slice.call(arguments);
      if (args.length === 1 && Array.isArray(args[0])) args = args[0];
      return hg.command(args).then(function (res) {
        return (res && res.ok) ? res : { ok: false, error: (res && res.error) || 'command failed' };
      });
    }

    function getProperty(name) {
      return hg.getProperty(String(name || '')).then(function (res) {
        return (res && res.ok) ? res.value : null;
      });
    }

    function setPropertyRaw(name, value) {
      return hg.setProperty(String(name || ''), String(value == null ? '' : value)).then(function () {
        return { ok: true };
      });
    }

    // ── Public adapter object ──

    var adapter = {
      kind: 'mpv',
      windowMode: 'embedded-libmpv',
      capabilities: {
        tracks: true,
        delays: true,
        transforms: true,
        externalSubtitles: true,
        screenshots: true,
      },

      on: on,

      load: load,
      play: play,
      pause: pause,
      togglePlay: togglePlay,
      seekTo: seekTo,
      seekToFast: seekToFast,
      seekBy: seekBy,
      stop: stop,
      unload: unload,
      destroy: destroy,

      command: mpvCommand,
      getProperty: getProperty,
      setProperty: setPropertyRaw,
      getState: getState,
      getDuration: getDuration,
      getChapters: getChapters,

      setVolume: setVolume,
      setMuted: setMuted,
      setSpeed: setSpeed,
      setBounds: setBounds,
      setRenderQuality: setRenderQuality,
      getRenderStats: getRenderStats,
      takeScreenshot: takeScreenshot,
      setSubtitleHudLift: setSubtitleHudLift,

      getAudioTracks: getAudioTracks,
      getSubtitleTracks: getSubtitleTracks,
      getCurrentAudioTrack: getCurrentAudioTrack,
      getCurrentSubtitleTrack: getCurrentSubtitleTrack,
      setAudioTrack: setAudioTrack,
      setSubtitleTrack: setSubtitleTrack,
      selectSubtitleTrack: setSubtitleTrack,
      cycleAudioTrack: cycleAudioTrack,
      cycleSubtitleTrack: cycleSubtitleTrack,
      toggleSubtitles: toggleSubtitles,
      addExternalSubtitle: addExternalSubtitle,

      getAudioDelay: getAudioDelay,
      setAudioDelay: setAudioDelay,
      getSubtitleDelay: getSubtitleDelay,
      setSubtitleDelay: setSubtitleDelay,

      getAspectRatio: getAspectRatio,
      setAspectRatio: setAspectRatio,
      getCrop: getCrop,
      setCrop: setCrop,
      resetVideoTransforms: resetVideoTransforms,
      setRespectSubtitleStyles: setRespectSubtitleStyles,
    };

    return adapter;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.createHolyGrailBackend = createHolyGrailBackend;
})();
