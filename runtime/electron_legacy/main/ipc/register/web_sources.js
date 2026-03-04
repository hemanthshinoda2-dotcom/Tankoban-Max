// BUILD_WEB: IPC registration for Web Sources domain

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webSourcesDomain;
  ipcMain.handle(CHANNEL.WEB_SOURCES_GET, function (e) { return d.get(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_SOURCES_ADD, function (e, payload) { return d.add(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_SOURCES_REMOVE, function (e, id) { return d.remove(ctx, e, id); });
  ipcMain.handle(CHANNEL.WEB_SOURCES_UPDATE, function (e, payload) { return d.update(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_ROUTE, function (e, payload) { return d.routeDownload(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_DESTINATIONS, function (e) { return d.getDestinations(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_DIRECT_URL, function (e, payload) { return d.downloadFromUrl(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_HISTORY_GET, function (e) { return d.getDownloadHistory(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_HISTORY_CLEAR, function (e) { return d.clearDownloadHistory(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_HISTORY_REMOVE, function (e, payload) { return d.removeDownloadHistory(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_PAUSE, function (e, payload) { return d.pauseDownload(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_RESUME, function (e, payload) { return d.resumeDownload(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_CANCEL, function (e, payload) { return d.cancelDownload(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_PICK_FOLDER, function (e, payload) { return d.pickDestinationFolder(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_PICKER_LIST_FOLDERS, function (e, payload) { return d.listDestinationFolders(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_DOWNLOAD_PICKER_RESOLVE, function (e, payload) { return d.resolveDestinationPicker(ctx, e, payload); });

  // Native OS folder picker dialog
  ipcMain.handle(CHANNEL.WEB_PICK_SAVE_FOLDER, async function (_e, payload) {
    var { dialog } = require('electron');
    var opts = { title: 'Select save folder', properties: ['openDirectory', 'createDirectory'] };
    if (payload && payload.defaultPath) opts.defaultPath = String(payload.defaultPath);
    try {
      var result = await dialog.showOpenDialog(ctx.win(), opts);
      if (result.canceled || !result.filePaths || !result.filePaths.length) return { ok: false, cancelled: true };
      return { ok: true, path: result.filePaths[0] };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  // Set up download handler for the webview partition
  d.setupDownloadHandler(ctx);
};
