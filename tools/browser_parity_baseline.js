#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const outDir = path.join(root, 'docs', 'browser-build0');
const outPath = path.join(outDir, 'generated_baseline_report.md');

const files = [
  'src/domains/web/web.js',
  'src/domains/web/web_module_hub.js',
  'src/domains/web/web_module_tabs_state.js',
  'src/domains/web/web_module_nav_omnibox.js',
  'src/domains/web/web_module_downloads.js',
  'preload/namespaces/web.js',
  'main/index.js',
  'main/domains/webSources/index.js'
];

const probes = [
  ['ctrl_shift_t_reopen', 'src/domains/web/web.js', /ctrl && e\.shiftKey && lower === 't'/i],
  ['reload_stop_toggle', 'src/domains/web/web.js', /syncReloadStopButton\s*\(/i],
  ['long_press_back_forward_history', 'src/domains/web/web.js', /addNavLongPressHandler\s*\(/i],
  ['pinned_tabs', 'src/domains/web/web.js', /function\s+pinTab\s*\(/i],
  ['omnibox_scheme_sanitization', 'src/domains/web/web.js', /never pass through arbitrary schemes/i],
  ['omnibox_inline_autocomplete', 'src/domains/web/web.js', /Inline autocomplete ghost text/i],
  ['download_progress_listener_preload', 'preload/namespaces/web.js', /WEB_DOWNLOAD_PROGRESS/i],
  ['download_progress_listener_renderer', 'src/domains/web/web.js', /onDownloadProgress\s*\(/i],
  ['clear_download_history_backend_call', 'src/domains/web/web.js', /api\.webSources\.clearDownloadHistory\(/i],
  ['webview_crash_detection', 'src/domains/web/web.js', /render-process-gone/i],
  ['webview_fail_load_handler', 'src/domains/web/web.js', /did-fail-load/i],
  ['main_permission_request_handler', 'main/index.js', /setPermissionRequestHandler\s*\(/i],
  ['main_permission_check_handler', 'main/index.js', /setPermissionCheckHandler\s*\(/i],
  ['main_navigation_filter_will_navigate', 'main/index.js', /will-navigate/i],
  ['main_navigation_filter_will_redirect', 'main/index.js', /will-redirect/i],
];

function read(rel) { return fs.readFileSync(path.join(root, rel)); }
function info(rel) {
  const b = read(rel);
  return {
    file: rel,
    lines: b.toString('utf8').split(/\r?\n/).length,
    bytes: b.length,
    sha: crypto.createHash('sha256').update(b).digest('hex').slice(0, 16),
  };
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const rows = files.filter(rel => fs.existsSync(path.join(root, rel))).map(info);
const probeRows = probes.map(([name, rel, rx]) => {
  let found = false;
  try { found = rx.test(read(rel).toString('utf8')); } catch (e) {}
  return { name, found };
});

const lines = [
  '# Browser Build 0 Baseline Report (Generated)',
  '',
  `Date: ${new Date().toISOString().slice(0, 10)}`,
  '',
  '## Core browser-related files (snapshot)',
  '',
  'File | Lines | Bytes | SHA-256 (first 16)',
  '--- | ---: | ---: | ---',
];
for (const r of rows) lines.push(`${r.file} | ${r.lines} | ${r.bytes} | \`${r.sha}\``);
lines.push('');
lines.push('## Code probe summary');
lines.push('');
for (const p of probeRows) lines.push(`- \`${p.name}\`: ${p.found ? 'found' : 'not found'}`);
lines.push('');

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${path.relative(root, outPath)}`);
