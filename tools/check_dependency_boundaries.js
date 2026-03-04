#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RULES_PATH = path.join(ROOT, 'docs', 'architecture', 'dependency-boundaries.yaml');
const SCAN_ROOTS = ['src', 'projectbutterfly', 'runtime/electron_legacy'];
const FILE_EXTS = new Set(['.js', '.py']);

function readRules() {
  if (!fs.existsSync(RULES_PATH)) {
    throw new Error('missing docs/architecture/dependency-boundaries.yaml');
  }
  const raw = fs.readFileSync(RULES_PATH, 'utf8').trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('dependency-boundaries.yaml must be JSON-compatible YAML: ' + err.message);
  }
  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error('dependency-boundaries.yaml missing rules array');
  }
  return parsed.rules;
}

function walkFiles(rootRel, out) {
  const abs = path.join(ROOT, rootRel);
  if (!fs.existsSync(abs)) return;
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '__pycache__') continue;
    const rel = path.join(rootRel, e.name).replace(/\\/g, '/');
    const full = path.join(ROOT, rel);
    if (e.isDirectory()) {
      walkFiles(rel, out);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      if (FILE_EXTS.has(ext)) out.push(rel);
    }
  }
}

function normalizeRel(rel) {
  return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}

function resolveJsImport(sourceRel, ref) {
  if (!ref || ref.startsWith('http://') || ref.startsWith('https://')) return null;
  if (ref.startsWith('.')) {
    const baseDir = path.dirname(path.join(ROOT, sourceRel));
    let resolved = path.resolve(baseDir, ref);
    const candidates = [resolved, resolved + '.js', resolved + '.py', path.join(resolved, 'index.js')];
    for (const c of candidates) {
      if (fs.existsSync(c)) return normalizeRel(path.relative(ROOT, c));
    }
    return normalizeRel(path.relative(ROOT, resolved));
  }
  if (ref.startsWith('/')) return normalizeRel(ref.slice(1));
  if (ref.includes('/')) return normalizeRel(ref);
  return null;
}

function resolvePyImport(ref) {
  if (!ref) return null;
  const token = String(ref).trim();
  if (!token) return null;
  if (token.startsWith('runtime.') || token.startsWith('projectbutterfly.') || token.startsWith('src.') || token.startsWith('experiments.') || token.startsWith('archive.')) {
    return normalizeRel(token.replace(/\./g, '/') + '.py');
  }
  if (token === 'runtime' || token === 'projectbutterfly' || token === 'src' || token === 'experiments' || token === 'archive') {
    return normalizeRel(token + '/');
  }
  return null;
}

function extractDeps(sourceRel) {
  const abs = path.join(ROOT, sourceRel);
  const text = fs.readFileSync(abs, 'utf8');
  const deps = [];

  if (sourceRel.endsWith('.js')) {
    const re = /(?:import\s+[^'"\n]*from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const dep = resolveJsImport(sourceRel, m[1]);
      if (dep) deps.push(dep);
    }
  }

  if (sourceRel.endsWith('.py')) {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      let m = line.match(/^\s*from\s+([\w\.]+)\s+import\s+/);
      if (m) {
        const dep = resolvePyImport(m[1]);
        if (dep) deps.push(dep);
        continue;
      }
      m = line.match(/^\s*import\s+([\w\.]+)/);
      if (m) {
        const dep = resolvePyImport(m[1]);
        if (dep) deps.push(dep);
      }
    }
  }

  return deps;
}

function startsWithAny(value, prefixes) {
  return prefixes.some((p) => value.startsWith(p));
}

function main() {
  const rules = readRules();
  const files = [];
  for (const root of SCAN_ROOTS) walkFiles(root, files);

  const errors = [];
  for (const rel of files) {
    const deps = extractDeps(rel);
    if (!deps.length) continue;

    for (const rule of rules) {
      const srcPrefixes = Array.isArray(rule.source_prefixes) ? rule.source_prefixes : [];
      const blocked = Array.isArray(rule.disallow_prefixes) ? rule.disallow_prefixes : [];
      const excludes = new Set((rule.exclude_sources || []).map(normalizeRel));
      if (!srcPrefixes.length || !blocked.length) continue;
      if (!startsWithAny(rel, srcPrefixes)) continue;
      if (excludes.has(rel)) continue;

      for (const dep of deps) {
        if (startsWithAny(dep, blocked)) {
          errors.push(`${rule.id || 'rule'}: ${rel} -> ${dep}`);
        }
      }
    }
  }

  if (errors.length) {
    console.error('DEPENDENCY BOUNDARIES FAIL (' + errors.length + ' issue(s))');
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }

  console.log('DEPENDENCY BOUNDARIES OK');
}

main();
