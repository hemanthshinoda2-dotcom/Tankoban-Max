// BUILD_WCV: IPC registration for Web Tabs domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webTabsDomain;
  ipcMain.handle(CHANNEL.WEB_TAB_CREATE, function (e, payload) { return d.create(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TAB_CLOSE, function (e, payload) { return d.close(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TAB_ACTIVATE, function (e, payload) { return d.activate(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TAB_NAVIGATE, function (e, payload) { return d.navigate(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TAB_BOUNDS, function (e, payload) { return d.setBounds(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TAB_HIDE_ALL, function (e) { return d.hideAll(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_TAB_QUERY, function (e, payload) { return d.query(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_TAB_SPLIT_BOUNDS, function (e, payload) { return d.splitBounds(ctx, e, payload); });
};
