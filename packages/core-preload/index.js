'use strict';

module.exports = {
  name: 'core-preload',
  ownership: 'Preload bridge composition and namespace exposure.',
  current: {
    entry: 'preload/index.js',
    namespaces: 'preload/namespaces',
    legacyAliases: 'preload/namespaces/_legacy.js',
  },
};

