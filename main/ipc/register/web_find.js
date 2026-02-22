// IPC placeholder for web find-in-page.
// The renderer owns <webview> instances, so actual find operations are done there.

module.exports = function register({ ipcMain, CHANNEL }) {
  ipcMain.handle(CHANNEL.WEB_FIND_IN_PAGE, function () {
    return { ok: false, error: 'find-in-page is renderer-managed in this build' };
  });
};
