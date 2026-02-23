#!/usr/bin/env node
/* Build 1 helper: scan browser debug logs for tab/state integrity warnings */
const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node tools/browser_stability_log_scan.js <logfile>');
}

const file = process.argv[2];
if (!file) {
  usage();
  process.exit(1);
}

const abs = path.resolve(process.cwd(), file);
if (!fs.existsSync(abs)) {
  console.error('[browser-stability-scan] File not found:', abs);
  process.exit(2);
}

const text = fs.readFileSync(abs, 'utf8');
const lines = text.split(/\r?\n/);
const patterns = [
  { key: 'web-tabs-warning', rx: /\[web-tabs\]/ },
  { key: 'diag-tabs', rx: /\[DIAG:tabs\]/ },
  { key: 'webview-crash', rx: /\b(crashed|render-process-gone|unresponsive)\b/i },
  { key: 'failed-open-tab', rx: /Failed to open tab/i },
  { key: 'ghost-tab-hint', rx: /ghost tab|orphan(ed)?/i }
];

const counts = Object.fromEntries(patterns.map(p => [p.key, 0]));
const hits = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const p of patterns) {
    if (p.rx.test(line)) {
      counts[p.key] += 1;
      if (hits.length < 80) hits.push({ line: i + 1, kind: p.key, text: line.trim().slice(0, 300) });
    }
  }
}

console.log('=== Browser Stability Log Scan (Build 1) ===');
console.log('File:', abs);
console.log('Total lines:', lines.length);
console.log('Counts:');
for (const p of patterns) console.log(`- ${p.key}: ${counts[p.key]}`);

if (!hits.length) {
  console.log('\nNo matching warnings/diagnostics found.');
  process.exit(0);
}

console.log('\nSample hits (up to 80):');
for (const h of hits) {
  console.log(`[${h.kind}] line ${h.line}: ${h.text}`);
}
