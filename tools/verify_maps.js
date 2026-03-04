#!/usr/bin/env node
/*
Compatibility wrapper.
Historically this validated docs/maps references.
The canonical docs link validator is now tools/check_docs_links.js.
*/

const path = require('path');
const { checkDocsLinks } = require('./check_docs_links');

function verifyMaps(opts) {
  const repoRoot = (opts && opts.repoRoot) ? opts.repoRoot : path.resolve(__dirname, '..');
  return checkDocsLinks({ repoRoot });
}

if (require.main === module) {
  const res = verifyMaps({ repoRoot: path.resolve(__dirname, '..') });
  if (!res.ok) {
    console.error('MAP VERIFY FAIL: referenced docs path does not exist');
    for (const err of res.errors) {
      console.error('- ' + err.file + ': ' + err.ref);
    }
    process.exit(1);
  }
  console.log('OK: docs references verified');
}

module.exports = { verifyMaps };
