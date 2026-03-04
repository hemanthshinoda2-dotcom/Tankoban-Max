'use strict';

const { createPirateBayAdapter } = require('./piratebay');
const { createX1337Adapter } = require('./x1337');
const { createNyaaAdapter } = require('./nyaa');
const { createTorznabAdapter } = require('./torznab');

function createBuiltinAdapters() {
  return [
    createPirateBayAdapter(),
    createX1337Adapter(),
    createNyaaAdapter(),
  ];
}

function createImportedAdapter(indexer) {
  return createTorznabAdapter(indexer);
}

module.exports = {
  createBuiltinAdapters,
  createImportedAdapter,
};

