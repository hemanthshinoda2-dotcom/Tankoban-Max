(function () {
  'use strict';

  function keyForEpisode(ep) {
    if (!ep || typeof ep !== 'object') return '';
    if (ep.id != null) return String(ep.id);
    if (ep.path) return String(ep.path);
    if (ep.key != null) return String(ep.key);
    return '';
  }

  function nowMs() {
    return Date.now ? Date.now() : (new Date()).getTime();
  }

  function createPlaylistController(opts) {
    var o = opts || {};
    var triggeredKey = null;
    var panelOpen = false;
    var lastOpenKey = '';
    var lastOpenAtMs = 0;
    var refreshTimer = null;
    var snapshot = {
      showId: null,
      currentKey: '',
      playlistLength: 0,
      currentIndex: -1,
      folderLabel: ''
    };

    function safeCall(fn) {
      try { return fn(); } catch (_) { return undefined; }
    }

    function emitToast(message) {
      if (!message) return;
      if (typeof o.showToast === 'function') safeCall(function () { return o.showToast(String(message)); });
    }

    function getCurrentKey() {
      if (typeof o.getCurrentKey !== 'function') return '';
      var v = safeCall(function () { return o.getCurrentKey(); });
      return String(v || '');
    }

    function requestRefresh(reason) {
      if (typeof o.requestRefreshPanel !== 'function') return;
      safeCall(function () { return o.requestRefreshPanel(String(reason || '')); });
    }

    function scrollCurrentIntoView(reason) {
      if (typeof o.scrollCurrentIntoView !== 'function') return;
      safeCall(function () { return o.scrollCurrentIntoView(String(reason || '')); });
    }

    function scheduleRefresh(reason, delayMs) {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      refreshTimer = setTimeout(function () {
        refreshTimer = null;
        requestRefresh(reason);
      }, Math.max(0, Number(delayMs) || 0));
    }

    function scheduleRefreshBurst(reason) {
      requestRefresh(reason || 'playlist-refresh');
      scheduleRefresh(reason || 'playlist-refresh', 70);
      setTimeout(function () { requestRefresh(reason || 'playlist-refresh'); }, 180);
      setTimeout(function () { scrollCurrentIntoView(reason || 'playlist-refresh'); }, 16);
      setTimeout(function () { scrollCurrentIntoView(reason || 'playlist-refresh'); }, 120);
    }

    function updateSnapshot(partial) {
      if (!partial || typeof partial !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(partial, 'showId')) snapshot.showId = partial.showId;
      if (Object.prototype.hasOwnProperty.call(partial, 'currentKey')) snapshot.currentKey = String(partial.currentKey || '');
      if (Object.prototype.hasOwnProperty.call(partial, 'playlistLength')) snapshot.playlistLength = Number(partial.playlistLength) || 0;
      if (Object.prototype.hasOwnProperty.call(partial, 'currentIndex')) snapshot.currentIndex = Number(partial.currentIndex);
      if (!isFinite(snapshot.currentIndex)) snapshot.currentIndex = -1;
      if (Object.prototype.hasOwnProperty.call(partial, 'folderLabel')) snapshot.folderLabel = String(partial.folderLabel || '');
    }

    function markPlayedKey(key) {
      triggeredKey = String(key || '');
    }

    function reset() {
      triggeredKey = null;
    }

    function shouldSuppressEpisodeOpen(ep, meta) {
      var key = keyForEpisode(ep) || getCurrentKey();
      if (!key) return false;
      var threshold = Number(meta && meta.windowMs);
      if (!isFinite(threshold) || threshold < 0) threshold = 700;
      var t = nowMs();
      return (String(lastOpenKey || '') === String(key)) && ((t - Number(lastOpenAtMs || 0)) < threshold);
    }

    function recordEpisodeOpenIntent(ep) {
      lastOpenKey = keyForEpisode(ep) || getCurrentKey();
      lastOpenAtMs = nowMs();
    }

    function notifyEpisodeOpened(ep, meta) {
      var key = keyForEpisode(ep) || getCurrentKey();
      triggeredKey = null;
      updateSnapshot({ currentKey: key });
      if (meta && Object.prototype.hasOwnProperty.call(meta, 'playlistLength')) {
        updateSnapshot({ playlistLength: meta.playlistLength });
      }
      if (getPanelOpen()) scheduleRefreshBurst('episode-opened');
    }

    function notifyPlaylistChanged(info) {
      var currentKey = (info && Object.prototype.hasOwnProperty.call(info, 'currentKey')) ? info.currentKey : getCurrentKey();
      updateSnapshot({
        showId: info ? info.showId : snapshot.showId,
        currentKey: currentKey,
        playlistLength: info && info.playlistLength != null ? info.playlistLength : snapshot.playlistLength,
        currentIndex: info && info.currentIndex != null ? info.currentIndex : snapshot.currentIndex,
        folderLabel: info && info.folderLabel != null ? info.folderLabel : snapshot.folderLabel
      });
      if (getPanelOpen()) scheduleRefreshBurst('playlist-changed');
    }

    function onAutoAdvanceToggled(enabled) {
      emitToast(enabled ? 'Auto-advance on' : 'Auto-advance off');
    }

    function panelOpened() {
      panelOpen = true;
      if (typeof o.onPanelOpened === 'function') safeCall(function () { return o.onPanelOpened(); });
      scheduleRefreshBurst('panel-open');
    }

    function panelClosed() {
      panelOpen = false;
      if (typeof o.onPanelClosed === 'function') safeCall(function () { return o.onPanelClosed(); });
    }

    function getPanelOpen() {
      if (typeof o.getPanelOpen === 'function') {
        return !!safeCall(function () { return o.getPanelOpen(); });
      }
      return !!panelOpen;
    }

    function maybeAdvanceFromEof() {
      if (typeof o.getAutoAdvance !== 'function' || !o.getAutoAdvance()) return false;
      var next = (typeof o.getNextEpisode === 'function') ? safeCall(function () { return o.getNextEpisode(); }) : null;
      if (!next) {
        emitToast('End of playlist');
        return false;
      }

      var curKey = getCurrentKey();
      if (curKey && triggeredKey === curKey) return false;
      triggeredKey = curKey || triggeredKey;

      if (typeof o.onOpenEpisode === 'function') {
        recordEpisodeOpenIntent(next);
        safeCall(function () { return o.onOpenEpisode(next, { source: 'auto-advance' }); });
        if (getPanelOpen()) scheduleRefreshBurst('auto-advance');
        return true;
      }
      return false;
    }

    function getSnapshot() {
      return {
        showId: snapshot.showId,
        currentKey: snapshot.currentKey,
        playlistLength: snapshot.playlistLength,
        currentIndex: snapshot.currentIndex,
        folderLabel: snapshot.folderLabel,
        triggeredKey: triggeredKey,
        panelOpen: getPanelOpen(),
        lastOpenKey: String(lastOpenKey || ''),
        lastOpenAtMs: Number(lastOpenAtMs || 0)
      };
    }

    return {
      markPlayedKey: markPlayedKey,
      reset: reset,
      maybeAdvanceFromEof: maybeAdvanceFromEof,
      shouldSuppressEpisodeOpen: shouldSuppressEpisodeOpen,
      recordEpisodeOpenIntent: recordEpisodeOpenIntent,
      notifyEpisodeOpened: notifyEpisodeOpened,
      notifyPlaylistChanged: notifyPlaylistChanged,
      onAutoAdvanceToggled: onAutoAdvanceToggled,
      panelOpened: panelOpened,
      panelClosed: panelClosed,
      isPanelOpen: getPanelOpen,
      requestRefreshPanel: requestRefresh,
      scrollCurrentIntoView: scrollCurrentIntoView,
      getSnapshot: getSnapshot,
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createPlaylistController = createPlaylistController;
})();
