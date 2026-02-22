// IPC registration for WebTorrent domain.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webTorrentDomain;
  ipcMain.handle(CHANNEL.WEB_TORRENT_START_MAGNET, function (e, payload) { return d.startMagnet(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_START_TORRENT_URL, function (e, payload) { return d.startTorrentUrl(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_PAUSE, function (e, payload) { return d.pause(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_RESUME, function (e, payload) { return d.resume(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_CANCEL, function (e, payload) { return d.cancel(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_GET_ACTIVE, function (e) { return d.getActive(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_GET_HISTORY, function (e) { return d.getHistory(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_CLEAR_HISTORY, function (e) { return d.clearHistory(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_TORRENT_REMOVE_HISTORY, function (e, payload) { return d.removeHistory(ctx, e, payload); });
};
