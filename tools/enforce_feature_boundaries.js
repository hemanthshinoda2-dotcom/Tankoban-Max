// Enforce package feature boundaries.
// Rules:
// 1) files under runtime/electron_legacy/packages/feature-* cannot import another runtime/electron_legacy/packages/feature-* internals.
// 2) files under runtime/electron_legacy/apps/* cannot import src/main/preload internals directly; they must use runtime/electron_legacy/packages/core-main launch entry.
//
// Usage:
//   node tools/enforce_feature_boundaries.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'runtime', 'electron_legacy', 'packages');
const APPS_DIR = path.join(ROOT, 'runtime', 'electron_legacy', 'apps');
const RENDERER_DOMAINS_DIR = path.join(ROOT, 'src', 'domains');
const MAIN_DOMAINS_DIR = path.join(ROOT, 'runtime', 'electron_legacy', 'main', 'domains');
const PATH_STATUS_FILE = path.join(ROOT, 'docs', 'architecture', 'path-status.yaml');
const LEGACY_ALLOWED_CROSS_DOMAIN_IMPORTS = new Set([]);

function walkJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.js')) continue;
      out.push(full);
    }
  }
  return out;
}

function extractImportLikeSpecifiers(text) {
  const out = [];
  const reImport = /import\s+[^'"]*['"]([^'"]+)['"]/g;
  const reRequire = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reImport.exec(text)) !== null) out.push(m[1]);
  while ((m = reRequire.exec(text)) !== null) out.push(m[1]);
  return out;
}

function featureNameFromPath(filePath) {
  const rel = path.relative(PACKAGES_DIR, filePath).replace(/\\/g, '/');
  const first = rel.split('/')[0] || '';
  return first.startsWith('feature-') ? first : '';
}

function listFeaturePackages() {
  if (!fs.existsSync(PACKAGES_DIR)) return [];
  return fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('feature-'))
    .map((e) => e.name)
    .sort();
}

function resolveImportAbsolute(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, spec);
  // We only need directory-level matching, so resolve directly.
  return base;
}

function topFeatureFromRendererDomain(relPath) {
  const top = String((relPath.split('/')[0] || '')).toLowerCase();
  if (!top) return '';
  if (top === 'reader' || top === 'library') return 'comics';
  if (top === 'books') return 'books';
  if (top === 'video') return 'video';
  if (top === 'web' || top === 'browser_host') return 'browser_torrent';
  if (top === 'shell' || top === 'state' || top === 'services' || top === 'ui') return '';
  return top;
}

function topFeatureFromMainDomain(relPath) {
  const top = String((relPath.split('/')[0] || '')).toLowerCase();
  if (!top) return '';
  if (top.startsWith('books')) return 'books';
  if (top.startsWith('video') || top === 'holyGrail' || top === 'player_core') return 'video';
  if (top.startsWith('web') || top === 'torrentSearch' || top === 'torProxy') return 'browser_torrent';
  if (top === 'library' || top === 'comic' || top === 'archives') return 'comics';
  if (top.startsWith('audiobook')) return 'audiobook';
  return '';
}

function main() {
  const errors = [];
  const features = listFeaturePackages();
  const featureSet = new Set(features);

  // Rule 1: feature package isolation
  const packageFiles = walkJsFiles(PACKAGES_DIR);
  for (const filePath of packageFiles) {
    const ownerFeature = featureNameFromPath(filePath);
    if (!ownerFeature) continue;

    const src = fs.readFileSync(filePath, 'utf8');
    const specs = extractImportLikeSpecifiers(src);
    for (const spec of specs) {
      if (spec.includes('runtime/electron_legacy/packages/feature-')) {
        const hit = spec.match(/packages\/(feature-[a-z0-9-]+)/i);
        if (hit && hit[1] && hit[1] !== ownerFeature) {
          errors.push(`${path.relative(ROOT, filePath)} imports cross-feature path ${spec}`);
        }
      }

      const resolved = resolveImportAbsolute(filePath, spec);
      if (!resolved) continue;
      const relFromPackages = path.relative(PACKAGES_DIR, resolved).replace(/\\/g, '/');
      const top = relFromPackages.split('/')[0] || '';
      if (featureSet.has(top) && top !== ownerFeature) {
        errors.push(`${path.relative(ROOT, filePath)} imports ${spec} -> ${top} (cross-feature internal import)`);
      }
    }
  }

  // Rule 2: app entrypoint boundaries
  const appFiles = walkJsFiles(APPS_DIR);
  for (const filePath of appFiles) {
    const src = fs.readFileSync(filePath, 'utf8');
    const specs = extractImportLikeSpecifiers(src);
    for (const spec of specs) {
      const bad =
        spec.includes('/src/') ||
        spec.includes('/runtime/electron_legacy/main/') ||
        spec.includes('/runtime/electron_legacy/preload/') ||
        spec.startsWith('../src') ||
        spec.startsWith('../main') ||
        spec.startsWith('../preload');
      if (bad) {
        errors.push(`${path.relative(ROOT, filePath)} imports forbidden runtime path ${spec}`);
      }
    }
  }

  // Rule 3: renderer feature domains should not import unrelated feature internals
  const rendererDomainFiles = walkJsFiles(RENDERER_DOMAINS_DIR);
  for (const filePath of rendererDomainFiles) {
    const rel = path.relative(RENDERER_DOMAINS_DIR, filePath).replace(/\\/g, '/');
    const owner = topFeatureFromRendererDomain(rel);
    if (!owner) continue;
    const src = fs.readFileSync(filePath, 'utf8');
    const specs = extractImportLikeSpecifiers(src);
    for (const spec of specs) {
      const resolved = resolveImportAbsolute(filePath, spec);
      if (!resolved) continue;
      if (!resolved.startsWith(RENDERER_DOMAINS_DIR)) continue;
      const depRel = path.relative(RENDERER_DOMAINS_DIR, resolved).replace(/\\/g, '/');
      const depOwner = topFeatureFromRendererDomain(depRel);
      if (!depOwner || depOwner === owner) continue;
      errors.push(`${path.relative(ROOT, filePath)} imports renderer domain ${spec} -> ${depRel} (${owner} -> ${depOwner})`);
    }
  }

  // Rule 4: main feature domains should not import unrelated feature internals
  const mainDomainFiles = walkJsFiles(MAIN_DOMAINS_DIR);
  for (const filePath of mainDomainFiles) {
    const rel = path.relative(MAIN_DOMAINS_DIR, filePath).replace(/\\/g, '/');
    const owner = topFeatureFromMainDomain(rel);
    if (!owner) continue;
    const src = fs.readFileSync(filePath, 'utf8');
    const specs = extractImportLikeSpecifiers(src);
    for (const spec of specs) {
      const resolved = resolveImportAbsolute(filePath, spec);
      if (!resolved) continue;
      if (!resolved.startsWith(MAIN_DOMAINS_DIR)) continue;
      const depRel = path.relative(MAIN_DOMAINS_DIR, resolved).replace(/\\/g, '/');
      const depOwner = topFeatureFromMainDomain(depRel);
      if (!depOwner || depOwner === owner) continue;
      const legacyKey = `${path.relative(ROOT, filePath).replace(/\\/g, '/')}->${spec}`;
      if (LEGACY_ALLOWED_CROSS_DOMAIN_IMPORTS.has(legacyKey)) continue;
      errors.push(`${path.relative(ROOT, filePath)} imports main domain ${spec} -> ${depRel} (${owner} -> ${depOwner})`);
    }
  }

  // Rule 5: path status contract must exist
  if (!fs.existsSync(PATH_STATUS_FILE)) {
    errors.push('missing path status contract docs/architecture/path-status.yaml');
  }

  if (errors.length) {
    console.error(`Boundary check failed (${errors.length} issue(s))`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(`Boundary check passed (${features.length} feature package(s), ${appFiles.length} app file(s)).`);
}

main();

