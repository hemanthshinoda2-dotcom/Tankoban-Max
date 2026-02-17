# Claude Code Mega Prompt: Tankoban Max Book Reader TTS Inspection + Remediation

## Project + Scope
You are working in:
`D:\Projects\Tankoban-Pro-Electron\projects\Tankoban Max`

Focus area:
- Books reader "Text-to-Voice" (TTS) feature
- Behavior consistency between toolbar/top controls, floating bar, footer mini controls, and settings panel controls
- UX clarity, accessibility, and transport behavior

Primary files (inspect first):
- `src/index.html`
- `src/domains/books/reader/reader_tts_ui.js`
- `src/domains/books/reader/tts_core.js`
- `src/domains/books/reader/reader_core.js`
- `src/domains/books/reader/reader_state.js`
- `src/domains/books/reader/reader_appearance.js`
- `src/domains/books/reader/engine_foliate.js`
- `src/domains/books/reader/engine_txt.js`
- `src/styles/books-reader.css`

Important clarification:
- Next/previous sentence controls already exist. Do NOT report that as missing.

## Mission
1. Perform a deep inspection of TTS logic + UI.
2. List concrete defects with file/line references.
3. Implement targeted fixes (minimal, no unrelated refactor).
4. Improve UX for user-friendliness and predictability.
5. Provide a clear verification checklist.

## Confirmed Baseline Issues To Validate and Fix
Treat these as high-priority verification points. If any is already fixed in current code, say so explicitly.

1. **Rate mismatch bug**
- UI/settings allow up to 3.0x, but core clamps to 2.0x.
- Expected: one consistent max across UI + core + persisted settings + labels.

2. **Step while paused resumes unexpectedly**
- Prev/next sentence while paused forces playback to playing.
- Expected: stepping from paused should remain paused unless explicitly designed otherwise (if you choose otherwise, justify and align UI copy).

3. **Sleep timer lifecycle bug**
- Timer cleanup tied to manual stop path, not guaranteed on natural completion.
- Expected: no stale countdown, no delayed false "stopped" toast after playback already ended.

4. **TTS launch availability inconsistency**
- TTS launch affordance can remain visible/clickable when format disallows TTS (e.g., PDF).
- Expected: disabled/hidden + clear feedback text/tooltips.

5. **No "start from selected text" flow**
- Selection APIs exist in engines, but TTS start path does not use them.
- Expected: user can select text and start read-aloud from selection.

6. **No time-based transport**
- Sentence step exists, but no `-10s/+10s` style skip.
- Expected: add time-like jumps with engine-compatible approximation if exact timestamps are unavailable.

7. **Mini controls accessibility gap**
- Mini controls are less descriptive than top controls (labels/state semantics).
- Expected: full a11y parity (`aria-label`, `aria-pressed` where relevant, focus-visible, tooltip clarity).

8. **Voice preview flow can be disruptive**
- Preview can pause active playback without restoring prior state.
- Expected: predictable preview behavior (restore previous playing/paused state unless user changed mode intentionally).

## Required UX/Product Improvements
Implement these improvements with pragmatic minimal changes:

1. **Transport parity across all control surfaces**
- Top bar, floating TTS bar, mini footer bar, and keyboard shortcuts must drive same state transitions.
- No hidden divergence in behavior.

2. **`-10s/+10s` transport**
- Add controls and keyboard shortcuts.
- If engine lacks true media time, implement deterministic approximation (char-based or boundary-based jump).
- Show tooltips/text as "Back 10s" / "Forward 10s" and document approximation behavior.

3. **Read from selection**
- Add action path:
  - Context menu item and/or TTS panel button: "Read from selection"
  - If selection exists, start from nearest matching segment
  - If no selection, keep existing default start behavior
- Handle both EPUB and TXT gracefully.

4. **UI simplification and clarity**
- Reduce ambiguity between launch/toggle/play states.
- Ensure visible state icons match actual internal state.
- Keep mini controls compact but complete and discoverable.

5. **Error and unsupported feedback**
- For disallowed formats or unavailable engines, give direct status feedback and disable controls.
- Avoid silent no-op interactions.

## Implementation Constraints
- Preserve current architecture and module boundaries.
- Keep changes localized to reader/TTS files unless absolutely necessary.
- Avoid unrelated refactors.
- Do not regress PDF non-TTS behavior.
- Maintain existing sentence stepping and existing keyboard shortcuts unless replacing with better equivalents.
- If adding new shortcuts, ensure they do not conflict with existing defaults.

## Suggested Technical Direction (if useful)
- Introduce explicit TTS transport actions in one place (single source of truth):
  - `toggle`, `play`, `pause`, `resume`, `stop`, `stepSentence(delta)`, `jumpApproxMs(deltaMs)`, `playFromSelection()`
- Add a small state contract comment for expected transitions.
- Normalize speed constraints by centralizing min/max constants.
- Ensure `onStateChange` hooks cleanup timers/UI as needed.

## Acceptance Criteria
All must pass:

1. TTS rate:
- UI max == engine max == persisted max.
- No silent clamping mismatch.

2. Pause/step behavior:
- While paused, prev/next sentence does not unexpectedly auto-play (unless explicitly spec'd and UI text updated).

3. Sleep timer:
- Timer clears on manual stop, natural end, and reader close.
- No stale countdown display.

4. Availability:
- PDF mode does not expose active TTS actions as if available.

5. Selection start:
- Selecting text and invoking "Read from selection" starts near selection reliably.

6. Time-based jump:
- `-10s/+10s` actions exist and behave predictably during playing and paused states.

7. Accessibility:
- Mini and top controls have consistent labels/state semantics and keyboard focus behavior.

8. Non-regression:
- Existing next/previous sentence controls still work.
- Existing voice cycling and sleep timer still work.

## Manual Test Matrix (run and report)
- EPUB:
  - Start TTS from top launch.
  - Pause/resume from mini bar.
  - Step prev/next while paused.
  - Use `-10s/+10s` while playing and paused.
  - Select text and run "Read from selection".
  - Let playback naturally finish with sleep timer active.
  - Change voice and preview; verify restore behavior.
- TXT:
  - Repeat same core transport + selection tests.
- PDF:
  - Confirm TTS controls are disabled/hidden with clear feedback.

## Output Format
Provide response in this exact order:

1. **Findings** (severity-ordered)
- Include file + line references and repro steps.

2. **Implementation Plan**
- Concise bullet list of exact code changes.

3. **Code Changes Applied**
- File-by-file summary.

4. **Verification Results**
- Pass/fail per acceptance criterion.

5. **Residual Risks / Follow-ups**
- Any remaining edge cases.

## Do the Work
Proceed to implement changes now. Do not stop at analysis.
