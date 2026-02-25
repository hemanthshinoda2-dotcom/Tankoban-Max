#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const navPath = path.join(__dirname, '..', 'src', 'domains', 'web', 'web_module_nav_omnibox.js');
const webPath = path.join(__dirname, '..', 'src', 'domains', 'web', 'web.js');
const nav = fs.readFileSync(navPath, 'utf8');
const web = fs.readFileSync(webPath, 'utf8');

const checks = [
  ['Input resolver present', nav.includes('function resolveInput(raw)')],
  ['Search engine map present', nav.includes('var SEARCH_ENGINES =')],
  ['Omnibox dropdown rendering', nav.includes('function renderOmniDropdown()')],
  ['Ghost text support', nav.includes('function updateOmniGhostText()')],
  ['Ctrl+Enter URL helper', nav.includes('function tryCtrlEnterUrl(input)')],
  ['Navigation emits webview intent', nav.includes("bridge.emit('view:webview'")],
  ['New-tab navigation path', nav.includes('o.newTab') && nav.includes('createTab')],
  ['Back/forward/reload button bindings', nav.includes('el.btnBack') && nav.includes('el.btnForward') && nav.includes('el.btnReload')],
  ['Web entry has host-gated V2 path', web.includes('isBrowserUxV2Enabled()') && web.includes('host.openDefault')]
];

let pass = 0;
console.log('Browser omnibox audit (redesign)');
console.log('-------------------------------');
for (const [label, ok] of checks) {
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
}
console.log(`\nScore: ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
