'use strict';

const path = require('path');

const CANONICAL_SECTIONS = new Set([
  'shell',
  'library',
  'comic',
  'book',
  'audiobook',
  'video',
  'browser',
  'torrent',
]);

const SECTION_ALIASES = Object.freeze({
  comics: 'comic',
  'comic-reader': 'comic',
  reader: 'comic',
  books: 'book',
  'book-reader': 'book',
  'audiobook-reader': 'audiobook',
  audiobooks: 'audiobook',
  videos: 'video',
  'video-player': 'video',
  web: 'browser',
  'web-browser': 'browser',
});

function normalizeSection(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return '';
  const mapped = SECTION_ALIASES[key] || key;
  return CANONICAL_SECTIONS.has(mapped) ? mapped : '';
}

function launchSectionApp(options = {}) {
  const requested = options && typeof options === 'object' ? options.section : '';
  const section = normalizeSection(requested) || normalizeSection(process.env.TANKOBAN_APP_SECTION) || 'shell';
  const appRoot = path.resolve(__dirname, '..', '..');

  process.env.TANKOBAN_APP_SECTION = section;
  process.env.TANKOBAN_APP_ENTRY = String((options && options.entryName) || section);

  require(path.join(appRoot, 'main', 'index'))({ APP_ROOT: appRoot });
}

module.exports = {
  launchSectionApp,
  normalizeSection,
  CANONICAL_SECTIONS: Array.from(CANONICAL_SECTIONS),
};

