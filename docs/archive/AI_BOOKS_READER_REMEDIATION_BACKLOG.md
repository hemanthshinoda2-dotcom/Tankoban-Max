# Tankoban Max Books Reader Remediation Backlog (UI + TTS)

Date: 2026-02-16  
Target repo: `projects/Tankoban Max` only  
Do not modify: `app/`

## Purpose
This is the strict execution backlog for fixing the current Books reader issues after the 4-wave implementation.  
It is ordered for safe delivery and split into:
1. `MUST-FIX (Parity)` - required before calling Books reader baseline stable.
2. `POLISH` - improvements after parity is complete.

## Readest Comparison Baseline (Why TTS sounds better there)
Readest quality advantage comes from:
1. Multi-engine orchestration (Edge neural preferred, fallback engines second).
2. Better voice selection + defaults.
3. Richer segmentation/highlighting behavior during speech.

Tankoban Max currently uses Web Speech only, so this backlog upgrades architecture first, then quality.

## Execution Order
1. Batch A - MUST-FIX UI blockers (`UI-F01`..`UI-F05`)
2. Batch B - MUST-FIX UI parity/refinement (`UI-F06`..`UI-F10`)
3. Batch C - MUST-FIX TTS architecture + quality baseline (`TTS-F01`..`TTS-F04`)
4. Batch D - POLISH TTS quality/parity (`TTS-F05`..`TTS-F08`)
5. Batch E - POLISH hardening + regression (`X-F01`..`X-F03`)

---

## Batch A - MUST-FIX UI blockers

### UI-F01 - Reader open errors must be visible to users
Priority: `MUST-FIX (Parity)`  
Issue: Open failures dispatch events but users do not get a clear, actionable in-reader error state.  
Files:
1. `src/domains/books/reader/controller.js`
2. `src/index.html`
3. `src/styles/styles.css`
Implementation:
1. Add a persistent reader error banner/toast area in the reader chrome.
2. On `books-reader-error`, render error title + concise reason + file path (trimmed).
3. Add `Retry` and `Close` actions.
Acceptance:
1. Broken EPUB/PDF shows visible message inside reader.
2. Message includes actionable text, not only console logs.
3. Retry re-attempts open without app restart.

### UI-F02 - TOC open state should persist and not force-open every time
Priority: `MUST-FIX (Parity)`  
Issue: TOC state feels jumpy and resets on reopen.  
Files:
1. `src/domains/books/reader/controller.js`
2. `main/domains/booksUi/index.js`
Implementation:
1. Persist `tocOpen` in Books UI state.
2. Restore previous TOC collapsed/expanded state on open.
Acceptance:
1. Collapse TOC, close reader, reopen same/different book -> TOC stays collapsed.
2. No forced TOC open unless first run or reset.

### UI-F03 - TOC active chapter mapping must be robust
Priority: `MUST-FIX (Parity)`  
Issue: Active chapter highlight can break due to strict href comparisons.  
Files:
1. `src/domains/books/reader/controller.js`
2. `src/domains/books/reader/engine_foliate.js`
Implementation:
1. Normalize TOC href comparisons (strip fragment variance, decode URI, consistent casing rules).
2. Add fallback matching by nearest spine index when href mismatch occurs.
Acceptance:
1. Active chapter updates correctly while reading and after TOC jumps.
2. No stale highlight after chapter transitions.

### UI-F04 - Search lifecycle must be consistent across engines
Priority: `MUST-FIX (Parity)`  
Issue: Clear/reset behavior differs across TXT vs Foliate paths.  
Files:
1. `src/domains/books/reader/controller.js`
2. `src/domains/books/reader/engine_foliate.js`
3. `src/domains/books/reader/engine_txt.js`
Implementation:
1. Standardize engine contract: `search`, `searchGoTo`, `clearSearch`.
2. Implement `clearSearch` in Foliate engine.
3. Ensure controller always resets UI count, active hit index, and engine highlights.
Acceptance:
1. Search clear button removes highlights in EPUB/PDF/TXT.
2. Search next/prev state always matches visible highlights.

### UI-F05 - Dictionary popup should anchor to selection, not screen corner
Priority: `MUST-FIX (Parity)`  
Issue: Popup behavior is coarse and not selection-driven.  
Files:
1. `src/domains/books/reader/controller.js`
2. `src/styles/styles.css`
Implementation:
1. Position popup near current selection rect.
2. Add viewport clamping and escape/outside-click close.
3. Keep fallback placement for missing selection rect.
Acceptance:
1. Selecting a word opens popup near selected word.
2. Popup never renders offscreen.

Batch A gate:
1. EPUB/PDF open failures are understandable without dev tools.
2. TOC/search/dictionary behavior is reliable and deterministic.

---

## Batch B - MUST-FIX UI parity/refinement

### UI-F06 - Top bar must remain one-row and uncluttered at 1366x768
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/index.html`
2. `src/styles/styles.css`
Implementation:
1. Prevent wrapping by grouping controls into compact icon clusters.
2. Move secondary controls into compact overflow panel.
3. Keep search width responsive with min/max constraints.
Acceptance:
1. No wrapping in reader top bar at 1366x768.
2. Core actions remain one-click accessible.

### UI-F07 - Reader status row should be subtle and auto-hide
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/domains/books/reader/controller.js`
2. `src/styles/styles.css`
Implementation:
1. Convert status to transient messages with timeout.
2. Keep persistent messages only for warnings/errors.
Acceptance:
1. Status row no longer consumes fixed space when idle.
2. Important messages remain visible long enough to read.

### UI-F08 - TTS bar should be overlay/floating, not layout-shifting
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/index.html`
2. `src/styles/styles.css`
3. `src/domains/books/reader/controller.js`
Implementation:
1. Render TTS controls as floating panel anchored above content.
2. Show only when TTS is enabled/active.
Acceptance:
1. TTS controls do not resize/reflow reading canvas.
2. TTS controls are keyboard and pointer accessible.

### UI-F09 - TOC/bookmarks pane should be resizable and responsive
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/index.html`
2. `src/styles/styles.css`
3. `src/domains/books/reader/controller.js`
Implementation:
1. Add drag handle and persisted pane width.
2. Add sane min/max bounds and mobile fallback collapse.
Acceptance:
1. Pane width persists between sessions.
2. Reader remains usable on narrow widths.

### UI-F10 - Accessibility parity for focus and labels
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/index.html`
2. `src/styles/styles.css`
3. `src/domains/books/reader/controller.js`
Implementation:
1. Add `:focus-visible` states for all top-bar and sidebar controls.
2. Ensure icon buttons include `aria-label` and tooltip text parity.
3. Ensure disabled states are clearly distinguishable.
Acceptance:
1. Keyboard-only nav is usable end-to-end.
2. No unlabeled icon-only controls in accessibility tree.

Batch B gate:
1. Reader feels visually consistent with app language.
2. Reader chrome stays minimal and stable under real window sizes.

---

## Batch C - MUST-FIX TTS architecture + quality baseline

### TTS-F01 - Add multi-engine TTS abstraction with deterministic fallback
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/domains/books/reader/tts_core.js`
2. `src/domains/books/reader/controller.js`
3. `src/domains/books/reader/tts_engine_webspeech.js`
4. `src/domains/books/reader/` (new engine modules)
Implementation:
1. Introduce engine registry (`edgeNeural`, `webSpeech`) with health checks.
2. Select best available engine at runtime; fallback automatically.
3. Expose active engine in UI.
Acceptance:
1. TTS starts even if primary engine fails.
2. UI shows which engine/voice is active.

### TTS-F02 - Port/adapt Edge neural TTS path (Readest-inspired)
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/domains/books/reader/tts_engine_edge.js` (new)
2. `src/domains/books/reader/tts_core.js`
3. `src/services/api_gateway.js` (only if Electron-main relay is needed)
4. Optional main relay files if network/cors restrictions require it
Implementation:
1. Adapt Readest-style Edge client behavior to Tankoban architecture.
2. Stream/queue audio per chunk and keep reader highlight sync.
3. Preserve strict fallback to Web Speech on error/offline.
Acceptance:
1. Neural voices are selectable and play successfully.
2. Fallback to Web Speech works without restart when Edge fails.

### TTS-F03 - Add voice picker + voice preview UX
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/index.html`
2. `src/styles/styles.css`
3. `src/domains/books/reader/controller.js`
4. `main/domains/booksSettings/index.js`
Implementation:
1. Add compact voice picker in TTS panel with engine grouping.
2. Add 2-3 second preview action per selected voice.
3. Persist voice + engine preference in Books settings.
Acceptance:
1. Voice selection persists after restart.
2. Preview uses selected voice before full playback.

### TTS-F04 - Improve text segmentation and highlight behavior
Priority: `MUST-FIX (Parity)`  
Files:
1. `src/domains/books/reader/tts_core.js`
2. `src/domains/books/reader/controller.js`
Implementation:
1. Segment by sentence/phrase with max token guard instead of coarse blocks.
2. Use boundary callbacks to track active segment/word where available.
3. Keep highlight movement aligned with spoken progress.
Acceptance:
1. Playback sounds smoother (less abrupt chunk transitions).
2. Highlight moves progressively during narration.

Batch C gate:
1. TTS quality is materially better than baseline Web Speech-only behavior.
2. User can pick voice and keep that preference.

---

## Batch D - POLISH TTS quality/parity

### TTS-F05 - Add pitch and expressive presets
Priority: `POLISH`  
Files:
1. `src/index.html`
2. `src/domains/books/reader/controller.js`
3. `src/domains/books/reader/tts_core.js`
Implementation:
1. Add optional pitch control and presets (`Natural`, `Clear`, `Fast Study`).
2. Map unsupported params gracefully per engine.
Acceptance:
1. Presets apply immediately and are persisted.

### TTS-F06 - Add robust transport UX
Priority: `POLISH`  
Files:
1. `src/domains/books/reader/controller.js`
2. `src/styles/styles.css`
Implementation:
1. Add rewind/forward by sentence.
2. Add explicit buffering/loading state.
Acceptance:
1. User sees clear state transitions: buffering, playing, paused, stopped.

### TTS-F07 - Add download/cache policy for generated audio (if Edge path supports it)
Priority: `POLISH`  
Files:
1. `main/domains/booksUi/index.js` or new books TTS cache domain
2. `src/domains/books/reader/tts_core.js`
Implementation:
1. Cache short-lived chunks to reduce repeated network synthesis.
2. Add bounded cache size + clear policy.
Acceptance:
1. Replaying recent section starts faster.
2. Cache never grows unbounded.

### TTS-F08 - Add TTS diagnostics panel for support/debug
Priority: `POLISH`  
Files:
1. `src/index.html`
2. `src/domains/books/reader/controller.js`
Implementation:
1. Show current engine, voice id, rate, last error code in a small diagnostics drawer.
Acceptance:
1. Failures are inspectable without devtools.

Batch D gate:
1. TTS experience feels controlled, predictable, and troubleshootable.

---

## Batch E - POLISH hardening + regression

### X-F01 - Books reader smoke expansion
Priority: `POLISH`  
Files:
1. `tools/smoke_check.js`
2. Optional `tools/books_reader_smoke.js`
Implementation:
1. Add checks for new TTS modules, reader UI ids, and settings fields.
Acceptance:
1. Smoke fails fast on missing reader/TTS integration points.

### X-F02 - Manual QA matrix update
Priority: `POLISH`  
Files:
1. `docs/08_TESTING_AND_SMOKE.md`
Implementation:
1. Add explicit test scripts for EPUB/PDF open, TOC/search, dictionary placement, TTS engine fallback.
Acceptance:
1. QA doc is executable by a human tester without tribal knowledge.

### X-F03 - Regression pass for Comics/Videos
Priority: `POLISH`  
Files:
1. Any touched files from prior batches
Implementation:
1. Verify no behavior regressions in comics reader and video player.
Acceptance:
1. `npm run smoke` passes.
2. Comics and Videos golden-path checks still pass.

---

## Definition of Done (Global)
1. All `MUST-FIX` items (`UI-F01`..`UI-F10`, `TTS-F01`..`TTS-F04`) are complete with acceptance checks passing.
2. No regressions in Comics/Videos mode.
3. Reader UX is minimal, stable, and consistent with existing Tankoban visual language.
4. TTS is no longer limited to robotic default behavior when neural path is available, with graceful fallback when unavailable.

## Claude Execution Rules
1. Implement one batch at a time, in order.
2. Do not mark any task done without file-level evidence and command output.
3. Keep patches small and reversible.
4. Avoid touching non-Books domains unless required for shared infra.
