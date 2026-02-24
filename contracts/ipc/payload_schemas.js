'use strict';

const { CHANNEL, EVENT } = require('../../shared/ipc');

const ANY = Object.freeze({ kind: 'any' });
const ANY_OBJECT = Object.freeze({ type: 'object' });
const ANY_ARRAY = Object.freeze({ type: 'array' });

function buildChannelDefaults(defaultSchema) {
  return Object.fromEntries(Object.keys(CHANNEL).map((key) => [key, defaultSchema]));
}

function buildEventDefaults(defaultSchema) {
  return Object.fromEntries(
    Object.keys(EVENT)
      .filter((key) => typeof EVENT[key] === 'string')
      .map((key) => [key, defaultSchema])
  );
}

const channelRequest = Object.assign(buildChannelDefaults(ANY_ARRAY), {
  WINDOW_SET_FULLSCREEN: { type: 'array', minItems: 1, maxItems: 1, items: [{ type: 'boolean' }] },
  WINDOW_TOGGLE_FULLSCREEN: { type: 'array', maxItems: 0 },
  LIBRARY_SCAN: { type: 'array', items: [{ type: 'object' }] },
  BOOKS_SCAN: { type: 'array', items: [{ type: 'object' }] },
  VIDEO_SCAN: { type: 'array', items: [{ type: 'object' }] },
  WEB_TORRENT_START_MAGNET: {
    type: 'array',
    minItems: 1,
    items: [
      {
        type: 'object',
        required: ['magnetUri'],
        properties: { magnetUri: { type: 'string' }, referer: { type: 'string', nullable: true } },
      },
    ],
  },

  // FEAT-BROWSER: New torrent channels
  WEB_TORRENT_REMOVE: { type: 'array', minItems: 1, items: [{ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }] },
  WEB_TORRENT_PAUSE_ALL: { type: 'array', maxItems: 0 },
  WEB_TORRENT_RESUME_ALL: { type: 'array', maxItems: 0 },
  WEB_TORRENT_GET_PEERS: { type: 'array', minItems: 1, items: [{ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }] },
  WEB_TORRENT_GET_DHT_NODES: { type: 'array', maxItems: 0 },
  WEB_TORRENT_SELECT_SAVE_FOLDER: { type: 'array', maxItems: 0 },
  WEB_TORRENT_RESOLVE_METADATA: { type: 'array', minItems: 1, items: [{ type: 'string' }] },
  WEB_TORRENT_START_CONFIGURED: { type: 'array', minItems: 1, items: [{ type: 'object', required: ['resolveId'], properties: { resolveId: { type: 'string' }, savePath: { type: 'string', nullable: true }, selectedFiles: { type: 'array', nullable: true } } }] },
  WEB_TORRENT_CANCEL_RESOLVE: { type: 'array', minItems: 1, items: [{ type: 'object', required: ['resolveId'], properties: { resolveId: { type: 'string' } } }] },

  // FEAT-BROWSER: Search history
  WEB_SEARCH_SUGGEST: { type: 'array', minItems: 1, items: [{ type: 'string' }] },

  // FEAT-BROWSER: Browser actions
  WEB_PRINT_PDF: { type: 'array', minItems: 1, items: [{ type: 'object', required: ['webContentsId'], properties: { webContentsId: { type: 'number' } } }] },
  WEB_CAPTURE_PAGE: { type: 'array', minItems: 1, items: [{ type: 'object', required: ['webContentsId'], properties: { webContentsId: { type: 'number' } } }] },
});

const channelResponse = Object.assign(buildChannelDefaults(ANY), {
  WINDOW_SET_FULLSCREEN: { type: 'boolean' },
  WINDOW_TOGGLE_FULLSCREEN: { type: 'boolean' },
  LIBRARY_SCAN: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
  BOOKS_SCAN: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
  VIDEO_SCAN: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },

  // FEAT-BROWSER: New torrent responses
  WEB_TORRENT_REMOVE: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
  WEB_TORRENT_PAUSE_ALL: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
  WEB_TORRENT_RESUME_ALL: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
  WEB_TORRENT_GET_PEERS: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, peers: { type: 'array' } } },
  WEB_TORRENT_GET_DHT_NODES: { type: 'number' },
  WEB_TORRENT_SELECT_SAVE_FOLDER: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, path: { type: 'string', nullable: true } } },
  WEB_TORRENT_RESOLVE_METADATA: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, resolveId: { type: 'string', nullable: true }, name: { type: 'string', nullable: true }, files: { type: 'array', nullable: true } } },
  WEB_TORRENT_START_CONFIGURED: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, id: { type: 'string', nullable: true } } },
  WEB_TORRENT_CANCEL_RESOLVE: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },

  // FEAT-BROWSER: Search history response
  WEB_SEARCH_SUGGEST: { type: 'array' },

  // FEAT-BROWSER: Browser action responses
  WEB_PRINT_PDF: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, path: { type: 'string', nullable: true } } },
  WEB_CAPTURE_PAGE: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, path: { type: 'string', nullable: true } } },
});

const eventPayload = Object.assign(buildEventDefaults(ANY_OBJECT), {
  APP_OPEN_FILES: {
    type: 'object',
    required: ['paths', 'source'],
    properties: {
      paths: { type: 'array', items: { type: 'string' } },
      source: { type: 'string' },
    },
  },
  VIDEO_UPDATED: { type: 'object' },
  BOOKS_UPDATED: { type: 'object' },
  LIBRARY_UPDATED: { type: 'object' },

  // FEAT-BROWSER: New events
  WEB_CTX_MENU: { type: 'object', required: ['webContentsId', 'params'], properties: { webContentsId: { type: 'number' }, params: { type: 'object' } } },
  WEB_CREATE_TAB: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
  WEB_MAGNET_DETECTED: { type: 'object', required: ['magnetUri'], properties: { magnetUri: { type: 'string' }, webContentsId: { type: 'number' } } },
  WEB_TORRENT_FILE_DETECTED: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, webContentsId: { type: 'number' } } },
});

module.exports = {
  channelRequest,
  channelResponse,
  eventPayload,
};
