#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const webJsPath = path.join(__dirname, '..', 'src', 'domains', 'web', 'web.js');
const text = fs.readFileSync(webJsPath, 'utf8');
const checks = [
  ['Ctrl+1..9 tab switching', 'switchToTabByChromeIndex('],
  ['Ctrl+PageUp/PageDown', "key === 'PageUp' || key === 'PageDown'"],
  ['Alt+Home', "key === 'Home'"],
  ['Tab-strip double click', 'double-click empty tab strip space opens a new tab'],
  ['New-tab button middle click', "addBtn.addEventListener('auxclick'"]
];
let pass = 0;
console.log('Browser navigation shortcut audit (Build 2)');
console.log('-------------------------------------------');
for (const [label, needle] of checks) {
  const ok = text.includes(needle);
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
}
console.log(`\nScore: ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
