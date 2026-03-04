#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'resources', 'manifests', 'vendor-manifest.json');

function parseArgs() {
  const out = { id: '' };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--id=')) out.id = String(arg.slice('--id='.length)).trim();
  }
  return out;
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('VENDOR FETCH FAIL: missing resources/manifests/vendor-manifest.json');
    process.exit(1);
  }

  const args = parseArgs();
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const vendors = Array.isArray(manifest.vendors) ? manifest.vendors : [];
  const cacheRoot = path.join(ROOT, manifest.cacheRoot || 'resources/cache');
  fs.mkdirSync(cacheRoot, { recursive: true });

  const platform = process.platform;
  const filtered = vendors.filter((vendor) => {
    if (args.id && vendor.id !== args.id) return false;
    if (vendor.platform && vendor.platform !== platform) return false;
    return true;
  });

  if (!filtered.length) {
    console.log('No matching vendors for platform=' + platform + (args.id ? ' id=' + args.id : ''));
    return;
  }

  console.log('Vendor manifest loaded: ' + filtered.length + ' matching entry(s)');
  for (const vendor of filtered) {
    const status = vendor.status || 'unknown';
    const line = '- ' + vendor.id + ' [' + status + ']';
    console.log(line);
    if (vendor.notes) console.log('  notes: ' + vendor.notes);
    if (status === 'disabled') console.log('  action: skipped (disabled)');
    else if (status === 'external-script') console.log('  action: managed by dedicated script');
    else console.log('  action: no generic fetch strategy configured');
  }

  console.log('Cache directory: ' + path.relative(ROOT, cacheRoot).replace(/\\/g, '/'));
}

main();
