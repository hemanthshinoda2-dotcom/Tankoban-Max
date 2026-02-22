const { app, BrowserWindow, dialog, ipcMain, sharedTexture } = require('electron');
const path = require('path');

let win;
let addon = null;

// ── Load native addon ──────────────────────────────────────────────
function loadAddon() {
    try {
        addon = require('./build/Release/holy_grail.node');
        console.log('[holy-grail] Native addon loaded');
        return true;
    } catch (e) {
        console.warn('[holy-grail] Native addon not found — run npm run build first');
        console.warn('[holy-grail]', e.message);
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
        filters: [
            {
                name: 'Video Files',
                extensions: [
                    'mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv',
                    'flv', 'ts', 'm2ts', 'mpg', 'mpeg', '3gp', 'm4v',
                ],
            },
        ],
        properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
});

// ── IPC: Check if addon + sharedTexture are available ──────────────
ipcMain.handle('check-capabilities', () => {
    return {
        addonLoaded:    !!addon,
        sharedTexture:  !!sharedTexture,
    };
});

// ── IPC: Test shared texture pipeline ──────────────────────────────
// Creates a D3D11 texture, fills it with a color, sends it to renderer
// via Electron's sharedTexture module.
ipcMain.handle('test-shared-texture', async (event, r, g, b) => {
    if (!addon) throw new Error('Native addon not loaded');
    if (!sharedTexture) throw new Error('sharedTexture module not available');

    const width  = 1280;
    const height = 720;

    // Initialize D3D11 device + texture (only once)
    if (!addon._initialized) {
        addon.init(width, height);
        addon._initialized = true;
        console.log('[holy-grail] D3D11 device + texture created (%dx%d)', width, height);
    }

    // Fill with the requested color
    addon.fillColor(r ?? 1.0, g ?? 0.0, b ?? 0.0, 1.0);

    // Get the NT handle as a Buffer
    const handleBuf = addon.getHandle();
    if (!handleBuf) throw new Error('No shared handle available');

    console.log('[holy-grail] Handle buffer: %d bytes, value: 0x%s',
        handleBuf.length,
        handleBuf.readBigUInt64LE(0).toString(16));

    // Import into Electron's shared texture system
    const imported = sharedTexture.importSharedTexture({
        textureInfo: {
            pixelFormat: 'bgra',
            codedSize: { width, height },
            visibleRect: { x: 0, y: 0, width, height },
            handle: {
                ntHandle: handleBuf,
            },
        },
        allReferencesReleased: () => {
            console.log('[holy-grail] All references released');
        },
    });

    console.log('[holy-grail] Texture imported, sending to renderer...');

    // Send to the renderer process
    await sharedTexture.sendSharedTexture({
        frame: win.webContents.mainFrame,
        importedSharedTexture: imported,
    });

    // Release main process reference
    imported.release();

    console.log('[holy-grail] Frame sent to renderer');
    return { width, height };
});

// ── Cleanup on quit ────────────────────────────────────────────────
app.on('before-quit', () => {
    if (addon && addon._initialized) {
        addon.destroy();
        console.log('[holy-grail] Addon destroyed');
    }
});
