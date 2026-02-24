// Verify canonical agent docs are in sync with docs/agent-map.source.md.
// Usage:
//   node tools/verify_agent_docs.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs', 'agent-map.source.md');
const TARGETS = [
  path.join(ROOT, 'CLAUDE.md'),
  path.join(ROOT, 'chatgpt.md'),
];

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing source file: ${path.relative(ROOT, SOURCE)}`);
    process.exit(1);
  }

  const source = fs.readFileSync(SOURCE, 'utf8');
  let failed = false;

  for (const target of TARGETS) {
    if (!fs.existsSync(target)) {
      console.error(`Missing target file: ${path.relative(ROOT, target)}`);
      failed = true;
      continue;
    }
    const content = fs.readFileSync(target, 'utf8');
    if (content !== source) {
      console.error(`Out of sync: ${path.relative(ROOT, target)} (run npm run docs:sync)`);
      failed = true;
    }
  }

  if (failed) process.exit(1);
  console.log('Agent docs are in sync.');
}

main();

