#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DOC_ROOTS = [
  'README.md',
  'agents.md',
  'docs',
];

function isIgnoredRef(ref) {
  if (!ref) return true;
  if (ref.startsWith('http://') || ref.startsWith('https://')) return true;
  if (ref.startsWith('mailto:')) return true;
  if (ref.startsWith('#')) return true;
  if (ref.includes('*')) return true;
  if (/^[a-zA-Z]:\\/.test(ref)) return true;
  if (ref.startsWith('file://')) return true;
  return false;
}

function normalizeRef(ref) {
  let clean = String(ref).trim();
  clean = clean.replace(/\\/g, '/');
  clean = clean.split('#')[0];
  clean = clean.split('?')[0];
  if (clean.startsWith('./')) clean = clean.slice(2);
  if (clean.startsWith('/')) clean = clean.slice(1);
  return clean;
}

function collectMarkdownFiles(repoRoot) {
  const out = [];
  function walk(abs) {
    const st = fs.statSync(abs);
    if (st.isFile()) {
      if (abs.toLowerCase().endsWith('.md')) out.push(abs);
      return;
    }
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.isDirectory() && (entry.name === 'history' || entry.name === 'archive')) continue;
      walk(path.join(abs, entry.name));
    }
  }
  for (const rootRel of DOC_ROOTS) {
    const abs = path.join(repoRoot, rootRel);
    if (fs.existsSync(abs)) walk(abs);
  }
  return out;
}

function extractRefs(text) {
  const refs = [];
  const mdLinkRe = /\[[^\]]+\]\(([^)]+)\)/g;
  const codeRe = /`([^`]+)`/g;
  let m;
  while ((m = mdLinkRe.exec(text)) !== null) refs.push(m[1]);
  while ((m = codeRe.exec(text)) !== null) {
    const token = m[1].trim();
    const firstToken = token.split(/\s+/)[0];
    if (
      firstToken.startsWith('docs/') ||
      firstToken.startsWith('src/') ||
      firstToken.startsWith('projectbutterfly/') ||
      firstToken.startsWith('runtime/') ||
      firstToken.startsWith('resources/') ||
      firstToken.startsWith('scripts/') ||
      firstToken.startsWith('tools/') ||
      firstToken.startsWith('qa/') ||
      firstToken.startsWith('contracts/') ||
      firstToken.startsWith('types/') ||
      firstToken.startsWith('player_qt/') ||
      firstToken.startsWith('archive/') ||
      firstToken.startsWith('experiments/') ||
      firstToken === 'main.js' ||
      firstToken === 'preload.js' ||
      firstToken === 'package.json'
    ) {
      refs.push(firstToken);
    }
  }
  return refs;
}

function checkDocsLinks(opts) {
  const repoRoot = opts.repoRoot;
  const files = collectMarkdownFiles(repoRoot);
  const errors = [];

  for (const file of files) {
    if (file.includes(path.join('docs', 'migration', 'baseline-'))) continue;
    const text = fs.readFileSync(file, 'utf8');
    const refs = extractRefs(text);
    for (const rawRef of refs) {
      if (isIgnoredRef(rawRef)) continue;
      const ref = normalizeRef(rawRef);
      if (!ref) continue;

      let abs = path.resolve(path.dirname(file), ref);
      if (!fs.existsSync(abs)) {
        abs = path.join(repoRoot, ref);
      }
      if (!fs.existsSync(abs)) {
        errors.push({
          file: path.relative(repoRoot, file).replace(/\\/g, '/'),
          ref,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const res = checkDocsLinks({ repoRoot });
  if (!res.ok) {
    console.error('DOC LINKS FAIL (' + res.errors.length + ' issue(s))');
    for (const err of res.errors) {
      console.error(' - ' + err.file + ' -> ' + err.ref);
    }
    process.exit(1);
  }
  console.log('DOC LINKS OK');
}

if (require.main === module) {
  main();
}

module.exports = { checkDocsLinks };
