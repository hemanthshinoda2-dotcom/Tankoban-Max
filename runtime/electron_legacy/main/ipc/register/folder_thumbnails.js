// Build 21 - Folder Thumbnails IPC handlers

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  // Build 21: Folder thumbnail auto-generation
  ipcMain.handle(CHANNEL.VIDEO_GET_FOLDER_THUMBNAIL, (e, ...args) => 
    domains.folderThumbsDomain.getFolderThumbnail(ctx, e, ...args));
  
  ipcMain.handle(CHANNEL.VIDEO_REQUEST_FOLDER_THUMBNAIL, (e, ...args) => 
    domains.folderThumbsDomain.requestFolderThumbnail(ctx, e, ...args));
};
