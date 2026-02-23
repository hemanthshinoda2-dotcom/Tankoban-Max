/**
 * FEAT-TOR: Tor Proxy domain — manages the Tor process lifecycle and
 * toggles the Chromium session proxy for the browser webview partition.
 *
 * Exposed to IPC:
 *   start(ctx)       -> { ok, error? }
 *   stop(ctx)        -> { ok, error? }
 *   getStatus()      -> { ok, active, bootstrapProgress }
 *
 * Internal (not IPC):
 *   isActive()       -> boolean  (sync, for torrent domain cart-mode check)
 *   forceKill()      -> void     (sync, for app quit cleanup)
 */

const { app, session } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---- State ----
var torProcess = null;
var torActive = false;
var bootstrapProgress = 0;
var torDataDir = '';
var torPort = 0;

// Port range to try (avoids conflict with system Tor on 9050)
var PORT_START = 9150;
var PORT_END = 9159;
var BOOTSTRAP_TIMEOUT_MS = 45000;

var PARTITION = 'persist:webmode';

// ---- Helpers ----

function locateTorExe() {
  // Packaged: process.resourcesPath/tor/windows/tor.exe
  if (app.isPackaged) {
    var p = path.join(process.resourcesPath, 'tor', 'windows', 'tor.exe');
    if (fs.existsSync(p)) return p;
  }
  // Dev: APP_ROOT/resources/tor/windows/tor.exe
  // APP_ROOT is passed via ctx but we also try common locations
  var devPaths = [
    path.join(__dirname, '..', '..', '..', 'resources', 'tor', 'windows', 'tor.exe'),
    path.join(process.cwd(), 'resources', 'tor', 'windows', 'tor.exe'),
  ];
  for (var i = 0; i < devPaths.length; i++) {
    if (fs.existsSync(devPaths[i])) return devPaths[i];
  }
  return null;
}

function locateGeoip(torDir) {
  return {
    geoip: path.join(torDir, 'geoip'),
    geoip6: path.join(torDir, 'geoip6'),
  };
}

function makeTempDir() {
  var base = path.join(os.tmpdir(), 'tankoban_tor_' + process.pid + '_' + Date.now());
  try { fs.mkdirSync(base, { recursive: true }); } catch {}
  return base;
}

function cleanTempDir(dir) {
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function emit(ctx, eventName, payload) {
  try {
    var w = ctx && ctx.win;
    if (w && !w.isDestroyed() && w.webContents) {
      w.webContents.send(eventName, payload);
    }
  } catch {}
}

function setProxy(rules) {
  try {
    var ses = session.fromPartition(PARTITION);
    return ses.setProxy({ proxyRules: rules || '' });
  } catch {
    return Promise.resolve();
  }
}

// ---- Public API ----

async function start(ctx) {
  if (torActive && torProcess) return { ok: true };

  var torExe = locateTorExe();
  if (!torExe) return { ok: false, error: 'Tor binary not found. Run: node tools/fetch_tor.js' };

  var torDir = path.dirname(torExe);
  var geo = locateGeoip(torDir);

  // Clean up any stale state
  if (torProcess) {
    try { torProcess.kill(); } catch {}
    torProcess = null;
  }

  torDataDir = makeTempDir();
  bootstrapProgress = 0;

  // Try ports in range
  var port = PORT_START;
  var lastError = '';

  while (port <= PORT_END) {
    try {
      var result = await _tryStart(ctx, torExe, geo, port);
      if (result.ok) return result;
      lastError = result.error || 'Unknown error';
      port++;
    } catch (err) {
      lastError = String((err && err.message) || err);
      port++;
    }
  }

  // All ports failed
  _cleanup();
  return { ok: false, error: 'Failed to start Tor: ' + lastError };
}

function _tryStart(ctx, torExe, geo, port) {
  return new Promise(function (resolve) {
    var resolved = false;
    var ipc = null;
    try { ipc = require('../../../shared/ipc'); } catch {}

    var args = [
      '--SocksPort', String(port),
      '--DataDirectory', torDataDir,
      '--Log', 'notice stdout',
    ];
    if (fs.existsSync(geo.geoip)) args.push('--GeoIPFile', geo.geoip);
    if (fs.existsSync(geo.geoip6)) args.push('--GeoIPv6File', geo.geoip6);

    var proc;
    try {
      proc = spawn(torExe, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      return resolve({ ok: false, error: String((err && err.message) || err) });
    }

    var timeout = setTimeout(function () {
      if (resolved) return;
      resolved = true;
      try { proc.kill(); } catch {}
      resolve({ ok: false, error: 'Bootstrap timeout (' + (BOOTSTRAP_TIMEOUT_MS / 1000) + 's)' });
    }, BOOTSTRAP_TIMEOUT_MS);

    proc.on('error', function (err) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      var msg = String((err && err.message) || err);
      // EADDRINUSE → try next port
      if (msg.indexOf('EADDRINUSE') !== -1 || msg.indexOf('address already in use') !== -1) {
        resolve({ ok: false, error: 'Port ' + port + ' in use' });
      } else {
        resolve({ ok: false, error: msg });
      }
    });

    proc.on('exit', function (code) {
      if (resolved) return;
      // If Tor exits before bootstrap completes, it likely means port conflict
      resolved = true;
      clearTimeout(timeout);
      resolve({ ok: false, error: 'Tor exited with code ' + code + ' (port ' + port + ' may be in use)' });
    });

    // Monitor stdout for bootstrap progress
    var stdoutBuf = '';
    proc.stdout.on('data', function (chunk) {
      stdoutBuf += String(chunk);
      // Parse bootstrap lines: "Bootstrapped 45% (loading_descriptors): ..."
      var lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() || ''; // keep incomplete last line

      for (var i = 0; i < lines.length; i++) {
        var match = lines[i].match(/Bootstrapped\s+(\d+)%/);
        if (match) {
          bootstrapProgress = parseInt(match[1], 10);
          if (ipc) {
            emit(ctx, ipc.EVENT.TOR_PROXY_STATUS_CHANGED, {
              active: false,
              connecting: true,
              bootstrapProgress: bootstrapProgress,
            });
          }

          if (bootstrapProgress >= 100 && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            torProcess = proc;
            torPort = port;
            torActive = true;

            // Set proxy on the webmode session
            setProxy('socks5h://127.0.0.1:' + port).then(function () {
              if (ipc) {
                emit(ctx, ipc.EVENT.TOR_PROXY_STATUS_CHANGED, {
                  active: true,
                  connecting: false,
                  bootstrapProgress: 100,
                });
              }
              resolve({ ok: true });
            }).catch(function () {
              resolve({ ok: true }); // proxy set failed but Tor is running
            });

            // Watch for unexpected exit after bootstrap
            proc.on('exit', function () {
              if (!torActive) return;
              torActive = false;
              torProcess = null;
              bootstrapProgress = 0;
              setProxy('').catch(function () {});
              if (ipc) {
                emit(ctx, ipc.EVENT.TOR_PROXY_STATUS_CHANGED, {
                  active: false,
                  connecting: false,
                  bootstrapProgress: 0,
                  crashed: true,
                });
              }
            });
          }
        }
      }
    });

    // Also check stderr for port-in-use errors from Tor
    proc.stderr.on('data', function (chunk) {
      var text = String(chunk);
      if (text.indexOf('Address already in use') !== -1 || text.indexOf('Could not bind') !== -1) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          try { proc.kill(); } catch {}
          resolve({ ok: false, error: 'Port ' + port + ' in use' });
        }
      }
    });
  });
}

async function stop(ctx) {
  if (!torActive && !torProcess) return { ok: true };

  var ipc = null;
  try { ipc = require('../../../shared/ipc'); } catch {}

  // Clear proxy first
  await setProxy('');

  // Kill Tor process
  if (torProcess) {
    try { torProcess.kill(); } catch {}
    // Give it 3 seconds, then force kill
    var proc = torProcess;
    setTimeout(function () {
      try { proc.kill('SIGKILL'); } catch {}
    }, 3000);
    torProcess = null;
  }

  torActive = false;
  bootstrapProgress = 0;
  torPort = 0;

  // Clean up temp dir
  cleanTempDir(torDataDir);
  torDataDir = '';

  if (ipc) {
    emit(ctx, ipc.EVENT.TOR_PROXY_STATUS_CHANGED, {
      active: false,
      connecting: false,
      bootstrapProgress: 0,
    });
  }

  return { ok: true };
}

function getStatus() {
  return {
    ok: true,
    active: torActive,
    bootstrapProgress: bootstrapProgress,
    port: torPort,
  };
}

function isActive() {
  return torActive;
}

function forceKill() {
  if (torProcess) {
    try { torProcess.kill(); } catch {}
    torProcess = null;
  }
  torActive = false;
  bootstrapProgress = 0;
  // Clear proxy synchronously isn't possible, but we're quitting anyway
  cleanTempDir(torDataDir);
  torDataDir = '';
}

function _cleanup() {
  if (torProcess) {
    try { torProcess.kill(); } catch {}
    torProcess = null;
  }
  torActive = false;
  bootstrapProgress = 0;
  torPort = 0;
  cleanTempDir(torDataDir);
  torDataDir = '';
}

module.exports = {
  start: start,
  stop: stop,
  getStatus: getStatus,
  isActive: isActive,
  forceKill: forceKill,
};
