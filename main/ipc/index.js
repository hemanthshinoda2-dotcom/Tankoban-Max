/*
TankobanPlus — Main IPC Registry

// TRACE:IPC_IN
OWNERSHIP: THE ONLY FILE WHERE ipcMain.handle/on MAY BE CALLED.

Structure:
- Imports + domain module requires
- ctx creation (shared context for all domain handlers)
- DevTools keyboard shortcuts
- File-opening / single-instance support
- Window creation (createWindow, createVideoShellWindow)
- IPC registry module loop (./register/*.js)

All library/video domain logic lives in main/domains/.
Storage utilities live in main/lib/storage.js.
*/

module.exports = function registerIpc({ APP_ROOT, win, windows }) {

// DIAG: Boot logger to trace IPC registration issues (writes to temp dir)
const __bLog = (() => {
  const _os = require('os');
  const _fs = require('fs');
  const _path = require('path');
  const logFile = _path.join(_os.tmpdir(), 'tankoban_boot_ipc.log');
  try { _fs.writeFileSync(logFile, ''); } catch {} // truncate
  return function(msg) {
    try { _fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
  };
})();
__bLog('registerIpc: ENTERED, win=' + (win ? 'BrowserWindow' : 'null') + ', windows=' + (windows ? 'Set(size=' + windows.size + ')' : 'undefined'));

// ========== IMPORTS ==========
const { app, BrowserWindow, ipcMain } = require('electron');
const { fileURLToPath } = require('url');
const path = require('path');
const fs = require('fs');

// Phase 2: IPC contract (Build 76) - Phase 3: adjusted path
const { CHANNEL, EVENT } = require('../../shared/ipc');
__bLog('registerIpc: core imports OK');

// Phase 4A: Storage library and persistence domains (Build 78A)
const storage = require('../lib/storage');
const progress = require('../domains/progress');
const booksProgress = require('../domains/booksProgress');
const booksTtsProgress = require('../domains/booksTtsProgress'); // LISTEN_P4
const videoProgress = require('../domains/videoProgress');
const booksSettings = require('../domains/booksSettings');
const booksBookmarks = require('../domains/booksBookmarks');
const booksAnnotations = require('../domains/booksAnnotations'); // BUILD_ANNOT
const booksDisplayNames = require('../domains/booksDisplayNames'); // RENAME-BOOK
const videoDisplayNames = require('../domains/videoDisplayNames'); // RENAME-VIDEO
const videoSettings = require('../domains/videoSettings');
const booksUi = require('../domains/booksUi');
const videoUi = require('../domains/videoUi');
const seriesSettings = require('../domains/seriesSettings');
__bLog('registerIpc: Phase 4A domains OK');

// BUILD88: Ensure health:ping is always registered even if later registry modules throw.
try {
  ipcMain.handle(CHANNEL.HEALTH_PING, async () => ({ ok: true, timestamp: Date.now() }));
} catch {}

// Phase 4B: Window, shell, archives, export domains (Build 78B)
const windowDomain = require('../domains/window');
const shellDomain = require('../domains/shell');
const archivesDomain = require('../domains/archives');
const exportDomain = require('../domains/export');
__bLog('registerIpc: Phase 4B domains OK');

// Phase 4C: Thumbs, library, video domains (Build 78C)
const thumbsDomain = require('../domains/thumbs');
const libraryDomain = require('../domains/library');
const booksDomain = require('../domains/books');
const booksTtsEdgeDomain = require('../domains/booksTtsEdge');
const booksOpdsDomain = require('../domains/booksOpds');
const videoDomain = require('../domains/video');
__bLog('registerIpc: Phase 4C domains OK (thumbs, library, books, video)');

// Phase 4D: MPV/libmpv extraction + thin registry sweep (Build 78D)
const playerCoreDomain = require('../domains/player_core');
const holyGrailDomain = require('../domains/holyGrail');
const clipboardDomain = require('../domains/clipboard');
const filesDomain = require('../domains/files');
const comicDomain = require('../domains/comic');
__bLog('registerIpc: Phase 4D domains OK (player_core, holy_grail, clipboard, files, comic)');

// BUILD_WEB: Web Sources domain
const webSourcesDomain = require('../domains/webSources');
const webBrowserSettingsDomain = require('../domains/webBrowserSettings');
const webHistoryDomain = require('../domains/webHistory');
const webTorrentDomain = require('../domains/webTorrent');
const webSessionDomain = require('../domains/webSession');
const webBookmarksDomain = require('../domains/webBookmarks');
const webPermissionsDomain = require('../domains/webPermissions');
const webDataDomain = require('../domains/webData');
const webAdblockDomain = require('../domains/webAdblock');
const torProxyDomain = require('../domains/torProxy');
__bLog('registerIpc: BUILD_WEB webSourcesDomain + settings/history/torrent/torProxy domains OK');

// FEAT-AUDIOBOOK: Audiobook domains
const audiobooksDomain = require('../domains/audiobooks');
const audiobookProgress = require('../domains/audiobookProgress');
const audiobookPairing = require('../domains/audiobookPairing');
__bLog('registerIpc: FEAT-AUDIOBOOK domains OK');

// Phase 4A/4B: Build context object for domain handlers
// Note: createWindow and createVideoShellWindow are defined below and added to ctx after definition
// BUILD 111 FIX: win is captured by value at registration time, which may be undefined if registerIpc
// is called before createWindow (e.g., launcher mode). Use a getter that dynamically resolves from the
// shared `windows` Set so push events (VIDEO_UPDATED, etc.) reach the renderer after window creation.
const ctx = {
  APP_ROOT,
  get win() {
    for (const w of windows) {
      if (w && !w.isDestroyed()) return w;
    }
    return null;
  },
  storage, CHANNEL, EVENT,
};
__bLog('registerIpc: ctx created OK');

// Phase 2: IPC contract (Build 76)

// BUILD31_DEVTOOLS_SHORTCUTS (TankobanPlus Build 31)
// INTENT: Allow opening Chromium Developer Tools even when the app menu is removed.
// Works in packaged builds.
function __tankobanToggleDevTools(w){
  if (!w || w.isDestroyed()) return;
  try {
    const wc = w.webContents;
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'detach' });
  } catch {}
}

function __tankobanBindDevtoolsShortcuts(w){
  if (!w || w.isDestroyed()) return;
  try {
    w.webContents.on('before-input-event', (event, input) => {
      try {
        const key = String(input?.key || '');
        const ctrl = !!(input?.control || input?.meta);
        const shift = !!input?.shift;
        if (key === 'F12' || (ctrl && shift && (key === 'I' || key === 'J'))) {
          event.preventDefault();
          __tankobanToggleDevTools(w);
        }
      } catch {}
    });
  } catch {}
}

// BUILD 19D/19E: CBZ/CBR session management moved to domains/archives (Build 78B, Phase 4B)

function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

let videoShellWin = null; // dedicated video player shell window (controller UI)

// BUILD26_SINGLE_INSTANCE_OPENWITH (Build 26)
// INTENT: Support OS "Open with Tankoban" and argv-based open on first launch,
// while enforcing single-instance behavior (focus existing window + forward opens).
let pendingOpenPaths = [];
let pendingOpenSource = '';

function normalizeOpenArg(a) {
  let s = String(a || '').trim();
  if (!s) return '';
  // Strip surrounding quotes (Windows shells sometimes include them).
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  // Convert file:// URLs to paths if present.
  if (s.startsWith('file://')) {
    try { s = fileURLToPath(s); } catch {}
  }
  return s;
}

function isComicArchivePath(p) {
  const s = String(p || '');
  return /\.(cbz|cbr)$/i.test(s);
}

function getPrimaryWindow() {
  try {
    const w = BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    for (const w of windows) {
      if (w && !w.isDestroyed()) return w;
    }
  } catch {}
  return win;
}

function extractComicPathsFromArgv(argv) {
  const out = [];
  const seen = new Set();
  for (const raw of (Array.isArray(argv) ? argv : [])) {
    const s0 = normalizeOpenArg(raw);
    if (!s0) continue;
    if (s0.startsWith('-')) continue; // ignore flags
    if (!isComicArchivePath(s0)) continue;

    const st = statSafe(s0);
    if (!st || !st.isFile()) continue;

    if (seen.has(s0)) continue;
    seen.add(s0);
    out.push(s0);
  }
  return out;
}

function enqueueOpenPaths(paths, source) {
  const list = Array.isArray(paths) ? paths.map(normalizeOpenArg).filter(Boolean) : [];
  const valid = [];
  for (const p of list) {
    if (!isComicArchivePath(p)) continue;
    const st = statSafe(p);
    if (!st || !st.isFile()) continue;
    valid.push(p);
  }
  if (!valid.length) return;

  pendingOpenSource = String(source || '') || pendingOpenSource || 'unknown';
  pendingOpenPaths.push(...valid);

  const w = getPrimaryWindow();
  if (w && w.__tankobanDidFinishLoad) flushPendingOpenPaths(w);
}

function flushPendingOpenPaths(targetWindow) {
  const w = targetWindow;
  if (!w || w.isDestroyed()) return;
  if (!w.__tankobanDidFinishLoad) return;
  if (!pendingOpenPaths.length) return;

  const paths = pendingOpenPaths.slice(0);
  pendingOpenPaths = [];

  const source = pendingOpenSource || 'unknown';
  pendingOpenSource = '';

  try {
    w.webContents.send(EVENT.APP_OPEN_FILES, { paths, source });
  } catch {}
}

// BUILD21_MULTI_WINDOW (Build 21)
// INTENT: Allow multiple independent reader windows without changing the renderer architecture.
// We keep `win` only as a last-resort fallback; all IPC should prefer the calling window.

function winFromEvt(evt) {
  // Prefer the calling window so dialogs/fullscreen affect the correct instance.
  try {
    const w = BrowserWindow.fromWebContents(evt?.sender);
    if (w && !w.isDestroyed()) return w;
  } catch {}
  try {
    const w2 = BrowserWindow.getFocusedWindow();
    if (w2 && !w2.isDestroyed()) return w2;
  } catch {}
  return win;
}

function createWindow(opts = {}) {
  const openBookId = (opts && opts.openBookId) ? String(opts.openBookId) : '';

  const w = new BrowserWindow({
    width: 1200,
    height: 800,
    // FIND_THIS:TANKOBAN_RENAME_COSMETIC (Tankoban Build 1A)
    title: 'Tankoban',
    backgroundColor: '#000000',
    icon: path.join(APP_ROOT, 'build', 'icon.png'),
    // Build 36: restore standard window chrome (Windows title bar buttons).
    frame: true,
    fullscreen: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // CRITICAL BUGFIX (Build 84): disabling sandbox keeps preload module loading intact.
      sandbox: false,
      webviewTag: true,
    },
  });

  windows.add(w);
  win = w;

// BUILD32_CBZ_WINDOW_OWNER (Build 32)
  const cbzOwnerId = w.webContents.id;

  w.on('focus', () => { win = w; });
  w.on('closed', () => {
    try { windows.delete(w); } catch {}

    // BUILD32_CBZ_WINDOW_CLEANUP (Build 32)
    // Best-effort: close any CBZ sessions opened by this renderer window.
    (async () => {
      try { await archivesDomain.cbzCloseAllForOwner(cbzOwnerId); } catch {}
    })();

    (async () => {
      // BUILD31_LIBMPV_WINDOW_CLEANUP (TankobanPlus Build 31)
      // Best-effort: close any embedded libmpv players created by this renderer window.
    })();  });

  w.setMenuBarVisibility(false);
  w.setMenu(null);
  // Allow exiting fullscreen even with menu removed (F11)
  w.webContents.on('before-input-event', (event, input) => {
    if (input && input.key === 'F11') {
      event.preventDefault();
      w.setFullScreen(!w.isFullScreen());
    }
  });

  // Build 31: Developer tools shortcuts (F12 / Ctrl+Shift+I)
  __tankobanBindDevtoolsShortcuts(w);

  // Optional debug mode for renderer diagnostics (default-off).
  // Enable by launching with: MANGA_SCROLLER_DEBUG=1
  const debug = String(process.env.MANGA_SCROLLER_DEBUG || '') === '1';

  // BUILD21_MULTI_WINDOW_STARTUP (Build 21)
  // INTENT: Let a new window boot directly into a volume by passing openBookId via query string.
  const query = {};
  if (debug) query.debug = '1';
  if (openBookId) query.openBookId = openBookId;

  w.__tankobanDidFinishLoad = false;

  w.loadFile(path.join(APP_ROOT, 'src', 'index.html'), Object.keys(query).length ? { query } : undefined);

  // Only send open-with events once the renderer has loaded listeners.
  w.webContents.on('did-finish-load', () => {
    w.__tankobanDidFinishLoad = true;
    flushPendingOpenPaths(w);
  });

  w.once('ready-to-show', () => {
    // Start maximized (not fullscreen) so Windows chrome is visible.
    try { w.maximize(); } catch {}
    w.show();
  });

  return w;
}


function createVideoShellWindow() {
  const debug = String(process.env.MANGA_SCROLLER_DEBUG || '') === '1';
  const query = { videoShell: '1' };
  if (debug) query.debug = '1';

  const w = new BrowserWindow({
    width: 900,
    height: 260,
    title: 'Tankoban Player',
    backgroundColor: '#000000',
    icon: path.join(APP_ROOT, 'build', 'icon.png'),
    frame: true,
    fullscreen: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // CRITICAL BUGFIX (Build 84): disabling sandbox keeps preload module loading intact.
      sandbox: false,
      webviewTag: true,
    },
  });

  windows.add(w);
  videoShellWin = w;
  w.__tankobanDidFinishLoad = false;
  w.__videoShellPendingPlay = null;

  w.on('focus', () => { win = w; });
  w.on('closed', () => {
    try { windows.delete(w); } catch {}
    try { if (videoShellWin === w) videoShellWin = null; } catch {}
  });

  w.loadFile(path.join(APP_ROOT, 'src', 'index.html'), { query });

  w.webContents.on('did-finish-load', () => {
    w.__tankobanDidFinishLoad = true;
    try {
      if (w.__videoShellPendingPlay) {
        w.webContents.send(EVENT.VIDEO_SHELL_PLAY, w.__videoShellPendingPlay);
        w.__videoShellPendingPlay = null;
      }
    } catch {}
  });

  w.once('ready-to-show', () => {
    try { w.show(); } catch {}
    try { w.focus(); } catch {}
  });

  return w;
}

// Phase 4B: Add window creation functions to ctx for window domain
ctx.createWindow = createWindow;
ctx.createVideoShellWindow = createVideoShellWindow;
ctx.windows = windows; // Add windows set for getPrimaryWindow
ctx.getWin = () => win; // Live win getter for domains that need it

// BUILD26_SINGLE_INSTANCE_OPENWITH (Build 26)
// ========== IPC: Registry Modules (Nirvana 10) ==========
// This file owns IPC bootstrap + ctx creation.
// Individual ipcMain.handle registrations are grouped in ./register/*.js for readability.
let registerModules;
try {
  registerModules = [
    require('./register/window'),
    require('./register/shell'),
    require('./register/library'),
    require('./register/books'),
    require('./register/books_tts_edge'),
    require('./register/books_progress'),
    require('./register/books_tts_progress'), // LISTEN_P4
    require('./register/books_settings'),
    require('./register/books_ui_state'),
    require('./register/books_opds'),
    require('./register/video'),
    require('./register/video_posters'),
    require('./register/page_thumbnails'),
    require('./register/files'),
    require('./register/archives'),
    require('./register/export'),
    require('./register/progress'),
    require('./register/video_progress'),
    require('./register/video_settings'),
    require('./register/video_ui_state'),
    require('./register/player_core'),
    require('./register/holy_grail'),
    require('./register/series_settings'),
    require('./register/books_bookmarks'),
    require('./register/books_annotations'), // BUILD_ANNOT
    require('./register/books_display_names'), // RENAME-BOOK
    require('./register/video_display_names'), // RENAME-VIDEO
    require('./register/health_check'),
    require('./register/web_sources'), // BUILD_WEB
    require('./register/web_browser_settings'),
    require('./register/web_history'),
    require('./register/web_session'),
    require('./register/web_bookmarks'),
    require('./register/web_permissions'),
    require('./register/web_data'),
    require('./register/web_find'),
    require('./register/web_adblock'),
    require('./register/web_torrent'),
    require('./register/tor_proxy'), // FEAT-TOR
    require('./register/audiobooks'), // FEAT-AUDIOBOOK
    require('./register/audiobook_progress'), // FEAT-AUDIOBOOK
    require('./register/audiobook_pairing'), // FEAT-AUDIOBOOK
  ];
  __bLog('registerIpc: all register modules required OK (' + registerModules.length + ' modules)');
} catch (e) {
  __bLog('registerIpc: FAILED to require register modules: ' + (e && e.message ? e.message : e));
  registerModules = [];
}

const registerModuleNames = ['window','shell','library','books','books_tts_edge','books_progress','books_tts_progress','books_settings','books_ui_state','books_opds','video','video_posters','page_thumbnails','files','archives','export','progress','video_progress','video_settings','video_ui_state','player_core','holy_grail','series_settings','books_bookmarks','books_annotations','books_display_names','video_display_names','health_check','web_sources','web_browser_settings','web_history','web_session','web_bookmarks','web_permissions','web_data','web_find','web_adblock','web_torrent','tor_proxy','audiobooks','audiobook_progress','audiobook_pairing'];
for (let i = 0; i < registerModules.length; i++) {
  const register = registerModules[i];
  try {
    register({ ipcMain, CHANNEL, ctx, domains: {
    archivesDomain,
    clipboardDomain,
    comicDomain,
    exportDomain,
    filesDomain,
    libraryDomain,
    booksDomain,
    booksTtsEdgeDomain,
    booksOpdsDomain,
    playerCoreDomain,
    holyGrailDomain,
    shellDomain,
    thumbsDomain,
    videoDomain,
    windowDomain,
    progress,
    booksProgress,
    booksTtsProgress, // LISTEN_P4
    videoProgress,
    booksSettings,
    booksBookmarks,
    booksAnnotations, // BUILD_ANNOT
    booksDisplayNames, // RENAME-BOOK
    videoDisplayNames, // RENAME-VIDEO
    videoSettings,
    booksUi,
    videoUi,
    seriesSettings,
    webSourcesDomain, // BUILD_WEB
    webBrowserSettingsDomain,
    webHistoryDomain,
    webSessionDomain,
    webBookmarksDomain,
    webPermissionsDomain,
    webDataDomain,
    webAdblockDomain,
    webTorrentDomain,
    torProxyDomain, // FEAT-TOR
    audiobooksDomain, // FEAT-AUDIOBOOK
    audiobookProgress, // FEAT-AUDIOBOOK
    audiobookPairing, // FEAT-AUDIOBOOK
    }});
    __bLog('registerIpc: registered ' + (registerModuleNames[i] || i));
  } catch (e) {
    // Keep IPC partially functional even if a single register module fails.
    __bLog('registerIpc: FAILED to register ' + (registerModuleNames[i] || i) + ': ' + (e && e.message ? e.message : e));
    try { console.error('[ipc] register module failed:', e && e.message ? e.message : e); } catch {}
  }
}

// FEAT-TOR: Kill Tor process on app quit
try {
  app.on('before-quit', function () {
    try { torProxyDomain.forceKill(); } catch {}
  });
} catch {}

__bLog('registerIpc: ALL DONE');

}; // end registerIpc
