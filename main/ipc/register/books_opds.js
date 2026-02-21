module.exports = function registerBooksOpds(args) {
  var ipcMain = args.ipcMain;
  var CHANNEL = args.CHANNEL;
  var ctx = args.ctx;
  var domains = args.domains || {};
  var booksOpdsDomain = domains.booksOpdsDomain;
  if (!booksOpdsDomain) throw new Error('booksOpdsDomain missing');

  ipcMain.handle(CHANNEL.BOOKS_OPDS_GET_FEEDS, function () {
    return booksOpdsDomain.getFeeds(ctx);
  });
  ipcMain.handle(CHANNEL.BOOKS_OPDS_ADD_FEED, function (evt, payload) {
    return booksOpdsDomain.addFeed(ctx, evt, payload || {});
  });
  ipcMain.handle(CHANNEL.BOOKS_OPDS_UPDATE_FEED, function (evt, payload) {
    return booksOpdsDomain.updateFeed(ctx, evt, payload || {});
  });
  ipcMain.handle(CHANNEL.BOOKS_OPDS_REMOVE_FEED, function (evt, payload) {
    return booksOpdsDomain.removeFeed(ctx, evt, payload || {});
  });
  ipcMain.handle(CHANNEL.BOOKS_OPDS_FETCH_CATALOG, function (evt, payload) {
    return booksOpdsDomain.fetchCatalog(ctx, evt, payload || {});
  });
};
