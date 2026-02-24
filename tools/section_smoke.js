// Section smoke checks: fast deterministic checks without launching Electron.
// Usage:
//   node tools/section_smoke.js --section=video
//   node tools/section_smoke.js --all

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { SECTIONS } = require('./section_definitions');

const ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { section: '', all: false };
  for (const a of args) {
    if (a === '--all') out.all = true;
    else if (a.startsWith('--section=')) out.section = String(a.slice('--section='.length) || '').trim().toLowerCase();
    else if (!a.startsWith('--') && !out.section) out.section = String(a).trim().toLowerCase();
  }
  return out;
}

function fail(msg) {
  console.error(`SECTION SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function parseJs(rel) {
  const abs = path.join(ROOT, rel);
  const code = fs.readFileSync(abs, 'utf8');
  new vm.Script(code, { filename: rel });
}

function checkStartScript(scriptName) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const scripts = (pkg && pkg.scripts) || {};
  if (!scripts[scriptName]) {
    fail(`package.json scripts is missing ${scriptName}`);
    return;
  }
  ok(`package script present: ${scriptName}`);
}

function checkSection(name, def) {
  ok(`--- Section: ${name} ---`);
  checkStartScript(def.startScript);

  if (!exists(def.appEntry)) fail(`missing app entry ${def.appEntry}`);
  else ok(`exists: ${def.appEntry}`);

  if (!exists(def.featurePackage)) fail(`missing feature package ${def.featurePackage}`);
  else ok(`exists: ${def.featurePackage}`);

  for (const rel of def.fixtures || []) {
    if (!exists(rel)) fail(`missing fixture path ${rel}`);
    else ok(`exists: ${rel}`);
  }

  for (const rel of def.keyFiles || []) {
    if (!exists(rel)) {
      fail(`missing key file ${rel}`);
      continue;
    }
    ok(`exists: ${rel}`);
    if (rel.endsWith('.js')) {
      try {
        parseJs(rel);
        ok(`parse: ${rel}`);
      } catch (err) {
        fail(`parse error in ${rel}: ${err.message}`);
      }
    }
  }
}

function main() {
  const args = parseArgs();
  const sectionNames = Object.keys(SECTIONS);

  if (!args.all && !args.section) {
    console.error(`Usage: node tools/section_smoke.js --section=<${sectionNames.join('|')}> | --all`);
    process.exit(1);
  }

  const targets = args.all ? sectionNames : [args.section];
  for (const section of targets) {
    const def = SECTIONS[section];
    if (!def) {
      fail(`unknown section '${section}'`);
      continue;
    }
    checkSection(section, def);
  }

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`Section smoke passed (${targets.length} section(s)).`);
}

main();

