// Generate canonical agent docs from a single source.
// Source: docs/agent-map.source.md
// Targets: CLAUDE.md, chatgpt.md
//
// Usage:
//   node tools/generate_agent_docs.js

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

  const content = fs.readFileSync(SOURCE, 'utf8');
  for (const target of TARGETS) {
    fs.writeFileSync(target, content, 'utf8');
    console.log(`Wrote ${path.relative(ROOT, target)}`);
  }
}

main();

