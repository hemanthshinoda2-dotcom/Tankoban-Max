# Shell Domain

## Entrypoint
- `src/domains/shell/index.js`

## Active Runtime Role
- App shell bootstrap, control wiring, and section orchestration for the shared renderer.

## Public API
- `window.Tanko.shell` (created by `core.js` and bindings scripts)

## Internal Modules
- `core.js`: shell bootstrap and state hydration
- `shell_bindings.js`: shell event/action bindings
- `state.js`: staged-facade state surface
- `bindings.js`: staged-facade binding composition surface
