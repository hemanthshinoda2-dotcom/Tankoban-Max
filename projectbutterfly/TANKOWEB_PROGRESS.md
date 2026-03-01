# Tankoweb Progress

---

## Phase 1 — Core Home Screen + Nav Button (2026-03-01)

### Done
- [x] Nav bar: `#tankWebBtn` (globe icon) added to `.tbLeft` after Refresh; `#modeSourcesBtn` removed from modeSwitch
- [x] `shell_bindings.js`: Tankoweb button wired to `openBrowserFromTopButton()`; `setAppTheme()` bridge call added to `applyAppTheme()` for live theme sync
- [x] `mode_router.js`: Dead Sources mode Butterfly intercept removed
- [x] `bridge.py`: `ShellBridge.setAppTheme()` + `getAppTheme()` added — persists to `app_prefs.json`, pushes theme to all home tab pages via `runJavaScript()`
- [x] `bridge.py`: `TorrentSearchBridge.saveSettings()` added — saves Prowlarr/Jackett config from Tools panel
- [x] `bridge.py`: `TorrentSearchBridge.getConfig()` added — returns full provider config for Tools panel pre-population
- [x] `home.html`: Full redesign
  - Library ← and Browser → buttons at top (SVG icons, no emoji)
  - Inline Lucide SVG sprite (arrow-left, arrow-right, globe, search, settings, external-link, download, zap, x)
  - Theme sync: `_tankwebApplyTheme()` maps all 6 app themes to CSS variables; calls `shell.getAppTheme()` on load
  - Sources tiles: Opera GX speed-dial style (card grid, favicon, label)
  - Torrent search: Tools icon toggles inline Prowlarr/Jackett settings panel
  - Torrent Downloads table: # | Filename | Size | Seeds | Dn Speed | % | Destination
  - DDL Downloads table: # | Filename | Size | Dn Speed | % | File Type | Destination
- [x] `TANKOWEB.md` created from user's canonical plan
- [x] `TANKOWEB_PROGRESS.md` created (this file)
- [x] `PROGRESS.md` + `BUTTERFLY.md` updated

### Known Issues
- Torrent "Destination" column shows path basename — a proper library-label resolver (Comics/Books/Videos) will be added in Phase 3
- DDL "File Type" column derived from filename extension only

---

## Phase 2 — Torrent Search Engine (planned)

- [ ] Remove 40-result cap from `TorrentSearchBridge.query()`
- [ ] Test Prowlarr and Jackett APIs end-to-end
- [ ] Verify all Electron torrent search features are re-implemented
- [ ] Add per-indexer configuration UI to Tools panel

---

## Phase 3 — Torrent Downloader (planned)

- [ ] Custom Tankoban destination picker (select mode + subfolder)
- [ ] Map torrent save paths to library labels (Comics / Books / Videos)
- [ ] Add torrent folder to Video library as streamable folder (streaming badge on thumbnails)

---

## Phase 4 — DDL Download Manager (planned)

- [ ] Test DDL downloads end-to-end via Yandex search + direct link
- [ ] Destination mode picker for DDL downloads
- [ ] Integration with library path resolver
