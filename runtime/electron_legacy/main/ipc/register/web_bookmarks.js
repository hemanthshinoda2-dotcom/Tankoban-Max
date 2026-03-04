// IPC registration for web bookmarks domain.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webBookmarksDomain;
  ipcMain.handle(CHANNEL.WEB_BOOKMARKS_LIST, function (e) { return d.list(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_BOOKMARKS_ADD, function (e, payload) { return d.add(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_BOOKMARKS_UPDATE, function (e, payload) { return d.update(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_BOOKMARKS_REMOVE, function (e, payload) { return d.remove(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_BOOKMARKS_TOGGLE, function (e, payload) { return d.toggle(ctx, e, payload); });
};
