const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let holyGrailDomain = null;

// Parse --file from command line arguments
function parseLaunchArgs() {
  var args = process.argv.slice(1);
  var result = { file: null };
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      result.file = args[i + 1];
      i++;
    }
  }
  return result;
}

// ── Holy Grail detection ──
// Try to load the HG domain from the parent Tankoban project.
// If it works, we use preload_hg.js (GPU pipeline); otherwise preload.js (HTML5).

function detectHolyGrail() {
  try {
    // Resolve paths relative to the player_hg directory
    var projectRoot = path.resolve(__dirname, '..');
    var addonPath = path.join(projectRoot, 'native', 'holy_grail', 'build', 'Release', 'holy_grail.node');
    var mpvPath = path.join(projectRoot, 'resources', 'mpv', 'windows', 'libmpv-2.dll');

    if (!fs.existsSync(addonPath)) return false;
    if (!fs.existsSync(mpvPath)) return false;

    // Check that Electron has sharedTexture API
    try {
      var st = require('electron').sharedTexture;
      if (!st || typeof st.importSharedTexture !== 'function') return false;
    } catch (e) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

function loadHolyGrailDomain() {
  try {
    var projectRoot = path.resolve(__dirname, '..');
    var domainPath = path.join(projectRoot, 'main', 'domains', 'holyGrail', 'index.js');
    if (!fs.existsSync(domainPath)) return null;
    return require(domainPath);
  } catch (e) {
    console.error('[player_hg] Failed to load HG domain:', e.message);
    return null;
  }
}

function registerHolyGrailIPC(domain) {
  // Create a ctx object matching what the HG domain expects
  var projectRoot = path.resolve(__dirname, '..');
  var ctx = {
    APP_ROOT: projectRoot,
    get win() { return win; },
  };

  // Register all HG IPC handlers (mirroring main/ipc/register/holy_grail.js)
  ipcMain.handle('holyGrail:probe',          function (evt)          { return domain.probe(ctx, evt); });
  ipcMain.handle('holyGrail:init',           function (evt, args)    { return domain.initGpu(ctx, evt, args); });
  ipcMain.handle('holyGrail:resize',         function (evt, args)    { return domain.resizeSurface(ctx, evt, args); });
  ipcMain.handle('holyGrail:load',           function (evt, fp)      { return domain.loadFile(ctx, evt, fp); });
  ipcMain.handle('holyGrail:startFrameLoop', function (evt)          { return domain.startFrameLoop(ctx, evt); });
  ipcMain.handle('holyGrail:stopFrameLoop',  function ()             { return domain.stopFrameLoop(); });
  ipcMain.handle('holyGrail:command',        function (evt, args)    { return domain.command(ctx, evt, args); });
  ipcMain.handle('holyGrail:getProperty',    function (evt, name)    { return domain.getProperty(ctx, evt, name); });
  ipcMain.handle('holyGrail:setProperty',    function (evt, n, v)    { return domain.setProperty(ctx, evt, n, v); });
  ipcMain.handle('holyGrail:getState',       function (evt)          { return domain.getState(ctx, evt); });
  ipcMain.handle('holyGrail:getTrackList',   function (evt)          { return domain.getTrackList(ctx, evt); });
  ipcMain.handle('holyGrail:observeProperty',function (evt, name)    { return domain.observeProperty(ctx, evt, name); });
  ipcMain.handle('holyGrail:destroy',        function (evt)          { return domain.destroy(ctx, evt); });
}

app.whenReady().then(function () {
  var hgAvailable = detectHolyGrail();
  var preloadPath = hgAvailable
    ? path.join(__dirname, 'preload_hg.js')
    : path.join(__dirname, 'preload.js');

  console.log('[player_hg] Holy Grail available:', hgAvailable);
  console.log('[player_hg] Using preload:', path.basename(preloadPath));

  // If HG is available, load the domain and register IPC handlers BEFORE creating the window
  if (hgAvailable) {
    holyGrailDomain = loadHolyGrailDomain();
    if (holyGrailDomain) {
      registerHolyGrailIPC(holyGrailDomain);
      console.log('[player_hg] HG domain loaded, IPC handlers registered');
    } else {
      // Fallback to HTML5 if domain failed to load
      hgAvailable = false;
      preloadPath = path.join(__dirname, 'preload.js');
      console.warn('[player_hg] HG domain load failed, falling back to HTML5');
    }
  }

  win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    show: false,
    frame: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  win.once('ready-to-show', function () {
    win.maximize();
    win.show();
  });

  // Fullscreen change -> notify renderer
  win.on('enter-full-screen', function () {
    win.webContents.send('fullscreen-changed', true);
  });
  win.on('leave-full-screen', function () {
    win.webContents.send('fullscreen-changed', false);
  });

  // IPC handlers
  ipcMain.handle('get-launch-args', function () {
    return parseLaunchArgs();
  });

  ipcMain.handle('open-file-dialog', async function () {
    var result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Video',
          extensions: [
            'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ts', 'm2ts',
            'flv', 'wmv', 'mpg', 'mpeg', 'ogv', '3gp',
          ],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('open-subtitle-dialog', async function () {
    var result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Subtitles',
          extensions: ['srt', 'ass', 'ssa', 'sub', 'vtt', 'idx'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // List video files in a folder (for playlist building)
  var VIDEO_EXTS = new Set([
    '.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts', '.m2ts',
    '.flv', '.wmv', '.mpg', '.mpeg', '.ogv', '.3gp',
  ]);

  ipcMain.handle('list-folder-videos', function (_event, folderPath) {
    try {
      var entries = fs.readdirSync(folderPath, { withFileTypes: true });
      var files = [];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isFile()) {
          var ext = path.extname(entries[i].name).toLowerCase();
          if (VIDEO_EXTS.has(ext)) {
            files.push(path.join(folderPath, entries[i].name));
          }
        }
      }
      return files;
    } catch (e) {
      return [];
    }
  });

  ipcMain.on('minimize-window', function () {
    if (win) win.minimize();
  });

  ipcMain.on('toggle-fullscreen', function () {
    if (win.isFullScreen()) win.setFullScreen(false);
    else win.setFullScreen(true);
  });

  ipcMain.on('quit-app', function () {
    app.quit();
  });

  // Set window title from renderer
  ipcMain.on('set-title', function (_event, title) {
    if (win && title) win.setTitle(title);
  });

  // ── Settings persistence ──

  var SETTINGS_PATH = path.join(__dirname, 'player_settings.json');

  ipcMain.handle('load-player-settings', function () {
    try {
      var data = fs.readFileSync(SETTINGS_PATH, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('save-player-settings', function (_event, settings) {
    try {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Screenshot saving ──

  ipcMain.handle('save-screenshot', function (_event, dataUrl, suggestedName) {
    try {
      var base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      var buffer = Buffer.from(base64, 'base64');
      var dir = path.join(app.getPath('pictures'), 'Tankoban-Screenshots');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      var filename = suggestedName || ('screenshot_' + Date.now() + '.png');
      var filePath = path.join(dir, filename);
      fs.writeFileSync(filePath, buffer);
      return { ok: true, path: filePath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
});

app.on('window-all-closed', function () {
  app.quit();
});
