'use strict';

function createFeatureFacade(api) {
  var src = api && typeof api === 'object' ? api : {};
  return {
    sources: {
      openSources: function () { return src.web && src.web.openSources ? src.web.openSources() : Promise.resolve({ ok: false }); },
      openSearch: function () { return src.web && src.web.openSourcesSearch ? src.web.openSourcesSearch() : Promise.resolve({ ok: false }); },
      openDownloads: function () { return src.web && src.web.openSourcesDownloads ? src.web.openSourcesDownloads() : Promise.resolve({ ok: false }); },
      search: function (payload) { return src.torrentSearch && src.torrentSearch.query ? src.torrentSearch.query(payload) : Promise.resolve({ ok: false, items: [] }); },
      startMagnet: function (payload) { return src.webTorrent && src.webTorrent.startMagnet ? src.webTorrent.startMagnet(payload) : Promise.resolve({ ok: false }); },
    },
    torrent: {
      getActive: function () { return src.webTorrent && src.webTorrent.getActive ? src.webTorrent.getActive() : Promise.resolve({ ok: false, torrents: [] }); },
      getHistory: function () { return src.webTorrent && src.webTorrent.getHistory ? src.webTorrent.getHistory() : Promise.resolve({ ok: false, torrents: [] }); },
      selectFiles: function (payload) { return src.webTorrent && src.webTorrent.selectFiles ? src.webTorrent.selectFiles(payload) : Promise.resolve({ ok: false }); },
      remove: function (payload) { return src.webTorrent && src.webTorrent.remove ? src.webTorrent.remove(payload) : Promise.resolve({ ok: false }); },
    },
    video: {
      getState: function () { return src.video && src.video.getState ? src.video.getState() : Promise.resolve({ ok: false }); },
      getPlayerPreference: function () { return src.videoSettings && src.videoSettings.get ? src.videoSettings.get() : Promise.resolve({}); },
      setPlayerPreference: function (payload) { return src.videoSettings && src.videoSettings.save ? src.videoSettings.save(payload) : Promise.resolve({ ok: false }); },
    },
    browser: {
      getSettings: function () { return src.webBrowserSettings && src.webBrowserSettings.get ? src.webBrowserSettings.get() : Promise.resolve({ ok: false }); },
      saveSettings: function (payload) { return src.webBrowserSettings && src.webBrowserSettings.save ? src.webBrowserSettings.save(payload) : Promise.resolve({ ok: false }); },
    },
  };
}

module.exports = {
  name: 'core-preload',
  ownership: 'Preload bridge composition and namespace exposure.',
  current: {
    entry: 'preload/index.js',
    namespaces: 'preload/namespaces',
    legacyAliases: 'preload/namespaces/_legacy.js',
  },
  createFeatureFacade: createFeatureFacade,
};
