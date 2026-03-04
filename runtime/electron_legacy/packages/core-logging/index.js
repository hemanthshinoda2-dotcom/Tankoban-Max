'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

function createLogger(name) {
  const tag = String(name || 'tankoban').trim() || 'tankoban';
  const file = path.join(os.tmpdir(), `tankoban_${tag}.log`);
  return {
    path: file,
    log: function log(msg) {
      try { fs.appendFileSync(file, `[${new Date().toISOString()}] ${String(msg || '')}\n`); } catch {}
    },
  };
}

module.exports = {
  name: 'core-logging',
  ownership: 'Cross-process diagnostic log boundaries and debug policy.',
  current: {
    mainBoot: 'main/index.js',
    ipcRegistry: 'main/ipc/index.js',
    healthMonitor: 'src/services/health/monitor.js',
  },
  createLogger,
};
