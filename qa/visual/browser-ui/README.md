# Browser UI Visual QA

Deterministic visual QA scenarios for browser UI states:

- `tabs-normal`, `tabs-pinned`, `tabs-loading`, `tabs-crashed`
- `omnibox-idle`, `omnibox-typing-suggestions-ghost`
- `history-dropdown`
- `download-shelf-states`
- `permission-and-siteinfo`
- `split-view-transition`, `home-panel-transition`

## Baselines

Baseline screenshots are stored as text files in `qa/visual/browser-ui/baseline/*.png.b64.txt`.
Each file contains a base64-encoded PNG for environments where binary files are not supported.

## Local workflow

1. Capture current screenshots:
   - `npm run visual:browser:capture`
2. Compare against baseline:
   - `npm run visual:browser:compare`
3. If intentional UI changes were made, regenerate baseline:
   - `npm run visual:browser:baseline`

## Notes

- Fixture source: `tools/browser_visual_qa_fixture.html`
- Capture script: `tools/visual-qa/browser_ui_visual_qa.js`
- Compare script: `tools/visual-qa/browser_ui_compare.js`
- Compare is exact-hash based on the base64 screenshot payload for deterministic PR review.
