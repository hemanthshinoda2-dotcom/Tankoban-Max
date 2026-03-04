// IPC registration for web userscripts (extension-lite).
module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webUserscriptsDomain;
  ipcMain.handle(CHANNEL.WEB_USERSCRIPTS_GET, function (e) { return d.get(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_USERSCRIPTS_SET_ENABLED, function (e, payload) { return d.setEnabled(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_USERSCRIPTS_UPSERT, function (e, payload) { return d.upsert(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_USERSCRIPTS_REMOVE, function (e, payload) { return d.remove(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_USERSCRIPTS_SET_RULE_ENABLED, function (e, payload) { return d.setRuleEnabled(ctx, e, payload); });
};
