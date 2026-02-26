'use strict';

const ipc = require('../../shared/ipc');

function getContracts() {
  return {
    CHANNEL: ipc.CHANNEL,
    EVENT: ipc.EVENT,
    CHANNEL_V2: ipc.CHANNEL_V2 || {},
    EVENT_V2: ipc.EVENT_V2 || {},
    DEPRECATED_CHANNEL_ALIASES: ipc.DEPRECATED_CHANNEL_ALIASES || {},
    DEPRECATED_EVENT_ALIASES: ipc.DEPRECATED_EVENT_ALIASES || {},
  };
}

module.exports = Object.assign({}, ipc, { getContracts });
