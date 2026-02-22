const { contextBridge, ipcRenderer } = require('electron');

// ── Shared texture receiver ────────────────────────────────────────
// Electron's sharedTexture module in the renderer process receives
// GPU-backed VideoFrame objects from the main process.
let onFrameCallback = null;

try {
    const { sharedTexture } = require('electron');
    if (sharedTexture && sharedTexture.setSharedTextureReceiver) {
        sharedTexture.setSharedTextureReceiver(({ importedSharedTexture }) => {
            const videoFrame = importedSharedTexture.getVideoFrame();
            if (onFrameCallback) {
                onFrameCallback(videoFrame);
            } else {
                videoFrame.close();
            }
            importedSharedTexture.release();
        });
        console.log('[preload] sharedTexture receiver registered');
    } else {
        console.warn('[preload] sharedTexture module not available');
    }
} catch (e) {
    console.warn('[preload] Failed to set up sharedTexture receiver:', e.message);
}

// ── Exposed API ────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('holyGrail', {
    openVideo:         ()             => ipcRenderer.invoke('open-video'),
    checkCapabilities: ()             => ipcRenderer.invoke('check-capabilities'),
    testSharedTexture: (r, g, b)      => ipcRenderer.invoke('test-shared-texture', r, g, b),
    onVideoFrame:      (callback)     => { onFrameCallback = callback; },
});
