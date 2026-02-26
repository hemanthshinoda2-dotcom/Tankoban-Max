// Per-section test harness runner.
// Usage:
//   node tools/section_test_harness.js --section=browser
//   node tools/section_test_harness.js --all
//
// This harness is intentionally pragmatic:
// - Always runs deterministic section smoke.
// - Runs additional checks when they are stable for that section.

const path = require('path');
const { spawnSync } = require('child_process');
const { SECTIONS } = require('./section_definitions');

const ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { section: '', all: false, extended: false, baselineOut: '' };
  for (const a of args) {
    if (a === '--all') out.all = true;
    else if (a === '--extended') out.extended = true;
    else if (a.startsWith('--baseline-out=')) out.baselineOut = String(a.slice('--baseline-out='.length) || '').trim();
    else if (a.startsWith('--section=')) out.section = String(a.slice('--section='.length) || '').trim().toLowerCase();
    else if (!a.startsWith('--') && !out.section) out.section = String(a).trim().toLowerCase();
  }
  return out;
}

function run(command, args) {
  const pretty = `${command} ${args.join(' ')}`.trim();
  console.log(`[harness] ${pretty}`);
  const res = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '' }),
  });
  if (res.status !== 0) throw new Error(`command failed: ${pretty}`);
}

function runSection(section, opts) {
  const smokeArgs = ['tools/section_smoke.js', `--section=${section}`];
  if (opts.baselineOut) {
    const baselineFile = opts.all
      ? opts.baselineOut
      : opts.baselineOut.replace(/\.json$/i, `.${section}.json`);
    smokeArgs.push(`--baseline-out=${baselineFile}`);
  }
  run('node', smokeArgs);

  if (!opts.extended) return;

  // Extended checks are opt-in because some historical scripts are stricter
  // than the current docs/layout and may be intentionally out of date.
  if (section === 'browser') {
    run('node', ['tools/browser_nav_shortcut_audit.js']);
    run('node', ['tools/browser_tabs_polish_audit.js']);
  } else if (section === 'book' || section === 'audiobook') {
    run('node', ['tools/books_phase8_verify.js']);
  } else if (section === 'video') {
    run('node', ['tools/validate_player_artifacts.js']);
  }
}

function main() {
  const args = parseArgs();
  const sections = Object.keys(SECTIONS);

  if (!args.all && !args.section) {
    console.error(`Usage: node tools/section_test_harness.js --section=<${sections.join('|')}> | --all [--extended] [--baseline-out=path.json]`);
    process.exit(1);
  }

  const targets = args.all ? sections : [args.section];
  for (const section of targets) {
    if (!SECTIONS[section]) {
      console.error(`Unknown section: ${section}`);
      process.exit(1);
    }
    runSection(section, args);
  }
  console.log(`Section harness passed (${targets.length} section(s)).`);
}

main();
