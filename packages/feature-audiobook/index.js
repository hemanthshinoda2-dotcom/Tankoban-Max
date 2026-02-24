'use strict';

module.exports = {
  name: 'feature-audiobook',
  section: 'audiobook',
  ownership: 'Audiobook library, pairing, and progress features.',
  current: {
    renderer: [
      'src/domains/books/listening_player.js',
      'src/domains/books/audiobook_player_overlay.js',
      'src/domains/books/reader/reader_audiobook.js',
      'src/domains/books/reader/reader_audiobook_pairing.js',
    ],
    main: [
      'main/domains/audiobooks/index.js',
      'main/domains/audiobookProgress/index.js',
      'main/domains/audiobookPairing/index.js',
    ],
    preload: ['preload/namespaces/audiobooks.js'],
  },
};

