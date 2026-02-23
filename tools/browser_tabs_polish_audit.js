#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const webJsPath = path.join(__dirname, '..', 'src', 'domains', 'web', 'web.js');
const cssPath = path.join(__dirname, '..', 'src', 'styles', 'web-browser.css');

const webJs = fs.readFileSync(webJsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const checks = [
  ['Active tab auto-scroll in strip', webJs.includes('function ensureActiveTabVisibleInStrip()') && webJs.includes('ensureActiveTabVisibleInStrip();')],
  ['Tab density class scaling', webJs.includes('function applyTabDensityClass()') && css.includes('.webBrowserView.webTabsDense')],
  ['Split drop insert marker (before/after)', webJs.includes("dragBefore") && webJs.includes("dragAfter") && css.includes('.webTab.dragBefore::before')],
  ['Half-edge drop insertion logic', webJs.includes('dropBefore ? toIdx : (toIdx + 1)')],
  ['Tab tooltip includes URL', webJs.includes("tabTooltip += '\\n' + String(t.url)")],
  ['Accessible new tab button label', webJs.includes('aria-label="New tab"')],
  ['Close button visible on active tab', css.includes('.webTab.active .webTabClose')],
  ['Smooth tab-strip scroll behavior', css.includes('scroll-behavior: smooth;')]
];

let pass = 0;
console.log('Browser tabs polish audit (Build 6)');
console.log('----------------------------------');
for (const [label, ok] of checks) {
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
}
console.log(`\nScore: ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
