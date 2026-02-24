# mpv Holy Grail — PoC

Zero-copy GPU pipeline for embedding mpv inside Electron with full HTML overlay support.

## The Problem
- **HWND embedding**: mpv renders fast (GPU-direct) but HTML overlays can't sit on top
- **Software render to canvas**: HTML overlays work but CPU copy kills performance for HD/4K

## The Holy Grail
```
mpv decode → GPU → D3D11 texture → Electron sharedTexture → VideoFrame (GPU-backed) → WebGL → DOM
```
Frames never leave the GPU. HTML overlays compose naturally via DOM layering.

## Phases

### Phase 1 — Shell (current)
Minimal Electron app with HTML5 `<video>` fallback. Proves the UI (canvas + HUD overlays) works.

### Phase 2 — Native addon
C++ addon that:
1. Loads libmpv-2.dll dynamically
2. Creates D3D11 device + ANGLE EGL context
3. Uses mpv's OpenGL render API to render to a D3D11 texture
4. Exports shared texture handle for Electron's `sharedTexture` module

### Phase 3 — Integration
Wire the native addon into the renderer via IPC + sharedTexture → VideoFrame → WebGL.

## Running
```bash
cd experiments/mpv-holy-grail
npm install
npm start
```
