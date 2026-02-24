// HTML5 <video> adapter backend.
// Implements the VideoAdapter interface using a standard <video> element.
// Used for standalone development; replaced by holy_grail_adapter when
// embedded in Tankoban Max.
(function () {
  'use strict';

  var toFiniteNumber = window.TankoPlayer.utils.toFiniteNumber;

  function createHtml5Backend(opts) {
    var videoEl = opts.videoElement;
    if (!videoEl) throw new Error('html5_backend: opts.videoElement is required');

    var listeners = new Map();
    var destroyed = false;
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
        try { fn.apply(null, args); } catch (e) { console.error('[html5] event error:', event, e); }
      });
    }

    // ── Bind native <video> events ──

    function onTimeUpdate() {
      state.timeSec = toFiniteNumber(videoEl.currentTime, 0);
      emit('time', state.timeSec);
      // Also push to player_state
      window.TankoPlayer.state.set({ timeSec: state.timeSec });
    }

    function onDurationChange() {
      state.durationSec = toFiniteNumber(videoEl.duration, 0);
      emit('duration', state.durationSec);
      window.TankoPlayer.state.set({ durationSec: state.durationSec });
    }

    function onPlay() {
      state.paused = false;
      state.eofReached = false;
      emit('play');
      window.TankoPlayer.state.set({ paused: false, eofReached: false });
    }

    function onPause() {
      state.paused = true;
      emit('pause');
      window.TankoPlayer.state.set({ paused: true });
    }

    function onEnded() {
      state.eofReached = true;
      state.paused = true;
      emit('ended');
      window.TankoPlayer.state.set({ eofReached: true, paused: true });
    }

    function onVolumeChange() {
      state.volume = toFiniteNumber(videoEl.volume, 1);
      state.muted = videoEl.muted;
      emit('volume', state.volume, state.muted);
      window.TankoPlayer.state.set({ volume: state.volume, muted: state.muted });
    }

    function onLoadedMetadata() {
      state.ready = true;
      state.durationSec = toFiniteNumber(videoEl.duration, 0);
      state.width = videoEl.videoWidth || 0;
      state.height = videoEl.videoHeight || 0;
      emit('ready');
      emit('file-loaded');
      emit('duration', state.durationSec);
      window.TankoPlayer.state.set({
        ready: true,
        fileLoaded: true,
        durationSec: state.durationSec,
        width: state.width,
        height: state.height,
      });
      console.log('[html5] loaded — %dx%d, %.1fs', state.width, state.height, state.durationSec);
    }

    function onError(e) {
      var msg = videoEl.error ? videoEl.error.message : 'Unknown error';
      console.error('[html5] error:', msg);
      emit('error', msg);
    }

    videoEl.addEventListener('timeupdate', onTimeUpdate);
    videoEl.addEventListener('durationchange', onDurationChange);
    videoEl.addEventListener('play', onPlay);
    videoEl.addEventListener('pause', onPause);
    videoEl.addEventListener('ended', onEnded);
    videoEl.addEventListener('volumechange', onVolumeChange);
    videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
    videoEl.addEventListener('error', onError);

    // ── Adapter methods ──

    function load(filePath) {
      state.ready = false;
      state.eofReached = false;
      state.timeSec = 0;
      state.durationSec = 0;
      window.TankoPlayer.state.set({ ready: false, fileLoaded: false, filePath: filePath });

      // Convert local file path to file:// URL for the <video> element.
      // Raw Windows paths (D:\foo\bar.mkv) don't work as src — need file:///D:/foo/bar.mkv
      var src = filePath;
      if (src && !src.startsWith('file://') && !src.startsWith('blob:') && !src.startsWith('http')) {
        src = 'file:///' + src.replace(/\\/g, '/');
      }
      videoEl.src = src;
      videoEl.load();
      return Promise.resolve({ ok: true });
    }

    function play() {
      var p = videoEl.play();
      if (p && p.catch) p.catch(function () {});
      return Promise.resolve({ ok: true });
    }

    function pause() {
      videoEl.pause();
      return Promise.resolve({ ok: true });
    }

    function togglePlay() {
      if (videoEl.paused) return play();
      return pause();
    }

    function seekTo(seconds) {
      var sec = toFiniteNumber(seconds, 0);
      if (sec < 0) sec = 0;
      if (state.durationSec > 0 && sec > state.durationSec) sec = state.durationSec;
      videoEl.currentTime = sec;
      state.eofReached = false;
      return Promise.resolve({ ok: true });
    }

    function seekBy(deltaSec) {
      return seekTo(videoEl.currentTime + deltaSec);
    }

    function stop() {
      videoEl.pause();
      videoEl.currentTime = 0;
      return Promise.resolve({ ok: true });
    }

    function unload() {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load(); // reset
      state.ready = false;
      state.filePath = null;
      window.TankoPlayer.state.set({ ready: false, fileLoaded: false, filePath: null });
      return Promise.resolve({ ok: true });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.removeEventListener('timeupdate', onTimeUpdate);
      videoEl.removeEventListener('durationchange', onDurationChange);
      videoEl.removeEventListener('play', onPlay);
      videoEl.removeEventListener('pause', onPause);
      videoEl.removeEventListener('ended', onEnded);
      videoEl.removeEventListener('volumechange', onVolumeChange);
      videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
      videoEl.removeEventListener('error', onError);
      listeners.clear();
    }

    function getState() {
      return Object.assign({}, state);
    }

    function getDuration() {
      return state.durationSec;
    }

    function getChapters() {
      return []; // HTML5 <video> has no chapter API
    }

    // ── Volume / Speed ──

    function setVolume(vol) {
      videoEl.volume = window.TankoPlayer.utils.clamp(vol, 0, 1);
      state.volume = videoEl.volume;
      return Promise.resolve({ ok: true });
    }

    function setMuted(muted) {
      videoEl.muted = !!muted;
      state.muted = videoEl.muted;
      return Promise.resolve({ ok: true });
    }

    function setSpeed(speed) {
      var s = toFiniteNumber(speed, 1);
      if (s < 0.25) s = 0.25;
      if (s > 4) s = 4;
      videoEl.playbackRate = s;
      state.speed = s;
      emit('speed', s);
      window.TankoPlayer.state.set({ speed: s });
      return Promise.resolve({ ok: true });
    }

    // ── Tracks (limited in HTML5) ──

    function getAudioTracks() { return []; }
    function getSubtitleTracks() { return []; }
    function getCurrentAudioTrack() { return null; }
    function getCurrentSubtitleTrack() { return null; }
    function setAudioTrack() { return Promise.resolve({ ok: false, error: 'Not supported in HTML5 backend' }); }
    function setSubtitleTrack() { return Promise.resolve({ ok: false, error: 'Not supported in HTML5 backend' }); }
    function cycleAudioTrack() { return Promise.resolve({ ok: false, error: 'Not supported' }); }
    function cycleSubtitleTrack() { return Promise.resolve({ ok: false, error: 'Not supported' }); }
    function toggleSubtitles() { return Promise.resolve({ ok: false, error: 'Not supported' }); }
    function addExternalSubtitle() { return Promise.resolve({ ok: false, error: 'Not supported' }); }

    // ── Delays (not supported) ──

    function getAudioDelay() { return 0; }
    function setAudioDelay() { return Promise.resolve({ ok: false, error: 'Not supported' }); }
    function getSubtitleDelay() { return 0; }
    function setSubtitleDelay() { return Promise.resolve({ ok: false, error: 'Not supported' }); }

    // ── Transforms (basic CSS only) ──

    function getAspectRatio() { return state.aspectRatio; }
    function setAspectRatio(value) {
      state.aspectRatio = value || 'auto';
      if (value && value !== 'auto') {
        videoEl.style.objectFit = 'fill';
        videoEl.style.aspectRatio = value.replace(':', '/');
      } else {
        videoEl.style.objectFit = 'contain';
        videoEl.style.aspectRatio = '';
      }
      return Promise.resolve({ ok: true });
    }
    function getCrop() { return 'none'; }
    function setCrop() { return Promise.resolve({ ok: false, error: 'Not supported' }); }
    function resetVideoTransforms() {
      videoEl.style.objectFit = 'contain';
      videoEl.style.aspectRatio = '';
      state.aspectRatio = 'auto';
      state.crop = 'none';
      return Promise.resolve({ ok: true });
    }

    // ── Stubs for mpv-only methods ──

    function setBounds() { return Promise.resolve({ ok: true }); }
    function setRenderQuality() { return Promise.resolve({ ok: true }); }
    function getRenderStats() { return { fps: 0, droppedFrames: 0 }; }
    function takeScreenshot() { return Promise.resolve({ ok: false, error: 'Not supported in HTML5 backend' }); }
    function setSubtitleHudLift() { return Promise.resolve({ ok: true }); }
    function setRespectSubtitleStyles() { return Promise.resolve({ ok: true }); }
    function command() { return Promise.resolve({ ok: false, error: 'Not supported' }); }
    function getProperty() { return null; }
    function setProperty() { return Promise.resolve({ ok: false, error: 'Not supported' }); }

    // ── Public adapter object (matches holy_grail_adapter.js lines 1132-1195) ──

    var adapter = {
      kind: 'html5',
      windowMode: 'embedded-html5',
      capabilities: {
        tracks: false,
        delays: false,
        transforms: false,
        externalSubtitles: false,
        screenshots: false,
      },

      on: on,

      load: load,
      play: play,
      pause: pause,
      togglePlay: togglePlay,
      seekTo: seekTo,
      seekToFast: seekTo, // same as seekTo for HTML5
      seekBy: seekBy,
      stop: stop,
      unload: unload,
      destroy: destroy,

      command: command,
      getProperty: getProperty,
      setProperty: setProperty,
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
  window.TankoPlayer.createHtml5Backend = createHtml5Backend;
})();
