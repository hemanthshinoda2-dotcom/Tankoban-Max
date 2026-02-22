const { app, BrowserWindow, dialog, ipcMain, sharedTexture } = require('electron');
const path = require('path');
const fs   = require('fs');

let win;
let addon = null;
let frameLoopTimer = null;

// ── Resolve DLL paths ──────────────────────────────────────────────
const electronDir = path.dirname(require.resolve('electron/index.js'));
const electronDist = path.join(electronDir, 'dist');

// mpv: check project resources first, then current dir
const mpvSearchPaths = [
    path.join(__dirname, '../../resources/mpv/windows/libmpv-2.dll'),
    path.join(__dirname, 'libmpv-2.dll'),
];
const eglPath  = path.join(electronDist, 'libEGL.dll');
const glesPath = path.join(electronDist, 'libGLESv2.dll');

function findMpv() {
    for (const p of mpvSearchPaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// ── Load native addon ──────────────────────────────────────────────
function loadAddon() {
    try {
        addon = require('./build/Release/holy_grail.node');
        console.log('[holy-grail] Native addon loaded');
        return true;
    } catch (e) {
        console.warn('[holy-grail] Native addon not found:', e.message);
        return false;
    }
}

// ── Window ─────────────────────────────────────────────────────────
function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 720,
        title: 'mpv Holy Grail — PoC',
        backgroundColor: '#0a0a0a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadFile('index.html');
    win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
    loadAddon();
    createWindow();
});
app.on('window-all-closed', () => app.quit());

// ── IPC: Open file dialog ──────────────────────────────────────────
ipcMain.handle('open-video', async () => {
    const result = await dialog.showOpenDialog(win, {
        title: 'Open Video',
        filters: [{
            name: 'Video Files',
            extensions: [
                'mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv',
                'flv', 'ts', 'm2ts', 'mpg', 'mpeg', '3gp', 'm4v',
            ],
        }],
        properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

// ── IPC: Check capabilities ────────────────────────────────────────
ipcMain.handle('check-capabilities', () => {
    const mpvPath = findMpv();
    return {
        addonLoaded:   !!addon,
        sharedTexture: !!sharedTexture,
        mpvFound:      !!mpvPath,
        mpvPath:       mpvPath,
        eglFound:      fs.existsSync(eglPath),
        glesFound:     fs.existsSync(glesPath),
    };
});

// ── IPC: Initialize GPU pipeline ───────────────────────────────────
ipcMain.handle('init-gpu', (event, width, height) => {
    if (!addon) throw new Error('Native addon not loaded');

    const mpvPath = findMpv();
    if (!mpvPath) throw new Error('libmpv-2.dll not found');
    if (!fs.existsSync(eglPath)) throw new Error('libEGL.dll not found');
    if (!fs.existsSync(glesPath)) throw new Error('libGLESv2.dll not found');

    addon.initGpu({
        mpvPath,
        eglPath,
        glesPath,
        width:  width  || 1920,
        height: height || 1080,
    });

    console.log('[holy-grail] GPU pipeline initialized: %dx%d', width || 1920, height || 1080);
    console.log('[holy-grail] mpv: %s', mpvPath);
    return true;
});

// ── IPC: Load a video file ─────────────────────────────────────────
ipcMain.handle('load-video-mpv', (event, filePath) => {
    if (!addon) throw new Error('Addon not loaded');
    addon.loadFile(filePath);
    console.log('[holy-grail] Loading:', filePath);
    return true;
});

// ── IPC: Start / stop frame loop ───────────────────────────────────
ipcMain.handle('start-frame-loop', () => {
    if (frameLoopTimer) return;
    frameLoop();
    return true;
});

ipcMain.handle('stop-frame-loop', () => {
    if (frameLoopTimer) {
        clearTimeout(frameLoopTimer);
        frameLoopTimer = null;
    }
    return true;
});

async function frameLoop() {
    if (!addon || !win || win.isDestroyed()) {
        frameLoopTimer = null;
        return;
    }

    try {
        const handleBuf = addon.renderFrame();
        if (handleBuf && sharedTexture) {
            const size = addon.getSize();
            const imported = sharedTexture.importSharedTexture({
                textureInfo: {
                    pixelFormat: 'bgra',
                    codedSize: { width: size.width, height: size.height },
                    visibleRect: { x: 0, y: 0, width: size.width, height: size.height },
                    handle: { ntHandle: handleBuf },
                },
                allReferencesReleased: () => {},
            });

            await sharedTexture.sendSharedTexture({
                frame: win.webContents.mainFrame,
                importedSharedTexture: imported,
            });
            imported.release();
        }
    } catch (e) {
        // Don't crash the loop on transient errors
        console.error('[holy-grail] Frame error:', e.message);
    }

    // Schedule next frame — self-limiting (waits for send to complete)
    frameLoopTimer = setTimeout(frameLoop, 0);
}

// ── IPC: mpv controls ──────────────────────────────────────────────
ipcMain.handle('mpv-command', (event, args) => {
    if (!addon) return;
    addon.command(args);
});

ipcMain.handle('mpv-get-property', (event, name) => {
    if (!addon) return null;
    return addon.getProperty(name);
});

ipcMain.handle('mpv-set-property', (event, name, value) => {
    if (!addon) return;
    addon.setProperty(name, value);
});

ipcMain.handle('mpv-get-state', () => {
    if (!addon) return null;
    return addon.getState();
});

// ── Cleanup ────────────────────────────────────────────────────────
app.on('before-quit', () => {
    if (frameLoopTimer) {
        clearTimeout(frameLoopTimer);
        frameLoopTimer = null;
    }
    if (addon) {
        try { addon.destroy(); } catch (e) {}
        console.log('[holy-grail] Addon destroyed');
    }
});
