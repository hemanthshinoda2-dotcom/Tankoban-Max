#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const webJsPath = path.join(__dirname, '..', 'src', 'domains', 'web', 'web.js');
const hostPath = path.join(__dirname, '..', 'src', 'domains', 'browser_host', 'host_runtime.js');
const text = fs.readFileSync(webJsPath, 'utf8');
const host = fs.readFileSync(hostPath, 'utf8');

const checks = [
  ['Ctrl+T new tab shortcut', text.includes("key === 't'") && text.includes('openNewTab()')],
  ['Ctrl+W close tab shortcut', text.includes("key === 'w'") && text.includes('tabsState.closeTab')],
  ['Ctrl+L focus url bar', text.includes("key === 'l'") && text.includes('el.urlBar.focus()')],
  ['Ctrl+F find shortcut', text.includes("key === 'f'") && text.includes('find.openFind')],
  ['Ctrl+H routes to home history', text.includes("key === 'h'") && text.includes("openHome({ section: 'history' })")],
  ['Ctrl+J routes to home downloads', text.includes("key === 'j'") && text.includes("openHome({ section: 'downloads' })")],
  ['Ctrl+B routes to home bookmarks', text.includes("key === 'b'") && text.includes("openHome({ section: 'bookmarks' })")],
  ['Ctrl+Shift+T Tor toggle', text.includes("key === 'T'") && text.includes('panels.toggleTor')],
  ['Active-surface keyboard gate present', text.includes('isAspectSurfaceOwnerActive()')],
  ['Host exposes fallback state for shortcut gate', host.includes('fallbackActive')]
];

let pass = 0;
console.log('Browser navigation shortcut audit (redesign)');
console.log('--------------------------------------------');
for (const [label, ok] of checks) {
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
}
console.log(`\nScore: ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
