// IPC registration for Jackett-backed torrent search domain.
const { registerTorrentSearchHandlers } = require('../../../packages/feature-torrent/register_ipc');

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  registerTorrentSearchHandlers({ ipcMain, CHANNEL, ctx, domains });
};
