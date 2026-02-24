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
});

const channelResponse = Object.assign(buildChannelDefaults(ANY), {
  WINDOW_SET_FULLSCREEN: { type: 'boolean' },
  WINDOW_TOGGLE_FULLSCREEN: { type: 'boolean' },
  LIBRARY_SCAN: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
  BOOKS_SCAN: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
  VIDEO_SCAN: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
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
});

module.exports = {
  channelRequest,
  channelResponse,
  eventPayload,
};
