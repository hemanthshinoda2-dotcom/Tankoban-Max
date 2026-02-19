// BUILD_WEB: IPC registration for Web Sources domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webSourcesDomain;
  ipcMain.handle(CHANNEL.WEB_SOURCES_GET, function (e) { return d.get(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_SOURCES_ADD, function (e, payload) { return d.add(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_SOURCES_REMOVE, function (e, id) { return d.remove(ctx, e, id); });
  ipcMain.handle(CHANNEL.WEB_SOURCES_UPDATE, function (e, payload) { return d.update(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_ROUTE, function (e, payload) { return d.routeDownload(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_DESTINATIONS, function (e) { return d.getDestinations(ctx, e); });

  // Set up download handler for the webview partition
  d.setupDownloadHandler(ctx);
};
