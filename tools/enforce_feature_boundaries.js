// Enforce package feature boundaries.
// Rules:
// 1) files under packages/feature-* cannot import another packages/feature-* internals.
// 2) files under apps/* cannot import src/main/preload directly; they must use packages/core-main launch entry.
//
// Usage:
//   node tools/enforce_feature_boundaries.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');
const APPS_DIR = path.join(ROOT, 'apps');

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
      if (spec.includes('packages/feature-')) {
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
        spec.includes('/main/') ||
        spec.includes('/preload/') ||
        spec.startsWith('../src') ||
        spec.startsWith('../main') ||
        spec.startsWith('../preload');
      if (bad) {
        errors.push(`${path.relative(ROOT, filePath)} imports forbidden runtime path ${spec}`);
      }
    }
  }

  if (errors.length) {
    console.error(`Boundary check failed (${errors.length} issue(s))`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(`Boundary check passed (${features.length} feature package(s), ${appFiles.length} app file(s)).`);
}

main();

