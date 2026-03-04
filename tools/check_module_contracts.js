#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'docs', 'architecture', 'module-index.yaml');
const ALLOWED = new Set(['active', 'legacy', 'experimental', 'archive']);

function readModuleIndex() {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error('missing docs/architecture/module-index.yaml');
  }
  const raw = fs.readFileSync(INDEX_PATH, 'utf8').trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('module-index.yaml must be JSON-compatible YAML: ' + err.message);
  }
  if (!parsed || !Array.isArray(parsed.modules)) {
    throw new Error('module-index.yaml missing "modules" array');
  }
  return parsed.modules;
}

function hasReadmeNear(entrypoint) {
  let dir = path.dirname(path.join(ROOT, entrypoint));
  const stop = ROOT;
  while (dir.startsWith(stop)) {
    const readme = path.join(dir, 'README.md');
    if (fs.existsSync(readme)) return true;
    if (dir === stop) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

function main() {
  const modules = readModuleIndex();
  const errors = [];
  const seen = new Set();

  for (const mod of modules) {
    const id = String(mod.module_id || '').trim();
    const entrypoint = String(mod.entrypoint || '').trim().replace(/\\/g, '/');
    const owner = String(mod.owner || '').trim();
    const status = String(mod.status || '').trim();
    const api = Array.isArray(mod.public_api) ? mod.public_api : [];

    if (!id) {
      errors.push('module with missing module_id');
      continue;
    }
    if (seen.has(id)) {
      errors.push('duplicate module_id: ' + id);
      continue;
    }
    seen.add(id);

    if (!entrypoint) errors.push(id + ': missing entrypoint');
    if (!owner) errors.push(id + ': missing owner');
    if (!ALLOWED.has(status)) errors.push(id + ': invalid status ' + status);
    if (!api.length) errors.push(id + ': public_api must be non-empty array');

    if (entrypoint) {
      const abs = path.join(ROOT, entrypoint);
      if (!fs.existsSync(abs)) {
        errors.push(id + ': entrypoint does not exist -> ' + entrypoint);
      }
      if (status === 'active' && !hasReadmeNear(entrypoint)) {
        errors.push(id + ': no README.md found for active module near ' + entrypoint);
      }
    }
  }

  if (errors.length) {
    console.error('MODULE CONTRACTS FAIL (' + errors.length + ' issue(s))');
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }

  console.log('MODULE CONTRACTS OK: ' + modules.length + ' modules');
}

main();
