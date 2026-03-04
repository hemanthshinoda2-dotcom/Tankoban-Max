'use strict';

module.exports = {
  name: 'feature-library',
  section: 'library',
  ownership: 'Comics library indexing, shelf rendering, and scan orchestration.',
  current: {
    renderer: ['src/domains/library/library.js', 'src/domains/shell/core.js'],
    main: ['main/domains/library/index.js'],
    preload: ['preload/namespaces/library.js'],
    workers: ['library_scan_worker.js', 'workers/shared'],
  },
};

