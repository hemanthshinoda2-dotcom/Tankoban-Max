/*
Tankoban Max - Books Edge TTS bridge domain (FIX-TTS01, FIX-TTS02)
Main-process transport for Edge neural synthesis via msedge-tts.
Same IPC contract as before: probe, getVoices, synth.
*/

let edgeTtsLib = null;
let ttsInstance = null;

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

    await tts.setMetadata(voice, outputFormat, { wordBoundaryEnabled: true });

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
      audioBase64: audioBuf.toString('base64'),
      encoding: 'base64',
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

async function synth(_ctx, _evt, payload) {
  try {
    return await synthEdge(payload);
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

module.exports = {
  probe,
  getVoices,
  synth,
};
