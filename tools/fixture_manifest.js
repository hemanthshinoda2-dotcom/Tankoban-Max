// Deterministic fixture manifest generator/verifier.
// Usage:
//   node tools/fixture_manifest.js --write
//   node tools/fixture_manifest.js --check

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'qa', 'fixtures');
const MANIFEST_PATH = path.join(FIXTURES_DIR, 'manifest.json');

function listFixtureFiles(baseDir) {
  const files = [];
  const stack = [baseDir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      if (rel === 'manifest.json') continue;
      if (rel.toLowerCase().endsWith('.md')) continue;
      files.push(rel);
    }
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function sha256For(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildManifest() {
  const createdAt = new Date().toISOString();
  const files = listFixtureFiles(FIXTURES_DIR).map((rel) => {
    const full = path.join(FIXTURES_DIR, rel);
    return {
      path: rel,
      sizeBytes: fs.statSync(full).size,
      sha256: sha256For(full),
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: createdAt,
    files,
  };
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function checkManifest() {
  const expected = readManifest();
  if (!expected) {
    console.error('FIXTURE MANIFEST FAIL: qa/fixtures/manifest.json is missing');
    process.exit(1);
  }

  const actual = buildManifest();
  const mapExpected = new Map((expected.files || []).map((f) => [String(f.path || ''), f]));
  const mapActual = new Map((actual.files || []).map((f) => [String(f.path || ''), f]));

  let failed = false;

  for (const [rel, e] of mapExpected.entries()) {
    const a = mapActual.get(rel);
    if (!a) {
      console.error(`FIXTURE MANIFEST FAIL: missing file from manifest set: ${rel}`);
      failed = true;
      continue;
    }
    if (String(e.sha256 || '') !== String(a.sha256 || '')) {
      console.error(`FIXTURE MANIFEST FAIL: sha mismatch for ${rel}`);
      failed = true;
    }
    if (Number(e.sizeBytes || 0) !== Number(a.sizeBytes || 0)) {
      console.error(`FIXTURE MANIFEST FAIL: size mismatch for ${rel}`);
      failed = true;
    }
  }

  for (const rel of mapActual.keys()) {
    if (!mapExpected.has(rel)) {
      console.error(`FIXTURE MANIFEST FAIL: untracked fixture file: ${rel}`);
      failed = true;
    }
  }

  if (failed) {
    console.error('Fixture manifest check failed. Run: node tools/fixture_manifest.js --write');
    process.exit(1);
  }

  console.log(`Fixture manifest check passed (${mapActual.size} files).`);
}

function writeManifest() {
  const manifest = buildManifest();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)} (${manifest.files.length} files).`);
}

function main() {
  const arg = (process.argv[2] || '--check').trim();
  if (arg === '--write') {
    writeManifest();
    return;
  }
  if (arg === '--check') {
    checkManifest();
    return;
  }
  console.error('Usage: node tools/fixture_manifest.js --write|--check');
  process.exit(1);
}

main();

