// IPC registration for per-origin web permissions domain.

module.exports = function register({ ipcMain, CHANNEL, ctx, domains }) {
  var d = domains.webPermissionsDomain;
  var prompts = null;
  try { prompts = require('../../domains/webPermissionPrompts'); } catch (_) {}

  ipcMain.handle(CHANNEL.WEB_PERMISSIONS_LIST, function (e) { return d.list(ctx, e); });
  ipcMain.handle(CHANNEL.WEB_PERMISSIONS_SET, function (e, payload) { return d.set(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_PERMISSIONS_RESET, function (e, payload) { return d.reset(ctx, e, payload); });
  ipcMain.handle(CHANNEL.WEB_PERMISSIONS_PROMPT_RESOLVE, function (_e, payload) {
    if (!prompts || typeof prompts.resolvePrompt !== 'function') return { ok: false, error: 'unavailable' };
    return prompts.resolvePrompt(payload || {});
  });
};
