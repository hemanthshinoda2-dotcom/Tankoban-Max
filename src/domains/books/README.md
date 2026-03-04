# Books Domain

## Entrypoint
- `src/domains/books/index.js`

## Active Runtime Role
- Books library view, reading/listening flows, OPDS and sources integration.

## Public API
- `window.__tankoBooksLibShared`

## Internal Modules
- `library.js`: books domain boot and library interactions
- `reader/`: reader runtime modules
- `listening_*.js`: audiobook/listening UI helpers
- `sources/`: staged-facade split target for web sources integration
