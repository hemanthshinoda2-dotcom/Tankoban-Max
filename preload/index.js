/**
 * TankobanPlus — Preload API (Phase 4, Session 13)
 *
 * OWNERSHIP: Unified preload bridge with organized namespaces.
 * Each namespace is defined in preload/namespaces/*.js.
 * Legacy aliases provide 100% backward compatibility.
 */
// TRACE:IPC_OUT

const { contextBridge, ipcRenderer } = require('electron');
const { CHANNEL, EVENT } = require('../shared/ipc');
const deps = { ipcRenderer, CHANNEL, EVENT };

// ========================================
// GROUPED API IMPLEMENTATION
// ========================================

const api = Object.assign({},
  require('./namespaces/window')(deps),
  require('./namespaces/shell')(deps),
  require('./namespaces/library')(deps),
  require('./namespaces/books')(deps),
  require('./namespaces/books_metadata')(deps),
  require('./namespaces/video')(deps),
  require('./namespaces/media')(deps),
  require('./namespaces/player')(deps),
  require('./namespaces/web')(deps),
  require('./namespaces/progress')(deps),
  require('./namespaces/series')(deps),
);

// ========================================
// LEGACY ALIASES (100% BACKWARD COMPATIBILITY)
// ========================================

const legacy = require('./namespaces/_legacy')({ api, ipcRenderer, CHANNEL });

// ========================================
// EXPOSE TO RENDERER
// ========================================

const exposed = Object.assign({}, api, legacy);

// BUILD14: Add event listener support
exposed._setupBuild14EventForwarding = () => {
  ipcRenderer.on(EVENT.BUILD14_PLAYER_EXITED, (_evt, payload) => {
    try {
      if (exposed._build14PlayerExitedCallback) {
        exposed._build14PlayerExitedCallback(payload);
      }
    } catch (e) {
      console.error('[BUILD14 Preload] Failed to forward playerExited event:', e);
    }
  });
};

exposed._registerBuild14Callback = (callback) => {
  exposed._build14PlayerExitedCallback = callback;
};

contextBridge.exposeInMainWorld('electronAPI', exposed);

// Set up the IPC listener immediately
exposed._setupBuild14EventForwarding();
