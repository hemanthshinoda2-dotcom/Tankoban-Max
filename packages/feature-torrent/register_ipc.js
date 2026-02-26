'use strict';

function registerWebTorrentHandlers(registry) {
  var ipcMain = registry.ipcMain;
  var CHANNEL = registry.CHANNEL;
  var ctx = registry.ctx;
  var domains = registry.domains || {};
  var d = domains.webTorrentDomain;
  if (!ipcMain || !CHANNEL || !d) return;

  ipcMain.handle(CHANNEL.WEB_TORRENT_START_MAGNET, function (e, payload) { return d.startMagnet(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_START_TORRENT_URL, function (e, payload) { return d.startTorrentUrl(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_PAUSE, function (e, payload) { return d.pause(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_RESUME, function (e, payload) { return d.resume(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_CANCEL, function (e, payload) { return d.cancel(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_GET_ACTIVE, function (e) { return d.getActive(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_GET_HISTORY, function (e) { return d.getHistory(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_CLEAR_HISTORY, function (e) { return d.clearHistory(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_REMOVE_HISTORY, function (e, payload) { return d.removeHistory(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_SELECT_FILES, function (e, payload) { return d.selectFiles(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_SET_DESTINATION, function (e, payload) { return d.setDestination(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_STREAM_FILE, function (e, payload) { return d.streamFile(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_ADD_TO_VIDEO_LIBRARY, function (e, payload) { return d.addToVideoLibrary(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_REMOVE, function (e, payload) { return d.remove(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_PAUSE_ALL, function () { return d.pauseAll(ctx); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_RESUME_ALL, function () { return d.resumeAll(ctx); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_GET_PEERS, function (e, payload) { return d.getPeers(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_GET_DHT_NODES, function () { return d.getDhtNodes(ctx); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_SELECT_SAVE_FOLDER, function () { return d.selectSaveFolder(ctx); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_RESOLVE_METADATA, function (e, payload) { return d.resolveMetadata(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_START_CONFIGURED, function (e, payload) { return d.startConfigured(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_CANCEL_RESOLVE, function (e, payload) { return d.cancelResolve(ctx, e, payload); });
  ipcMain.on(CHANNEL.WEB_TORRENT_OPEN_FOLDER, function (e, payload) { d.openFolder(ctx, e, payload); });
}

function registerTorrentSearchHandlers(registry) {
  var ipcMain = registry.ipcMain;
  var CHANNEL = registry.CHANNEL;
  var ctx = registry.ctx;
  var domains = registry.domains || {};
  var d = domains.torrentSearchDomain;
  if (!ipcMain || !CHANNEL || !d) return;
  ipcMain.handle(CHANNEL.TORRENT_SEARCH_QUERY, function (e, payload) { return d.query(ctx, e, payload); });
  ipcMain.handle(CHANNEL.TORRENT_SEARCH_HEALTH, function (e) { return d.health(ctx, e); });
}

module.exports = {
  registerWebTorrentHandlers: registerWebTorrentHandlers,
  registerTorrentSearchHandlers: registerTorrentSearchHandlers,
};

