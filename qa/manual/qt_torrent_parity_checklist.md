# Qt Torrent Parity Manual Checklist

Platform target: Windows (primary acceptance).

## 1. Metadata Resolve and Add Flow
1. Open torrents page and add a healthy magnet.
2. Confirm dialog opens immediately and metadata resolves (name/size/files shown).
3. Confirm no files are auto-downloading before explicit apply when destination is not finalized.
4. Confirm file list can be selected/deselected and priorities changed.
5. Confirm zero selected files keeps Apply/Download disabled.

Expected:
- metadata resolves without blank/error state for healthy magnets
- no unintended downloads before user confirmation

## 2. Destination Picker Policy (No Mandatory OS Picker)
1. In add/manage dialog, pick `Videos`, `Comics`, `Books`.
2. Validate destination modes:
   - `Standalone download (default)`
   - `Pick existing folder`
   - `Create new folder`
3. Validate existing folder list comes from library-root browse.
4. Validate new folder is created under selected library root.

Expected:
- primary flow uses Tankoban destination model
- no forced Windows file picker for normal add/manage flow

## 3. File Selection, Priorities, Sequential
1. Pick mixed files and assign high/normal/low priorities.
2. Toggle sequential on/off.
3. Apply, then reopen manage flow and confirm selections/priorities persist.

Expected:
- backend selection and priority behavior is deterministic
- sequential setting round-trips correctly

## 4. Completed Pending Recovery
1. Finish torrent that has no destination (`completed_pending`).
2. Use manage flow to set destination and apply.
3. Verify routed counts and final state (`completed` or `completed_with_errors`).

Expected:
- no stuck completed-pending state after destination is set

## 5. Streamable Folder Flow
1. For video category, enable streamable flow and apply.
2. Verify show folder is created in video root.
3. Verify `.tanko_torrent_stream.json` exists and lists video files.
4. Verify placeholder files exist for listed video files.
5. Switch to video mode and confirm folder is discoverable.
6. Trigger playback and verify stream path resolves (via `streamFile` response path/url).

Expected:
- streamable folder is end-to-end usable for discovery and playback

## 6. Provider Dropdown and Fallback
1. Set provider to `jackett`, run search with invalid jackett config but valid prowlarr/tankorent.
2. Confirm fallback to next provider and results still appear.
3. Repeat for `prowlarr` and `tankorent` selected as primary.
4. Confirm indexer dropdown updates by provider.

Expected:
- fallback chain matches:
  - jackett -> prowlarr -> tankorent
  - prowlarr -> jackett -> tankorent
  - tankorent -> jackett -> prowlarr
- UI shows provider/fallback status

## 7. Downloads Manager Manage Flow
1. Open downloads table row context menu.
2. Confirm `Manage Files/Save` appears for `metadata_ready`, `completed_pending`, active states.
3. Apply changes and verify state/progress remains consistent.
4. Validate pause/resume/remove/open folder actions still work.

Expected:
- manage action is deterministic and non-destructive

## 8. Backward Compatibility
1. Start app with existing user data from prior build.
2. Validate torrents/history/settings still load.
3. Validate search provider defaults safely if missing.

Expected:
- no destructive migration behavior

## Release Gate Command
Run:
`python -m pytest projectbutterfly/tests/browser -k "torrent or qt_integration"`
