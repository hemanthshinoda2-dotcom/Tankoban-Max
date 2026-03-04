#!/usr/bin/env node
/*
  repo_map.js
  - Generates docs/architecture/repo-map.json using tracked files only.

  Usage:
    npm run map
*/

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'docs', 'architecture', 'repo-map.json');

const PURPOSE_HINTS = {
  'projectbutterfly/app.py': {
    purpose: 'Qt runtime entrypoint (canonical runtime).',
    danger: 'high',
  },
  'src/index.html': {
    purpose: 'Primary renderer HTML loaded by Qt shell.',
    danger: 'high',
  },
  'runtime/electron_legacy/main.js': {
    purpose: 'Legacy Electron entrypoint.',
    danger: 'medium',
  },
  'runtime/electron_legacy/shared/ipc.js': {
    purpose: 'Electron legacy IPC contract constants.',
    danger: 'high',
  },
  'main.js': {
    purpose: 'Root compatibility shim to legacy Electron runtime.',
    danger: 'low',
  },
  'preload.js': {
    purpose: 'Root compatibility shim to legacy preload.',
    danger: 'low',
  },
};

function listTrackedFiles() {
  const out = cp.execSync('git ls-files', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .filter((line) => !line.startsWith('node_modules/'));
}

function buildEntry(rel) {
  const hint = PURPOSE_HINTS[rel] || PURPOSE_HINTS[path.basename(rel)] || null;
  return {
    path: rel,
    purpose: hint ? hint.purpose : 'Project file.',
    danger: hint ? hint.danger : 'low',
  };
}

function main() {
  const files = listTrackedFiles().filter((rel) => rel !== 'repo_map.json').sort();
  const major = Object.keys(PURPOSE_HINTS).filter((rel) => files.includes(rel));
  const majorSet = new Set(major);
  const ordered = major.concat(files.filter((rel) => !majorSet.has(rel)));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'git ls-files',
    entries: ordered.map(buildEntry),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log('Wrote ' + path.relative(ROOT, OUT_PATH).replace(/\\/g, '/'));
}

main();
