(function hostBridgeBootstrap(){
  'use strict';
  var isEmbed = false;
  try {
    var qp = new URLSearchParams((window.location && window.location.search) || '');
    isEmbed = !!(window.__ASPECT_EMBED__ || qp.get('embed') === '1');
  } catch (_e) {
    isEmbed = !!window.__ASPECT_EMBED__;
  }
  if (isEmbed) {
    try { window.__ASPECT_EMBED__ = true; } catch (_e2) {}
  }

  function noopUnsub(){ return function(){}; }
  function parentBridge(){
    try {
      if (window.parent && window.parent !== window && window.parent.__ASPECT_TANKO_BRIDGE__) {
        return window.parent.__ASPECT_TANKO_BRIDGE__;
      }
    } catch (_e) {}
    return null;
  }
  function pcall(name, args, fallback) {
    var bridge = parentBridge();
    if (!bridge || typeof bridge[name] !== 'function') return (typeof fallback === 'function') ? fallback() : fallback;
    try {
      return bridge[name].apply(bridge, args || []);
    } catch (_e) {
      return (typeof fallback === 'function') ? fallback() : fallback;
    }
  }
  function on(name, cb) {
    if (typeof cb !== 'function') return noopUnsub();
    var unsub = pcall(name, [cb], null);
    return typeof unsub === 'function' ? unsub : noopUnsub();
  }

  // Minimal Tanko proxy to allow auto-registration path in embed-ready Aspect builds.
  try {
    window.Tanko = window.Tanko || {};
    window.Tanko.browserHost = window.Tanko.browserHost || {};
    if (typeof window.Tanko.browserHost.registerAdapter !== 'function') {
      window.Tanko.browserHost.registerAdapter = function(adapter) {
        try {
          if (window.parent && window.parent.Tanko && window.parent.Tanko.browserHost && typeof window.parent.Tanko.browserHost.registerAdapter === 'function') {
            return window.parent.Tanko.browserHost.registerAdapter(adapter);
          }
        } catch (_e) {}
        return false;
      };
    }
  } catch (_e) {}

  function clipReadFallback() {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        navigator.clipboard.readText().then(function(txt){
          try { pcall('clipboardCacheWrite', [String(txt || '')], null); } catch (_e) {}
        }).catch(function(){});
      }
    } catch (_e) {}
    return String(pcall('clipboardCacheRead', [], '') || '');
  }
  function clipWriteFallback(text) {
    var s = String(text == null ? '' : text);
    pcall('clipboardCacheWrite', [s], null);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(s).catch(function(){});
      }
    } catch (_e) {}
    return true;
  }

  window.aspect = Object.assign({}, window.aspect || {}, {
    // Settings / history / bookmarks
    loadSettings: function(){ return pcall('loadSettings', [], {}); },
    saveSettings: function(settings){ return pcall('saveSettings', [settings], { ok:false }); },
    loadHistory: function(){ return pcall('loadHistory', [], []); },
    addHistory: function(url, title){ return pcall('addHistory', [url, title], { ok:false }); },
    deleteHistory: function(url){ return pcall('deleteHistory', [url], { ok:false }); },
    clearHistory: function(){ return pcall('clearHistory', [], { ok:false }); },
    loadBookmarks: function(){ return pcall('loadBookmarks', [], []); },
    addBookmark: function(url, title){ return pcall('addBookmark', [url, title], { ok:false }); },
    removeBookmark: function(url){ return pcall('removeBookmark', [url], { ok:false }); },
    bookmarksCheck: function(url){ return pcall('bookmarksCheck', [url], false); },
    toggleBookmark: function(url, title){ return pcall('toggleBookmark', [url, title], { ok:false }); },

    // Shell / window
    minimizeWindow: function(){ return pcall('minimizeWindow', [], false); },
    maximizeWindow: function(){ return pcall('maximizeWindow', [], false); },
    closeWindow: function(){ return pcall('closeWindow', [], false); },
    getWindowState: function(){ return pcall('getWindowState', [], { isMaximized:false }); },
    onWindowState: function(cb){ return on('onWindowState', cb); },

    // Search
    searchSuggest: function(q){ return pcall('searchSuggest', [q], []); },
    searchAdd: function(q){ return pcall('searchAdd', [q], { ok:false }); },
    // Webview actions
    onCreateTab: function(callback){
      if (typeof callback !== 'function') return noopUnsub();
      return on('onCreateTab', function (payload) {
        var p = (payload && typeof payload === 'object') ? payload : {};
        try { callback(p.url || '', p.disposition || '', p); } catch (_e) {}
      });
    },
    onPopupUrl: function(cb){ return on('onPopupUrl', cb); },
    printPdf: function(webContentsId){ return pcall('printPdf', [webContentsId], { ok:false }); },
    capturePage: function(webContentsId){ return pcall('capturePage', [webContentsId], { ok:false }); },
    ctxAction: function(webContentsId, action, payload){
      if (webContentsId && typeof webContentsId === 'object' && action == null) {
        return pcall('ctxAction', [webContentsId], { ok:false });
      }
      return pcall('ctxAction', [{ webContentsId: webContentsId, action: action, payload: payload }], { ok:false });
    },
    onShowContextMenu: function(cb){ return on('onShowContextMenu', cb); },

    // Downloads

    downloadAction: function(id, action){ return pcall('downloadAction', [id, action], { ok:false }); },
    downloadOpen: function(path){ return pcall('downloadOpen', [path], { ok:false }); },
    downloadShow: function(path){ return pcall('downloadShow', [path], { ok:false }); },
    onDownloadStarted: function(cb){ return on('onDownloadStarted', cb); },
    onDownloadProgress: function(cb){ return on('onDownloadProgress', cb); },
    onDownloadDone: function(cb){ return on('onDownloadDone', cb); },

    // Clipboard
    clipboardRead: function(){ return pcall('clipboardRead', [], clipReadFallback); },
    clipboardWrite: function(text){ return pcall('clipboardWrite', [text], function(){ return clipWriteFallback(text); }); },

    // Find-in-page helpers
    webviewFindInPage: function(webContentsId, text, opts){ return pcall('webviewFindInPage', [webContentsId, text, opts], { requestId:null }); },
    webviewStopFinding: function(webContentsId, action){ return pcall('webviewStopFinding', [webContentsId, action], { ok:false }); },
    onWebFindResult: function(cb){ return on('onWebFindResult', cb); },
    webviewExecuteJavaScript: function(webContentsId, code){ return pcall('webviewExecuteJavaScript', [webContentsId, code], null); },
    webviewSetAudioMuted: function(webContentsId, muted){ return pcall('webviewSetAudioMuted', [webContentsId, muted], false); },

    // Tor
    torGetStatus: function(){ return pcall('torGetStatus', [], { ok:false }); },
    torEnable: function(){ return pcall('torEnable', [], { ok:false }); },
    torDisable: function(){ return pcall('torDisable', [], { ok:false }); },
    onTorStatusChanged: function(cb){ return on('onTorStatusChanged', cb); },

    // Torrent workflow
    torrentGetActive: function(){ return pcall('torrentGetActive', [], { ok:false, items:[] }); },
    torrentGetHistory: function(){ return pcall('torrentGetHistory', [], { ok:false, items:[] }); },
    torrentSelectSaveFolder: function(){ return pcall('torrentSelectSaveFolder', [], { canceled:true, path:null }); },
    torrentStartConfigured: function(payload){ return pcall('torrentStartConfigured', [payload], { ok:false }); },
    torrentPause: function(id){ return pcall('torrentPause', [id], { ok:false }); },
    torrentResume: function(id){ return pcall('torrentResume', [id], { ok:false }); },
    torrentCancel: function(id){ return pcall('torrentCancel', [id], { ok:false }); },
    torrentRetry: function(id){ return pcall('torrentRetry', [id], { ok:false }); },
    torrentRemove: function(id, opts){ return pcall('torrentRemove', [id, opts], { ok:false }); },
    torrentOpenFolder: function(id){ return pcall('torrentOpenFolder', [id], { ok:false }); },
    torrentOpenFile: function(id){ return pcall('torrentOpenFile', [id], { ok:false }); },
    torrentResolveMetadata: function(input){ return pcall('torrentResolveMetadata', [input], { ok:false }); },
    torrentGetPeers: function(id){ return pcall('torrentGetPeers', [id], { ok:false, peers:[] }); },
    torrentGetDhtNodes: function(){ return pcall('torrentGetDhtNodes', [], { ok:false, nodes:[] }); },
    onTorrentStarted: function(cb){ return on('onTorrentStarted', cb); },
    onTorrentMetadata: function(cb){ return on('onTorrentMetadata', cb); },
    onTorrentProgress: function(cb){ return on('onTorrentProgress', cb); },
    onTorrentCompleted: function(cb){ return on('onTorrentCompleted', cb); },
    onMagnetDetected: function(cb){ return on('onMagnetDetected', cb); },
    onTorrentFileDetected: function(cb){ return on('onTorrentFileDetected', cb); },

    // Optional dialogs (safe fallbacks)
    dialogOpenFile: function(){ return pcall('dialogOpenFile', [], { canceled:true, filePaths:[] }); },
    dialogSaveAs: function(opts){ return pcall('dialogSaveAs', [opts], { canceled:true, filePath:null }); },

    // Permissions / adblock / userscripts safe bridge methods
    permissionsList: function(){ return pcall('permissionsList', [], []); },
    permissionsResolvePrompt: function(payload){ return pcall('permissionsResolvePrompt', [payload], { ok:false }); },
    onPermissionPrompt: function(cb){ return on('onPermissionPrompt', cb); },
    onPermissionsUpdated: function(cb){ return on('onPermissionsUpdated', cb); },
    userscriptsGet: function(){ return pcall('userscriptsGet', [], []); },
    userscriptsSetEnabled: function(enabled){ return pcall('userscriptsSetEnabled', [enabled], { ok:false }); },
    userscriptsUpsert: function(script){ return pcall('userscriptsUpsert', [script], { ok:false }); },
    userscriptsRemove: function(id){ return pcall('userscriptsRemove', [id], { ok:false }); },
    onUserscriptsUpdated: function(cb){ return on('onUserscriptsUpdated', cb); },
    adblockGetState: function(){ return pcall('adblockGetState', [], { enabled:false }); },
    adblockSetEnabled: function(enabled){ return pcall('adblockSetEnabled', [enabled], { ok:false }); },
    onAdblockUpdated: function(cb){ return on('onAdblockUpdated', cb); }
  });


  // Desktop-preload compatibility aliases expected by the embed-ready Aspect renderer.
  // These forward to the parent bridge methods (implemented in aspect_embed_mount.js).
  window.aspect.historyLoad = function () { return pcall('historyLoad', [], []); };
  window.aspect.historyAdd = function (entry) { return pcall('historyAdd', [entry || {}], null); };
  window.aspect.historyDelete = function (timestamp) { return pcall('historyDelete', [timestamp], null); };

  window.aspect.bookmarksLoad = function () { return pcall('bookmarksLoad', [], []); };
  window.aspect.bookmarksAdd = function (entry) { return pcall('bookmarksAdd', [entry || {}], null); };
  window.aspect.bookmarksRemove = function (url) { return pcall('bookmarksRemove', [url], null); };

  window.aspect.torStart = function () { return pcall('torStart', [], null); };
  window.aspect.torStop = function () { return pcall('torStop', [], null); };

  window.aspect.torrentStartMagnet = function (uri) { return pcall('torrentStartMagnet', [uri], false); };
  window.aspect.torrentStartUrl = function (url) { return pcall('torrentStartUrl', [url], false); };
  window.aspect.torrentPauseAll = function () { return pcall('torrentPauseAll', [], false); };
  window.aspect.torrentResumeAll = function () { return pcall('torrentResumeAll', [], false); };
  window.aspect.torrentSelectFiles = function (id, indices) { return pcall('torrentSelectFiles', [id, indices], false); };
  window.aspect.torrentCancelResolve = function (resolveId) { return pcall('torrentCancelResolve', [resolveId], false); };
  window.aspect.torrentGetPeers = function (id) { return pcall('torrentGetPeers', [id], { ok:false, peers:[] }); };
  window.aspect.torrentGetDhtNodes = function () { return pcall('torrentGetDhtNodes', [], { ok:false, nodes:[] }); };
})();
