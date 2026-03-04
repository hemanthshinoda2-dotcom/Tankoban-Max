'use strict';

module.exports = {
  name: 'feature-comic-reader',
  section: 'comic',
  ownership: 'Comic reader render/input/state machine and archive decode usage.',
  current: {
    renderer: ['src/domains/reader'],
    main: ['main/domains/comic/index.js', 'main/domains/archives/index.js'],
    preload: ['preload/namespaces/media.js', 'preload/namespaces/player.js'],
  },
};

