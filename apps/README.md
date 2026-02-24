# App Entrypoints

This directory provides standalone Electron entrypoints for each major section.

All app entrypoints delegate to the same core runtime and codebase, but boot with
an explicit `appSection` target so each area can be tested in isolation.

Sections:
- `shell-app` -> integrated full app (default behavior)
- `library-app` -> comics library-focused boot
- `comic-reader-app` -> comics mode boot
- `book-reader-app` -> books mode boot
- `audiobook-app` -> books mode boot (audiobook-focused workflows)
- `video-player-app` -> videos mode boot
- `browser-app` -> browser mode boot
- `torrent-app` -> browser mode + torrent tools focus

Source of truth for section launcher behavior:
- `packages/core-main/launch_section_app.js`

