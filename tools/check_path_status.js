#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATUS_PATH = path.join(ROOT, 'docs', 'architecture', 'path-status.yaml');
const ALLOWED = new Set(['active', 'legacy', 'experimental', 'archive']);
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist']);

function parsePathStatusYaml(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line === 'paths:') continue;
    if (line.startsWith('- path:')) {
      if (current) rows.push(current);
      current = { path: line.slice('- path:'.length).trim(), status: '', owner: '' };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('status:')) current.status = line.slice('status:'.length).trim();
    else if (line.startsWith('owner:')) current.owner = line.slice('owner:'.length).trim();
  }
  if (current) rows.push(current);
  return rows;
}

function topLevelDirs() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => !EXCLUDED_DIRS.has(name));
}

function main() {
  if (!fs.existsSync(STATUS_PATH)) {
    console.error('PATH STATUS FAIL: missing docs/architecture/path-status.yaml');
    process.exit(1);
  }

  const rows = parsePathStatusYaml(fs.readFileSync(STATUS_PATH, 'utf8'));
  const byPath = new Map();
  const errors = [];

  for (const row of rows) {
    if (!row.path) {
      errors.push('empty path entry found');
      continue;
    }
    if (byPath.has(row.path)) {
      errors.push('duplicate path entry: ' + row.path);
      continue;
    }
    if (!ALLOWED.has(row.status)) {
      errors.push('invalid status for ' + row.path + ': ' + row.status);
    }
    if (!row.owner) {
      errors.push('missing owner for ' + row.path);
    }
    byPath.set(row.path, row);
  }

  const dirs = topLevelDirs();
  for (const dir of dirs) {
    if (!byPath.has(dir)) {
      errors.push('top-level directory missing classification: ' + dir);
    }
  }

  for (const row of rows) {
    const abs = path.join(ROOT, row.path);
    if (!fs.existsSync(abs)) {
      errors.push('classified path does not exist: ' + row.path);
    }
  }

  if (errors.length) {
    console.error('PATH STATUS FAIL (' + errors.length + ' issue(s))');
    for (const err of errors) console.error(' - ' + err);
    process.exit(1);
  }

  console.log('PATH STATUS OK: ' + rows.length + ' classified paths');
}

main();
