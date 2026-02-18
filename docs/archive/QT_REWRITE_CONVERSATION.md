# Tankoban Pro — Qt Rewrite Discussion

## Context

Tankoban Pro is currently an Electron desktop app for managing and reading manga/comics (CBZ/CBR), books, and video libraries with an integrated MPV-based video player. The app was built over months of collaboration with AI (primarily ChatGPT), and more recently with Claude Code and Codex agents.

The app now has a genuine USP — a unified book + comic + video library and reader/player — but there's an architectural pain point driving this discussion.

---

## The Problem

The video player is a **detached Python/Qt process**, not truly embedded in the app. It communicates with Electron via file-based IPC (session JSON files polled every 500ms). This detached window approach is fundamentally a limitation of Electron — there's no good way to embed mpv natively in a Chromium-based app.

**Goal: One window, one process, true embedded player.**

---

## Current Architecture

```
Renderer (vanilla JS/HTML/CSS)
  → Preload (contextBridge → Tanko.api.*)
    → Main Process (Node.js — domains, storage, workers)
      → Qt Video Player (separate Python/PySide6/mpv process)
```

- **Renderer**: Pure vanilla JS, no frameworks, no build step
- **Main process**: Node.js domain modules for file I/O, scanning, hashing, persistence
- **IPC**: Electron ipcMain.handle ↔ ipcRenderer.invoke, all channels defined in `app/shared/ipc.js`
- **Storage**: Atomic JSON writes (temp + rename), debounced writes
- **Qt Player**: 6000+ line standalone Python/PySide6/mpv app — already potplayer-quality for basic functionality

---

## Decision: Rewrite to Qt

### Why Leave Electron

- Electron cannot embed mpv properly — the detached player window is the core issue
- Qt can embed mpv as a native widget in the same window alongside the library UI
- Single runtime (Python/Qt) eliminates the file-based IPC hack
- One window, one process, true unified app

### What Survives

- **Renderer JS/HTML/CSS** — can run inside `QWebEngineView` if taking hybrid approach, or serves as direct reference for QML UI
- **All business logic** — scanning, hashing, JSON structures, edge case handling — is a 1:1 translation reference
- **Qt player codebase** — already solves the hardest problems (mpv embedding, controls, subtitles, chapters)
- **Data shapes** — all JSON file formats stay identical

### What Gets Rewritten

| Node.js | Python equivalent |
|---|---|
| `fs.readFile` / `fs.writeFile` | `pathlib.Path.read_text()` / `.write_text()` |
| `path.join` / `path.resolve` | `pathlib.Path` |
| `crypto.createHash('sha1')` | `hashlib.sha1()` |
| `child_process.spawn` | `subprocess.Popen` |
| `JSON.parse` / `JSON.stringify` | `json.loads` / `json.dumps` |
| `setTimeout` / debounce | `QTimer` |
| Worker threads | `QThread` or `concurrent.futures` |
| `ipcMain.handle` | `QWebChannel` slots |
| `node-unrar-js` | Python unrar/zip library |

### Difficulty Ranking

- **Trivial**: Storage, config, JSON persistence — near 1:1 translation
- **Easy**: Video/library/book scanning — same logic, different fs calls
- **Medium**: QWebChannel to replace IPC registry — different API, same pattern
- **Medium**: CBZ/CBR extraction — need Python unrar/zip library
- **Annoying but not hard**: File association and single-instance logic in Qt

---

## UI Approach: QML vs Qt Widgets

| | Qt Widgets | QML |
|---|---|---|
| What it is | Traditional desktop widgets | Declarative, CSS-like UI language |
| Look | Native OS look by default | Custom, fluid, modern by default |
| Animations | Manual, clunky | Built-in, buttery |
| Best for | Utility apps | Media apps with custom UI |

**Recommendation: QML** — designed for media-rich, animated interfaces. Right fit for a manga/video/book app that wants refined UI.

### Alternative: Hybrid Approach

Instead of full QML rewrite, embed `QWebEngineView` for the library UI:

```
Qt App (one window)
├── QWebEngineView (existing HTML/CSS/JS library UI, mostly unchanged)
├── mpv widget (embedded player)
└── Python backend (replaces Node main process)
```

This preserves the existing renderer work and cuts the rewrite scope roughly in half.

---

## AI Agent Strategy

Resources are finite. Codex 5.3 is more meticulous but quota-limited (ChatGPT Plus). Claude Code (Opus 4.6) is available at higher volume.

| Task | Tool |
|---|---|
| Architecture decisions, planning, file exploration | Claude Code |
| Translating Node backend to Python (methodical, reference-based) | Claude Code |
| Boilerplate — QWebChannel setup, scaffolding, config files | Claude Code |
| Tricky Qt/QML UI work where subtle bugs matter | Codex |
| mpv widget integration with library UI | Codex |
| Debugging something Claude Code can't solve after 2 attempts | Codex |

### Tips for Claude Code Effectiveness

- Be specific: "translate `app/main/domains/video.js` to Python, matching patterns in `run_player.py`"
- Point it at both the source JS and existing Python patterns
- Smaller edits, more often — focused tasks over sprawling rewrites
- Use for validation: "compare this Python port against the original JS — what did I miss?"

---

## Development Pace Reference

- Book mode (library + reader) was built in **12 hours** using Claude Code + Codex — a task estimated at 2 weeks traditionally
- The Qt player reached potplayer-quality basic functionality through AI-assisted iteration
- The developer has deep understanding of the codebase from months of hands-on work with ChatGPT — knows *what* to build, agents handle *how*

---

## Key Files Reference

### Electron App (translation source)
- `app/main/index.js` — app lifecycle, window creation
- `app/main/ipc/index.js` — IPC registry (all channel handlers)
- `app/main/domains/` — business logic modules
- `app/main/lib/storage.js` — atomic JSON persistence
- `app/shared/ipc.js` — channel/event constants
- `app/preload/index.js` — contextBridge (Tanko.api.*)
- `app/src/` — renderer (vanilla JS/HTML/CSS)
- `app/workers/` — library and video scan workers

### Qt Player (existing Python patterns)
- `app/player_qt/run_player.py` — 6000+ line player, reference for all Python/Qt patterns

### Data Files
- `video_index.json`, `video_progress.json` — video library state
- `library_state.json`, `library_index.json` — comic/book library state
- `progress.json` — reading progress
- `qt_player_sessions/` — session/command/playlist files (eliminated in unified app)

### Flow Documentation
- `docs/maps/MAP_QT_LAUNCH_FLOW.md` — player spawn flow (changes fundamentally)
- `docs/maps/MAP_PROGRESS_SYNC_FLOW.md` — progress sync (simplified — no more file polling)
- `docs/maps/MAP_VIDEO_FLOW.md` — video scanning (logic stays, transport changes)
