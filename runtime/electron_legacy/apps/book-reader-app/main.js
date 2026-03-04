'use strict';

const { launchSectionApp } = require('../../packages/core-main');

launchSectionApp({
  section: 'book',
  entryName: 'apps/book-reader-app/main.js',
});

