#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const webJsPath = path.join(__dirname, '..', 'src', 'domains', 'web', 'web.js');
const text = fs.readFileSync(webJsPath, 'utf8');

const checks = [
  ['Search suggestion helper', 'function shouldOfferSearchSuggestion(rawQuery)'],
  ['Omnibox ranking scorer', 'function scoreOmniSuggestion(query, item, idx)'],
  ['Search suggestion item kind', "kind === 'search'"],
  ['History suggestion delete helper', 'function removeActiveOmniHistorySuggestion()'],
  ['Shift+Delete history removal', 'Shift+Delete removes selected history suggestion'],
  ['Ctrl+K / Ctrl+E search focus shortcut', 'Ctrl+K / Ctrl+E focuses omnibox for search'],
  ['Suggestion subtitle support', "s.subtitle || s.url"],
  ['Middle click / modifier open new tab', "evt.button === 1"]
];

let pass = 0;
console.log('Browser omnibox polish audit (Build 7)');
console.log('-------------------------------------');
for (const [label, needle] of checks) {
  const ok = text.includes(needle);
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`);
}
console.log(`\nScore: ${pass}/${checks.length}`);
process.exit(pass === checks.length ? 0 : 1);
