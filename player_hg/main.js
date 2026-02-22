const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

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

app.whenReady().then(function () {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    show: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

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
