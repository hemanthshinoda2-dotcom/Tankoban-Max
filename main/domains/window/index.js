/*
TankobanPlus — Window Domain (Build 78B, Phase 4 Checkpoint B)

Handles BrowserWindow operations: fullscreen, always-on-top, minimize/close, dialogs, screenshots.
Extracted from Build 78A IPC registry with ZERO behavior changes.
*/

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== HELPER FUNCTIONS ==========

/**
 * Get window from IPC event sender.
 * Lifted from Build 78A index.js lines 1205-1216.
 */
function winFromEvt(evt) {
  try {
    const w = BrowserWindow.fromWebContents(evt?.sender);
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    const w2 = BrowserWindow.getFocusedWindow();
    if (w2 && !w2.isDestroyed()) return w2;
  } catch {}
  return null; // Will use ctx.win if this returns null
}

/**
 * Get primary window (focused or first available).
 * Lifted from Build 78A index.js lines 1134-1145.
 */
function getPrimaryWindow(ctx) {
  try {
    const w = BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    // ctx.windows would need to be passed if we use it, but Build 78A uses win
    if (ctx.win && !ctx.win.isDestroyed()) return ctx.win;
  } catch {}
  return null;
}


/**
 * Small async sleep to allow window state transitions (maximize <-> fullscreen) to settle.
 * Helps on Windows where fullscreen toggles can be ignored when the window is maximized.
 */
function __sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Robust fullscreen setter:
 * - If entering fullscreen while maximized (Windows), unmaximize first then enter fullscreen.
 * - Wait a tick between transitions so Electron applies them consistently.
 * Returns the final fullscreen state (best-effort).
 */
async function __applyFullscreen(w, want) {
  if (!w || (w.isDestroyed && w.isDestroyed())) return false;

  const platform = process.platform;
  let wasMax = false;
  try { wasMax = !!(w.isMaximized && w.isMaximized()); } catch {}

  if (want) {
    try { w.__tankoWasMaxBeforeFs = wasMax; } catch {}
    // Windows: fullscreen can be flaky if called while maximized (esp. frameless windows).
    if (platform === 'win32' && wasMax) {
      try { w.unmaximize(); } catch {}
      await __sleep(45);
    }
    try { w.setFullScreen(true); } catch {}
    await __sleep(45);
    // Retry once if the state didn't stick.
    try { if (!(w.isFullScreen && w.isFullScreen())) w.setFullScreen(true); } catch {}
    await __sleep(20);
  } else {
    try { w.setFullScreen(false); } catch {}
    await __sleep(35);
    // If we captured a pre-fullscreen maximize state, restore it (Windows UX).
    let restoreMax = false;
    try { restoreMax = !!w.__tankoWasMaxBeforeFs; } catch {}
    if (platform === 'win32' && restoreMax) {
      try { w.maximize(); } catch {}
      await __sleep(20);
    }
  }

  try { return !!(w.isFullScreen && w.isFullScreen()); } catch {}
  return !!want;
}


// ========== DOMAIN HANDLERS ==========

/**
 * Set fullscreen state.
 * Lifted from Build 78A index.js lines 1378-1384.
 */
async function setFullscreen(ctx, evt, value) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try {
    const next = await __applyFullscreen(w, !!value);
    return { ok: true, value: !!next };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}


/**
 * Toggle fullscreen state.
 * Lifted from Build 78A index.js lines 1386-1392.
 */
async function toggleFullscreen(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try {
    let cur = false;
    try { cur = !!(w.isFullScreen && w.isFullScreen()); } catch {}
    const next = await __applyFullscreen(w, !cur);
    return { ok: true, value: !!next };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}


/**
 * Get fullscreen state.
 * Lifted from Build 78A index.js lines 1394-1398.
 */
async function isFullscreen(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  try { return !!w?.isFullScreen(); } catch {}
  return false;
}

/**
 * Get maximized state.
 */
async function isMaximized(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  try { return !!w?.isMaximized(); } catch {}
  return false;
}

/**
 * Toggle maximize / restore.
 * NOTE: This is different from fullscreen. Used by the top window control bar.
 */
async function toggleMaximize(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };

  // If minimized, restore first so maximize/unmaximize is visible.
  try { if (w.isMinimized && w.isMinimized()) w.restore(); } catch {}

  // If currently fullscreen, exit fullscreen then maximize (matches Windows UX).
  try {
    if (w.isFullScreen && w.isFullScreen()) {
      try { w.setFullScreen(false); } catch {}
      setImmediate(() => { try { w.maximize(); } catch {} });
      return { ok: true, value: true };
    }
  } catch {}

  try {
    const cur = !!w.isMaximized();
    if (cur) {
      w.unmaximize();
    } else {
      w.maximize();
    }
    let next = !cur;
    try { next = !!w.isMaximized(); } catch {}
    return { ok: true, value: next };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}


/**
 * Open book in new window.
 * BUILD21_MULTI_WINDOW_OPEN (Build 21)
 * Lifted from Build 78A index.js lines 1400-1407.
 */
async function openBookInNewWindow(ctx, _evt, bookId) {
  const id = String(bookId || '');
  if (!id) return { ok: false };
  try { ctx.createWindow({ openBookId: id }); } catch { return { ok: false }; }
  return { ok: true };
}

/**
 * Open video shell window.
 * BUILD39: Forward to existing window instead of spawning new shell.
 * Lifted from Build 78A index.js lines 1409-1430.
 */
async function openVideoShell(ctx, evt, payload) {
  try {
    const target = winFromEvt(evt) || getPrimaryWindow(ctx);
    if (target && !target.isDestroyed()) {
      try { if (target.isMinimized()) target.restore(); } catch {}
      try { target.show(); } catch {}
      try { target.focus(); } catch {}
      try { target.webContents.send(ctx.EVENT.VIDEO_SHELL_PLAY, payload || {}); } catch {}
      return { ok: true, forwarded: true };
    }
  } catch {}

  // Fallback: if no window exists yet, create the legacy shell window.
  const win = ctx.createVideoShellWindow();
  if (!win) return { ok: false, error: 'no window' };
  win.webContents.send(ctx.EVENT.VIDEO_SHELL_PLAY, payload || {});
  win.show();
  win.focus();
  return { ok: true, forwarded: false };
}

/**
 * Minimize window.
 * Lifted from Build 78A index.js lines 1432-1437.
 */
async function minimize(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try { w.minimize(); } catch {}
  return { ok: true };
}

/**
 * Close window.
 * Lifted from Build 78A index.js lines 1439-1444.
 */
async function close(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try { w.close(); } catch {}
  return { ok: true };
}

/**
 * Get always-on-top state.
 * BUILD64: Always-on-top support
 * Lifted from Build 78A index.js lines 1447-1455.
 */
async function isAlwaysOnTop(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return false;
  try {
    return w.isAlwaysOnTop();
  } catch {
    return false;
  }
}

/**
 * Toggle always-on-top state.
 * BUILD64: Always-on-top support
 * Lifted from Build 78A index.js lines 1457-1467.
 */
async function toggleAlwaysOnTop(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try {
    const current = w.isAlwaysOnTop();
    w.setAlwaysOnTop(!current);
    return { ok: true, value: !current };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Take screenshot.
 * BUILD64: Screenshot support
 * Lifted from Build 78A index.js lines 1470-1489.
 */
async function takeScreenshot(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try {
    const { nativeImage } = require('electron');
    const image = await w.webContents.capturePage();
    const buffer = image.toPNG();
    
    // Save to user's pictures folder with timestamp
    const picturesPath = app.getPath('pictures');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `Tankoban-Screenshot-${timestamp}.png`;
    const savePath = path.join(picturesPath, filename);
    
    fs.writeFileSync(savePath, buffer);
    return { ok: true, path: savePath };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Open subtitle file dialog.
 * BUILD64: Open subtitle file dialog
 * Lifted from Build 78A index.js lines 1492-1512.
 */
async function openSubtitleDialog(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try {
    const result = await dialog.showOpenDialog(w, {
      properties: ['openFile'],
      filters: [
        { name: 'Subtitle Files', extensions: ['srt', 'ass', 'ssa', 'sub', 'vtt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    
    return { ok: true, filePath: result.filePaths[0] };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * BUILD14: Hide window
 */
async function hideWindow(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try { 
    w.hide(); 
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * BUILD14: Show window and restore fullscreen
 */
async function showWindow(ctx, evt) {
  const w = winFromEvt(evt) || ctx.win;
  if (!w) return { ok: false };
  try {
    // Do not force fullscreen on/off here — callers (like the Qt player bridge) decide.
    try { if (w.isMinimized && w.isMinimized()) w.restore(); } catch {}
    w.show();
    w.focus();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}


module.exports = {
  setFullscreen,
  toggleFullscreen,
  isFullscreen,
  isMaximized,
  toggleMaximize,
  openBookInNewWindow,
  openVideoShell,
  minimize,
  close,
  isAlwaysOnTop,
  toggleAlwaysOnTop,
  takeScreenshot,
  openSubtitleDialog,
  hideWindow,    // BUILD14
  showWindow,    // BUILD14
};
