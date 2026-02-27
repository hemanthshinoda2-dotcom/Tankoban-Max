// IPC registration for web browsing history.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webHistoryDomain;
  ipcMain.handle(CHANNEL.WEB_HISTORY_LIST, function (e, payload) { return d.list(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_HISTORY_ADD, function (e, payload) { return d.add(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_HISTORY_UPSERT, function (e, payload) { return d.upsert(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_HISTORY_CLEAR, function (e, payload) { return d.clear(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_HISTORY_REMOVE, function (e, payload) { return d.remove(ctx, e, payload); });
};
