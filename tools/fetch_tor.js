#!/usr/bin/env node
/**
 * fetch_tor.js — Download and extract the Tor Expert Bundle for Windows.
 *
 * Usage:  node tools/fetch_tor.js [--version 15.0.6]
 *
 * Downloads tor-expert-bundle-windows-x86_64-<version>.tar.gz from
 * dist.torproject.org, extracts tor.exe + geoip/geoip6 into
 * resources/tor/windows/.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const DEFAULT_VERSION = '15.0.6';
const MIRROR = 'https://dist.torproject.org/torbrowser';

// Parse --version flag
let version = DEFAULT_VERSION;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--version' && process.argv[i + 1]) {
    version = process.argv[i + 1];
  }
}

const FILENAME = `tor-expert-bundle-windows-x86_64-${version}.tar.gz`;
const URL = `${MIRROR}/${version}/${FILENAME}`;
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'resources', 'tor', 'windows');
const TMP_FILE = path.join(ROOT, 'resources', 'tor', FILENAME);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function download(url) {
  return new Promise((resolve, reject) => {
    const follow = (u, redirects) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'Tankoban-Max/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const chunks = [];
        let received = 0;
        const total = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', (chunk) => {
          chunks.push(chunk);
          received += chunk.length;
          if (total) {
            const pct = ((received / total) * 100).toFixed(1);
            process.stdout.write(`\r  Downloading... ${pct}% (${(received / 1048576).toFixed(1)} MB)`);
          }
        });
        res.on('end', () => {
          process.stdout.write('\n');
          resolve(Buffer.concat(chunks));
        });
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url, 0);
  });
}

/**
 * Minimal tar extractor for the specific files we need.
 * tar format: 512-byte header blocks, name at offset 0 (100 bytes),
 * size at offset 124 (12 bytes, octal), followed by ceil(size/512)*512 data bytes.
 */
function extractTar(buf, wantedFiles) {
  const results = {};
  let offset = 0;
  while (offset + 512 <= buf.length) {
    // Read header
    const header = buf.subarray(offset, offset + 512);
    // Check for end-of-archive (two zero blocks)
    let allZero = true;
    for (let i = 0; i < 512; i++) { if (header[i] !== 0) { allZero = false; break; } }
    if (allZero) break;

    // Parse name (may include prefix at offset 345 for ustar)
    let name = '';
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0/g, '').trim();
    const base = header.subarray(0, 100).toString('utf8').replace(/\0/g, '').trim();
    name = prefix ? prefix + '/' + base : base;

    // Parse size (octal)
    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Type flag: '0' or '\0' = regular file
    const typeFlag = header[156];
    const isFile = (typeFlag === 0 || typeFlag === 48); // 0 or '0'

    offset += 512; // move past header

    if (isFile && size > 0) {
      // Normalize name: strip leading ./
      const normalized = name.replace(/^\.\//, '');
      for (const wanted of wantedFiles) {
        if (normalized === wanted.archivePath || normalized.endsWith('/' + wanted.archivePath) ||
            normalized.endsWith(wanted.basename)) {
          results[wanted.basename] = buf.subarray(offset, offset + size);
        }
      }
    }

    // Advance past data blocks (rounded up to 512)
    offset += Math.ceil(size / 512) * 512;
  }
  return results;
}

async function main() {
  console.log(`[fetch_tor] Tor Expert Bundle v${version}`);
  console.log(`[fetch_tor] URL: ${URL}`);
  console.log(`[fetch_tor] Output: ${OUT_DIR}`);

  // Check if already present
  const torExe = path.join(OUT_DIR, 'tor.exe');
  if (fs.existsSync(torExe)) {
    console.log('[fetch_tor] tor.exe already exists. Delete resources/tor/windows/ to re-download.');
    return;
  }

  ensureDir(path.join(ROOT, 'resources', 'tor'));
  ensureDir(OUT_DIR);

  // Download
  console.log('[fetch_tor] Downloading...');
  const gzBuf = await download(URL);
  console.log(`[fetch_tor] Downloaded ${(gzBuf.length / 1048576).toFixed(1)} MB`);

  // Decompress gzip
  console.log('[fetch_tor] Decompressing...');
  const tarBuf = zlib.gunzipSync(gzBuf);
  console.log(`[fetch_tor] Decompressed to ${(tarBuf.length / 1048576).toFixed(1)} MB`);

  // Extract the files we need from the tar
  console.log('[fetch_tor] Extracting...');
  const wanted = [
    { archivePath: 'tor/tor.exe', basename: 'tor.exe' },
    { archivePath: 'data/geoip', basename: 'geoip' },
    { archivePath: 'data/geoip6', basename: 'geoip6' },
  ];

  const extracted = extractTar(tarBuf, wanted);

  for (const w of wanted) {
    if (!extracted[w.basename]) {
      console.error(`[fetch_tor] WARNING: ${w.basename} not found in archive!`);
      continue;
    }
    const outPath = path.join(OUT_DIR, w.basename);
    fs.writeFileSync(outPath, extracted[w.basename]);
    console.log(`[fetch_tor]   ${w.basename} (${(extracted[w.basename].length / 1048576).toFixed(1)} MB)`);
  }

  // Verify
  if (fs.existsSync(torExe)) {
    console.log('[fetch_tor] Done! Tor binaries ready in resources/tor/windows/');
  } else {
    console.error('[fetch_tor] ERROR: tor.exe was not extracted. Check the archive structure.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[fetch_tor] FATAL:', err.message || err);
  process.exit(1);
});
