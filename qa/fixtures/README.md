# Deterministic Fixtures

This folder contains minimal deterministic fixtures for section-level tests.

Scope:
1. `comics/` - comic library scan fixture files (`.cbz`)
2. `books/` - book library scan fixture files (`.txt`)
3. `audiobooks/` - audiobook scan fixture files (`.mp3`)
4. `video/` - video scan fixture files (`.mp4`)
5. `browser/` - browser source fixture (`sources.json`)
6. `torrent/` - magnet fixture list (`magnets.txt`)
7. `contracts/` - IPC contract sample payloads

Determinism:
1. Every fixture file is tracked in `manifest.json` with `sha256` and `sizeBytes`.
2. Verify with `node tools/fixture_manifest.js --check`.
3. Re-generate only when fixtures intentionally change: `node tools/fixture_manifest.js --write`.

Note:
These are intentionally tiny synthetic fixtures for fast validation and repeatable CI.

