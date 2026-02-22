// IPC registration for web browser settings.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webBrowserSettingsDomain;
  ipcMain.handle(CHANNEL.WEB_BROWSER_SETTINGS_GET, function (e) { return d.get(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_BROWSER_SETTINGS_SAVE, function (e, payload) { return d.save(ctx, e, payload); });
};
