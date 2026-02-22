const { contextBridge, ipcRenderer } = require('electron');

// ── Shared texture receiver ────────────────────────────────────────
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
    }
} catch (e) {
    console.warn('[preload] sharedTexture setup failed:', e.message);
}

// ── Exposed API ────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('holyGrail', {
    // Capabilities
    checkCapabilities: ()                => ipcRenderer.invoke('check-capabilities'),

    // File dialog
    openVideo:         ()                => ipcRenderer.invoke('open-video'),

    // GPU pipeline
    initGpu:           (w, h)            => ipcRenderer.invoke('init-gpu', w, h),
    loadVideoMpv:      (path)            => ipcRenderer.invoke('load-video-mpv', path),
    startFrameLoop:    ()                => ipcRenderer.invoke('start-frame-loop'),
    stopFrameLoop:     ()                => ipcRenderer.invoke('stop-frame-loop'),

    // mpv controls
    mpvCommand:        (args)            => ipcRenderer.invoke('mpv-command', args),
    mpvGetProperty:    (name)            => ipcRenderer.invoke('mpv-get-property', name),
    mpvSetProperty:    (name, val)       => ipcRenderer.invoke('mpv-set-property', name, val),
    mpvGetState:       ()                => ipcRenderer.invoke('mpv-get-state'),

    // VideoFrame receiver
    onVideoFrame:      (cb)              => { onFrameCallback = cb; },
});
