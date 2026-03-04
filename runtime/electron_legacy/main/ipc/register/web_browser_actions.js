// FEAT-BROWSER: IPC registration for browser utility actions
// (context menu dispatch, print/screenshot, download file operations).

var fs = require('fs');
var path = require('path');

module.exports = function register({ ipcMain, CHANNEL, ctx }) {
  var { webContents, dialog, shell } = require('electron');
  var app = require('electron').app;

  // Dispatch context menu action to a webview's webContents
  ipcMain.on(CHANNEL.WEB_CTX_ACTION, function (_e, payload) {
    if (!payload || !payload.webContentsId) return;
    var wc = webContents.fromId(payload.webContentsId);
    if (!wc || wc.isDestroyed()) return;

    var action = String(payload.action || '');
    var data = payload.payload;

    switch (action) {
      case 'back':        wc.goBack(); break;
      case 'forward':     wc.goForward(); break;
      case 'reload':      wc.reload(); break;
      case 'copy':        wc.copy(); break;
      case 'cut':         wc.cut(); break;
      case 'paste':       wc.paste(); break;
      case 'pasteAndMatchStyle':
        if (typeof wc.pasteAndMatchStyle === 'function') wc.pasteAndMatchStyle();
        else wc.paste();
        break;
      case 'undo':
        if (typeof wc.undo === 'function') wc.undo();
        break;
      case 'redo':
        if (typeof wc.redo === 'function') wc.redo();
        break;
      case 'selectAll':   wc.selectAll(); break;
      case 'saveImage':   wc.downloadURL(data); break;
      case 'saveLinkAs':
        if (data) wc.downloadURL(String(data));
        break;
      case 'copyImage':   if (data) wc.copyImageAt(data.x, data.y); break;
      case 'copyLink':
        if (data) require('electron').clipboard.writeText(String(data));
        break;
      case 'openLinkExternal':
        if (data) shell.openExternal(String(data));
        break;
      case 'inspect':
        if (data) wc.inspectElement(data.x, data.y);
        break;
      case 'devtools':
        if (wc.isDevToolsOpened()) wc.closeDevTools();
        else wc.openDevTools({ mode: 'bottom' });
        break;
    }
  });

  // Print page to PDF with save dialog
  ipcMain.handle(CHANNEL.WEB_PRINT_PDF, async function (_e, payload) {
    var wcId = payload && payload.webContentsId;
    if (!wcId) return { ok: false, error: 'No webContentsId' };
    var wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return { ok: false, error: 'No webContents' };
    try {
      var buf = await wc.printToPDF({});
      var result = await dialog.showSaveDialog(ctx.win, {
        defaultPath: path.join(app.getPath('downloads'), 'page.pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
      await fs.promises.writeFile(result.filePath, buf);
      return { ok: true, path: result.filePath };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  });

  // Screenshot page with save dialog
  ipcMain.handle(CHANNEL.WEB_CAPTURE_PAGE, async function (_e, payload) {
    var wcId = payload && payload.webContentsId;
    if (!wcId) return { ok: false, error: 'No webContentsId' };
    var wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return { ok: false, error: 'No webContents' };
    try {
      var image = await wc.capturePage();
      var result = await dialog.showSaveDialog(ctx.win, {
        defaultPath: path.join(app.getPath('downloads'), 'screenshot.png'),
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
      await fs.promises.writeFile(result.filePath, image.toPNG());
      return { ok: true, path: result.filePath };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  });

  // Open a downloaded file with the OS default app
  ipcMain.on(CHANNEL.WEB_DOWNLOAD_OPEN_FILE, function (_e, payload) {
    var savePath = String(payload && payload.savePath || payload || '').trim();
    if (savePath) shell.openPath(savePath);
  });

  // Show a downloaded file in the OS file manager
  ipcMain.on(CHANNEL.WEB_DOWNLOAD_SHOW_IN_FOLDER, function (_e, payload) {
    var savePath = String(payload && payload.savePath || payload || '').trim();
    if (savePath) shell.showItemInFolder(savePath);
  });
};
