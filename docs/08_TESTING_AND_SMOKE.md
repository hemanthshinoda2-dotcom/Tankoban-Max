# Testing and Smoke

This document defines the Phase 8 release checks for Tankoban Max Books mode.

## Automated checks

Run from `projects/Tankoban Max`:

```powershell
npm run smoke
npm run phase8:verify
```

Expected:
- Both commands exit with code `0`.
- `smoke` reports `Smoke check passed.`
- `phase8:verify` reports `Phase 8 verify passed.`

## Golden path (manual)

### Mode and shell
1. Launch app in Comics mode.
2. Switch Comics -> Books -> Videos -> Books.
3. Verify top-bar `Back` and `Refresh` actions affect only the active mode.

### Books scan model
1. Add a root folder that contains both:
- Direct files (`.epub`, `.pdf`, `.txt`) at root.
- Subfolders representing series.
2. Add one explicit series folder.
3. Add one explicit single file.
4. Run scan and verify:
- Root-level files are listed as standalone books.
- Series folders are listed under series.
- Explicit single file remains present after rescan.
5. Remove one root/series/single source and verify only related entries are pruned.

### Reader format matrix
1. EPUB:
- Open book.
- Navigate using TOC.
- Search text.
- Close and reopen; resume position must match.
2. PDF:
- Open book.
- Next/prev page.
- Fit-width and fit-page.
- Zoom in/out.
- Close and reopen; resume page must match.
3. TXT:
- Open book.
- Change typography and theme.
- Search text.
- Close and reopen; resume location must match.

## Performance checks (manual baseline)

Capture numbers in release notes or checklist:

1. Large books library scan:
- Test set: at least 2,000 books mixed across root singles and series folders.
- Record full scan duration and incremental rescan duration.
2. Large EPUB chapter navigation:
- Test set: EPUB with 100+ chapters.
- Record time from chapter select to stable render.
3. Large PDF page traversal:
- Test set: PDF with 1,000+ pages.
- Record median next-page latency over 50 page turns.

Pass threshold for Phase 8 completion:
- No crashes.
- No blocked UI interactions > 2 seconds during navigation.
- No progress-loss on reopen for EPUB/PDF/TXT.

## Packaging checks

1. Verify `package.json` includes file associations for:
- `.epub`
- `.pdf`
- `.txt`
2. Verify `build.files` includes:
- `books_scan_worker.js`
- `workers/**/*`
- `main/**/*`
- `src/**/*`
3. Build artifacts:
- `npm run dist` completes.
- Install binary and confirm file association open-with behavior for EPUB/PDF/TXT.

### Reader UI (Batch A/B)

1. **Error visibility (UI-F01)**:
   - Open a corrupt or missing EPUB/PDF file.
   - Verify an error banner appears inside the reader with a message, file name, and Retry/Close buttons.
   - Click Retry — confirm it re-attempts open.
   - Click Close — confirm reader closes cleanly.

2. **TOC persistence (UI-F02)**:
   - Open book, collapse TOC panel.
   - Close reader, reopen any book.
   - Verify TOC panel is still collapsed (not forced open).

3. **TOC active chapter (UI-F03)**:
   - Open EPUB with TOC. Navigate via TOC.
   - Verify active chapter highlight updates correctly after each jump.
   - Use next/prev page — verify highlight follows current position.

4. **Search lifecycle (UI-F04)**:
   - Search for a word in EPUB. Verify match count and highlighted results.
   - Click clear — verify all highlights removed and count resets.
   - Repeat in TXT format.

5. **Dictionary popup (UI-F05)**:
   - Double-click a word in EPUB. Verify popup appears near the selected word, not in a fixed corner.
   - Verify popup never renders offscreen on narrow windows.
   - Click outside popup — verify it closes.
   - Press Escape — verify popup closes before reader closes.

6. **Top bar (UI-F06)**:
   - Resize window to 1366x768.
   - Verify reader top bar remains a single row (no wrapping).

7. **Status row (UI-F07)**:
   - Open book. Status shows briefly ("Opening...") then auto-hides.
   - Search — status shows match count then auto-hides after ~4 seconds.

8. **TTS bar (UI-F08)**:
   - Press T to start TTS. Verify floating TTS bar appears above content without layout shift.
   - Stop TTS — bar hides.

9. **TOC resize (UI-F09)**:
   - Drag the resize handle between TOC and reader content.
   - Verify width persists after closing and reopening reader.
   - Verify min (180px) and max (400px) bounds are enforced.

10. **Accessibility (UI-F10)**:
    - Tab through all reader controls. Verify visible focus outlines on each.
    - Verify all icon buttons have tooltips and aria-labels.

### TTS (Batch C/D)

1. **Multi-engine fallback (TTS-F01)**:
   - Start TTS. Note engine badge in TTS bar (should show "Edge" if online).
   - Disconnect network, start TTS again — should fall back to "Web" engine.
   - Verify playback starts either way (no silent failure).

2. **Edge neural voices (TTS-F02)**:
   - With network, start TTS. Verify audio plays with a neural voice (smoother than robotic Web Speech).
   - Verify word boundary highlighting in the snippet bar moves with speech.

3. **Voice picker (TTS-F03)**:
   - Open voice picker in TTS bar. Verify voices grouped by engine (Edge Neural / Web Speech).
   - Select a different voice. Click preview button — verify ~3 second sample plays.
   - Close reader, reopen, start TTS — verify voice selection persisted.

4. **Sentence segmentation (TTS-F04)**:
   - Start TTS on a long paragraph. Verify speech flows sentence-by-sentence (no long pauses between huge chunks).
   - Verify block highlight stays on the paragraph while sentences within it are spoken.

5. **Presets (TTS-F05)**:
   - Select "Fast Study" preset. Verify rate increases to 1.4x.
   - Select "Clear" preset. Verify rate adjusts to 0.9x.
   - Close and reopen — verify preset selection persisted.

6. **Transport controls (TTS-F06)**:
   - During TTS playback, click rewind (`<<`). Verify previous sentence replays.
   - Click forward (`>>`). Verify next sentence starts.
   - Verify buttons are responsive during playback.

7. **Audio cache (TTS-F07)**:
   - Play TTS through a few sentences with Edge engine.
   - Rewind to a previously spoken sentence. Verify it starts immediately (cached).

8. **Diagnostics panel (TTS-F08)**:
   - Click gear icon in TTS bar. Verify diagnostics panel opens showing:
     engine, available engines, status, rate, pitch, preset, voice, segment/block progress.
   - Verify panel updates during playback.
   - Close via X button.

## Regression guard

Before sign-off:
1. Open at least one comic in reader and verify progress resume still works.
2. Open at least one video episode and verify player flow is unchanged.
3. Confirm Pro codebase untouched by running (from repo root):

```powershell
git diff --name-only -- app
```

Expected: empty output.
