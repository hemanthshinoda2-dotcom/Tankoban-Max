// Preload for player_hg in Holy Grail mode.
// Exposes two bridges:
//   PlayerBridge  — window management (same as preload.js)
//   HolyGrailBridge — mpv + D3D11 + sharedTexture GPU pipeline

const { contextBridge, ipcRenderer, sharedTexture } = require('electron');

// ── Shared texture frame receiver ──

var __frameHandler = null;
var __receiverBound = false;

function bindSharedTextureReceiver() {
  if (__receiverBound) return;
  __receiverBound = true;

  try {
    if (!sharedTexture || typeof sharedTexture.setSharedTextureReceiver !== 'function') return;

    sharedTexture.setSharedTextureReceiver(function (payload) {
      var videoFrame = null;
      try {
        videoFrame = payload.importedSharedTexture.getVideoFrame();
      } catch (e) {}

      try {
        if (videoFrame && typeof __frameHandler === 'function') {
          __frameHandler(videoFrame);
        } else if (videoFrame && typeof videoFrame.close === 'function') {
          videoFrame.close();
        }
      } catch (e) {
        try { if (videoFrame && typeof videoFrame.close === 'function') videoFrame.close(); } catch (e2) {}
      } finally {
        try { payload.importedSharedTexture.release(); } catch (e) {}
      }
    });
  } catch (e) {}
}

bindSharedTextureReceiver();

// ── IPC helpers ──

function invoke(channel) {
  var args = Array.prototype.slice.call(arguments, 1);
  return ipcRenderer.invoke.apply(ipcRenderer, [channel].concat(args)).then(function (res) {
    return (res && typeof res === 'object') ? res : { ok: false, error: 'Invalid response' };
  }).catch(function (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  });
}

function onEvent(channel, handler) {
  if (typeof handler !== 'function') return function () {};
  var fn = function (_evt, payload) {
    try { handler(payload); } catch (e) {}
  };
  ipcRenderer.on(channel, fn);
  return function () {
    try { ipcRenderer.removeListener(channel, fn); } catch (e) {}
  };
}

// ── IPC channel constants (mirroring shared/ipc.js) ──

var CH = {
  HG_PROBE:            'holyGrail:probe',
  HG_INIT:             'holyGrail:init',
  HG_RESIZE:           'holyGrail:resize',
  HG_LOAD:             'holyGrail:load',
  HG_START_FRAME_LOOP: 'holyGrail:startFrameLoop',
  HG_STOP_FRAME_LOOP:  'holyGrail:stopFrameLoop',
  HG_COMMAND:          'holyGrail:command',
  HG_GET_PROPERTY:     'holyGrail:getProperty',
  HG_SET_PROPERTY:     'holyGrail:setProperty',
  HG_GET_STATE:        'holyGrail:getState',
  HG_GET_TRACK_LIST:   'holyGrail:getTrackList',
  HG_OBSERVE_PROPERTY: 'holyGrail:observeProperty',
  HG_DESTROY:          'holyGrail:destroy',
};

var EV = {
  HG_PROPERTY_CHANGE: 'holyGrail:propertyChange',
  HG_EOF:             'holyGrail:eof',
  HG_FILE_LOADED:     'holyGrail:fileLoaded',
};

// ── Expose PlayerBridge (window management — same as preload.js) ──

contextBridge.exposeInMainWorld('PlayerBridge', {
  getLaunchArgs: function () {
    return ipcRenderer.invoke('get-launch-args');
  },
  openFileDialog: function () {
    return ipcRenderer.invoke('open-file-dialog');
  },
  openSubtitleDialog: function () {
    return ipcRenderer.invoke('open-subtitle-dialog');
  },
  minimize: function () {
    ipcRenderer.send('minimize-window');
  },
  toggleFullscreen: function () {
    ipcRenderer.send('toggle-fullscreen');
  },
  quit: function () {
    ipcRenderer.send('quit-app');
  },
  setTitle: function (title) {
    ipcRenderer.send('set-title', title);
  },
  listFolderVideos: function (folderPath) {
    return ipcRenderer.invoke('list-folder-videos', folderPath);
  },
  onFullscreenChange: function (callback) {
    ipcRenderer.on('fullscreen-changed', function (_event, isFullscreen) {
      callback(isFullscreen);
    });
  },
  loadSettings: function () {
    return ipcRenderer.invoke('load-player-settings');
  },
  saveSettings: function (settings) {
    return ipcRenderer.invoke('save-player-settings', settings);
  },
  saveScreenshot: function (dataUrl, suggestedName) {
    return ipcRenderer.invoke('save-screenshot', dataUrl, suggestedName);
  },
});

// ── Expose HolyGrailBridge (GPU pipeline) ──

contextBridge.exposeInMainWorld('HolyGrailBridge', {
  probe:          function ()     { return invoke(CH.HG_PROBE); },
  initGpu:        function (opts) { return invoke(CH.HG_INIT, (opts && typeof opts === 'object') ? opts : {}); },
  resizeSurface:  function (opts) { return invoke(CH.HG_RESIZE, (opts && typeof opts === 'object') ? opts : {}); },
  loadFile:       function (path) { return invoke(CH.HG_LOAD, String(path || '')); },
  startFrameLoop: function ()     { return invoke(CH.HG_START_FRAME_LOOP); },
  stopFrameLoop:  function ()     { return invoke(CH.HG_STOP_FRAME_LOOP); },
  command:        function (args) { return invoke(CH.HG_COMMAND, Array.isArray(args) ? args : []); },
  getProperty:    function (name) { return invoke(CH.HG_GET_PROPERTY, String(name || '')); },
  setProperty:    function (name, value) { return invoke(CH.HG_SET_PROPERTY, String(name || ''), value); },
  getState:       function ()     { return invoke(CH.HG_GET_STATE); },
  getTrackList:   function ()     { return invoke(CH.HG_GET_TRACK_LIST); },
  observeProperty: function (name) { return invoke(CH.HG_OBSERVE_PROPERTY, String(name || '')); },
  destroy:        function ()     { return invoke(CH.HG_DESTROY); },

  onPropertyChange: function (handler) { return onEvent(EV.HG_PROPERTY_CHANGE, handler); },
  onEof:            function (handler) { return onEvent(EV.HG_EOF, handler); },
  onFileLoaded:     function (handler) { return onEvent(EV.HG_FILE_LOADED, handler); },

  onVideoFrame: function (handler) {
    __frameHandler = (typeof handler === 'function') ? handler : null;
    return function () {
      if (__frameHandler === handler) __frameHandler = null;
    };
  },
});
