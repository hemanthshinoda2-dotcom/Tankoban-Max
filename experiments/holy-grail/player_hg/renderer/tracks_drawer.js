// Tracks Drawer — audio/subtitle track selection + delay controls.
// Shows "requires mpv backend" for HTML5 backend, functional with mpv adapter.
(function () {
  'use strict';

  var drawer = null;
  var audioListEl = null;
  var subtitleListEl = null;
  var subtitleDelayValueEl = null;
  var audioDelayValueEl = null;

  var subtitleDelaySec = 0;
  var audioDelaySec = 0;

  // ── Delay helpers ──

  function nudgeSubtitleDelay(amount) {
    var adapter = window._adapter;
    if (!adapter || !adapter.capabilities || !adapter.capabilities.delays) {
      window.TankoPlayer.toast.show('Subtitle delay: requires mpv backend');
      return;
    }
    subtitleDelaySec = Math.round((subtitleDelaySec + amount) * 10) / 10;
    subtitleDelaySec = Math.max(-10, Math.min(10, subtitleDelaySec));
    adapter.setSubtitleDelay(subtitleDelaySec);
    updateDelayDisplay();
    window.TankoPlayer.toast.show('Sub delay: ' + subtitleDelaySec.toFixed(1) + 's');
  }

  function setSubtitleDelay(val) {
    var adapter = window._adapter;
    if (!adapter || !adapter.capabilities || !adapter.capabilities.delays) {
      window.TankoPlayer.toast.show('Subtitle delay: requires mpv backend');
      return;
    }
    subtitleDelaySec = val;
    adapter.setSubtitleDelay(subtitleDelaySec);
    updateDelayDisplay();
    window.TankoPlayer.toast.show('Sub delay: ' + subtitleDelaySec.toFixed(1) + 's');
  }

  function nudgeAudioDelay(amount) {
    var adapter = window._adapter;
    if (!adapter || !adapter.capabilities || !adapter.capabilities.delays) {
      window.TankoPlayer.toast.show('Audio delay: requires mpv backend');
      return;
    }
    audioDelaySec = Math.round((audioDelaySec + amount) * 10) / 10;
    audioDelaySec = Math.max(-10, Math.min(10, audioDelaySec));
    adapter.setAudioDelay(audioDelaySec);
    updateDelayDisplay();
    window.TankoPlayer.toast.show('Audio delay: ' + audioDelaySec.toFixed(1) + 's');
  }

  function setAudioDelay(val) {
    var adapter = window._adapter;
    if (!adapter || !adapter.capabilities || !adapter.capabilities.delays) {
      window.TankoPlayer.toast.show('Audio delay: requires mpv backend');
      return;
    }
    audioDelaySec = val;
    adapter.setAudioDelay(audioDelaySec);
    updateDelayDisplay();
    window.TankoPlayer.toast.show('Audio delay: ' + audioDelaySec.toFixed(1) + 's');
  }

  function updateDelayDisplay() {
    if (subtitleDelayValueEl) subtitleDelayValueEl.textContent = subtitleDelaySec.toFixed(1) + 's';
    if (audioDelayValueEl) audioDelayValueEl.textContent = audioDelaySec.toFixed(1) + 's';
  }

  // ── Build content ──

  function buildContent(contentEl) {
    // Audio tracks section
    var audioHeader = document.createElement('div');
    audioHeader.className = 'tracks-section-header';
    audioHeader.textContent = 'Audio Tracks';
    contentEl.appendChild(audioHeader);

    audioListEl = document.createElement('div');
    audioListEl.className = 'tracks-list';
    contentEl.appendChild(audioListEl);

    // Subtitle tracks section
    var subHeader = document.createElement('div');
    subHeader.className = 'tracks-section-header';
    subHeader.textContent = 'Subtitle Tracks';
    contentEl.appendChild(subHeader);

    subtitleListEl = document.createElement('div');
    subtitleListEl.className = 'tracks-list';
    contentEl.appendChild(subtitleListEl);

    // External subtitle button
    var loadSubBtn = document.createElement('button');
    loadSubBtn.className = 'drawer-btn';
    loadSubBtn.textContent = 'Load External Subtitle\u2026';
    loadSubBtn.style.marginTop = '10px';
    loadSubBtn.addEventListener('click', function () {
      var ad = window._adapter;
      if (ad && ad.capabilities && ad.capabilities.externalSubtitles && ad.addExternalSubtitle) {
        // Use Electron dialog to pick a subtitle file
        var bridge = window.PlayerBridge;
        var dialogFn = bridge && bridge.openSubtitleDialog ? bridge.openSubtitleDialog : (bridge && bridge.openFileDialog ? bridge.openFileDialog : null);
        if (dialogFn) {
          dialogFn().then(function (path) {
            if (path) {
              ad.addExternalSubtitle(path);
              window.TankoPlayer.toast.show('Loaded subtitle: ' + path.replace(/\\/g, '/').split('/').pop());
              setTimeout(refreshTracks, 300);
            }
          });
        }
      } else {
        window.TankoPlayer.toast.show('External subtitles: requires mpv backend');
      }
    });
    contentEl.appendChild(loadSubBtn);

    // ── Delay controls section ──
    var delayHeader = document.createElement('div');
    delayHeader.className = 'tracks-section-header';
    delayHeader.style.marginTop = '8px';
    delayHeader.textContent = 'Delays';
    contentEl.appendChild(delayHeader);

    // Subtitle delay row
    var subDelayRow = document.createElement('div');
    subDelayRow.className = 'tracks-delay-section';

    var subDelayLabel = document.createElement('span');
    subDelayLabel.className = 'tracks-delay-label';
    subDelayLabel.textContent = 'Subtitle:';

    var subDelayMinus = document.createElement('button');
    subDelayMinus.className = 'tracks-delay-btn';
    subDelayMinus.textContent = '\u2212'; // −
    subDelayMinus.title = '-0.1s';
    subDelayMinus.addEventListener('click', function () { nudgeSubtitleDelay(-0.1); });

    subtitleDelayValueEl = document.createElement('span');
    subtitleDelayValueEl.className = 'tracks-delay-value';
    subtitleDelayValueEl.textContent = '0.0s';

    var subDelayPlus = document.createElement('button');
    subDelayPlus.className = 'tracks-delay-btn';
    subDelayPlus.textContent = '+';
    subDelayPlus.title = '+0.1s';
    subDelayPlus.addEventListener('click', function () { nudgeSubtitleDelay(+0.1); });

    var subDelayReset = document.createElement('button');
    subDelayReset.className = 'tracks-delay-btn';
    subDelayReset.textContent = '\u21BA'; // ↺
    subDelayReset.title = 'Reset to 0';
    subDelayReset.addEventListener('click', function () { setSubtitleDelay(0); });

    subDelayRow.appendChild(subDelayLabel);
    subDelayRow.appendChild(subDelayMinus);
    subDelayRow.appendChild(subtitleDelayValueEl);
    subDelayRow.appendChild(subDelayPlus);
    subDelayRow.appendChild(subDelayReset);
    contentEl.appendChild(subDelayRow);

    // Audio delay row
    var audioDelayRow = document.createElement('div');
    audioDelayRow.className = 'tracks-delay-section';

    var audioDelayLabel = document.createElement('span');
    audioDelayLabel.className = 'tracks-delay-label';
    audioDelayLabel.textContent = 'Audio:';

    var audioDelayMinus = document.createElement('button');
    audioDelayMinus.className = 'tracks-delay-btn';
    audioDelayMinus.textContent = '\u2212';
    audioDelayMinus.title = '-0.1s';
    audioDelayMinus.addEventListener('click', function () { nudgeAudioDelay(-0.1); });

    audioDelayValueEl = document.createElement('span');
    audioDelayValueEl.className = 'tracks-delay-value';
    audioDelayValueEl.textContent = '0.0s';

    var audioDelayPlus = document.createElement('button');
    audioDelayPlus.className = 'tracks-delay-btn';
    audioDelayPlus.textContent = '+';
    audioDelayPlus.title = '+0.1s';
    audioDelayPlus.addEventListener('click', function () { nudgeAudioDelay(+0.1); });

    var audioDelayReset = document.createElement('button');
    audioDelayReset.className = 'tracks-delay-btn';
    audioDelayReset.textContent = '\u21BA';
    audioDelayReset.title = 'Reset to 0';
    audioDelayReset.addEventListener('click', function () { setAudioDelay(0); });

    audioDelayRow.appendChild(audioDelayLabel);
    audioDelayRow.appendChild(audioDelayMinus);
    audioDelayRow.appendChild(audioDelayValueEl);
    audioDelayRow.appendChild(audioDelayPlus);
    audioDelayRow.appendChild(audioDelayReset);
    contentEl.appendChild(audioDelayRow);

    refreshTracks();
  }

  function refreshTracks() {
    if (!audioListEl || !subtitleListEl) return;

    var adapter = window._adapter;
    var hasTrackSupport = adapter && adapter.capabilities && adapter.capabilities.tracks;

    audioListEl.innerHTML = '';
    subtitleListEl.innerHTML = '';

    if (!hasTrackSupport) {
      var audioMsg = document.createElement('div');
      audioMsg.className = 'tracks-empty';
      audioMsg.textContent = 'Requires mpv backend';
      audioListEl.appendChild(audioMsg);

      var subMsg = document.createElement('div');
      subMsg.className = 'tracks-empty';
      subMsg.textContent = 'Requires mpv backend';
      subtitleListEl.appendChild(subMsg);
      return;
    }

    // Populate from adapter if available
    var audioTracks = adapter.getAudioTracks ? adapter.getAudioTracks() : [];
    var subtitleTracks = adapter.getSubtitleTracks ? adapter.getSubtitleTracks() : [];
    var currentAudio = adapter.getCurrentAudioTrack ? adapter.getCurrentAudioTrack() : null;
    var currentSub = adapter.getCurrentSubtitleTrack ? adapter.getCurrentSubtitleTrack() : null;

    if (!audioTracks.length) {
      var noAudio = document.createElement('div');
      noAudio.className = 'tracks-empty';
      noAudio.textContent = 'No audio tracks';
      audioListEl.appendChild(noAudio);
    } else {
      for (var i = 0; i < audioTracks.length; i++) {
        var at = audioTracks[i];
        var item = document.createElement('div');
        item.className = 'tracks-item' + (at.id === currentAudio ? ' active' : '');
        item.textContent = at.label || 'Track ' + at.id;
        item.dataset.id = at.id;
        item.addEventListener('click', function (e) {
          var id = e.currentTarget.dataset.id;
          if (adapter.setAudioTrack) adapter.setAudioTrack(id);
          setTimeout(refreshTracks, 100);
        });
        audioListEl.appendChild(item);
      }
    }

    // Subtitle off option
    var offItem = document.createElement('div');
    offItem.className = 'tracks-item' + (currentSub === null ? ' active' : '');
    offItem.textContent = 'Off';
    offItem.addEventListener('click', function () {
      if (adapter.setSubtitleTrack) adapter.setSubtitleTrack(null);
      setTimeout(refreshTracks, 100);
    });
    subtitleListEl.appendChild(offItem);

    if (!subtitleTracks.length) {
      var noSub = document.createElement('div');
      noSub.className = 'tracks-empty';
      noSub.textContent = 'No subtitle tracks';
      subtitleListEl.appendChild(noSub);
    } else {
      for (var j = 0; j < subtitleTracks.length; j++) {
        var st = subtitleTracks[j];
        var sItem = document.createElement('div');
        sItem.className = 'tracks-item' + (st.id === currentSub ? ' active' : '');
        sItem.textContent = st.label || 'Subtitle ' + st.id;
        sItem.dataset.id = st.id;
        sItem.addEventListener('click', function (e) {
          var id = e.currentTarget.dataset.id;
          if (adapter.setSubtitleTrack) adapter.setSubtitleTrack(id);
          setTimeout(refreshTracks, 100);
        });
        subtitleListEl.appendChild(sItem);
      }
    }
  }

  function init() {
    drawer = window.TankoPlayer.createDrawer({
      id: 'tracksDrawer',
      title: 'Tracks',
      side: 'right',
    });
    buildContent(drawer.contentEl);
  }

  function toggle() {
    if (drawer) {
      drawer.toggle();
      if (drawer.isOpen()) refreshTracks();
    }
  }

  function isOpen() {
    return drawer ? drawer.isOpen() : false;
  }

  function destroy() {
    if (drawer && drawer.el && drawer.el.parentNode) {
      drawer.el.parentNode.removeChild(drawer.el);
    }
    drawer = null;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.tracksDrawer = {
    init: init,
    destroy: destroy,
    toggle: toggle,
    isOpen: isOpen,
    nudgeSubtitleDelay: nudgeSubtitleDelay,
    setSubtitleDelay: setSubtitleDelay,
    nudgeAudioDelay: nudgeAudioDelay,
    setAudioDelay: setAudioDelay,
  };
})();
