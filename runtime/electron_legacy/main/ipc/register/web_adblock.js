// IPC registration for built-in web adblock domain.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webAdblockDomain;
  ipcMain.handle(CHANNEL.WEB_ADBLOCK_GET, function (e) { return d.get(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_ADBLOCK_SET_ENABLED, function (e, payload) { return d.setEnabled(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_ADBLOCK_UPDATE_LISTS, function (e) { return d.updateLists(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_ADBLOCK_STATS, function (e) { return d.stats(ctx, e); });
};
