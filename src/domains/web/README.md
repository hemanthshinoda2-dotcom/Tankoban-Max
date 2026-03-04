# Web/Sources Domain

## Entrypoint
- `src/domains/web/index.js`

## Active Runtime Role
- Sources workspace, browser host integration, torrent search/manager UI, provider settings.

## Public API
- `window.Tanko.sources`
- `window.Tanko.web` (compatibility wrappers)

## Internal Modules
- `web.js`: active runtime entry
- `web_module_*.js`: existing modular slices
- `state/`, `browser/`, `apps/`, `torrents/`, `providers/`, `diagnostics/`: staged-facade split targets
