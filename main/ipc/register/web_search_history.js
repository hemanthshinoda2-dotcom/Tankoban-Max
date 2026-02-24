// FEAT-BROWSER: IPC registration for web search history (omnibox suggestions).

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webSearchHistoryDomain;
  ipcMain.handle(CHANNEL.WEB_SEARCH_SUGGEST, function (e, input) { return d.suggest(ctx, e, input); });
  ipcMain.on(CHANNEL.WEB_SEARCH_ADD, function (e, query) { d.add(ctx, e, query); });
};
