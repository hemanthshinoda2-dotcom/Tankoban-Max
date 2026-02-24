// Change-impact mapping helper.
// - Maps changed files to recommended checks.
// - Can optionally run those checks.
//
// Usage:
//   node tools/impact_map.js
//   node tools/impact_map.js --base=origin/master
//   node tools/impact_map.js --staged
//   node tools/impact_map.js --run

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RULES_PATH = path.join(ROOT, 'tools', 'impact_map.rules.json');

function parseArgs() {
  const out = {
    base: '',
    staged: false,
    run: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--staged') out.staged = true;
    else if (arg === '--run') out.run = true;
    else if (arg.startsWith('--base=')) out.base = String(arg.slice('--base='.length) || '').trim();
  }
  return out;
}

function runGit(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
  }
  return String(res.stdout || '');
}

function getChangedFiles(opts) {
  let output = '';
  if (opts.staged) {
    output = runGit(['diff', '--name-only', '--cached']);
  } else if (opts.base) {
    output = runGit(['diff', '--name-only', `${opts.base}...HEAD`]);
  } else {
    output = runGit(['diff', '--name-only']);
  }
  return output.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/');
}

function matchesPattern(file, pattern) {
  const f = normalizePath(file);
  const p = normalizePath(pattern);
  if (p.endsWith('/**')) {
    const prefix = p.slice(0, -3);
    return f === prefix || f.startsWith(prefix + '/');
  }
  if (p.includes('*')) {
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(`^${escaped}$`);
    return re.test(f);
  }
  return f === p;
}

function loadRules() {
  const raw = fs.readFileSync(RULES_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.rules) ? parsed.rules : [];
}

function mapImpacts(files, rules) {
  const matchedRules = [];
  const commandSet = new Set();

  for (const rule of rules) {
    const paths = Array.isArray(rule.paths) ? rule.paths : [];
    const hits = files.filter((f) => paths.some((p) => matchesPattern(f, p)));
    if (!hits.length) continue;

    matchedRules.push({
      name: String(rule.name || 'Unnamed Rule'),
      hits,
      commands: Array.isArray(rule.commands) ? rule.commands : [],
    });
    for (const cmd of (rule.commands || [])) commandSet.add(String(cmd));
  }

  return {
    matchedRules,
    commands: Array.from(commandSet),
  };
}

function runCommand(cmd) {
  console.log(`[impact-run] ${cmd}`);
  const res = spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    stdio: 'inherit',
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '' }),
  });
  if (res.status !== 0) {
    throw new Error(`failed: ${cmd}`);
  }
}

function main() {
  const opts = parseArgs();
  const files = getChangedFiles(opts);
  const rules = loadRules();
  const impact = mapImpacts(files, rules);

  console.log('Changed files:');
  if (!files.length) console.log('  (none)');
  for (const f of files) console.log(`  - ${f}`);

  console.log('\nMatched impact rules:');
  if (!impact.matchedRules.length) console.log('  (none)');
  for (const rule of impact.matchedRules) {
    console.log(`  - ${rule.name}`);
    for (const hit of rule.hits) console.log(`      * ${hit}`);
  }

  console.log('\nRecommended checks:');
  if (!impact.commands.length) console.log('  (none)');
  for (const cmd of impact.commands) console.log(`  - ${cmd}`);

  if (!opts.run || !impact.commands.length) return;

  console.log('\nRunning recommended checks...');
  for (const cmd of impact.commands) runCommand(cmd);
}

main();

