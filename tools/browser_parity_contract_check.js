#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const preloadPath = path.join(root, 'preload', 'namespaces', 'web.js');
const bridgePath = path.join(root, 'projectbutterfly', 'bridge.py');

const preloadText = fs.readFileSync(preloadPath, 'utf8');
const bridgeText = fs.readFileSync(bridgePath, 'utf8');

function extractNamespaceBlock(text, namespace) {
  const marker = `${namespace}: {`;
  const start = text.indexOf(marker);
  if (start === -1) return '';
  const braceStart = text.indexOf('{', start);
  if (braceStart === -1) return '';
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(braceStart + 1, i);
      }
    }
  }
  return '';
}

function extractMethodKeys(block) {
  if (!block) return [];
  const keys = [];
  const seen = new Set();
  const re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  let m;
  while ((m = re.exec(block)) !== null) {
    const key = m[1];
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

const namespaces = [
  'webSources',
  'webBrowserSettings',
  'webHistory',
  'webSession',
  'webBookmarks',
  'webData',
  'webPermissions',
  'webUserscripts',
  'webAdblock',
  'webFind',
  'webTorrent',
  'torrentSearch',
  'torProxy',
  'webSearch',
  'webBrowserActions',
];

let failures = 0;
console.log('Browser parity contract check (preload ↔ Butterfly shim)');
console.log('--------------------------------------------------------');

for (const ns of namespaces) {
  const preloadBlock = extractNamespaceBlock(preloadText, ns);
  const bridgeBlock = extractNamespaceBlock(bridgeText, ns);
  if (!preloadBlock) {
    console.log(`SKIP - ${ns}: missing in preload`);
    continue;
  }
  if (!bridgeBlock) {
    failures += 1;
    console.log(`FAIL - ${ns}: missing in Butterfly shim`);
    continue;
  }

  const preloadMethods = extractMethodKeys(preloadBlock);
  const bridgeMethods = extractMethodKeys(bridgeBlock);
  const bridgeSet = new Set(bridgeMethods);
  const missingInBridge = preloadMethods.filter((k) => !bridgeSet.has(k));

  if (missingInBridge.length) {
    failures += 1;
    console.log(`FAIL - ${ns}: missing in bridge -> ${missingInBridge.join(', ')}`);
  } else {
    console.log(`PASS - ${ns}: ${preloadMethods.length} methods covered`);
  }
}

if (failures) {
  console.log(`\nContract mismatches: ${failures}`);
  process.exit(1);
}

console.log('\nContract parity: OK');
