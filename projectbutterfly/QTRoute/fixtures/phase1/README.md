# QTRoute Phase 1 Baseline Fixtures

This folder stores golden JSON snapshots for the current bridge contract behavior of:
1. `library` (comics)
2. `books`
3. `video`

The capture script generates deterministic fixture media files, runs bridge methods, records state/event outputs, and writes snapshots.

## Generate / Refresh

From repo root:

```powershell
python projectbutterfly/QTRoute/scripts/capture_phase1_baseline.py
```

## Verify Parity (No Overwrite)

From repo root:

```powershell
python projectbutterfly/QTRoute/scripts/verify_phase1_parity.py
```

Outputs:
1. `comics_baseline.json`
2. `books_baseline.json`
3. `video_baseline.json`
4. `baseline_manifest.json`

## Notes

1. Public API shapes are captured as returned from bridge methods.
2. Scan event ordering is captured via instrumentation on bridge emit methods.
3. Runtime timestamp-like fields are normalized to keep fixture diffs stable.
4. Use `capture_phase1_baseline.py` only when intentionally updating golden fixtures.
