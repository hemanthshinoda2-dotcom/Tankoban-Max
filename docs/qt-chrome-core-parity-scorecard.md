# Qt Chrome Core Parity Scorecard

## Scoring Model

| Area | Weight | Pass Rule |
|---|---:|---|
| Tabs | 25 | 100% for critical tab cases |
| Navigation + History Menus | 20 | 100% for critical nav cases |
| Omnibox | 20 | 100% for critical omnibox cases |
| Permissions | 10 | 95%+ |
| Error/Crash Recovery | 10 | 95%+ |
| Downloads/History/Bookmarks Managers | 10 | 95%+ |
| Shortcuts + Context Menu | 5 | 90%+ |

Total possible score: 100

## Track Gate
- Weighted score >= 95
- Tabs/Nav/Omnibox critical suites: 100%
- No open P0/P1 defects

## Defect Severity Definitions
- P0: Data loss, crash loop, unusable core navigation/tab flow
- P1: Major parity break in core workflows with no reasonable workaround
- P2: Noticeable parity gap with workaround
- P3: Minor polish mismatch

## Current Implementation Status Snapshot

| Milestone Capability | Status |
|---|---|
| Versioned session schema + migration | Implemented |
| Debounced session persistence | Implemented |
| Opener-aware tab insertion | Implemented |
| Pinned-zone drag/reorder enforcement | Implemented |
| Close other/right + reopen closed tab payload restore | Implemented |
| Back/forward history dropdown + go-to-index | Implemented |
| Omnibox ghost + per-tab draft plumbing | Implemented |
| Permission remember + persisted decision lookup | Implemented |
| Error page + crash recovery surface | Implemented |
| Settings load/save runtime wiring | Implemented |
| Downloads manager internal page | Implemented |
| Bookmarks manager internal page | Implemented |
| Manual checklist | Added |
| Automated pytest suites | Added (new browser test package) |

## Evidence to Attach at Signoff
- Pytest output for browser suite
- Manual checklist run results
- Known issue list (P2/P3 only at gate)
- Short clip/screenshots for: history dropdown, crash recovery, session restore

## Release Gate Command Sequence
1. `python -m py_compile projectbutterfly/browser/*.py projectbutterfly/bridge.py`
2. `python -m pytest projectbutterfly/tests/browser -q`
3. Manually execute `qa/manual/qt_browser_chrome_core_checklist.md` on Windows
