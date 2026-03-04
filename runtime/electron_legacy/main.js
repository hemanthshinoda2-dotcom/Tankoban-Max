/*
Electron legacy entrypoint.

Canonical active runtime is Qt (Project Butterfly).
This file keeps the legacy Electron runtime bootable from runtime/electron_legacy/.
*/

const path = require('path');

// Legacy main/index.js expects APP_ROOT to be repo root so it can resolve src/,
// build/, player_qt/, and root worker shims.
const APP_ROOT = path.resolve(__dirname, '../..');

require('./main/index')({ APP_ROOT });
