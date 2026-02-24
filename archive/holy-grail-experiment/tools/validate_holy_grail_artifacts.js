#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const addonPath = path.join(appRoot, 'native', 'holy_grail', 'build', 'Release', 'holy_grail.node');

if (!fs.existsSync(addonPath)) {
  console.error('[holy-grail-validate] ERROR: native addon artifact is missing.');
  console.error(`  - ${path.relative(appRoot, addonPath)}`);
  console.error('[holy-grail-validate] Run "npm run build:holy-grail" before packaging.');
  process.exit(1);
}

console.log('[holy-grail-validate] OK: native addon artifact is present.');
