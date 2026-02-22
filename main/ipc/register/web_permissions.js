// IPC registration for per-origin web permissions domain.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webPermissionsDomain;
  ipcMain.handle(CHANNEL.WEB_PERMISSIONS_LIST, function (e) { return d.list(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_PERMISSIONS_SET, function (e, payload) { return d.set(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_PERMISSIONS_RESET, function (e, payload) { return d.reset(ctx, e, payload); });
};
