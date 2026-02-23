#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..', '..');
const base = path.join(repoRoot, 'qa', 'visual', 'browser-ui', 'baseline');
const current = path.join(repoRoot, 'qa', 'visual', 'browser-ui', 'current');
const diffDir = path.join(repoRoot, 'qa', 'visual', 'browser-ui', 'diff');

const scenarios = [
  'tabs-normal','tabs-pinned','tabs-loading','tabs-crashed',
  'omnibox-idle','omnibox-typing-suggestions-ghost','history-dropdown',
  'download-shelf-states','permission-and-siteinfo','split-view-transition','home-panel-transition'
];

fs.mkdirSync(diffDir, { recursive: true });
let failures = 0;
for (const scene of scenarios) {
  const b = path.join(base, `${scene}.png.b64.txt`);
  const c = path.join(current, `${scene}.png.b64.txt`);
  if (!fs.existsSync(b) || !fs.existsSync(c)) {
    console.error(`missing: ${scene}`);
    failures++;
    continue;
  }

  const baselineText = fs.readFileSync(b, 'utf8').trim();
  const currentText = fs.readFileSync(c, 'utf8').trim();
  const hb = crypto.createHash('sha256').update(baselineText).digest('hex');
  const hc = crypto.createHash('sha256').update(currentText).digest('hex');
  const marker = path.join(diffDir, `${scene}.changed.txt`);

  if (hb !== hc) {
    fs.writeFileSync(marker, `baseline=${hb}\ncurrent=${hc}\n`);
    console.error(`FAIL ${scene}`);
    failures++;
  } else {
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
    console.log(`PASS ${scene}`);
  }
}

if (failures > 0) process.exit(1);
