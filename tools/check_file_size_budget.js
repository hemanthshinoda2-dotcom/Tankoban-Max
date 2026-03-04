#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const WARN_RATIO = 0.75;
const TRANSITION_EXEMPT = new Set([
  'src/domains/books/library.js',
  'src/domains/books/listening_player.js',
  'src/domains/books/reader/engine_foliate.js',
  'src/domains/books/reader/tts_core.js',
  'src/domains/books/reader/tts_engine_edge_direct.js',
  'src/domains/browser_host/aspect_embed/renderer.js',
  'src/domains/library/library.js',
  'src/domains/reader/mega_settings.js',
  'src/domains/reader/render_two_page.js',
  'src/domains/reader/state_machine.js',
  'src/domains/reader/volume_nav_overlay.js',
  'src/domains/shell/core.js',
  'src/domains/shell/shell_bindings.js',
  'src/domains/video/video.js',
  'src/domains/web/web.js',
  'src/domains/web/web_module_torrent_tab.js',
]);
const RULES = [
  {
    id: 'renderer-domain-js',
    globPrefix: 'src/domains/',
    ext: '.js',
    maxLines: 1200,
    ignore: new Set(['src/domains/web/index.js', 'src/domains/video/index.js', 'src/domains/books/index.js', 'src/domains/shell/index.js'])
  },
  {
    id: 'qt-bridge-python',
    globPrefix: 'projectbutterfly/bridges/',
    ext: '.py',
    maxLines: 900,
    ignore: new Set(['projectbutterfly/bridges/_legacy_bridge_impl.py'])
  }
];

function walk(rel, out) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '__pycache__') continue;
    const childRel = path.join(rel, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) {
      walk(childRel, out);
    } else {
      out.push(childRel);
    }
  }
}

function countLines(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return text.split(/\r?\n/).length;
}

function main() {
  const all = [];
  walk('src/domains', all);
  walk('projectbutterfly/bridges', all);

  const errors = [];
  const warns = [];

  for (const rule of RULES) {
    for (const rel of all) {
      if (!rel.startsWith(rule.globPrefix)) continue;
      if (path.extname(rel).toLowerCase() !== rule.ext) continue;
      if (rule.ignore.has(rel)) continue;

      const lines = countLines(rel);
      const warnAt = Math.floor(rule.maxLines * WARN_RATIO);
      if (lines > rule.maxLines) {
        if (TRANSITION_EXEMPT.has(rel)) {
          warns.push(`${rule.id}: ${rel} has ${lines} lines (max ${rule.maxLines}) [TRANSITION EXEMPT]`);
        } else {
          errors.push(`${rule.id}: ${rel} has ${lines} lines (max ${rule.maxLines})`);
        }
      } else if (lines >= warnAt) {
        warns.push(`${rule.id}: ${rel} has ${lines} lines (warn at ${warnAt})`);
      }
    }
  }

  for (const w of warns) {
    console.log('WARN ' + w);
  }

  if (errors.length) {
    console.error('FILE SIZE BUDGET FAIL (' + errors.length + ' issue(s))');
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }

  console.log('FILE SIZE BUDGET OK');
}

main();
