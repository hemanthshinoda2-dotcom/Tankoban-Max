#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'browser-build0');
const outPath = path.join(outDir, 'manual_parity_checklist.md');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const iso = new Date().toISOString();
const lines = [
  '# Browser Parity Manual Checklist',
  '',
  `Generated: ${iso}`,
  '',
  'Mark each item after manual verification in Butterfly Sources mode.',
  '',
  '## Surface + Navigation',
  '- [ ] Sources initial page renders without blank viewport.',
  '- [ ] URL navigation works (enter URL/search).',
  '- [ ] Back / Forward / Reload / Stop work for active tab.',
  '- [ ] Home tab toggle works and does not break overlay rendering.',
  '',
  '## Tab Lifecycle',
  '- [ ] New tab / close tab / reopen closed tab work.',
  '- [ ] Duplicate tab and tab switching remain stable under rapid use.',
  '- [ ] Popup (`window.open`) creates one tab only (no duplicates).',
  '',
  '## Context Menu',
  '- [ ] Link actions: open new tab, copy, save link, open external.',
  '- [ ] Image actions: open image tab, save image, copy image.',
  '- [ ] Inspect action is available and opens DevTools inspect flow.',
  '',
  '## Permissions',
  '- [ ] Permission prompt appears for geolocation/camera/mic.',
  '- [ ] Allow and deny both resolve correctly.',
  '- [ ] Remembered decision is honored on subsequent requests.',
  '',
  '## Downloads',
  '- [ ] Download starts and progress updates in home + panel views.',
  '- [ ] Completed download supports Open and Show in Folder.',
  '- [ ] Download history loads after app restart.',
  '- [ ] Clear-history keeps active downloads and removes completed ones.',
  '',
  '## Persistence + Stress',
  '- [ ] Session restore preserves Sources tabs/history/bookmarks state.',
  '- [ ] 20-tab open/close cycle does not blank viewport or desync tab state.',
  '- [ ] Rapid resize + mode churn does not hide active tab view.',
  '',
  '## Audit Commands',
  '- [ ] `npm run browser:nav:audit`',
  '- [ ] `npm run browser:tabs:audit`',
  '- [ ] `npm run browser:parity:contract`',
];

fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${path.relative(root, outPath)}`);
