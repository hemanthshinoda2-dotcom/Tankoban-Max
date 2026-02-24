#!/usr/bin/env node
'use strict';

/**
 * release_prep.js — Smart release preparation orchestrator.
 *
 * Validates that all artifacts needed by electron-builder are present.
 *
 * Qt Player:         Builds automatically if Python 3.10+ is available.
 *                    Skips gracefully if Python is missing — creates a placeholder
 *                    directory so electron-builder doesn't crash.
 *
 * Runtime deps:      Validates mpv (hard fail) and tor (soft fail with placeholder).
 *
 * Usage:
 *   node tools/release_prep.js [--skip-player]
 */

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var execSync = childProcess.execSync;

var ROOT = path.resolve(__dirname, '..');
var ARGS = process.argv.slice(2).map(function (a) { return a.toLowerCase(); });
var flagSet = {};
ARGS.forEach(function (a) { flagSet[a] = true; });

// --- Paths ---
var PLAYER_EXE = path.join(ROOT, 'player_qt', 'dist', 'TankobanPlayer', 'TankobanPlayer.exe');
var PLAYER_DIR = path.join(ROOT, 'player_qt', 'dist', 'TankobanPlayer');
var MPV_DIR = path.join(ROOT, 'resources', 'mpv', 'windows');
var TOR_DIR = path.join(ROOT, 'resources', 'tor', 'windows');

function log(tag, msg) { console.log('[' + tag + '] ' + msg); }
function warn(tag, msg) { console.warn('[' + tag + '] WARNING: ' + msg); }
function err(tag, msg) { console.error('[' + tag + '] ERROR: ' + msg); }

function hasPython310() {
  var cmds = ['py --version', 'python --version'];
  for (var i = 0; i < cmds.length; i++) {
    try {
      var out = execSync(cmds[i], { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      var match = out.match(/Python (\d+)\.(\d+)/);
      if (match && parseInt(match[1]) >= 3 && parseInt(match[2]) >= 10) return true;
    } catch (_) { /* continue */ }
  }
  return false;
}

// ============================================================
// Step 1: Qt Player (optional)
// ============================================================
function prepPlayer() {
  if (flagSet['--skip-player']) {
    warn('player', 'Skipped (--skip-player flag).');
    ensurePlayerDir();
    return false;
  }

  if (fs.existsSync(PLAYER_EXE)) {
    log('player', 'OK — ' + path.relative(ROOT, PLAYER_EXE) + ' already built.');
    return true;
  }

  if (!hasPython310()) {
    warn('player', 'Python 3.10+ not found. Qt player will not be included.');
    warn('player', 'Install Python 3.10+ and run "npm run build:player" to include it.');
    ensurePlayerDir();
    return false;
  }

  log('player', 'Building Qt player (Python 3.10+ detected)...');
  try {
    execSync('build_player.bat', { stdio: 'inherit', cwd: path.join(ROOT, 'player_qt') });
    if (fs.existsSync(PLAYER_EXE)) {
      log('player', 'Build succeeded.');
      return true;
    }
    warn('player', 'Build completed but TankobanPlayer.exe not found.');
    ensurePlayerDir();
    return false;
  } catch (_) {
    warn('player', 'Build failed. Qt player will not be included.');
    ensurePlayerDir();
    return false;
  }
}

function ensurePlayerDir() {
  // Create placeholder so electron-builder's extraResources doesn't crash.
  if (!fs.existsSync(PLAYER_DIR)) {
    fs.mkdirSync(PLAYER_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PLAYER_DIR, 'NOT_BUILT.txt'),
      'The Qt video player was not built (Python 3.10+ not available).\n' +
      'Install Python 3.10+ and run "npm run build:player" to build it.\n'
    );
    log('player', 'Created placeholder directory for electron-builder compatibility.');
  }
}

// ============================================================
// Step 2: Runtime deps (mpv, tor)
// ============================================================
function checkRuntimeDeps() {
  var mpvExe = path.join(MPV_DIR, 'mpv.exe');
  if (!fs.existsSync(mpvExe)) {
    err('deps', 'MPV runtime missing at ' + path.relative(ROOT, MPV_DIR));
    err('deps', 'The ensure_deps script should have downloaded it. Run: scripts\\windows\\ensure_mpv_windows.bat');
    process.exit(1);
  }
  log('deps', 'MPV runtime present.');

  var torExe = path.join(TOR_DIR, 'tor.exe');
  if (!fs.existsSync(torExe)) {
    warn('deps', 'Tor runtime missing. Run: node tools/fetch_tor.js');
    warn('deps', 'Building without Tor — Tor features will be unavailable.');
    // Create empty dir so electron-builder's extraResources doesn't crash
    if (!fs.existsSync(TOR_DIR)) {
      fs.mkdirSync(TOR_DIR, { recursive: true });
    }
    return false;
  }
  log('deps', 'Tor runtime present.');
  return true;
}

// ============================================================
// Main
// ============================================================
function main() {
  console.log('');
  console.log('=== Tankoban Max Release Preparation ===');
  console.log('');

  var hasPlayer = prepPlayer();
  var hasTor = checkRuntimeDeps();

  console.log('');
  console.log('=== Summary ===');
  log('summary', 'Qt player        : ' + (hasPlayer ? 'OK' : 'SKIPPED (optional)'));
  log('summary', 'MPV runtime      : OK');
  log('summary', 'Tor runtime      : ' + (hasTor ? 'OK' : 'SKIPPED (optional)'));

  // Write manifest for debugging / CI
  var manifest = {
    timestamp: new Date().toISOString(),
    player: hasPlayer,
    mpv: true,
    tor: hasTor
  };
  var manifestPath = path.join(ROOT, '.release-prep-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  log('summary', 'Wrote .release-prep-manifest.json');

  console.log('');
  console.log('=== Release preparation complete ===');
  console.log('');
}

main();
