'use strict';

async function startTorrentFromBuffer(ctx, payload) {
  try {
    var webTorrentDomain = require('../../main/domains/webTorrent');
    if (!webTorrentDomain || typeof webTorrentDomain.startTorrentBuffer !== 'function') {
      return { ok: false, error: 'Torrent engine unavailable' };
    }
    var p = (payload && typeof payload === 'object') ? payload : {};
    return await webTorrentDomain.startTorrentBuffer(ctx, null, {
      buffer: p.buffer,
      referer: p.referer,
      sourceUrl: p.sourceUrl,
      destinationRoot: p.destinationRoot,
      origin: p.origin || 'sources_v2',
    });
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err || 'Failed to start torrent') };
  }
}

module.exports = {
  startTorrentFromBuffer: startTorrentFromBuffer,
};

