// Boot — callable entry point for player_hg.
// Can be invoked from standalone index.html or embedded inside the main app via Shadow DOM.
//
// Usage:
//   var instance = TankoPlayer.boot(opts);
//   instance.loadFile('/path/to/video.mkv');
//   instance.destroy();
//
// opts:
//   root              — Shadow root or document (default: document)
//   backend           — 'html5' | 'holy_grail' (default: auto-detect)
//   embedded          — true when running inside the main app's Shadow DOM
//   holyGrailBridge   — HG bridge object (default: window.HolyGrailBridge)
//   onExit            — called when the user requests exit (Back / Backspace / quit)
//   onFileSwitch      — called when playlist navigates to a new file
(function () {
  'use strict';

  function boot(opts) {
    opts = opts || {};

    var root = opts.root || document;
    var embedded = !!opts.embedded;

    // Store root for modules to use in getElementById lookups
    window.TankoPlayer._root = root;
    window.TankoPlayer._embedded = embedded;

    var stageEl = root.getElementById('playerStage');
    if (!stageEl) throw new Error('[boot] #playerStage not found in root');

    var videoEl = root.getElementById('videoSurface');
    var idleMessage = root.getElementById('idleMessage');
    var openFileBtn = root.getElementById('openFileBtn');
    var dropZone = root.getElementById('dropZone');

    // ── Detect backend ──

    var holyGrailBridge = opts.holyGrailBridge || window.HolyGrailBridge || null;
    var backendName = opts.backend || 'auto';
    if (backendName === 'auto') {
      backendName = (holyGrailBridge && typeof holyGrailBridge.probe === 'function')
        ? 'holy_grail'
        : 'html5';
    }
    var useHolyGrail = (backendName === 'holy_grail');

    if (useHolyGrail) {
      console.log('[boot] Holy Grail backend' + (embedded ? ' (embedded)' : ''));
    } else {
      console.log('[boot] HTML5 backend' + (embedded ? ' (embedded)' : ''));
    }

    // ── PlayerBridge for embedded mode ──

    if (embedded && !window.PlayerBridge) {
      var api = (window.Tanko && window.Tanko.api) ? window.Tanko.api : {};
      window.PlayerBridge = {
        toggleFullscreen: function () {
          if (api.window && api.window.toggleFullscreen) return api.window.toggleFullscreen();
          return Promise.resolve();
        },
        minimize: function () { /* no-op in embedded */ },
        quit: function () {
          if (opts.onExit) opts.onExit();
        },
        setTitle: function () { /* no-op in embedded — main app handles title */ },
        openFileDialog: function () {
          if (api.window && api.window.openFileDialog) return api.window.openFileDialog();
          return Promise.resolve(null);
        },
        openSubtitleDialog: function () {
          if (api.window && api.window.openSubtitleDialog) return api.window.openSubtitleDialog();
          return Promise.resolve(null);
        },
        listFolderVideos: function (folderPath) {
          if (api.files && api.files.listFolderVideos) return api.files.listFolderVideos(folderPath);
          return Promise.resolve([]);
        },
        onFullscreenChange: function () { /* handled by main app */ },
        loadSettings: function () {
          if (api.videoSettings && api.videoSettings.load) return api.videoSettings.load();
          return Promise.resolve(null);
        },
        saveSettings: function (settings) {
          if (api.videoSettings && api.videoSettings.save) return api.videoSettings.save(settings);
          return Promise.resolve();
        },
        saveScreenshot: function (dataUrl, suggestedName) {
          if (api.holyGrail && api.holyGrail.command) {
            return api.holyGrail.command(['screenshot-to-file', '', 'video']).then(function (res) {
              return (res && res.ok) ? { ok: true } : { ok: false };
            });
          }
          return Promise.resolve({ ok: false });
        },
        getLaunchArgs: function () {
          return Promise.resolve(null);
        },
      };
    }

    // ── Create adapter ──

    var adapter = null;

    function initAdapter() {
      if (adapter) return adapter;

      if (useHolyGrail) {
        if (videoEl) videoEl.style.display = 'none';
        adapter = window.TankoPlayer.createAdapter('holy_grail', {
          hostElement: stageEl,
          bridge: holyGrailBridge,
        });
      } else {
        adapter = window.TankoPlayer.createAdapter('html5', {
          videoElement: videoEl,
        });
      }

      // Debug logging
      adapter.on('ready', function () { console.log('[boot] adapter ready'); });
      adapter.on('play', function () { console.log('[boot] playing'); });
      adapter.on('pause', function () { console.log('[boot] paused'); });
      adapter.on('ended', function () { console.log('[boot] ended'); });
      adapter.on('error', function (msg) { console.error('[boot] error:', msg); });

      // Init overlays
      window.TankoPlayer.hud.init(adapter);
      window.TankoPlayer.topStrip.init();
      window.TankoPlayer.volumeHud.init();
      window.TankoPlayer.centerFlash.init();
      window.TankoPlayer.toast.init();
      window.TankoPlayer.contextMenu.init();
      window.TankoPlayer.playlist.init(loadFile);
      window.TankoPlayer.tracksDrawer.init();
      window.TankoPlayer.diagnostics.init();

      // Center flash on play/pause
      adapter.on('play', function () {
        window.TankoPlayer.centerFlash.flash('\u23F8'); // ⏸
      });
      adapter.on('pause', function () {
        window.TankoPlayer.centerFlash.flash('\u25B6'); // ▶
      });

      // Set top strip title and build playlist when file loads
      adapter.on('file-loaded', function () {
        var s = window.TankoPlayer.state.get();
        if (s.filePath) {
          var name = s.filePath.replace(/\\/g, '/').split('/').pop();
          name = name.replace(/\.[^.]+$/, '');
          window.TankoPlayer.topStrip.setTitle(name);
          window.TankoPlayer.playlist.buildFromFolder(s.filePath);
        }
      });

      // Auto-advance on EOF
      adapter.on('ended', function () {
        window.TankoPlayer.playlist.onEnded();
      });

      window._adapter = adapter;

      // Apply saved settings
      adapter.setVolume(volumePercent / 100);
      adapter.setMuted(muted);
      if (currentSpeed !== 1) {
        adapter.setSpeed(currentSpeed);
        if (window.TankoPlayer.hud.setSpeedLabel) {
          window.TankoPlayer.hud.setSpeedLabel(currentSpeed);
        }
      }

      return adapter;
    }

    // ── Load and play a file ──

    function loadFile(filePath) {
      if (!filePath) return;
      initAdapter();

      if (idleMessage) idleMessage.classList.add('hidden');
      if (!useHolyGrail && videoEl) videoEl.style.display = '';

      var filename = filePath.replace(/\\/g, '/').split('/').pop();
      if (window.PlayerBridge && window.PlayerBridge.setTitle) {
        window.PlayerBridge.setTitle(filename);
      }

      console.log('[boot] loading:', filePath);
      adapter.load(filePath).then(function () {
        return adapter.play();
      });

      if (opts.onFileSwitch) opts.onFileSwitch(filePath);
    }

    // ── Open file dialog (standalone idle screen) ──

    if (openFileBtn && !embedded) {
      openFileBtn.addEventListener('click', function () {
        if (window.PlayerBridge && window.PlayerBridge.openFileDialog) {
          window.PlayerBridge.openFileDialog().then(function (path) {
            if (path) loadFile(path);
          });
        }
      });
    }

    // ── Drag and drop (standalone only) ──

    if (!embedded) {
      document.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (dropZone) dropZone.classList.add('active');
      });

      document.addEventListener('dragleave', function (e) {
        if (e.relatedTarget === null && dropZone) {
          dropZone.classList.remove('active');
        }
      });

      document.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (dropZone) dropZone.classList.remove('active');

        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
          var file = files[0];
          if (file.path) loadFile(file.path);
        }
      });
    }

    // ── Seek helper with toast feedback ──

    function doSeek(seconds) {
      if (!adapter) return;
      adapter.seekBy(seconds);
      window.TankoPlayer.hud.show();
      window.TankoPlayer.hud.armAutoHide();
      var mag = Math.abs(seconds);
      var delta = mag < 60 ? mag + 's' : window.TankoPlayer.utils.fmtTime(mag);
      var sym = seconds < 0 ? '\u27EA' : '\u27EB';
      window.TankoPlayer.toast.show(sym + ' ' + delta);
    }

    // ── Volume helper ──

    var volumePercent = 100;
    var muted = false;

    function changeVolume(delta) {
      if (!adapter) return;
      var clamp = window.TankoPlayer.utils.clamp;
      volumePercent = clamp(volumePercent + delta, 0, 100);
      if (muted) {
        muted = false;
        adapter.setMuted(false);
      }
      adapter.setVolume(volumePercent / 100);
      window.TankoPlayer.volumeHud.show(volumePercent);
      scheduleSettingsSave();
    }

    function toggleMute() {
      if (!adapter) return;
      muted = !muted;
      adapter.setMuted(muted);
      window.TankoPlayer.volumeHud.show(muted ? 0 : volumePercent);
      scheduleSettingsSave();
    }

    // ── Speed helper ──

    var speedPresets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];
    var currentSpeed = 1.0;
    var aspectPresets = ['auto', '16:9', '4:3', '2.35:1'];
    var currentAspectIdx = 0;

    // ── Settings persistence (250ms debounce) ──

    var settingsTimer = null;

    function scheduleSettingsSave() {
      if (settingsTimer) clearTimeout(settingsTimer);
      settingsTimer = setTimeout(function () {
        if (window.PlayerBridge && window.PlayerBridge.saveSettings) {
          window.PlayerBridge.saveSettings({
            volume: volumePercent,
            muted: muted,
            speed: currentSpeed,
          });
        }
      }, 250);
    }

    // Load saved settings at boot
    if (window.PlayerBridge && window.PlayerBridge.loadSettings) {
      window.PlayerBridge.loadSettings().then(function (settings) {
        if (!settings) return;
        if (typeof settings.volume === 'number') {
          volumePercent = Math.max(0, Math.min(100, settings.volume));
        }
        if (typeof settings.muted === 'boolean') {
          muted = settings.muted;
        }
        if (typeof settings.speed === 'number' && settings.speed > 0) {
          currentSpeed = settings.speed;
        }
      });
    }

    function cycleSpeed(direction) {
      var idx = speedPresets.indexOf(currentSpeed);
      if (idx === -1) idx = 3;
      var next = Math.max(0, Math.min(speedPresets.length - 1, idx + direction));
      setSpeed(speedPresets[next]);
    }

    function setSpeed(speed) {
      if (!adapter) return;
      currentSpeed = speed;
      adapter.setSpeed(speed);
      window.TankoPlayer.toast.show('Speed ' + speed.toFixed(2) + '\u00D7');
      if (window.TankoPlayer.hud.setSpeedLabel) {
        window.TankoPlayer.hud.setSpeedLabel(speed);
      }
      scheduleSettingsSave();
    }

    // ── Go-to-time helper ──

    function goToTime() {
      if (!adapter) return;
      var s = window.TankoPlayer.state.get();
      var currentFmt = window.TankoPlayer.utils.fmtTime(s.timeSec);
      var input = prompt('Go to time (e.g. 1:23:45 or 83):', currentFmt);
      if (!input) return;
      input = input.trim();
      var seconds = 0;
      var parts = input.split(':');
      if (parts.length === 3) {
        seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
      } else if (parts.length === 2) {
        seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
      } else {
        seconds = parseFloat(input);
      }
      if (isFinite(seconds) && seconds >= 0) {
        adapter.seekTo(seconds);
        window.TankoPlayer.hud.show();
        window.TankoPlayer.hud.armAutoHide();
      }
    }

    // ── Aspect ratio cycle ──

    function cycleAspect() {
      if (!adapter) return;
      currentAspectIdx = (currentAspectIdx + 1) % aspectPresets.length;
      var aspect = aspectPresets[currentAspectIdx];
      adapter.setAspectRatio(aspect);
      var label = aspect === 'auto' ? '\u25AD \u21BA' : '\u25AD ' + aspect;
      window.TankoPlayer.toast.show(label);
    }

    // ── Screenshot ──

    function takeScreenshot() {
      if (!adapter) return;
      if (useHolyGrail && adapter.takeScreenshot) {
        adapter.takeScreenshot().then(function (res) {
          if (res && res.ok) {
            if (res.dataUrl) {
              saveScreenshotDataUrl(res.dataUrl);
            } else {
              window.TankoPlayer.toast.show('Screenshot saved (mpv)');
            }
          } else {
            captureCanvasScreenshot();
          }
        });
        return;
      }

      if (videoEl && videoEl.videoWidth) {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          saveScreenshotDataUrl(canvas.toDataURL('image/png'));
        } catch (e) {
          window.TankoPlayer.toast.show('Screenshot failed: ' + e.message);
        }
      } else {
        window.TankoPlayer.toast.show('No video to capture');
      }
    }

    function captureCanvasScreenshot() {
      var hgCanvas = stageEl.querySelector('canvas');
      if (!hgCanvas || !hgCanvas.width) {
        window.TankoPlayer.toast.show('No video to capture');
        return;
      }
      try {
        saveScreenshotDataUrl(hgCanvas.toDataURL('image/png'));
      } catch (e) {
        window.TankoPlayer.toast.show('Screenshot failed: ' + e.message);
      }
    }

    function saveScreenshotDataUrl(dataUrl) {
      var s = window.TankoPlayer.state.get();
      var filename = 'screenshot_' + Date.now() + '.png';
      if (s.filePath) {
        var name = s.filePath.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '');
        var timeStr = window.TankoPlayer.utils.fmtTime(s.timeSec).replace(/:/g, '-');
        filename = name + '_' + timeStr + '.png';
      }
      if (window.PlayerBridge && window.PlayerBridge.saveScreenshot) {
        window.PlayerBridge.saveScreenshot(dataUrl, filename).then(function (result) {
          window.TankoPlayer.toast.show(result && result.ok ? 'Screenshot saved' : 'Screenshot failed');
        });
      }
    }

    // Expose helpers for context menu + chip buttons
    window.TankoPlayer._cycleSpeed = cycleSpeed;
    window.TankoPlayer._setSpeed = setSpeed;
    window.TankoPlayer._goToTime = goToTime;
    window.TankoPlayer._cycleAspect = cycleAspect;
    window.TankoPlayer._takeScreenshot = takeScreenshot;

    // ── Keyboard shortcuts (standalone only) ──

    if (!embedded) {
      document.addEventListener('keydown', function (e) {
        if (!adapter) return;
        var s = window.TankoPlayer.state.get();
        if (!s.fileLoaded) return;

        var key = e.key;

        if (key === ' ' || key === 'k' || key === 'K') { e.preventDefault(); adapter.togglePlay(); return; }
        if (key === 'ArrowLeft') { e.preventDefault(); doSeek(e.shiftKey ? -30 : -10); return; }
        if (key === 'ArrowRight') { e.preventDefault(); doSeek(e.shiftKey ? 30 : 10); return; }
        if (key === 'j' || key === 'J') { e.preventDefault(); doSeek(-10); return; }
        if (key === 'l' || key === 'L') { e.preventDefault(); doSeek(10); return; }
        if (key === 'ArrowUp') { e.preventDefault(); changeVolume(5); return; }
        if (key === 'ArrowDown') { e.preventDefault(); changeVolume(-5); return; }
        if (key === 'm' || key === 'M') { e.preventDefault(); toggleMute(); return; }

        if (key === 'f' || key === 'F' || key === 'Enter') {
          e.preventDefault();
          if (window.PlayerBridge && window.PlayerBridge.toggleFullscreen) window.PlayerBridge.toggleFullscreen();
          return;
        }
        if (key === 'Escape') {
          var st = window.TankoPlayer.state.get();
          if (st.fullscreen && window.PlayerBridge && window.PlayerBridge.toggleFullscreen) {
            e.preventDefault();
            window.PlayerBridge.toggleFullscreen();
          }
          return;
        }

        if (key === 'c' || key === 'C' || key === ']') { e.preventDefault(); cycleSpeed(+1); return; }
        if (key === 'x' || key === 'X' || key === '[') { e.preventDefault(); cycleSpeed(-1); return; }
        if (key === 'z' || key === 'Z' || key === '\\') { e.preventDefault(); setSpeed(1.0); return; }
        if (key === 'g' || key === 'G') { e.preventDefault(); goToTime(); return; }

        if (key === 'n' || key === 'N') {
          e.preventDefault();
          if (e.shiftKey && adapter.capabilities && adapter.capabilities.tracks) {
            var chapters = adapter.getChapters();
            var s2 = window.TankoPlayer.state.get();
            for (var ci = 0; ci < chapters.length; ci++) {
              if (chapters[ci].timeSec > s2.timeSec + 1) {
                adapter.seekTo(chapters[ci].timeSec);
                window.TankoPlayer.toast.show('Chapter: ' + (chapters[ci].title || (ci + 1)));
                break;
              }
            }
          } else if (!e.shiftKey) {
            window.TankoPlayer.playlist.nextEpisode();
          }
          return;
        }
        if (key === 'p' || key === 'P') {
          e.preventDefault();
          if (e.shiftKey && adapter.capabilities && adapter.capabilities.tracks) {
            var chapters2 = adapter.getChapters();
            var s3 = window.TankoPlayer.state.get();
            for (var cj = chapters2.length - 1; cj >= 0; cj--) {
              if (chapters2[cj].timeSec < s3.timeSec - 2) {
                adapter.seekTo(chapters2[cj].timeSec);
                window.TankoPlayer.toast.show('Chapter: ' + (chapters2[cj].title || (cj + 1)));
                break;
              }
            }
          } else if (!e.shiftKey) {
            window.TankoPlayer.playlist.prevEpisode();
          }
          return;
        }

        if (key === 't' || key === 'T') { e.preventDefault(); window.TankoPlayer.tracksDrawer.toggle(); return; }
        if (key === 'i' || key === 'I') { e.preventDefault(); window.TankoPlayer.diagnostics.toggle(); return; }
        if ((key === 'h' || key === 'H') && e.altKey) { e.preventDefault(); if (adapter.toggleSubtitles) adapter.toggleSubtitles(); return; }

        if ((key === 's' || key === 'S') && e.ctrlKey) { e.preventDefault(); takeScreenshot(); return; }

        if (key === 'a' || key === 'A') {
          e.preventDefault();
          if (adapter.capabilities && adapter.capabilities.tracks) {
            adapter.cycleAudioTrack();
            setTimeout(function () {
              var tracks = adapter.getAudioTracks ? adapter.getAudioTracks() : [];
              var cur = adapter.getCurrentAudioTrack ? adapter.getCurrentAudioTrack() : null;
              for (var ti = 0; ti < tracks.length; ti++) {
                if (tracks[ti].id === cur) {
                  window.TankoPlayer.toast.show('\u266A ' + (tracks[ti].label || 'Track ' + tracks[ti].id));
                  break;
                }
              }
            }, 100);
          }
          return;
        }

        if (key === 's' || key === 'S') {
          e.preventDefault();
          if (adapter.capabilities && adapter.capabilities.tracks) {
            adapter.cycleSubtitleTrack();
            setTimeout(function () {
              var cur2 = adapter.getCurrentSubtitleTrack ? adapter.getCurrentSubtitleTrack() : null;
              if (cur2 === null) {
                window.TankoPlayer.toast.show('CC Off');
              } else {
                var tracks2 = adapter.getSubtitleTracks ? adapter.getSubtitleTracks() : [];
                for (var ti2 = 0; ti2 < tracks2.length; ti2++) {
                  if (tracks2[ti2].id === cur2) {
                    window.TankoPlayer.toast.show('CC ' + (tracks2[ti2].label || 'Subtitle ' + tracks2[ti2].id));
                    break;
                  }
                }
              }
            }, 100);
          }
          return;
        }

        if (key === '>') { e.preventDefault(); if (window.TankoPlayer.tracksDrawer.nudgeSubtitleDelay) window.TankoPlayer.tracksDrawer.nudgeSubtitleDelay(0.1); return; }
        if (key === '<') { e.preventDefault(); if (window.TankoPlayer.tracksDrawer.nudgeSubtitleDelay) window.TankoPlayer.tracksDrawer.nudgeSubtitleDelay(-0.1); return; }
        if (key === '/') { e.preventDefault(); if (window.TankoPlayer.tracksDrawer.setSubtitleDelay) window.TankoPlayer.tracksDrawer.setSubtitleDelay(0); return; }

        if (key === 'Backspace') {
          e.preventDefault();
          if (window.PlayerBridge && window.PlayerBridge.quit) window.PlayerBridge.quit();
          return;
        }
      });

      // Double-click: toggle fullscreen (standalone only)
      stageEl.addEventListener('dblclick', function (e) {
        if (e.button !== 0) return;
        if (window.PlayerBridge && window.PlayerBridge.toggleFullscreen) {
          window.PlayerBridge.toggleFullscreen();
        }
      });

      // Mouse wheel: volume ±5% (standalone only)
      stageEl.addEventListener('wheel', function (e) {
        if (!adapter) return;
        var s = window.TankoPlayer.state.get();
        if (!s.fileLoaded) return;
        e.preventDefault();
        changeVolume(e.deltaY < 0 ? 5 : -5);
      }, { passive: false });

      // Check for --file launch argument (standalone only)
      if (window.PlayerBridge && window.PlayerBridge.getLaunchArgs) {
        window.PlayerBridge.getLaunchArgs().then(function (args) {
          if (args && args.file) loadFile(args.file);
        });
      }

      // Fullscreen state sync (standalone only)
      if (window.PlayerBridge && window.PlayerBridge.onFullscreenChange) {
        window.PlayerBridge.onFullscreenChange(function (isFs) {
          window.TankoPlayer.state.set({ fullscreen: isFs });
          document.body.classList.toggle('fullscreen', isFs);
        });
      }
    }

    // Expose for debugging
    window._adapter = adapter;
    window._loadFile = loadFile;

    // ── Destroy function ──

    function destroy() {
      if (settingsTimer) clearTimeout(settingsTimer);
      try { window.TankoPlayer.hud.destroy(); } catch (e) {}
      try { window.TankoPlayer.topStrip.destroy(); } catch (e) {}
      try { window.TankoPlayer.volumeHud.destroy(); } catch (e) {}
      try { window.TankoPlayer.centerFlash.destroy(); } catch (e) {}
      try { window.TankoPlayer.toast.destroy(); } catch (e) {}
      try { window.TankoPlayer.contextMenu.close(); } catch (e) {}
      try { window.TankoPlayer.playlist.destroy(); } catch (e) {}
      try { window.TankoPlayer.tracksDrawer.destroy(); } catch (e) {}
      try { window.TankoPlayer.diagnostics.destroy(); } catch (e) {}
      try { if (adapter) adapter.destroy(); } catch (e) {}
      adapter = null;
      window._adapter = null;
      window._loadFile = null;
      window.TankoPlayer._root = null;
      window.TankoPlayer._embedded = false;
      if (embedded) {
        window.PlayerBridge = null;
      }
    }

    return {
      adapter: adapter,
      loadFile: loadFile,
      initAdapter: initAdapter,
      destroy: destroy,
      // Expose for video.js integration
      doSeek: doSeek,
      changeVolume: changeVolume,
      toggleMute: toggleMute,
      cycleSpeed: cycleSpeed,
      setSpeed: setSpeed,
      goToTime: goToTime,
      cycleAspect: cycleAspect,
      takeScreenshot: takeScreenshot,
      getAdapter: function () { return adapter; },
    };
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.boot = boot;
})();
