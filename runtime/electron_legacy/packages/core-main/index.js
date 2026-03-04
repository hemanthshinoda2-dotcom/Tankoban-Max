'use strict';

module.exports = Object.assign(
  {},
  require('./launch_section_app'),
  {
    libraryBridge: require('./library_bridge'),
    current: {
      launch: 'packages/core-main/launch_section_app.js',
      libraryBridge: 'packages/core-main/library_bridge.js',
    },
  },
);
