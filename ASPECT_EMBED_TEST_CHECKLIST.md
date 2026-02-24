# Aspect Embed Test Checklist (Manual)

> This environment can’t launch the Electron UI, so the items below are **NOT RUN here**. Please run locally.

## A) Launch and Navigation
- [ ] Launch Tankoban
- [ ] Open embedded browser pane
- [ ] Open a normal website
- [ ] Switch tabs
- [ ] Refresh
- [ ] Back / forward
- [ ] Open/close tabs repeatedly

## B) Focus and Keyboard
- [ ] Browser shortcuts only trigger when focus is inside the embedded browser
- [ ] Tankoban shortcuts still work outside the browser
- [ ] No cross-triggering between host and embedded browser

## C) Mount / Unmount Stability
- [ ] Enter browser pane
- [ ] Leave to another Tankoban view
- [ ] Return to browser pane
- [ ] Repeat multiple times
- [ ] No duplicated listeners / no stuck UI

## D) Internal Pages
- [ ] Open `aspect://torrents`
- [ ] Confirm loading bar is not stuck looping
- [ ] Confirm page remains interactive

## E) Download and Torrent Basic Sanity
- [ ] Downloads start and produce real files
- [ ] Torrent add-source works
- [ ] Torrent progress/completion updates correctly

## F) Window Safety
- [ ] Closing the last tab does NOT close the Tankoban window

## G) Recovery Behavior
- [ ] If a webview crash/unresponsive path exists, confirm recovery UI works without breaking Tankoban

