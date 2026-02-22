// VideoAdapter interface contract + factory.
// The adapter interface matches holy_grail_adapter.js (lines 1132-1195).
//
// Any backend (HTML5, mpv, etc.) must implement:
//
//   kind:           string — 'html5' | 'mpv'
//   windowMode:     string — 'embedded-html5' | 'embedded-libmpv'
//   capabilities:   { tracks, delays, transforms, externalSubtitles, screenshots }
//
//   on(event, handler)  -> off()
//
//   load(filePath, opts?)     play()              pause()
//   togglePlay()              seekTo(seconds)     seekBy(deltaSec)
//   stop()                    unload()            destroy()
//   getState()                getDuration()       getChapters()
//
//   setVolume(0-1)            setMuted(bool)      setSpeed(number)
//
//   getAudioTracks()          getSubtitleTracks()
//   getCurrentAudioTrack()    getCurrentSubtitleTrack()
//   setAudioTrack(id)         setSubtitleTrack(id)
//   cycleAudioTrack()         cycleSubtitleTrack()
//   toggleSubtitles()         addExternalSubtitle(path)
//
//   getAudioDelay()           setAudioDelay(sec)
//   getSubtitleDelay()        setSubtitleDelay(sec)
//   getAspectRatio()          setAspectRatio(value)
//   getCrop()                 setCrop(value)
//   resetVideoTransforms()
//
// Events: time, duration, play, pause, ended, volume, speed,
//         ready, error, file-loaded, tracks, chapters
//
(function () {
  'use strict';

  function createAdapter(backendName, opts) {
    if (backendName === 'html5') {
      return window.TankoPlayer.createHtml5Backend(opts);
    }
    if (backendName === 'holy_grail') {
      return window.TankoPlayer.createHolyGrailBackend(opts);
    }
    throw new Error('Unknown adapter backend: ' + backendName);
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.createAdapter = createAdapter;
})();
