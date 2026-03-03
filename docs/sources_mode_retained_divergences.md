# Sources Mode Retained Divergences

This track stabilizes Sources mode while intentionally preserving selected experimental behavior.

## Kept on Purpose
- Collapsed/expandable omnibox behavior in Sources browser UI.
- Drawer-based history/bookmark panels instead of full-page manager tabs.
- Qt-hosted `webTabManager` viewport rendering path (Butterfly-specific).

## Re-aligned to Core Workflow
- Main Sources panel order is fixed to:
  1. TankoBrowser
  2. TankoBrowser Downloads
  3. Tankoban Search
  4. Tankoban Torrents
- Downloads panel is first-class in page flow, not drawer-only content.
- Qt browser viewport bounds are updated on Sources scroll to prevent overlap/drift.

## Next Parity Checks
- Validate toolbar density/spacing against `Tankoban-Max-master` after each UI tweak.
- Keep any future divergence documented here before merge.
