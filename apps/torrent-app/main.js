'use strict';

const { launchSectionApp } = require('../../packages/core-main');

launchSectionApp({
  section: 'torrent',
  entryName: 'apps/torrent-app/main.js',
});

