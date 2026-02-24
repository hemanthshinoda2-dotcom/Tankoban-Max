'use strict';

module.exports = {
  name: 'shared-media',
  ownership: 'Shared media runtime adapters for video and player core.',
  current: {
    rendererVideoDomain: 'src/domains/video',
    mainPlayerCore: 'main/domains/player_core/index.js',
    resources: [
      'resources/mpv/windows',
      'player_qt',
    ],
  },
};

