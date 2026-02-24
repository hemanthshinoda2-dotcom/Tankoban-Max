'use strict';

module.exports = {
  name: 'feature-browser',
  section: 'browser',
  ownership: 'Integrated browser mode, tabs, history, bookmarks, session, userscripts, and adblock.',
  current: {
    renderer: ['src/domains/web'],
    main: [
      'main/domains/webSources/index.js',
      'main/domains/webHistory/index.js',
      'main/domains/webBookmarks/index.js',
      'main/domains/webBrowserSettings/index.js',
      'main/domains/webSession/index.js',
      'main/domains/webPermissions/index.js',
      'main/domains/webData/index.js',
      'main/domains/webAdblock/index.js',
      'main/domains/webUserscripts/index.js',
    ],
    preload: ['preload/namespaces/web.js'],
  },
};

