// IPC registration for Jackett-backed torrent search domain.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.torrentSearchDomain;
  ipcMain.handle(CHANNEL.TORRENT_SEARCH_QUERY, function (e, payload) { return d.query(ctx, e, payload); });
  ipcMain.handle(CHANNEL.TORRENT_SEARCH_HEALTH, function (e) { return d.health(ctx, e); });
};
