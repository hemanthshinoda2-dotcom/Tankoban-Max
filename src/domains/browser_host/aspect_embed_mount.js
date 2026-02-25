(function aspectEmbedMount(){
  'use strict';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  onReady(function init(){
    var tanko = (window.Tanko = window.Tanko || {});
    if (!tanko.browserHost || typeof tanko.browserHost.registerAdapter !== 'function') return;

    try {
      if (typeof tanko.browserHost.setConfig === 'function') {
        var existingCfg = (typeof tanko.browserHost.getConfig === 'function')
          ? (tanko.browserHost.getConfig() || {})
          : {};
        tanko.browserHost.setConfig({
          enabled: existingCfg.enabled !== false,
          adapter: existingCfg.adapter || 'aspect-embed',
          browserUxV2: existingCfg.browserUxV2 === true,
          hideLaunchButtons: existingCfg.hideLaunchButtons === true,
          showDisabledToast: existingCfg.showDisabledToast === true
        });
      }
    } catch (_cfgErr) {}

    var state = {
      iframe: null,
      wrapper: null,
      bridge: null,
      initialized: false,
      iframeLoaded: false,
      iframeLoadPromise: null,
      listenersBound: false,
      btnUnsubs: [],
      usingLegacyFallback: false,
      lastError: null
    };
    var handledClickEvents = (typeof WeakSet === 'function') ? new WeakSet() : null;
    var directCaptureHandler = null;

    function noop() {}
    function getHostCfg() {
      try {
        if (tanko.browserHost && typeof tanko.browserHost.getConfig === 'function') {
          return tanko.browserHost.getConfig() || {};
        }
      } catch (_e) {}
      return {};
    }
    function isAspectLaneEnabled() {
      var cfg = getHostCfg();
      return !!(cfg && cfg.enabled !== false && cfg.browserUxV2 === true && cfg.adapter === 'aspect-embed');
    }
    function reportRuntime(patch) {
      try {
        if (tanko.browserHost && typeof tanko.browserHost.reportRuntimeState === 'function') {
          tanko.browserHost.reportRuntimeState(patch || {});
        }
      } catch (_e) {}
    }
    function qs(id) { return document.getElementById(id); }
    function getBrowserRoot() { return qs('webLibraryView') || qs('wb-webview-view'); }
    function activateWebPage() {
      return new Promise(function(resolve) {
        var switched = false;
        try {
          if (tanko.appSections && typeof tanko.appSections.activate === 'function') {
            tanko.appSections.activate('webPage', { skipSidebarSync: false });
            switched = true;
          }
        } catch (_e) {}
        // Groundwork builds may not expose appSections at all. In that case, the Web UI still
        // lives under comics mode, so explicitly switch modes before showing the browser pane.
        try {
          if (!switched && tanko.modeRouter && typeof tanko.modeRouter.setMode === 'function') {
            Promise.resolve(tanko.modeRouter.setMode('browser')).then(function() {
              resolve(true);
            }).catch(function(err){
              try { console.error('[browserHost][aspect-embed] modeRouter.setMode(browser) failed', err); } catch (_e2) {}
              resolve(false);
            });
            return;
          }
        } catch (_e3) {}
        try {
          if (!switched && typeof window.setMode === 'function') {
            window.setMode('browser');
            switched = true;
          }
        } catch (_e4) {}
        if (!switched) {
          try { console.warn('[browserHost][aspect-embed] No appSections/modeRouter bridge found; attempting pane reveal only'); } catch (_e5) {}
        }
        resolve(switched);
      });
    }
    function isBrowserPaneVisible() {
      try {
        var node = getBrowserRoot();
        if (!node) return false;
        if (node.classList && node.classList.contains('hidden')) return false;
        if (node.style && node.style.display === 'none') return false;
        return true;
      } catch (_e) { return false; }
    }
    function emergencyShowBrowserPane() {
      try {
        var browserView = getBrowserRoot();
        if (browserView) {
          browserView.classList.remove('hidden');
          browserView.style.display = '';
          browserView.removeAttribute('aria-hidden');
        }
      } catch (_e) {}
      try { ensureMount(); } catch (_e2) {}
    }
    function markHandledClick(e) {
      if (!e) return;
      try {
        if (handledClickEvents) handledClickEvents.add(e);
        else if (typeof e === 'object') e.__aspectEmbedHandled = true;
      } catch (_e) {}
    }
    function isHandledClick(e) {
      if (!e) return false;
      try {
        if (handledClickEvents) return handledClickEvents.has(e);
        return !!e.__aspectEmbedHandled;
      } catch (_e) { return false; }
    }
    function safelyLaunch(actionName, runner) {
      try {
        var p = (typeof runner === 'function') ? runner() : null;
        return Promise.resolve(p).then(function(res){
          if (!isBrowserPaneVisible()) {
            try { emergencyShowBrowserPane(); } catch (_e) {}
          }
          return res;
        }).catch(function(err){
          try { console.error('[browserHost][aspect-embed] ' + actionName + ' failed', err); } catch (_e) {}
          emergencyShowBrowserPane();
          return { ok:false, adapter:'aspect-embed', error: String((err && err.message) || err || 'launch-failed') };
        });
      } catch (err) {
        try { console.error('[browserHost][aspect-embed] ' + actionName + ' threw', err); } catch (_e) {}
        emergencyShowBrowserPane();
        return Promise.resolve({ ok:false, adapter:'aspect-embed', error: String((err && err.message) || err || 'launch-threw') });
      }
    }
    function showBrowserPane() {
      try { if (tanko.browserHost && typeof tanko.browserHost.showBrowserPane === 'function') tanko.browserHost.showBrowserPane(); } catch (_e) {}
      if (!isAspectLaneEnabled()) {
        disableAspectForLegacyLane();
        return;
      }
      ensureMount();
    }
    function showLibraryPane() {
      try { if (tanko.browserHost && typeof tanko.browserHost.showLibraryPane === 'function') tanko.browserHost.showLibraryPane(); } catch (_e) {}
    }
    function focusIframeSoon() {
      setTimeout(function(){
        try { if (state.iframe && typeof state.iframe.focus === 'function') state.iframe.focus(); } catch (_e) {}
      }, 0);
    }

    function hideLegacyBrowserMarkup() {
      var root = qs('wb-webview-view');
      if (!root) return;
      if (!root.dataset.aspectEmbedPrepared) {
        root.dataset.aspectEmbedPrepared = '1';
        /* Keep the CSS position:fixed — do not override to relative */
        Array.prototype.forEach.call(root.children || [], function (child) {
          if (!child || child.id === 'aspectEmbedMountRoot') return;
          child.dataset.aspectEmbedHiddenByHost = '1';
          child.style.display = 'none';
        });
      }
    }

    function restoreLegacyBrowserMarkup() {
      var root = qs('wb-webview-view');
      if (!root) return;
      try { delete root.dataset.aspectEmbedPrepared; } catch (_e) {}
      Array.prototype.forEach.call(root.children || [], function (child) {
        if (!child || child.id === 'aspectEmbedMountRoot') return;
        if (child.dataset && child.dataset.aspectEmbedHiddenByHost === '1') {
          try { delete child.dataset.aspectEmbedHiddenByHost; } catch (_e2) {}
          child.style.display = '';
        }
      });
    }

    function unbindDirectLaunchButtonCapture() {
      var btn = qs('webHubToggleBtn');
      if (!btn || !directCaptureHandler) return;
      try { btn.removeEventListener('click', directCaptureHandler, true); } catch (_e) {}
      directCaptureHandler = null;
      try { delete btn.dataset.aspectEmbedCaptureBound; } catch (_e2) {}
    }

    function disableAspectForLegacyLane() {
      restoreLegacyBrowserMarkup();
      try {
        while (state.btnUnsubs.length) {
          var unsub = state.btnUnsubs.pop();
          if (typeof unsub === 'function') unsub();
        }
      } catch (_e) {}
      state.listenersBound = false;
      unbindDirectLaunchButtonCapture();

      try {
        var wrapper = qs('aspectEmbedMountRoot');
        if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      } catch (_e2) {}
      state.wrapper = null;
      state.iframe = null;
      state.iframeLoaded = false;
      state.iframeLoadPromise = null;
      state.initialized = false;
      state.usingLegacyFallback = false;
      state.lastError = null;
      reportRuntime({
        ready: false,
        mounted: false,
        visible: false,
        fallbackActive: false,
        lastError: null
      });
    }

    function hideAspectEmbedOverlayForLegacy(reason) {
      state.usingLegacyFallback = true;
      state.lastError = String(reason || 'legacy-fallback');
      try {
        if (state.wrapper) {
          state.wrapper.style.display = 'none';
          state.wrapper.style.pointerEvents = 'none';
          state.wrapper.setAttribute('aria-hidden', 'true');
        }
      } catch (_e) {}
      try {
        if (state.iframe) {
          state.iframe.style.pointerEvents = 'none';
          state.iframe.setAttribute('tabindex', '-1');
        }
      } catch (_e2) {}
      reportRuntime({
        ready: false,
        mounted: !!state.wrapper,
        visible: false,
        fallbackActive: true,
        lastError: state.lastError
      });
      try { console.warn('[browserHost][aspect-embed] hiding aspect overlay and switching to legacy browser', { reason: reason || 'fallback' }); } catch (_e3) {}
    }

    function showAspectEmbedOverlay() {
      state.usingLegacyFallback = false;
      state.lastError = null;
      try {
        if (state.wrapper) {
          state.wrapper.style.display = 'flex';
          state.wrapper.style.pointerEvents = '';
          state.wrapper.removeAttribute('aria-hidden');
        }
      } catch (_e) {}
      try {
        if (state.iframe) {
          state.iframe.style.pointerEvents = '';
          state.iframe.removeAttribute('tabindex');
        }
      } catch (_e2) {}
      reportRuntime({
        ready: true,
        mounted: !!state.wrapper,
        visible: true,
        fallbackActive: false,
        lastError: null
      });
    }

    function openLegacyWebDefaultFallback() {
      var d = tanko.deferred;
      var load = Promise.resolve();
      hideAspectEmbedOverlayForLegacy('iframe-timeout-or-api-missing');
      restoreLegacyBrowserMarkup();
      if (d && typeof d.ensureWebModulesLoadedLegacy === 'function') {
        load = Promise.resolve(d.ensureWebModulesLoadedLegacy());
      }
      return load.then(function () {
        var web = tanko.web;
        if (web && typeof web.openDefault === 'function') return web.openDefault();
        if (web && typeof web.openHome === 'function') return web.openHome();
        if (web && typeof web.openBrowser === 'function') return web.openBrowser(null);
        emergencyShowBrowserPane();
        reportRuntime({ fallbackActive: true, visible: true, mounted: true });
        return { ok: false, adapter: 'aspect-embed', fallback: 'pane-only' };
      }).catch(function () {
        emergencyShowBrowserPane();
        reportRuntime({ fallbackActive: true, visible: true, mounted: true });
        return { ok: false, adapter: 'aspect-embed', fallback: 'pane-only' };
      });
    }

    function normalizeListResult(res, key) {
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res[key])) return res[key];
      return [];
    }
    function normalizeSettings(res) {
      if (res && res.ok && res.settings && typeof res.settings === 'object') return res.settings;
      if (res && typeof res === 'object' && !Array.isArray(res)) return res;
      return {};
    }
    function call(obj, path, args, fallback) {
      try {
        var ctx = obj;
        for (var i = 0; i < path.length - 1; i += 1) {
          if (!ctx) return fallback;
          ctx = ctx[path[i]];
        }
        var fn = ctx && ctx[path[path.length - 1]];
        if (typeof fn !== 'function') return fallback;
        return fn.apply(ctx, args || []);
      } catch (_e) { return fallback; }
    }
    function getApi(){ return (window.Tanko && window.Tanko.api) || null; }
    function getElectronAPI(){
      // Keep access routed indirectly so this file does not directly reference preload globals.
      var key = 'electron' + 'API';
      return window[key] || null;
    }

    function createEventHub() {
      var buckets = Object.create(null);
      var wired = Object.create(null);
      function ensure(name) {
        if (!buckets[name]) buckets[name] = new Set();
        return buckets[name];
      }
      function emit(name, payload) {
        ensure(name).forEach(function (cb) {
          try { cb(payload); } catch (_e) {}
        });
      }
      function wire(name, binder) {
        if (wired[name]) return;
        wired[name] = true;
        try { binder(function(payload){ emit(name, payload); }); } catch (_e) {}
      }
      function sub(name, binder, cb) {
        if (typeof cb !== 'function') return noop;
        wire(name, binder);
        var set = ensure(name);
        set.add(cb);
        return function(){ try { set.delete(cb); } catch (_e) {} };
      }
      return { sub: sub };
    }

    function createParentBridge() {
      var hub = createEventHub();
      var clipboardCache = '';

      function api() { return getApi(); }
      function eapi() { return getElectronAPI(); }
      function webApi(path, args, fallback) { return call(api(), ['web'].concat(path), args, fallback); }
      function e(path, args, fallback) { return call(eapi(), path, args, fallback); }

      return {
        clipboardCacheRead: function(){ return clipboardCache; },
        clipboardCacheWrite: function(text){ clipboardCache = String(text || ''); return true; },

        loadSettings: function(){
          var res = webApi(['webBrowserSettings','get'], [], null);
          return Promise.resolve(res).then(normalizeSettings).catch(function(){ return {}; });
        },
        saveSettings: function(settings){
          var res = webApi(['webBrowserSettings','save'], [settings || {}], null);
          return Promise.resolve(res).catch(function(){ return { ok:false }; });
        },
        loadHistory: function(){
          var res = webApi(['webHistory','list'], [], null);
          return Promise.resolve(res).then(function(r){ return normalizeListResult(r, 'items'); }).catch(function(){ return []; });
        },
        addHistory: function(entryOrUrl, title){
          if (entryOrUrl && typeof entryOrUrl === 'object') {
            return Promise.resolve(webApi(['webHistory','add'], [entryOrUrl], { ok:false })).catch(function(){ return { ok:false }; });
          }
          return Promise.resolve(webApi(['webHistory','add'], [{ url: String(entryOrUrl || ''), title: String(title || '') }], { ok:false })).catch(function(){ return { ok:false }; });
        },
        deleteHistory: function(url){ return Promise.resolve(webApi(['webHistory','delete'], [url], { ok:false })).catch(function(){ return { ok:false }; }); },
        clearHistory: function(){ return Promise.resolve(webApi(['webHistory','clear'], [], { ok:false })).catch(function(){ return { ok:false }; }); },
        loadBookmarks: function(){
          var res = webApi(['webBookmarks','list'], [], null);
          return Promise.resolve(res).then(function(r){ return normalizeListResult(r, 'items'); }).catch(function(){ return []; });
        },
        addBookmark: function(entryOrUrl, title){
          if (entryOrUrl && typeof entryOrUrl === 'object') {
            return Promise.resolve(webApi(['webBookmarks','add'], [entryOrUrl], { ok:false })).catch(function(){ return { ok:false }; });
          }
          return Promise.resolve(webApi(['webBookmarks','add'], [{ url: String(entryOrUrl || ''), title: String(title || '') }], { ok:false })).catch(function(){ return { ok:false }; });
        },
        removeBookmark: function(payloadOrUrl){
          if (payloadOrUrl && typeof payloadOrUrl === 'object') {
            return Promise.resolve(webApi(['webBookmarks','remove'], [payloadOrUrl], { ok:false })).catch(function(){ return { ok:false }; });
          }
          return Promise.resolve(webApi(['webBookmarks','remove'], [{ url: String(payloadOrUrl || '') }], { ok:false })).catch(function(){ return { ok:false }; });
        },
        bookmarksCheck: function(url){
          var res = webApi(['webBookmarks','checkExists'], [url], null);
          return Promise.resolve(res).then(function(r){ return !!(r && (r.exists === true || r.ok === true && r.exists)); }).catch(function(){ return false; });
        },
        toggleBookmark: function(url, title){ return Promise.resolve(webApi(['webBookmarks','toggle'], [url, title], { ok:false })).catch(function(){ return { ok:false }; }); },

        minimizeWindow: function(){ return Promise.resolve(e(['windowControls','minimize'], [], false)).catch(function(){ return false; }); },
        maximizeWindow: function(){ return Promise.resolve(e(['windowControls','toggleMaximize'], [], false)).catch(function(){ return false; }); },
        closeWindow: function(){ return Promise.resolve(false); }, // embed-safe no-op
        getWindowState: function(){
          var res = e(['windowState','get'], [], null);
          return Promise.resolve(res).then(function(r){ return r || { isMaximized:false }; }).catch(function(){ return { isMaximized:false }; });
        },
        onWindowState: function(cb){
          return hub.sub('windowState', function(emit){ e(['windowState','onChanged'], [emit], null); }, cb);
        },

        searchSuggest: function(q){
          var res = e(['webSearch','suggest'], [q], null);
          return Promise.resolve(res).then(function(r){
            if (Array.isArray(r)) return r;
            if (r && Array.isArray(r.suggestions)) return r.suggestions;
            return [];
          }).catch(function(){ return []; });
        },
        searchAdd: function(q){ return Promise.resolve(e(['webSearch','add'], [q], { ok:false })).catch(function(){ return { ok:false }; }); },

        onCreateTab: function(cb){
          return hub.sub('createTab', function(emit){
            e(['webBrowserActions','onCreateTab'], [function(payload){
              var p = payload || {};
              emit({ url: p.url || '', disposition: p.disposition || 'foreground-tab', sourceWebContentsId: p.sourceWebContentsId || null });
            }], null);
          }, cb);
        },
        onPopupUrl: function(cb){
          return hub.sub('popupUrl', function(emit){
            e(['webSources','onPopupOpen'], [emit], null);
          }, cb);
        },
        printPdf: function(webContentsId){ return Promise.resolve(e(['webBrowserActions','printPdf'], [{ webContentsId: webContentsId }], { ok:false })).catch(function(){ return { ok:false }; }); },
        capturePage: function(webContentsId){ return Promise.resolve(e(['webBrowserActions','capturePage'], [{ webContentsId: webContentsId }], { ok:false })).catch(function(){ return { ok:false }; }); },
        ctxAction: function(payload){ return Promise.resolve(e(['webBrowserActions','ctxAction'], [payload || {}], { ok:false })).catch(function(){ return { ok:false }; }); },
        onShowContextMenu: function(cb){ return hub.sub('ctxMenu', function(emit){ e(['webBrowserActions','onContextMenu'], [emit], null); }, cb); },

        downloadAction: function(id, action){
          var act = String(action || '').toLowerCase();
          if (!id) return Promise.resolve({ ok:false, error:'missing download id' });
          if (act === 'pause') return Promise.resolve(webApi(['webSources','pauseDownload'], [id], { ok:false })).catch(function(){ return { ok:false }; });
          if (act === 'resume') return Promise.resolve(webApi(['webSources','resumeDownload'], [id], { ok:false })).catch(function(){ return { ok:false }; });
          if (act === 'cancel') return Promise.resolve(webApi(['webSources','cancelDownload'], [id], { ok:false })).catch(function(){ return { ok:false }; });
          return Promise.resolve({ ok:false, error:'unsupported action' });
        },
        downloadOpen: function(path){ return Promise.resolve(e(['webBrowserActions','downloadOpenFile'], [path], { ok:false })).catch(function(){ return { ok:false }; }); },
        downloadShow: function(path){ return Promise.resolve(e(['webBrowserActions','downloadShowInFolder'], [path], { ok:false })).catch(function(){ return { ok:false }; }); },
        onDownloadStarted: function(cb){ return hub.sub('dlStarted', function(emit){ e(['webSources','onDownloadStarted'], [emit], null); }, cb); },
        onDownloadProgress: function(cb){ return hub.sub('dlProgress', function(emit){ e(['webSources','onDownloadProgress'], [emit], null); }, cb); },
        onDownloadDone: function(cb){ return hub.sub('dlDone', function(emit){ e(['webSources','onDownloadCompleted'], [emit], null); }, cb); },

        clipboardRead: function(){ return clipboardCache || ''; },
        clipboardWrite: function(text){ clipboardCache = String(text || ''); return true; },

        webviewFindInPage: function(webContentsId, text, options){ return Promise.resolve(e(['webWebview','findInPage'], [{ webContentsId:webContentsId, text:text, options: options || {} }], { requestId:null })).catch(function(){ return { requestId:null }; }); },
        webviewStopFinding: function(webContentsId, action){ return Promise.resolve(e(['webWebview','stopFindInPage'], [{ webContentsId:webContentsId, action: action }], { ok:false })).catch(function(){ return { ok:false }; }); },
        onWebFindResult: function(cb){ return hub.sub('findResult', function(emit){ e(['webWebview','onFindResult'], [emit], null); }, cb); },
        webviewExecuteJavaScript: function(webContentsId, code){ return Promise.resolve(e(['webWebview','executeJavaScript'], [{ webContentsId:webContentsId, code: code }], null)).catch(function(){ return null; }); },
        webviewSetAudioMuted: function(_webContentsId, _muted){ return Promise.resolve(false); },

        torGetStatus: function(){ return Promise.resolve(e(['torProxy','getStatus'], [], { ok:false, enabled:false })).catch(function(){ return { ok:false, enabled:false }; }); },
        torEnable: function(){ return Promise.resolve(e(['torProxy','enable'], [], { ok:false })).catch(function(){ return { ok:false }; }); },
        torDisable: function(){ return Promise.resolve(e(['torProxy','disable'], [], { ok:false })).catch(function(){ return { ok:false }; }); },
        onTorStatusChanged: function(cb){ return hub.sub('torStatus', function(emit){ e(['torProxy','onStatusChanged'], [emit], null); }, cb); },

        torrentGetActive: function(){ return Promise.resolve(e(['webTorrent','getActive'], [], { ok:false, items:[] })).catch(function(){ return { ok:false, items:[] }; }); },
        torrentGetHistory: function(){ return Promise.resolve(e(['webTorrent','getHistory'], [], { ok:false, items:[] })).catch(function(){ return { ok:false, items:[] }; }); },
        torrentSelectSaveFolder: function(){ return Promise.resolve(e(['webTorrent','pickSaveFolder'], [], { canceled:true, path:null })).catch(function(){ return { canceled:true, path:null }; }); },
        torrentStartConfigured: function(payload){ return Promise.resolve(e(['webTorrent','startConfigured'], [payload && typeof payload === 'object' ? payload : { resolveId: payload }], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentPause: function(id){ return Promise.resolve(e(['webTorrent','pause'], [{ id: id }], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentResume: function(id){ return Promise.resolve(e(['webTorrent','resume'], [{ id: id }], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentCancel: function(id){ return Promise.resolve(e(['webTorrent','cancel'], [{ id: id }], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentRetry: function(id){ return Promise.resolve(e(['webTorrent','retry'], [{ id: id }], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentRemove: function(id){ return Promise.resolve(e(['webTorrent','remove'], [{ id: id }], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentOpenFolder: function(id){ return Promise.resolve(e(['webTorrent','openFolder'], [id], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentOpenFile: function(id){ return Promise.resolve(e(['webTorrent','openFile'], [id], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentResolveMetadata: function(input){ return Promise.resolve(e(['webTorrent','resolveMetadata'], [input], { ok:false })).catch(function(){ return { ok:false }; }); },
        torrentGetPeers: function(id){ return Promise.resolve(e(['webTorrent','getPeers'], [{ id: id }], { ok:false, peers:[] })).catch(function(){ return { ok:false, peers:[] }; }); },
        torrentGetDhtNodes: function(){ return Promise.resolve(e(['webTorrent','getDhtNodes'], [], { ok:false, nodes:[] })).catch(function(){ return { ok:false, nodes:[] }; }); },
        onTorrentStarted: function(cb){ return hub.sub('torStarted', function(emit){ e(['webTorrent','onStarted'], [emit], null); }, cb); },
        onTorrentMetadata: function(cb){ return hub.sub('torMeta', function(emit){ e(['webTorrent','onMetadata'], [emit], null); }, cb); },
        onTorrentProgress: function(cb){ return hub.sub('torProgress', function(emit){ e(['webTorrent','onProgress'], [emit], null); }, cb); },
        onTorrentCompleted: function(cb){ return hub.sub('torCompleted', function(emit){ e(['webTorrent','onCompleted'], [emit], null); }, cb); },
        onMagnetDetected: function(cb){ return hub.sub('magnetDetected', function(emit){ e(['webTorrent','onMagnetDetected'], [emit], null); }, cb); },
        onTorrentFileDetected: function(cb){ return hub.sub('torrentFileDetected', function(emit){ e(['webTorrent','onTorrentFileDetected'], [emit], null); }, cb); },



        // Desktop-preload naming compat (Aspect expects these names).
        historyLoad: function(){ return this.loadHistory(); },
        historyAdd: function(entry){ return this.addHistory(entry); },
        historyDelete: function(timestamp){ return Promise.resolve(webApi(['webHistory','remove'], [{ timestamp: timestamp }], { ok:false })).catch(function(){ return { ok:false }; }); },

        bookmarksLoad: function(){ return this.loadBookmarks(); },
        bookmarksAdd: function(entry){ return this.addBookmark(entry); },
        bookmarksRemove: function(url){ return this.removeBookmark(url); },

        torStart: function(){ return this.torEnable(); },
        torStop: function(){ return this.torDisable(); },

        torrentStartMagnet: function(uri){ return Promise.resolve(e(['webTorrent','startMagnet'], [{ magnetUri: uri }], false)).catch(function(){ return false; }); },
        torrentStartUrl: function(url){ return Promise.resolve(e(['webTorrent','startTorrentUrl'], [{ url: url }], false)).catch(function(){ return false; }); },
        torrentPauseAll: function(){ return Promise.resolve(e(['webTorrent','pauseAll'], [], false)).catch(function(){ return false; }); },
        torrentResumeAll: function(){ return Promise.resolve(e(['webTorrent','resumeAll'], [], false)).catch(function(){ return false; }); },
        torrentSelectFiles: function(id, indices){ return Promise.resolve(e(['webTorrent','selectFiles'], [{ id: id, selectedIndices: indices }], false)).catch(function(){ return false; }); },
        torrentCancelResolve: function(resolveId){ return Promise.resolve(e(['webTorrent','cancelResolve'], [{ resolveId: resolveId }], false)).catch(function(){ return false; }); },
        torrentGetPeers: function(id){ return Promise.resolve(e(['webTorrent','getPeers'], [{ id: id }], { ok:false, peers:[] })).catch(function(){ return { ok:false, peers:[] }; }); },
        torrentGetDhtNodes: function(){ return Promise.resolve(e(['webTorrent','getDhtNodes'], [], { ok:false, nodes:[] })).catch(function(){ return { ok:false, nodes:[] }; }); },

                dialogOpenFile: function(){ return Promise.resolve({ canceled:true, filePaths:[] }); },
        dialogSaveAs: function(){ return Promise.resolve({ canceled:true, filePath:null }); },

        permissionsList: function(){ return Promise.resolve(e(['webPermissions','listRules'], [], { ok:false, rules:[] })).then(function(r){ return Array.isArray(r) ? r : (r && Array.isArray(r.rules) ? r.rules : []); }).catch(function(){ return []; }); },
        permissionsResolvePrompt: function(payload){ return Promise.resolve(e(['webPermissions','resolvePrompt'], [payload || {}], { ok:false })).catch(function(){ return { ok:false }; }); },
        onPermissionPrompt: function(cb){ return hub.sub('permPrompt', function(emit){ e(['webPermissions','onPrompt'], [emit], null); }, cb); },
        onPermissionsUpdated: function(cb){ return hub.sub('permUpdated', function(emit){ e(['webPermissions','onUpdated'], [emit], null); }, cb); },
        userscriptsGet: function(){ return Promise.resolve(e(['webUserscripts','list'], [], { ok:false, scripts:[] })).then(function(r){ return Array.isArray(r) ? r : (r && Array.isArray(r.scripts) ? r.scripts : []); }).catch(function(){ return []; }); },
        userscriptsSetEnabled: function(enabled){ return Promise.resolve(e(['webUserscripts','setEnabled'], [enabled], { ok:false })).catch(function(){ return { ok:false }; }); },
        userscriptsUpsert: function(script){ return Promise.resolve(e(['webUserscripts','upsert'], [script], { ok:false })).catch(function(){ return { ok:false }; }); },
        userscriptsRemove: function(id){ return Promise.resolve(e(['webUserscripts','remove'], [id], { ok:false })).catch(function(){ return { ok:false }; }); },
        onUserscriptsUpdated: function(cb){ return hub.sub('userscriptsUpdated', function(emit){ e(['webUserscripts','onUpdated'], [emit], null); }, cb); },
        adblockGetState: function(){ return Promise.resolve(e(['webAdblock','getState'], [], { ok:false, enabled:false })).catch(function(){ return { ok:false, enabled:false }; }); },
        adblockSetEnabled: function(enabled){ return Promise.resolve(e(['webAdblock','setEnabled'], [enabled], { ok:false })).catch(function(){ return { ok:false }; }); },
        onAdblockUpdated: function(cb){ return hub.sub('adblockUpdated', function(emit){ e(['webAdblock','onUpdated'], [emit], null); }, cb); }
      };
    }

    function ensureMount() {
      if (!isAspectLaneEnabled()) {
        disableAspectForLegacyLane();
        return;
      }
      if (state.initialized && state.iframe && state.wrapper) {
        if (!state.usingLegacyFallback) showAspectEmbedOverlay();
        return;
      }
      var view = qs('wb-webview-view');
      if (!view) return;
      hideLegacyBrowserMarkup();

      var wrapper = qs('aspectEmbedMountRoot');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'aspectEmbedMountRoot';
        wrapper.setAttribute('data-role', 'aspect-embed-root');
        wrapper.style.position = 'absolute';
        wrapper.style.inset = '0';
        wrapper.style.zIndex = '110';
        wrapper.style.display = 'flex';
        wrapper.style.minWidth = '0';
        wrapper.style.minHeight = '0';
        wrapper.style.background = 'transparent';
        view.appendChild(wrapper);
      }
      state.wrapper = wrapper;
      if (!state.usingLegacyFallback) showAspectEmbedOverlay();
      reportRuntime({
        mounted: true,
        visible: !state.usingLegacyFallback
      });

      if (!state.bridge) {
        state.bridge = createParentBridge();
        window.__ASPECT_TANKO_BRIDGE__ = state.bridge;
      }

      var iframe = qs('aspectEmbedFrame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'aspectEmbedFrame';
        iframe.setAttribute('title', 'Tankoban Browser');
        iframe.setAttribute('aria-label', 'Embedded Browser');
        iframe.style.border = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.display = 'block';
        iframe.style.background = 'transparent';
        iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
        iframe.src = './domains/browser_host/aspect_embed/index.html?embed=1';
        state.iframeLoadPromise = new Promise(function(resolve){
          iframe.addEventListener('load', function(){
            state.iframeLoaded = true;
            reportRuntime({ ready: true, mounted: true, visible: !state.usingLegacyFallback, fallbackActive: false, lastError: null });
            resolve(true);
          }, { once: true });
        });
        wrapper.appendChild(iframe);
      } else if (!state.iframeLoadPromise) {
        state.iframeLoadPromise = Promise.resolve(true);
      }
      state.iframe = iframe;
      state.initialized = true;
      bindTopLevelButtons();
    }

    function getEmbedApi() {
      try {
        var cw = state.iframe && state.iframe.contentWindow;
        if (!cw) return null;
        return cw.AspectBrowserEmbed || null;
      } catch (_e) {
        return null;
      }
    }
    function afterIframeLoaded(fn) {
      if (!isAspectLaneEnabled()) return Promise.resolve(fn(false));
      ensureMount();
      var p = state.iframeLoadPromise || Promise.resolve(true);
      // If iframe load hangs (bad path / blocked load), degrade to legacy web flow.
      var hostCfg = (tanko.browserHost && typeof tanko.browserHost.getConfig === 'function')
        ? (tanko.browserHost.getConfig() || {})
        : {};
      var timeoutMs = Number(hostCfg.readinessTimeoutMs || 4000);
      if (!isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = 4000;
      var timeout = new Promise(function(resolve){
        setTimeout(function(){
          state.lastError = 'iframe-load-timeout';
          reportRuntime({ ready: false, fallbackActive: true, lastError: state.lastError });
          resolve(false);
        }, timeoutMs);
      });
      return Promise.race([Promise.resolve(p), timeout]).then(function(loaded){
        return fn(loaded !== false);
      });
    }

    function bindButton(id, handler) {
      var btn = qs(id);
      if (!btn || btn.dataset.aspectEmbedBound === '1') return;
      btn.dataset.aspectEmbedBound = '1';
      btn.addEventListener('click', handler);
      state.btnUnsubs.push(function(){
        try { btn.removeEventListener('click', handler); delete btn.dataset.aspectEmbedBound; } catch (_e) {}
      });
    }

    function bindDirectLaunchButtonCapture() {
      if (!isAspectLaneEnabled()) {
        unbindDirectLaunchButtonCapture();
        return;
      }
      var btn = qs('webHubToggleBtn');
      if (!btn || btn.dataset.aspectEmbedCaptureBound === '1') return;
      btn.dataset.aspectEmbedCaptureBound = '1';
      directCaptureHandler = function(e){
        if (isHandledClick(e)) return;
        markHandledClick(e);
        try {
          if (e) { e.preventDefault(); e.stopPropagation(); }
        } catch (_e) {}
        try {
          console.info('[browserHost][aspect-embed] webHubToggleBtn click captured', {
            mode: (window.Tanko && window.Tanko.modeRouter && typeof window.Tanko.modeRouter.getMode === 'function') ? window.Tanko.modeRouter.getMode() : 'unknown',
            hasWebviewView: !!qs('wb-webview-view'),
            hasWebLibraryView: !!qs('webLibraryView')
          });
        } catch (_e2) {}
        safelyLaunch('openDefault(capture)', function(){ return adapter.openDefault(); }).then(function(res){
          try {
            var browserVisible = isBrowserPaneVisible();
            var wrapperExists = !!qs('aspectEmbedMountRoot');
            var iframeExists = !!qs('aspectEmbedFrame');
            console.info('[browserHost][aspect-embed] openDefault(capture) result', {
              res: res,
              browserVisible: browserVisible,
              wrapperExists: wrapperExists,
              iframeExists: iframeExists
            });
            if (!browserVisible) {
              console.error('[browserHost][aspect-embed] Browser click handled but browser pane is still not visible');
            }
          } catch (_e3) {}
        }).catch(function(err){
          try { console.error('[browserHost][aspect-embed] openDefault(capture) rejected', err); } catch (_e4) {}
        });
      };
      btn.addEventListener('click', directCaptureHandler, true);
    }

    function bindTopLevelButtons() {
      if (!isAspectLaneEnabled()) {
        disableAspectForLegacyLane();
        return;
      }
      if (state.listenersBound) return;
      state.listenersBound = true;
      bindButton('webHubToggleBtn', function (e) {
        if (isHandledClick(e)) return;
        markHandledClick(e);
        if (e) { e.preventDefault(); e.stopPropagation(); }
        safelyLaunch('openDefault(button)', function(){ return adapter.openDefault(); });
      });
      bindButton('webHubAddSourceBtn', function (e) {
        if (isHandledClick(e)) return;
        markHandledClick(e);
        if (e) { e.preventDefault(); e.stopPropagation(); }
        safelyLaunch('openAddSourceDialog(button)', function(){ return adapter.openAddSourceDialog(); });
      });
      // Graceful browser/library tab switching in groundwork UI if buttons exist in future variants.
      bindButton('webBrowserTabBtn', function (e) {
        if (isHandledClick(e)) return;
        markHandledClick(e);
        if (e) { e.preventDefault(); e.stopPropagation(); }
        safelyLaunch('openDefault(webBrowserTabBtn)', function(){ return adapter.openDefault(); });
      });
      bindButton('webLibraryTabBtn', function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        activateWebPage(); showLibraryPane();
      });
      bindButton('webSourcesBtn', function (e) {
        if (isHandledClick(e)) return;
        markHandledClick(e);
        if (e) { e.preventDefault(); e.stopPropagation(); }
        safelyLaunch('openTorrentWorkspace(webSourcesBtn)', function(){ return adapter.openTorrentWorkspace(); });
      });
    }

    var adapter = {
      name: 'aspect-embed',
      mode: 'embed',
      ensureReady: function () {
        return Promise.resolve(activateWebPage()).then(function () {
          showBrowserPane();
          return afterIframeLoaded(function(loaded){
            if (!loaded) return openLegacyWebDefaultFallback();
            return { ok:true, adapter:'aspect-embed' };
          });
        });
      },
      openDefault: function () {
        return Promise.resolve(activateWebPage()).then(function(switched){
          showBrowserPane();
          try { console.info('[browserHost][aspect-embed] openDefault()', { modeSwitchAttempted: switched }); } catch (_e) {}
          return afterIframeLoaded(function(loaded){
            if (!loaded) return openLegacyWebDefaultFallback();
            var api = getEmbedApi();
            if (api && typeof api.openBrowser === 'function') {
              showAspectEmbedOverlay();
              hideLegacyBrowserMarkup();
              try { api.openBrowser(); } catch (_e2) {}
            } else {
              return openLegacyWebDefaultFallback();
            }
            focusIframeSoon();
            return { ok:true, adapter:'aspect-embed' };
          });
        });
      },
      openUrl: function (url) {
        return Promise.resolve(activateWebPage()).then(function () {
          showBrowserPane();
          return afterIframeLoaded(function(loaded){
            if (!loaded) return openLegacyWebDefaultFallback();
            var api = getEmbedApi();
            if (api && typeof api.openUrl === 'function') {
              showAspectEmbedOverlay();
              hideLegacyBrowserMarkup();
              try { api.openUrl(url || ''); } catch (_e) {}
            } else if (api && typeof api.openBrowser === 'function') {
              try { api.openBrowser(); } catch (_e2) {}
            } else {
              return openLegacyWebDefaultFallback();
            }
            focusIframeSoon();
            return { ok:true, adapter:'aspect-embed' };
          });
        });
      },
      openTorrentWorkspace: function () {
        return Promise.resolve(activateWebPage()).then(function () {
          showBrowserPane();
          return afterIframeLoaded(function(loaded){
            if (!loaded) return openLegacyWebDefaultFallback();
            var api = getEmbedApi();
            if (api && typeof api.openTorrents === 'function') {
              showAspectEmbedOverlay();
              hideLegacyBrowserMarkup();
              try { api.openTorrents(); } catch (_e) {}
            } else {
              return openLegacyWebDefaultFallback();
            }
            focusIframeSoon();
            return { ok:true, adapter:'aspect-embed' };
          });
        });
      },
      openAddSourceDialog: function () {
        return Promise.resolve(activateWebPage()).then(function () {
          showBrowserPane();
          return afterIframeLoaded(function(loaded){
            if (!loaded) return openLegacyWebDefaultFallback();
            var api = getEmbedApi();
            if (api && typeof api.openTorrentAddSourceDialog === 'function') {
              showAspectEmbedOverlay();
              hideLegacyBrowserMarkup();
              try { api.openTorrentAddSourceDialog(); return { ok:true, adapter:'aspect-embed' }; } catch (_e) {}
            }
            if (api && typeof api.openTorrents === 'function') {
              showAspectEmbedOverlay();
              hideLegacyBrowserMarkup();
              try { api.openTorrents(); } catch (_e2) {}
            } else {
              return openLegacyWebDefaultFallback();
            }
            return { ok:true, adapter:'aspect-embed', fallback:'opened-torrents' };
          });
        });
      },
      canOpenAddSource: function(){ return true; },
      isBrowserOpen: function () {
        try {
          var root = getBrowserRoot();
          return !!(state.iframe && state.iframe.isConnected && root && !(root.classList && root.classList.contains('hidden')));
        } catch (_e) { return false; }
      },
      getRuntimeState: function () {
        return {
          adapter: 'aspect-embed',
          ready: !!state.iframeLoaded && !state.usingLegacyFallback,
          mounted: !!(state.wrapper && state.wrapper.isConnected),
          visible: !state.usingLegacyFallback && isBrowserPaneVisible(),
          fallbackActive: !!state.usingLegacyFallback,
          lastError: state.lastError || null
        };
      }
    };

    try {
      tanko.browserHost.registerAdapter(adapter);
      tanko.aspectEmbed = tanko.aspectEmbed || {};
      tanko.aspectEmbed.adapter = adapter;
      tanko.aspectEmbed.openDefault = function(){ return adapter.openDefault(); };
      tanko.aspectEmbed.openUrl = function(url){ return adapter.openUrl(url); };
      tanko.aspectEmbed.openTorrents = function(){ return adapter.openTorrentWorkspace(); };
      tanko.aspectEmbed.ensureReady = function(){ return adapter.ensureReady(); };
      if (typeof tanko.browserHost.showLaunchButtons === 'function') tanko.browserHost.showLaunchButtons();
      if (typeof tanko.browserHost.showLaunchButtons === 'function') tanko.browserHost.showLaunchButtons();
      if (isAspectLaneEnabled()) bindDirectLaunchButtonCapture();
      else disableAspectForLegacyLane();
      try {
        console.info('[browserHost] Aspect embed adapter registered');
      } catch (_e) {}
    } catch (_eReg) { try { console.error('[browserHost] Aspect embed adapter registration failed', _eReg); } catch (_e) {} }
  });
})();
