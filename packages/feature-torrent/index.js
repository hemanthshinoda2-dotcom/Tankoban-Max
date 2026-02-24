'use strict';

module.exports = {
  name: 'feature-torrent',
  section: 'torrent',
  ownership: 'WebTorrent session and Tor proxy integration used by browser/torrent flows.',
  current: {
    renderer: ['src/domains/web/web_module_torrent_tab.js', 'src/domains/web/web.js'],
    main: ['main/domains/webTorrent/index.js', 'main/domains/torProxy/index.js'],
    preload: ['preload/namespaces/web.js'],
    tools: ['tools/fetch_tor.js'],
  },
};

