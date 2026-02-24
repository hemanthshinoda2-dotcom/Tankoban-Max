'use strict';

module.exports = {
  name: 'feature-video',
  section: 'video',
  ownership: 'Video library, playback shell, progress, and settings.',
  current: {
    renderer: ['src/domains/video'],
    main: [
      'main/domains/video/index.js',
      'main/domains/videoProgress/index.js',
      'main/domains/videoSettings/index.js',
      'main/domains/videoDisplayNames/index.js',
      'main/domains/videoUi/index.js',
      'main/domains/player_core/index.js',
    ],
    preload: ['preload/namespaces/video.js', 'preload/namespaces/player.js', 'preload/namespaces/media.js'],
    workers: ['video_scan_worker.js'],
  },
};

