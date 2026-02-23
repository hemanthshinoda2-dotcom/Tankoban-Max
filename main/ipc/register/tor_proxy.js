// IPC registration for Tor proxy (FEAT-TOR).

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.torProxyDomain;
  ipcMain.handle(CHANNEL.TOR_PROXY_START, function (e) { return d.start(ctx, e); });
  ipcMain.handle(CHANNEL.TOR_PROXY_STOP, function (e) { return d.stop(ctx, e); });
  ipcMain.handle(CHANNEL.TOR_PROXY_GET_STATUS, function () { return d.getStatus(); });
};
