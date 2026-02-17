// Tankoban Max - Phase 8 verifier
// Verifies Books release-readiness contracts that smoke_check.js does not fully cover.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  console.error(`PHASE8 FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function ensureFile(rel) {
  if (!exists(rel)) {
    fail(`Missing required file: ${rel}`);
    return false;
  }
  ok(`Exists: ${rel}`);
  return true;
}

function extractBooksChannels(ipcText) {
  // Only channels from CHANNEL object, not EVENT object.
  const channelBlockMatch = ipcText.match(/const CHANNEL\s*=\s*\{([\s\S]*?)^\};/m);
  const scope = channelBlockMatch ? channelBlockMatch[1] : ipcText;
  const out = [];
  const re = /\b(BOOKS(?:_[A-Z0-9]+)+)\s*:\s*'[^']+'/g;
  let hit;
  while ((hit = re.exec(scope)) !== null) out.push(hit[1]);
  return [...new Set(out)];
}

function extractObjectBlock(text, key) {
  const marker = `${key}: {`;
  const start = text.indexOf(marker);
  if (start < 0) return '';

  let i = text.indexOf('{', start);
  if (i < 0) return '';

  let depth = 0;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function assertBooksWiring() {
  const sharedPath = 'shared/ipc.js';
  const registerFiles = [
    'main/ipc/register/books.js',
    'main/ipc/register/books_progress.js',
    'main/ipc/register/books_settings.js',
    'main/ipc/register/books_ui_state.js',
    'main/ipc/register/books_bookmarks.js',
    'main/ipc/register/books_tts_edge.js',
  ];
  const preloadPath = 'preload/index.js';
  const gatewayPath = 'src/services/api_gateway.js';

  const shared = readText(sharedPath);
  const preload = readText(preloadPath);
  const gateway = readText(gatewayPath);
  const registerJoined = registerFiles.map(readText).join('\n');

  const channels = extractBooksChannels(shared);
  if (!channels.length) {
    fail('No BOOKS_* channels found in shared/ipc.js');
    return;
  }
  ok(`Found ${channels.length} BOOKS_* channel constants`);

  const missingRegister = [];
  const missingPreload = [];

  for (const ch of channels) {
    if (!registerJoined.includes(ch)) missingRegister.push(ch);
    if (!preload.includes(ch)) missingPreload.push(ch);
  }

  if (missingRegister.length) fail(`Missing register wiring for: ${missingRegister.join(', ')}`);
  else ok('All BOOKS_* channels are wired in main/ipc/register/*.js');

  if (missingPreload.length) fail(`Missing preload wiring for: ${missingPreload.join(', ')}`);
  else ok('All BOOKS_* channels are wired in preload/index.js');

  const gatewayContract = {
    books: [
      'getState',
      'onUpdated',
      'onScanStatus',
      'scan',
      'cancelScan',
      'setScanIgnore',
      'addRootFolder',
      'removeRootFolder',
      'addSeriesFolder',
      'removeSeriesFolder',
      'addFiles',
      'removeFile',
      'openFileDialog',
      'bookFromPath',
    ],
    booksProgress: ['getAll', 'get', 'save', 'clear', 'clearAll'],
    booksSettings: ['get', 'save', 'clear'],
    booksUi: ['get', 'save', 'clear'],
    booksBookmarks: ['get', 'save', 'delete', 'clear'],
    booksTtsEdge: ['probe', 'getVoices', 'synth'],
  };

  for (const ns of Object.keys(gatewayContract)) {
    const block = extractObjectBlock(gateway, ns);
    if (!block) {
      fail(`Missing gateway namespace: ${ns}`);
      continue;
    }
    ok(`Gateway namespace present: ${ns}`);
    for (const method of gatewayContract[ns]) {
      if (!new RegExp(`\\b${method}\\s*:`).test(block)) {
        fail(`Missing gateway method: ${ns}.${method}`);
      }
    }
  }
  ok('Gateway exposes required books/booksProgress/booksSettings/booksUi/booksBookmarks/booksTtsEdge methods');

  // Event bridge checks.
  for (const eventName of ['BOOKS_UPDATED', 'BOOKS_SCAN_STATUS']) {
    if (!shared.includes(eventName)) fail(`Missing event constant in shared/ipc.js: ${eventName}`);
    else ok(`Event constant present: ${eventName}`);
  }
  if (!preload.includes('onBooksUpdated') || !preload.includes('onBooksScanStatus')) {
    fail('Preload listeners missing for books update/scan status events');
  } else {
    ok('Preload listeners present for BOOKS_UPDATED and BOOKS_SCAN_STATUS');
  }
}

function assertPackaging() {
  const pkgPath = 'package.json';
  const pkg = JSON.parse(readText(pkgPath));
  const files = (pkg.build && Array.isArray(pkg.build.files)) ? pkg.build.files : [];
  const fileAssoc = (pkg.build && Array.isArray(pkg.build.fileAssociations)) ? pkg.build.fileAssociations : [];

  for (const rel of ['books_scan_worker.js', 'workers/**/*', 'main/**/*', 'src/**/*']) {
    if (!files.includes(rel)) fail(`package.json build.files missing: ${rel}`);
    else ok(`package.json build.files includes: ${rel}`);
  }

  const exts = new Set(fileAssoc.map(x => String(x && x.ext || '').toLowerCase()).filter(Boolean));
  for (const ext of ['epub', 'pdf', 'txt']) {
    if (!exts.has(ext)) fail(`package.json fileAssociations missing: .${ext}`);
    else ok(`package.json fileAssociations includes: .${ext}`);
  }
}

function assertDocs() {
  const golden = 'TESTING_GOLDEN_PATHS.md';
  const moved = 'docs/08_TESTING_AND_SMOKE.md';
  ensureFile(golden);
  ensureFile(moved);

  const goldenText = readText(golden);
  if (!goldenText.includes('docs/08_TESTING_AND_SMOKE.md')) {
    fail('TESTING_GOLDEN_PATHS.md does not point to docs/08_TESTING_AND_SMOKE.md');
  } else {
    ok('TESTING_GOLDEN_PATHS.md points to docs/08_TESTING_AND_SMOKE.md');
  }
}

function assertSmokeCoverage() {
  const smoke = readText('tools/smoke_check.js');
  if (!smoke.includes("checkFile('books_scan_worker.js'")) {
    fail("smoke_check.js missing books worker check: checkFile('books_scan_worker.js', ...)");
  } else {
    ok('smoke_check.js includes books_scan_worker.js check');
  }
  if (!smoke.includes("path.join(SRC, 'domains', 'books')")) {
    fail("smoke_check.js missing required folder check: src/domains/books");
  } else {
    ok('smoke_check.js includes src/domains/books required directory');
  }
}

function main() {
  for (const rel of [
    'shared/ipc.js',
    'preload/index.js',
    'src/services/api_gateway.js',
    'main/ipc/register/books.js',
    'main/ipc/register/books_progress.js',
    'main/ipc/register/books_settings.js',
    'main/ipc/register/books_ui_state.js',
    'main/ipc/register/books_bookmarks.js',
    'main/ipc/register/books_tts_edge.js',
    'tools/smoke_check.js',
    'package.json',
  ]) {
    ensureFile(rel);
  }

  assertSmokeCoverage();
  assertBooksWiring();
  assertPackaging();
  assertDocs();

  if (process.exitCode) {
    console.error('Phase 8 verify failed.');
    process.exit(process.exitCode);
  }
  console.log('Phase 8 verify passed.');
}

main();
