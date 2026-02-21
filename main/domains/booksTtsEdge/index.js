/*
Tankoban Max - Books Edge TTS bridge domain (FIX-TTS01, FIX-TTS02)
Main-process transport for Edge neural synthesis via msedge-tts.
Same IPC contract as before: probe, getVoices, synth.
*/

// LISTEN_P6: disk audio cache (tts_audio_cache/ in userData)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

let _audioCacheDir = null;

// FIX-TTS-B3 #22: Throttled disk cache eviction — 500 MB cap
const _evictMaxBytes = 500 * 1024 * 1024;
let _evictWriteCount = 0;
const _evictWriteThreshold = 50;

function getAudioCacheDir(ctx) {
  if (_audioCacheDir) return _audioCacheDir;
  try {
    if (ctx && ctx.storage && typeof ctx.storage.dataPath === 'function') {
      _audioCacheDir = ctx.storage.dataPath('tts_audio_cache');
    }
  } catch {}
  return _audioCacheDir;
}

function audioCacheKey(text, voice, rate, pitch) {
  return crypto.createHash('sha256')
    .update(text + '|' + voice + '|' + String(rate) + '|' + String(pitch))
    .digest('hex')
    .slice(0, 40);
}

function audioCacheGet(cacheDir, key, returnBase64) {
  try {
    const mp3Path = path.join(cacheDir, key + '.mp3');
    const metaPath = path.join(cacheDir, key + '.meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const audioPath = mp3Path;
    const audioUrl = pathToFileURL(mp3Path).toString();
    const out = {
      audioPath,
      audioUrl,
      boundaries: Array.isArray(meta.boundaries) ? meta.boundaries : [],
      mime: meta.mime || 'audio/mpeg',
    };
    if (returnBase64) {
      const audioBuf = fs.readFileSync(mp3Path);
      out.audioBase64 = audioBuf.toString('base64');
    }
    return out;
  } catch {
    return null;
  }
}

function audioCacheSet(cacheDir, key, audioBuf, boundaries, mime) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const mp3Path = path.join(cacheDir, key + '.mp3');
    const metaPath = path.join(cacheDir, key + '.meta.json');
    fs.writeFileSync(mp3Path, Buffer.isBuffer(audioBuf) ? audioBuf : Buffer.from(audioBuf || ''));
    fs.writeFileSync(metaPath, JSON.stringify({ boundaries: boundaries || [], mime: mime || 'audio/mpeg' }));
  } catch {}
}

// FIX-TTS-B3 #22: Evict oldest cache files when total size exceeds cap
function _evictIfNeeded(cacheDir, maxBytes) {
  try {
    const files = fs.readdirSync(cacheDir);
    const mp3Files = files.filter(function (f) { return f.endsWith('.mp3'); });
    if (!mp3Files.length) return;

    const entries = [];
    let totalSize = 0;
    for (let i = 0; i < mp3Files.length; i++) {
      const mp3Name = mp3Files[i];
      const mp3Path = path.join(cacheDir, mp3Name);
      const metaName = mp3Name.replace(/\.mp3$/, '.meta.json');
      const metaPath = path.join(cacheDir, metaName);
      try {
        const mp3Stat = fs.statSync(mp3Path);
        let metaSize = 0;
        try { metaSize = fs.statSync(metaPath).size; } catch {}
        totalSize += mp3Stat.size + metaSize;
        entries.push({ mp3Path: mp3Path, metaPath: metaPath, size: mp3Stat.size + metaSize, mtimeMs: mp3Stat.mtimeMs });
      } catch {}
    }

    if (totalSize <= maxBytes) return;

    entries.sort(function (a, b) { return a.mtimeMs - b.mtimeMs; });

    let idx = 0;
    while (totalSize > maxBytes && idx < entries.length) {
      try { fs.unlinkSync(entries[idx].mp3Path); } catch {}
      try { fs.unlinkSync(entries[idx].metaPath); } catch {}
      totalSize -= entries[idx].size;
      idx++;
    }
  } catch {}
}

let edgeTtsLib = null;
let ttsInstance = null;

// OPT-PERF: Track last setMetadata args to skip redundant WebSocket calls.
// setMetadata triggers WebSocket handshake/configuration — calling it for every
// synth request adds ~200-500ms overhead per block even when voice/format are unchanged.
let _lastMeta = { voice: '', format: '' };

function requireEdgeTts() {
  if (!edgeTtsLib) {
    try {
      edgeTtsLib = require('msedge-tts');
    } catch (err) {
      edgeTtsLib = null;
    }
  }
  return edgeTtsLib;
}

function getTtsInstance() {
  const lib = requireEdgeTts();
  if (!lib || !lib.MsEdgeTTS) return null;
  if (!ttsInstance) {
    try {
      ttsInstance = new lib.MsEdgeTTS();
      // FIX_TTS_CRASH: guard _pushMetadata/_pushAudioData against missing streams.
      // The msedge-tts library can receive WebSocket messages for a requestId whose
      // stream was already cleaned up, causing "Cannot read properties of undefined".
      const origMeta = ttsInstance._pushMetadata;
      const origAudio = ttsInstance._pushAudioData;
      ttsInstance._pushMetadata = function (data, requestId) {
        if (this._streams && this._streams[requestId]) return origMeta.call(this, data, requestId);
      };
      ttsInstance._pushAudioData = function (data, requestId) {
        if (this._streams && this._streams[requestId]) return origAudio.call(this, data, requestId);
      };
      // FIX_TTS_CRASH2: The _ws.onmessage handler (line 142 in MsEdgeTTS.js) directly
      // accesses this._streams[requestId].audio.push(null) on TURN_END without guarding.
      // Wrap setMetadata to patch onmessage with a try-catch after the WebSocket is created.
      const origSetMetadata = ttsInstance.setMetadata.bind(ttsInstance);
      ttsInstance.setMetadata = async function (...args) {
        const r = await origSetMetadata(...args);
        if (this._ws && this._ws.onmessage) {
          const origOnMsg = this._ws.onmessage;
          this._ws.onmessage = function (m) {
            try { return origOnMsg(m); } catch {}
          };
        }
        return r;
      };
    } catch (err) {
      ttsInstance = null;
    }
  }
  return ttsInstance;
}

// Reset instance on connection failures so next call creates a fresh one.
function resetTtsInstance() {
  if (ttsInstance) {
    try { ttsInstance.close(); } catch {}
  }
  ttsInstance = null;
  _lastMeta = { voice: '', format: '' };
}

function clamp(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function nowMs() {
  return Date.now();
}

// Convert numeric rate (0.5-2.0, 1.0 = normal) to SSML percentage string.
function rateToString(rate) {
  const pct = Math.round((clamp(rate, 0.5, 2.0, 1.0) - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

// Convert numeric pitch (0.5-2.0, 1.0 = normal) to SSML Hz offset string.
function pitchToString(pitch) {
  const hz = Math.round((clamp(pitch, 0.5, 2.0, 1.0) - 1) * 50);
  return `${hz >= 0 ? '+' : ''}${hz}Hz`;
}

// Normalize raw voice list from msedge-tts to our internal format.
function toVoiceList(rawList) {
  const list = Array.isArray(rawList) ? rawList : [];
  return list.map((v) => ({
    name: String(v && (v.ShortName || v.Name || '') || ''),
    voiceURI: String(v && (v.ShortName || v.Name || '') || ''),
    lang: String(v && (v.Locale || v.locale || '') || ''),
    gender: String(v && (v.Gender || '') || ''),
    localService: false,
    default: String(v && (v.ShortName || '') || '') === 'en-US-AriaNeural',
    engine: 'edge',
  })).filter((v) => !!v.voiceURI);
}

let voicesCache = {
  at: 0,
  voices: [],
};

async function fetchVoicesFresh() {
  const tts = getTtsInstance();
  if (!tts) {
    return { ok: false, voices: [], reason: 'edge_tts_module_missing' };
  }
  try {
    const raw = await tts.getVoices();
    const voices = toVoiceList(raw);
    if (!voices.length) return { ok: false, voices: [], reason: 'voices_empty' };
    voicesCache = { at: nowMs(), voices };
    return { ok: true, voices };
  } catch (err) {
    resetTtsInstance();
    return { ok: false, voices: [], reason: String(err && err.message ? err.message : err) };
  }
}

async function getVoices(_ctx, _evt, opts) {
  const maxAgeMs = Math.max(0, Number(opts && opts.maxAgeMs || 600000));
  if (voicesCache.voices.length && (nowMs() - voicesCache.at) <= maxAgeMs) {
    return { ok: true, voices: voicesCache.voices, cached: true };
  }
  return fetchVoicesFresh();
}

async function synthEdge(payload) {
  // By default keep backwards-compatible base64 responses.
  // Renderers that want a file URL can pass { returnBase64: false }.
  const returnBase64 = !(payload && payload.returnBase64 === false);
  const text = String(payload && payload.text || '').trim();
  if (!text) {
    return { ok: false, errorCode: 'edge_empty_text', reason: 'Text is empty', boundaries: [], audioBase64: '' };
  }

  const lib = requireEdgeTts();
  if (!lib) {
    return { ok: false, errorCode: 'edge_module_missing', reason: 'msedge-tts not available', boundaries: [], audioBase64: '' };
  }

  const tts = getTtsInstance();
  if (!tts) {
    return { ok: false, errorCode: 'edge_api_missing', reason: 'Could not create TTS instance', boundaries: [], audioBase64: '' };
  }

  const voice = String(payload && payload.voice || 'en-US-AriaNeural');
  const rate = rateToString(payload && payload.rate);
  const pitch = pitchToString(payload && payload.pitch);
  const startedAt = nowMs();

  try {
    const outputFormat = lib.OUTPUT_FORMAT && lib.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
      || 'audio-24khz-48kbitrate-mono-mp3';

    // OPT-PERF: Skip setMetadata if voice and format haven't changed since last call.
    // setMetadata involves WebSocket configuration — redundant calls add ~200-500ms per block.
    if (_lastMeta.voice !== voice || _lastMeta.format !== outputFormat) {
      await tts.setMetadata(voice, outputFormat, { wordBoundaryEnabled: true });
      _lastMeta = { voice, format: outputFormat };
    }

    const result = tts.toStream(text, { rate, pitch });
    const audioChunks = [];
    const boundaries = [];

    // FIX-TTS02: Consume audio and metadata streams with a 20-second timeout.
    // If the Edge service hangs, we reject instead of blocking forever.
    const SYNTH_TIMEOUT_MS = 20000;
    await Promise.race([
      new Promise((resolve, reject) => {
        let audioEnded = false;
        let metaEnded = false;

        function checkDone() {
          if (audioEnded && metaEnded) resolve();
        }

        result.audioStream.on('data', (chunk) => {
          audioChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        result.audioStream.on('end', () => { audioEnded = true; checkDone(); });
        result.audioStream.on('error', (err) => { audioEnded = true; reject(err); });

        if (result.metadataStream && typeof result.metadataStream.on === 'function') {
          result.metadataStream.on('data', (meta) => {
            try {
              const raw = Buffer.isBuffer(meta) ? meta.toString('utf8') : String(meta);
              const obj = JSON.parse(raw);
              const items = obj && obj.Metadata ? obj.Metadata : [obj];
              for (const item of items) {
                if (!item || !item.Data) continue;
                // Offset/Duration in 100-nanosecond units → milliseconds.
                const offsetMs = item.Data.Offset ? Math.round(Number(item.Data.Offset) / 10000) : 0;
                const durationMs = item.Data.Duration ? Math.round(Number(item.Data.Duration) / 10000) : 0;
                const word = item.Data.text && item.Data.text.Text ? String(item.Data.text.Text) : '';
                boundaries.push({ offsetMs, durationMs, text: word });
              }
            } catch {}
          });
          result.metadataStream.on('end', () => { metaEnded = true; checkDone(); });
          result.metadataStream.on('close', () => { metaEnded = true; checkDone(); });
          result.metadataStream.on('error', () => { metaEnded = true; checkDone(); });
        } else {
          metaEnded = true;
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('edge_synth_timeout')), SYNTH_TIMEOUT_MS)),
    ]);

    if (!audioChunks.length) {
      return { ok: false, errorCode: 'edge_audio_chunk_recv_none', reason: 'No audio data received', boundaries, audioBase64: '' };
    }

    const audioBuf = Buffer.concat(audioChunks);
    return {
      ok: true,
      elapsedMs: nowMs() - startedAt,
      boundaries,
      audioBuf,
      audioBase64: returnBase64 ? audioBuf.toString('base64') : '',
      encoding: returnBase64 ? 'base64' : 'buffer',
      mime: 'audio/mpeg',
    };
  } catch (err) {
    resetTtsInstance();
    return {
      ok: false,
      errorCode: 'edge_synth_error',
      reason: String(err && err.message ? err.message : err),
      boundaries: [],
      audioBase64: '',
    };
  }
}

async function synth(ctx, _evt, payload) {
  try {
    // LISTEN_P6: check disk cache before calling Edge TTS
    const cacheDir = getAudioCacheDir(ctx);
    const returnBase64 = !(payload && payload.returnBase64 === false);
    if (cacheDir) {
      const text  = String(payload && payload.text || '').trim();
      const voice = String(payload && payload.voice || 'en-US-AriaNeural');
      const rate  = payload && payload.rate  != null ? Number(payload.rate)  : 1.0;
      const pitch = payload && payload.pitch != null ? Number(payload.pitch) : 1.0;
      if (text) {
        const key    = audioCacheKey(text, voice, rate, pitch);
        const cached = audioCacheGet(cacheDir, key, returnBase64);
        if (cached) {
          return {
            ok: true,
            elapsedMs: 0,
            boundaries: cached.boundaries,
            audioBase64: cached.audioBase64 || '',
            audioPath: cached.audioPath,
            audioUrl: cached.audioUrl,
            encoding: returnBase64 ? 'base64' : 'url',
            mime: cached.mime,
            fromCache: true,
          };
        }
      }
    }

    // If cache dir is unavailable, we cannot safely return file URLs.
    // Fall back to base64 to keep synthesis working.
    let payload2 = payload;
    try {
      if (payload && typeof payload === 'object') payload2 = { ...payload };
      if (payload2 && payload2.returnBase64 === false && !cacheDir) payload2.returnBase64 = true;
    } catch {}
    const result = await synthEdge(payload2);

    // LISTEN_P6: write successful result to disk cache (async-safe; errors swallowed)
    if (cacheDir && result && result.ok && (result.audioBuf || result.audioBase64)) {
      try {
        const text  = String(payload && payload.text || '').trim();
        const voice = String(payload && payload.voice || 'en-US-AriaNeural');
        const rate  = payload && payload.rate  != null ? Number(payload.rate)  : 1.0;
        const pitch = payload && payload.pitch != null ? Number(payload.pitch) : 1.0;
        if (text) {
          const key = audioCacheKey(text, voice, rate, pitch);
          audioCacheSet(cacheDir, key, result.audioBuf ? result.audioBuf : Buffer.from(String(result.audioBase64 || ''), 'base64'), result.boundaries, result.mime || 'audio/mpeg');
          // FIX-TTS-B3 #22: Throttled disk cache eviction
          _evictWriteCount++;
          if (_evictWriteCount >= _evictWriteThreshold) {
            _evictWriteCount = 0;
            _evictIfNeeded(cacheDir, _evictMaxBytes);
          }
        }
      } catch {}
    }

    // If caller wants a file URL, avoid pushing huge base64 across IPC.
    if (cacheDir && result && result.ok && (payload && payload.returnBase64 === false)) {
      try {
        const text  = String(payload && payload.text || '').trim();
        const voice = String(payload && payload.voice || 'en-US-AriaNeural');
        const rate  = payload && payload.rate  != null ? Number(payload.rate)  : 1.0;
        const pitch = payload && payload.pitch != null ? Number(payload.pitch) : 1.0;
        if (text) {
          const key = audioCacheKey(text, voice, rate, pitch);
          const cached = audioCacheGet(cacheDir, key, false);
          if (cached) {
            return {
              ok: true,
              elapsedMs: result.elapsedMs || 0,
              boundaries: result.boundaries || [],
              audioPath: cached.audioPath,
              audioUrl: cached.audioUrl,
              audioBase64: '',
              encoding: 'url',
              mime: cached.mime || result.mime || 'audio/mpeg',
              fromCache: false,
            };
          }
        }
      } catch {}
      // fall through: return original result
    }

    // Default / legacy path
    if (result && result.audioBuf) {
      // Never serialize raw Buffers over IPC
      delete result.audioBuf;
    }
    return result;
  } catch (err) {
    return {
      ok: false,
      errorCode: 'edge_synth_internal_error',
      reason: String(err && err.message ? err.message : err),
      boundaries: [],
      audioBase64: '',
    };
  }
}

async function probe(ctx, _evt, payload) {
  const requireSynthesis = !(payload && payload.requireSynthesis === false);
  const allowVoicesOnly = !!(payload && payload.allowVoicesOnly);
  const probeTimeoutMs = Math.max(4000, Number(payload && payload.timeoutMs || 10000));

  const out = {
    ok: true,
    available: false,
    reason: '',
    details: {
      voices: null,
      synth: null,
    },
  };

  const v = await getVoices(ctx, null, { maxAgeMs: 0 });
  out.details.voices = { ok: !!(v && v.ok), count: Array.isArray(v && v.voices) ? v.voices.length : 0, reason: v && v.reason ? String(v.reason) : '' };
  const voicesOk = !!(v && v.ok && Array.isArray(v.voices) && v.voices.length > 0);
  if (voicesOk && !requireSynthesis) {
    out.available = true;
    out.reason = 'voices_ok';
    return out;
  }

  const s = await synth(ctx, null, {
    text: String(payload && payload.text || 'Edge probe'),
    voice: String(payload && payload.voice || 'en-US-AriaNeural'),
    rate: 1.0,
    pitch: 1.0,
    timeoutMs: probeTimeoutMs,
  });
  out.details.synth = { ok: !!(s && s.ok), errorCode: s && s.errorCode ? String(s.errorCode) : '', reason: s && s.reason ? String(s.reason) : '' };
  if (s && s.ok && s.audioBase64) {
    out.available = true;
    out.reason = 'synth_ok';
    return out;
  }

  if (voicesOk && allowVoicesOnly) {
    out.available = true;
    out.reason = 'voices_only_mode';
    return out;
  }

  out.available = false;
  out.reason = (s && (s.errorCode || s.reason)) ? String(s.errorCode || s.reason) : 'probe_failed';
  return out;
}

// FIX-TTS04: Pre-warm Edge TTS WebSocket connection to reduce first-playback latency.
async function warmup(_ctx, _evt, payload) {
  const tts = getTtsInstance();
  if (!tts) return { ok: false, reason: 'edge_tts_module_missing' };
  try {
    const lib = requireEdgeTts();
    if (!lib) return { ok: false, reason: 'edge_tts_lib_missing' };
    const outputFormat = lib.OUTPUT_FORMAT && lib.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
      || 'audio-24khz-48kbitrate-mono-mp3';
    const voice = String(payload && payload.voice || 'en-US-AriaNeural');
    await tts.setMetadata(voice, outputFormat, { wordBoundaryEnabled: true });
    return { ok: true };
  } catch (err) {
    resetTtsInstance();
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
}

// FIX-TTS06: Expose resetInstance to renderer so retry logic can force a fresh WebSocket.
async function resetInstanceHandler(_ctx, _evt) {
  resetTtsInstance();
  return { ok: true };
}

// LISTEN_P6: Clear all files in the on-disk audio cache directory.
async function clearAudioCache(ctx) {
  const cacheDir = getAudioCacheDir(ctx);
  if (!cacheDir) return { ok: false, reason: 'cache_dir_unavailable' };
  try {
    if (!fs.existsSync(cacheDir)) return { ok: true, deletedCount: 0 };
    const files = fs.readdirSync(cacheDir);
    let deleted = 0;
    for (const f of files) {
      try { fs.unlinkSync(path.join(cacheDir, f)); deleted++; } catch {}
    }
    return { ok: true, deletedCount: deleted };
  } catch (err) {
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
}

// LISTEN_P6: Return count + total size of on-disk audio cache.
async function getAudioCacheInfo(ctx) {
  const cacheDir = getAudioCacheDir(ctx);
  if (!cacheDir) return { ok: false, reason: 'cache_dir_unavailable', count: 0, sizeBytes: 0 };
  try {
    if (!fs.existsSync(cacheDir)) return { ok: true, count: 0, sizeBytes: 0 };
    const files = fs.readdirSync(cacheDir);
    const mp3Count = files.filter((f) => f.endsWith('.mp3')).length;
    let sizeBytes = 0;
    for (const f of files) {
      try { sizeBytes += fs.statSync(path.join(cacheDir, f)).size; } catch {}
    }
    return { ok: true, count: mp3Count, sizeBytes };
  } catch (err) {
    return { ok: false, reason: String(err && err.message ? err.message : err), count: 0, sizeBytes: 0 };
  }
}

module.exports = {
  probe,
  getVoices,
  synth,
  warmup,
  resetInstance: resetInstanceHandler,
  clearAudioCache,   // LISTEN_P6
  getAudioCacheInfo, // LISTEN_P6
};
