#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const webJsPath = path.join(__dirname, '..', 'src', 'domains', 'web', 'web.js');
const tabsPath = path.join(__dirname, '..', 'src', 'domains', 'web', 'web_module_tabs_state.js');
const htmlPath = path.join(__dirname, '..', 'src', 'index.html');
const hostPath = path.join(__dirname, '..', 'src', 'domains', 'browser_host', 'host_runtime.js');
const modeRouterPath = path.join(__dirname, '..', 'src', 'state', 'mode_router.js');
const aspectMountPath = path.join(__dirname, '..', 'src', 'domains', 'browser_host', 'aspect_embed_mount.js');

const webJs = fs.readFileSync(webJsPath, 'utf8');
const tabs = fs.readFileSync(tabsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const hostJs = fs.readFileSync(hostPath, 'utf8');
const modeRouterJs = fs.readFileSync(modeRouterPath, 'utf8');
const aspectMountJs = fs.readFileSync(aspectMountPath, 'utf8');

const checks = [
  ['Sidebar tabs list exists', html.includes('id="wb-sidebar-tabs-list"')],
  ['Sidebar new-tab button exists', html.includes('id="wb-sidebar-new-tab"')],
  ['Sidebar bookmarks section exists', html.includes('id="wb-sidebar-bookmarks-list"')],
  ['Sidebar torrent button exists', html.includes('id="wb-sidebar-torrent-btn"')],
  ['Single active webview runtime', tabs.includes('activeRuntime') && tabs.includes('destroyActiveWebview')],
  ['Tabs change orchestration event', tabs.includes("bridge.emit('tabs:changed'")],
  ['View orchestration events', webJs.includes("emit('view:home'") && webJs.includes("emit('view:webview'") && webJs.includes("emit('view:torrent'")],
  ['Public API contract', webJs.includes('openDefault') && webJs.includes('openHome') && webJs.includes('openTorrentWorkspace') && webJs.includes('openBrowser')],
  ['Feature flag browserUxV2 exists', hostJs.includes('browserUxV2')],
  ['Runtime diagnostics API exists', hostJs.includes('getRuntimeState()') && hostJs.includes('reportRuntimeState(partial)')],
  ['Browser is a mode-router first-class mode', modeRouterJs.includes("new Set(['comics', 'videos', 'books', 'browser'])")],
  ['Aspect path does not force comics mode', !aspectMountJs.includes("setMode('comics'") && !aspectMountJs.includes("activate('comic'")]
];

let pass = 0;
console.log('Browser redesign static audit');
console.log('-----------------------------');
for (const [label, ok] of checks) {
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
}
console.log(`\nScore: ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
