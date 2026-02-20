# TTS Issues Tracker

22 issues found during deep inspection of the TTS/listening system.
Grouped into fix batches by area and dependency.

---

## Batch 1 — Play/Pause Reliability
Core playback state machine fixes. Should be done first since everything else depends on reliable play/pause.

- [x] **#1 CRITICAL — Resume play() failure leaves engine stuck**
  `tts_engine_edge.js:697-716` — If `audio.play()` rejects, the engine optimistically set `paused = false` before the promise resolved. If promise never settles (rare), engine thinks it's playing but isn't. Resume attempts silently rejected. User must stop and restart.

- [x] **#3 HIGH — Boundary polling timer leaks when paused**
  `tts_engine_edge.js:286-317` — `_bdPoll()` fires every 100ms while paused, checking if it should resume. If user pauses and leaves app open for hours, CPU keeps waking. Only stops on `cancel()` or next `speak()`.

---

## Batch 2 — Wake Lock & Resource Management
Prevents battery drain during long listening sessions.

- [x] **#4 HIGH — Wake lock not re-acquired after tab switch**
  `tts_core.js:112-127` — Visibility change listener only re-acquires wake lock if `status === PLAYING`. If user pauses → switches tabs → returns → resumes, wake lock is gone. Device can sleep mid-listen.

- [x] **#5 HIGH — destroy() doesn't guarantee wake lock release**
  `tts_core.js:1503-1530` — `destroy()` calls `stop()` which releases wake lock. If `stop()` throws before reaching `releaseWakeLock()`, lock leaks. Visibility change listener also never removed after destroy.

---

## Batch 3 — Preload & Cache Resilience
Prevents audio gaps and stalls during playback.

- [x] **#6 HIGH — Preload failures silent, no retry**
  `tts_engine_edge.js:97-122` — When `preload()` fails (network drop, WebSocket closed), error is swallowed. No retry. When TTS reaches that block, it stalls 1-5 seconds synthesizing on demand. User hears a gap.

- [x] **#14 MEDIUM — Cache invalidated on rate/pitch change**
  `tts_engine_edge.js` — LRU cache key includes voice+rate+pitch+text. Changing speed flushes the entire 50-block cache. Every block must be re-synthesized.

- [x] **#22 LOW — Disk cache grows unbounded**
  `main/domains/booksTtsEdge/index.js` — No automatic eviction by age or disk size. Only manual clear via UI.

---

## Batch 4 — Error Feedback & Recovery
Make failures visible to the user instead of silently stopping.

- [ ] **#7 MEDIUM — No feedback when max consecutive errors reached**
  `tts_core.js:838-841` — After several synthesis failures, TTS silently stops. No message or indicator. User thinks it just stopped for no reason.

- [ ] **#12 MEDIUM — Queue generation has no error handling**
  `tts_core.js:560-588` — If `_fol.tts.next()` throws during queue build, queue is partially filled with no indication. Playback may skip content.

- [ ] **#2 CRITICAL — Rate 3.0x requested but silently capped to 2.0x**
  `tts_core.js:1399` — Speed slider goes to 3.0 but Edge TTS maxes at 2.0. User sees 3.0x in UI but hears 2.0x. No warning.

---

## Batch 5 — Audio Quality
Smoother playback and more accurate word tracking.

- [ ] **#8 MEDIUM — No gapless crossfade between blocks**
  `tts_engine_edge.js` — Block transitions have 50-200ms micro-silences. Old audio stops, new audio starts with no overlap or fade.

- [ ] **#9 MEDIUM — Word highlight drifts at high speed**
  `tts_engine_edge.js:323-425` — Text normalization strips punctuation aggressively. `indexOf` matching can hit wrong word occurrence. At 2-3x speed, highlight lags 1-2 words behind audio.

- [ ] **#13 MEDIUM — Enlarge span persists after DOM mutation**
  `tts_core.js:432-454` — Enlarge `<span>` wrapping a word can detach from DOM on page reflow. Cleanup fails silently, leaving visual artifact.

---

## Batch 6 — Player UI Performance
Reduce jank and improve responsiveness.

- [ ] **#11 MEDIUM — Segment window DOM rebuilt on every word**
  `listening_player.js:287-372` — `updateCard()` rebuilds entire `innerHTML` on every word boundary (10-20x/sec). Each rebuild triggers layout calculations. Causes scroll jank on slower devices.

- [ ] **#20 LOW — Voice list rebuilt on every TTS init**
  `listening_player.js:446-494` — Filters and groups 50+ voices each time player opens. Should cache.

---

## Batch 7 — Navigation & Sleep Timer
Fix stuck states in chapter navigation and sleep mode.

- [ ] **#10 MEDIUM — TOC navigation has no timeout fallback**
  `listening_player.js:799-810` — After chapter navigation, TTS waits indefinitely for `reader:relocated` event. If event never fires, TTS stays stopped forever.

- [ ] **#15 LOW — Sleep timer countdown updates only every 10 seconds**
  User may think timer isn't working between updates.

---

## Batch 8 — Keyboard & Accessibility
Polish for keyboard users and screen readers.

- [ ] **#16 LOW — Escape cascade can accidentally close player**
  First press closes TOC, second settings, third diag, fourth closes the player itself.

- [ ] **#17 LOW — Missing keyboard shortcuts**
  No shortcut for ±10s jump, cycle voices, or toggle settings. Only Space, arrows, C, Esc, M, S, +/- exist.

- [ ] **#18 LOW — Color swatches inaccessible to screen readers**
  Highlight color buttons have no text label or aria-label.

- [ ] **#19 LOW — No keyboard navigation in TOC list**
  Must tab through all items. No arrow key support.

- [ ] **#21 LOW — No "copy diagnostics" button**
  Diagnostics panel has no easy way to share debug info.

---

## Not bugs — design trade-offs

- Volume changes mid-playback cause level shift (no ramping) — standard HTMLAudioElement behavior
- Rate/pitch changes apply to next block only — intentional (TTS-QOL4)
- Per-book settings shadow global settings — working as designed
- Edge TTS time-stretch degrades above 2x — inherent limitation of the service
