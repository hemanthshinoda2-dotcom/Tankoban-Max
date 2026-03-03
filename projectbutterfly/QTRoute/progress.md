# QTRoute Progress

| Phase | Description | Status | Date | Notes |
|---|---|---|---|---|
| Phase 0 | Docs Bootstrap | Completed | 2026-03-02 | `plan.md` + `progress.md` created in `projectbutterfly/QTRoute`. |
| Phase 1 | Baseline Fixtures | Completed | 2026-03-02 | Added `QTRoute/scripts/capture_phase1_baseline.py` and generated `fixtures/phase1/*_baseline.json` + manifest. |
| Phase 2 | Shared Core | Completed | 2026-03-02 | Shared modules added under `QTRoute/src` and `bridge.py` helper layer now delegates to QTRoute `common/store` for path/id/ignore/config-index primitives. |
| Phase 3 | Comics Adapter | Completed | 2026-03-02 | LibraryBridge now routes get/scan/cancel + all config mutation slots (`setScanIgnore`, add/remove root/series, ignore controls, file dialog, lookup) through QTRoute service/profile callbacks. |
| Phase 4 | Books Adapter | Completed | 2026-03-02 | BooksBridge now routes get/scan/cancel + all config/file mutation slots through QTRoute service/profile callbacks with behavior parity. |
| Phase 5 | Video Adapter | Completed | 2026-03-02 | VideoBridge now routes scan-show, folder/file mutation, hidden-show flows, subtitle/video dialogs, and episode query methods through QTRoute service/profile callbacks while preserving existing `video.*` payload shapes. |
| Phase 6 | Hardening | Completed | 2026-03-02 | Removed duplicate runtime lifecycle accounting in `QTRouteService`, added non-destructive parity check script (`scripts/verify_phase1_parity.py`), and documented future media-profile onboarding in `ADDING_MEDIA_PROFILE.md`. |
