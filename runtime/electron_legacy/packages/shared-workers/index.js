'use strict';

module.exports = {
  name: 'shared-workers',
  ownership: 'Library/media scanning workers and worker shared helpers.',
  current: {
    roots: [
      'library_scan_worker.js',
      'books_scan_worker.js',
      'video_scan_worker.js',
      'audiobook_scan_worker.js',
    ],
    shared: 'workers/shared',
  },
};

