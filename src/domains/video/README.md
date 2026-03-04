# Video Domain

## Entrypoint
- `src/domains/video/index.js`

## Active Runtime Role
- Video library routing, state, search, and player launch coordination.

## Public API
- `window.__tankoVideoShared`
- `window.__tankoVideoSearch`

## Internal Modules
- `video.js`: current monolith runtime entry
- `video_search.js`: search indexing + interactions
- `state/`, `library/`, `player/`, `routing/`: staged-facade split targets
