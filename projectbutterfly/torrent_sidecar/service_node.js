/*
 * Tanko Torrent Sidecar (Node/WebTorrent backend)
 *
 * qBit-compatible HTTP RPC surface consumed by the Python bridge adapter.
 * This removes qBittorrent runtime dependency from the active path.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var http = require('http');
var { URL } = require('url');

var WebTorrent = null;

var VERSION = '0.2-webtorrent';
var PORT = 8765;
var HOST = '127.0.0.1';
var DATA_DIR = '';

var client = null;
var recordsByHash = new Map(); // hash(lower) -> rec

function nowMs() { return Date.now(); }

function parseArgs(argv) {
  var out = {};
  for (var i = 2; i < argv.length; i++) {
    var k = argv[i];
    var v = (i + 1 < argv.length) ? argv[i + 1] : '';
    if (k === '--host') { out.host = String(v || '').trim(); i += 1; continue; }
    if (k === '--port') { out.port = Number(v || 0) || 8765; i += 1; continue; }
    if (k === '--data-dir') { out.dataDir = String(v || '').trim(); i += 1; continue; }
  }
  return out;
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
}

function writeFileIfMissing(filePath, content) {
  try {
    if (fs.existsSync(filePath)) return true;
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function ensureDependencyShims() {
  // Some npm mirrors package "last-one-wins" without index.js.
  // WebTorrent's DHT path needs it; provide a local compatible shim.
  try {
    var pkgPath = require.resolve('last-one-wins/package.json');
    var dir = path.dirname(pkgPath);
    var indexPath = path.join(dir, 'index.js');
    writeFileIfMissing(indexPath, [
      "'use strict';",
      'module.exports = function (worker) {',
      '  var running = false;',
      '  var queued = false;',
      '  var latestArgs = null;',
      '  function done() {',
      '    running = false;',
      '    if (!queued) return;',
      '    queued = false;',
      '    invoke();',
      '  }',
      '  function invoke() {',
      '    running = true;',
      '    var args = latestArgs || [];',
      '    try { worker.apply(null, args.concat(done)); }',
      '    catch (_) { done(); }',
      '  }',
      '  return function () {',
      '    latestArgs = Array.prototype.slice.call(arguments);',
      '    if (running) { queued = true; return; }',
      '    invoke();',
      '  };',
      '};',
      '',
    ].join('\n'));
  } catch (_) {}
}

async function loadDependencies() {
  ensureDependencyShims();
  if (WebTorrent) return;
  var mod = await import('webtorrent');
  WebTorrent = mod && (mod.default || mod.WebTorrent || mod);
}

function normalizeHash(h) {
  return String(h || '').trim().toLowerCase();
}

function parseHashes(hashes) {
  var s = String(hashes || '').trim();
  if (!s) return [];
  return s.split('|').map(normalizeHash).filter(Boolean);
}

function extractHashFromInput(urls, torrentBuf) {
  // .torrent hash is discovered later when WebTorrent emits infoHash.
  // For magnets we can parse btih directly.
  if (torrentBuf && Buffer.isBuffer(torrentBuf) && torrentBuf.length > 0) {
    return '';
  }
  try {
    var u = String(urls || '').trim();
    if (u.toLowerCase().startsWith('magnet:?')) {
      var m = /[?&]xt=urn:btih:([^&]+)/i.exec(u);
      if (m && m[1]) return normalizeHash(decodeURIComponent(m[1]));
    }
  } catch (_) {}
  return '';
}

function getRecordByHash(hash) {
  var h = normalizeHash(hash);
  if (!h) return null;
  return recordsByHash.get(h) || null;
}

function registerRecord(hash, rec) {
  var h = normalizeHash(hash);
  if (!h || !rec) return;
  rec.hash = h;
  recordsByHash.set(h, rec);
}

function remapRecordHash(rec, nextHash) {
  var oldHash = normalizeHash(rec && rec.hash);
  var nh = normalizeHash(nextHash);
  if (!rec || !nh || oldHash === nh) return;
  if (oldHash) recordsByHash.delete(oldHash);
  rec.hash = nh;
  recordsByHash.set(nh, rec);
}

function ensureClient() {
  if (client) return client;
  client = new WebTorrent({
    utp: false,
    natUpnp: false,
    natPmp: false,
  });
  client.on('error', function (err) {
    try { console.error('[sidecar] client error', err && err.message || err); } catch (_) {}
  });
  return client;
}

function recState(rec) {
  if (!rec) return 'error';
  if (rec.error) return 'error';
  if (!rec.metadataReady) return 'metaDL';
  var tor = rec.torrent;
  var progress = Number(tor && tor.progress || 0);
  if (rec.paused) return progress >= 1 ? 'pausedUP' : 'pausedDL';
  if (progress >= 1) return 'uploading';
  return 'downloading';
}

function safeNum(v) {
  var n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function toInfo(rec) {
  var tor = rec && rec.torrent;
  var name = '';
  try { name = String(tor && tor.name || rec.name || rec.hash || ''); } catch (_) { name = rec.hash || ''; }
  var total = safeNum(tor && tor.length);
  var savePath = String(rec && rec.savePath || '');
  return {
    hash: String(rec && rec.hash || ''),
    name: name,
    state: recState(rec),
    progress: safeNum(tor && tor.progress),
    dlspeed: safeNum(tor && tor.downloadSpeed),
    upspeed: safeNum(tor && tor.uploadSpeed),
    uploaded: safeNum(tor && tor.uploaded),
    downloaded: safeNum(tor && tor.downloaded),
    total_size: total,
    size: total,
    num_seeds: safeNum(tor && tor.numPeers),
    num_leechs: 0,
    save_path: savePath,
    content_path: savePath && name ? path.join(savePath, name) : savePath,
    seq_dl: !!(rec && rec.sequential),
    magnet_uri: String(tor && tor.magnetURI || rec.magnetUri || ''),
  };
}

function filePriority(rec, idx) {
  if (!rec || !rec.filePriorities) return 1;
  if (!rec.filePriorities.has(idx)) return 1;
  return Number(rec.filePriorities.get(idx) || 0);
}

function toFiles(rec) {
  var tor = rec && rec.torrent;
  if (!tor || !Array.isArray(tor.files)) return [];
  var out = [];
  for (var i = 0; i < tor.files.length; i++) {
    var f = tor.files[i];
    if (!f) continue;
    out.push({
      index: i,
      name: String(f.path || f.name || ''),
      size: safeNum(f.length),
      progress: safeNum(f.progress),
      priority: filePriority(rec, i),
      is_seed: false,
    });
  }
  return out;
}

function getRecordsForHashes(hashes) {
  var hs = parseHashes(hashes);
  if (!hs.length) return Array.from(recordsByHash.values());
  var out = [];
  for (var i = 0; i < hs.length; i++) {
    var rec = recordsByHash.get(hs[i]);
    if (rec) out.push(rec);
  }
  return out;
}

function selectFile(rec, idx, prio) {
  var tor = rec && rec.torrent;
  if (!tor || !Array.isArray(tor.files) || idx < 0 || idx >= tor.files.length) return;
  var f = tor.files[idx];
  if (!f) return;
  var p = Number(prio || 0);
  try {
    if (p <= 0) f.deselect();
    else f.select(Math.max(1, Math.min(9999, p)));
    rec.filePriorities.set(idx, p <= 0 ? 0 : p);
  } catch (_) {}
}

function attachTorrentHandlers(rec) {
  var tor = rec && rec.torrent;
  if (!tor) return;

  function onReadyLike() {
    rec.metadataReady = true;
    rec.name = String(tor.name || rec.name || rec.hash || '');
    if (tor.infoHash) remapRecordHash(rec, tor.infoHash);
    if (rec.startPaused) {
      try {
        if (Array.isArray(tor.files)) {
          for (var i = 0; i < tor.files.length; i++) {
            selectFile(rec, i, 0);
          }
        }
        if (typeof tor.pause === 'function') tor.pause();
      } catch (_) {}
      rec.paused = true;
      rec.startPaused = false;
    }
  }

  tor.on('ready', onReadyLike);
  tor.on('metadata', onReadyLike);
  tor.on('done', function () {
    rec.completedAt = nowMs();
    if (!rec.paused) rec.paused = false;
  });
  tor.on('error', function (err) {
    rec.error = String(err && err.message || err || 'torrent_error');
  });
}

async function destroyRecord(rec, deleteFiles) {
  if (!rec) return;
  var tor = rec.torrent;
  var h = normalizeHash(rec.hash);
  if (h) recordsByHash.delete(h);
  if (!tor) return;
  await new Promise(function (resolve) {
    try {
      tor.destroy({ destroyStore: !!deleteFiles }, function () { resolve(); });
    } catch (_) {
      resolve();
    }
  });
}

async function rpcAddTorrent(payload) {
  var cl = ensureClient();
  var urls = String(payload && payload.urls || '').trim();
  var savePath = String(payload && payload.save_path || '').trim();
  var startPaused = !!(payload && payload.is_stopped);
  var sequential = !!(payload && payload.sequential);
  var torrentFileB64 = String(payload && payload.torrent_file_b64 || '').trim();
  var torrentBuf = null;
  if (torrentFileB64) {
    try { torrentBuf = Buffer.from(torrentFileB64, 'base64'); } catch (_) { torrentBuf = null; }
  }
  if (!urls && !torrentBuf) return { ok: false, error: 'missing_source' };

  var hash = normalizeHash(payload && payload.expected_info_hash);
  if (!hash) hash = extractHashFromInput(urls, torrentBuf);

  if (!savePath) {
    savePath = path.join(DATA_DIR || os.tmpdir(), 'web_torrent_tmp', hash || ('tmp_' + String(nowMs())));
  }
  ensureDir(savePath);

  var existing = hash ? getRecordByHash(hash) : null;
  if (existing) return { ok: true, reused: true, hash: existing.hash };

  var input = torrentBuf || urls;
  var tor = null;
  try {
    tor = cl.add(input, { path: savePath });
  } catch (e) {
    return { ok: false, error: String(e && e.message || e || 'add_failed') };
  }

  var rec = {
    hash: hash || '',
    torrent: tor,
    savePath: savePath,
    paused: false,
    startPaused: startPaused,
    sequential: sequential,
    metadataReady: !!(tor.files && tor.files.length > 0),
    error: '',
    addedAt: nowMs(),
    completedAt: 0,
    filePriorities: new Map(),
    magnetUri: String(urls && urls.startsWith('magnet:') ? urls : ''),
  };
  if (sequential && Array.isArray(tor.files)) {
    for (var i = 0; i < tor.files.length; i++) rec.filePriorities.set(i, 1);
  }
  attachTorrentHandlers(rec);
  if (!rec.hash && tor.infoHash) rec.hash = normalizeHash(tor.infoHash);
  if (!rec.hash) rec.hash = 'tmp_' + String(nowMs()) + '_' + Math.random().toString(36).slice(2, 8);
  registerRecord(rec.hash, rec);
  return { ok: true, hash: rec.hash };
}

async function rpcTorrentInfo(payload) {
  var recs = getRecordsForHashes(payload && payload.hashes);
  return { ok: true, torrents: recs.map(toInfo) };
}

async function rpcTorrentFiles(payload) {
  var rec = getRecordByHash(payload && payload.hash);
  if (!rec) return { ok: true, files: [] };
  return { ok: true, files: toFiles(rec) };
}

async function rpcSetFilePriority(payload) {
  var rec = getRecordByHash(payload && payload.hash);
  if (!rec) return { ok: false, error: 'not_found' };
  var ids = Array.isArray(payload && payload.ids) ? payload.ids : [];
  var prio = Number(payload && payload.priority || 0);
  for (var i = 0; i < ids.length; i++) {
    selectFile(rec, Number(ids[i]), prio);
  }
  return { ok: true };
}

async function rpcToggleSequential(payload) {
  var recs = getRecordsForHashes(payload && payload.hashes);
  for (var i = 0; i < recs.length; i++) recs[i].sequential = !recs[i].sequential;
  return { ok: true };
}

async function rpcSetLocation(payload) {
  var recs = getRecordsForHashes(payload && payload.hashes);
  var loc = String(payload && payload.location || '').trim();
  if (loc) ensureDir(loc);
  for (var i = 0; i < recs.length; i++) {
    if (loc) recs[i].savePath = loc;
  }
  return { ok: true };
}

async function rpcPause(payload) {
  var recs = getRecordsForHashes(payload && payload.hashes);
  for (var i = 0; i < recs.length; i++) {
    var tor = recs[i].torrent;
    try { if (tor && typeof tor.pause === 'function') tor.pause(); } catch (_) {}
    recs[i].paused = true;
  }
  return { ok: true };
}

async function rpcResume(payload) {
  var recs = getRecordsForHashes(payload && payload.hashes);
  for (var i = 0; i < recs.length; i++) {
    var tor = recs[i].torrent;
    try { if (tor && typeof tor.resume === 'function') tor.resume(); } catch (_) {}
    recs[i].paused = false;
  }
  return { ok: true };
}

async function rpcDelete(payload) {
  var recs = getRecordsForHashes(payload && payload.hashes);
  var removeFiles = !!(payload && payload.delete_files);
  for (var i = 0; i < recs.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    await destroyRecord(recs[i], removeFiles);
  }
  return { ok: true };
}

async function rpcTorrentPeers(payload) {
  var rec = getRecordByHash(payload && payload.hash);
  var out = {};
  if (rec && rec.torrent && Array.isArray(rec.torrent.wires)) {
    var wires = rec.torrent.wires;
    for (var i = 0; i < wires.length; i++) {
      var w = wires[i];
      if (!w) continue;
      out[String(i)] = {
        ip: String(w.remoteAddress || ''),
        client: String(w.peerExtendedHandshake && w.peerExtendedHandshake.client || ''),
        progress: 0,
        dl_speed: safeNum(w.downloadSpeed && w.downloadSpeed()),
        up_speed: safeNum(w.uploadSpeed && w.uploadSpeed()),
      };
    }
  }
  return { ok: true, peers: out };
}

async function rpcTransferInfo() {
  var dl = 0;
  var ul = 0;
  recordsByHash.forEach(function (rec) {
    if (!rec || !rec.torrent) return;
    dl += safeNum(rec.torrent.downloadSpeed);
    ul += safeNum(rec.torrent.uploadSpeed);
  });
  return { ok: true, info: { dl_info_speed: dl, up_info_speed: ul, dht_nodes: 0 } };
}

var RPC = {
  add_torrent: rpcAddTorrent,
  torrent_info: rpcTorrentInfo,
  torrent_files: rpcTorrentFiles,
  set_file_priority: rpcSetFilePriority,
  toggle_sequential: rpcToggleSequential,
  set_location: rpcSetLocation,
  pause: rpcPause,
  resume: rpcResume,
  delete: rpcDelete,
  torrent_peers: rpcTorrentPeers,
  transfer_info: rpcTransferInfo,
};

function readJsonBody(req) {
  return new Promise(function (resolve) {
    var bufs = [];
    req.on('data', function (chunk) { bufs.push(chunk); });
    req.on('end', function () {
      if (!bufs.length) return resolve({});
      try {
        var obj = JSON.parse(Buffer.concat(bufs).toString('utf8'));
        resolve((obj && typeof obj === 'object') ? obj : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', function () { resolve({}); });
  });
}

function sendJson(res, code, payload) {
  var raw = Buffer.from(JSON.stringify(payload || {}), 'utf8');
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(raw.length));
  res.end(raw);
}

async function handle(req, res) {
  var url = new URL(req.url, 'http://127.0.0.1/');
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      ready: true,
      service: 'torrent_sidecar',
      backend: 'webtorrent',
      version: VERSION,
      active: recordsByHash.size,
    });
  }

  if (req.method !== 'POST') return sendJson(res, 404, { ok: false, error: 'not_found' });
  var body = await readJsonBody(req);
  if (!url.pathname.startsWith('/rpc/')) return sendJson(res, 404, { ok: false, error: 'not_found' });
  var method = url.pathname.slice('/rpc/'.length);
  var fn = RPC[method];
  if (!fn) return sendJson(res, 404, { ok: false, error: 'rpc_not_found', method: method });
  try {
    var out = await fn(body || {});
    return sendJson(res, 200, (out && typeof out === 'object') ? out : { ok: false, error: 'bad_rpc_response' });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: String(e && e.message || e || 'rpc_error') });
  }
}

async function main() {
  await loadDependencies();
  var args = parseArgs(process.argv);
  HOST = String(args.host || '127.0.0.1');
  PORT = Number(args.port || 8765) || 8765;
  DATA_DIR = String(args.dataDir || '').trim();
  if (!DATA_DIR) DATA_DIR = path.join(os.tmpdir(), 'tanko-sidecar');
  ensureDir(DATA_DIR);
  ensureClient();

  var server = http.createServer(function (req, res) {
    handle(req, res).catch(function (err) {
      sendJson(res, 500, { ok: false, error: String(err && err.message || err || 'server_error') });
    });
  });

  server.listen(PORT, HOST, function () {
    // Silent by default; parent probes /health.
  });

  function shutdown() {
    try { server.close(); } catch (_) {}
    try { if (client) client.destroy(function () {}); } catch (_) {}
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(function (err) {
  try { console.error('[sidecar] fatal', err && err.message || err); } catch (_) {}
  process.exit(1);
});
