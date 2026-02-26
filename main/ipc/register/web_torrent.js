// IPC registration for WebTorrent domain.
const { registerWebTorrentHandlers } = require('../../../packages/feature-torrent/register_ipc');

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  registerWebTorrentHandlers({ ipcMain, CHANNEL, ctx, domains });
};
