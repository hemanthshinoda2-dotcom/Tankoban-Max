// IPC Sync Validator — Phase 1, Session 1
//
// Cross-references shared/ipc.js, preload/index.js, and main/ipc/register/*.js
// to detect dead channels, missing handlers, undefined references, and orphaned files.
//
// Usage:
//   node tools/ipc_sync_check.js          (standalone)
//   const { check } = require('./ipc_sync_check');  (programmatic)

const fs = require('fs');
const path = require('path');

// ── Helpers ──

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

function globSync(dir, pattern) {
  // Simple glob for *.js in a single directory
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(dir, f));
}

// ── Step 1: Parse shared/ipc.js ──

function parseIpcDefinitions(filePath) {
  const src = readText(filePath);

  // Find the CHANNEL = { ... } block
  const channelStart = src.indexOf('const CHANNEL = {');
  const eventStart = src.indexOf('const EVENT = {');
  if (channelStart === -1) throw new Error('Could not find CHANNEL definition in ' + filePath);
  if (eventStart === -1) throw new Error('Could not find EVENT definition in ' + filePath);

  // Extract the CHANNEL block text (from 'const CHANNEL = {' to its closing '};')
  const channelBlock = extractObjectBlock(src, channelStart);
  const eventBlock = extractObjectBlock(src, eventStart);

  // Extract static properties: KEY_NAME: 'string:value'
  const staticPropRe = /^\s*([A-Z_][A-Z0-9_]*)\s*:\s*['"]([\w:.\-]+)['"]/gm;
  const channels = new Map();
  let m;
  while ((m = staticPropRe.exec(channelBlock)) !== null) {
    channels.set(m[1], m[2]);
  }

  // Extract static EVENT properties
  const events = new Map();
  const dynamicEvents = [];
  staticPropRe.lastIndex = 0;
  while ((m = staticPropRe.exec(eventBlock)) !== null) {
    events.set(m[1], m[2]);
  }

  // Detect dynamic event functions: camelCase: (param) => ...
  const dynamicRe = /^\s*([a-zA-Z_]\w*)\s*:\s*\([^)]*\)\s*=>/gm;
  while ((m = dynamicRe.exec(eventBlock)) !== null) {
    dynamicEvents.push(m[1]);
  }

  return { channels, events, dynamicEvents };
}

function extractObjectBlock(src, startPos) {
  // Find the opening brace after startPos
  const braceStart = src.indexOf('{', startPos);
  if (braceStart === -1) return '';
  let depth = 1;
  let i = braceStart + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(braceStart, i);
}

// ── Step 2: Scan main process handlers ──

function scanMainHandlers(ipcIndexPath, registerDir) {
  const handled = new Set();
  const fileMap = new Map(); // channel -> file that handles it

  // Scan main/ipc/index.js itself (for inline registrations like HEALTH_PING)
  const indexSrc = readText(ipcIndexPath);
  const handleRe = /ipcMain\.handle\(\s*CHANNEL\.([A-Z_][A-Z0-9_]*)/g;
  let m;
  while ((m = handleRe.exec(indexSrc)) !== null) {
    handled.add(m[1]);
    fileMap.set(m[1], path.basename(ipcIndexPath));
  }
  // Also check ipcMain.on (for push-style registrations)
  const onRe = /ipcMain\.on\(\s*CHANNEL\.([A-Z_][A-Z0-9_]*)/g;
  while ((m = onRe.exec(indexSrc)) !== null) {
    handled.add(m[1]);
    fileMap.set(m[1], path.basename(ipcIndexPath));
  }

  // Find which register files are actually loaded
  const loadedFiles = new Set();
  const requireRe = /require\(['"]\.\/(register\/[^'"]+)['"]\)/g;
  while ((m = requireRe.exec(indexSrc)) !== null) {
    // Normalize: 'register/window' -> 'window.js'
    const base = path.basename(m[1]) + (m[1].endsWith('.js') ? '' : '.js');
    loadedFiles.add(base);
  }

  // Scan all register/*.js files
  const registerFiles = globSync(registerDir);
  const orphanedFiles = [];

  for (const filePath of registerFiles) {
    const basename = path.basename(filePath);
    const isLoaded = loadedFiles.has(basename);
    if (!isLoaded) {
      orphanedFiles.push(basename);
    }

    const src = readText(filePath);
    handleRe.lastIndex = 0;
    onRe.lastIndex = 0;

    while ((m = handleRe.exec(src)) !== null) {
      if (isLoaded) {
        handled.add(m[1]);
        fileMap.set(m[1], basename);
      }
      // If not loaded, we still note the channel exists in an orphaned file
    }
    while ((m = onRe.exec(src)) !== null) {
      if (isLoaded) {
        handled.add(m[1]);
        fileMap.set(m[1], basename);
      }
    }
  }

  return { handled, fileMap, orphanedFiles, loadedFiles };
}

// ── Step 3: Scan preload ──

function scanPreload(preloadPath) {
  const src = readText(preloadPath);
  const channelRefs = new Set();
  const eventRefs = new Set();

  // Extract all CHANNEL.XXX references
  const channelRe = /CHANNEL\.([A-Z_][A-Z0-9_]*)/g;
  let m;
  while ((m = channelRe.exec(src)) !== null) {
    channelRefs.add(m[1]);
  }

  // Extract all EVENT.XXX references (both static and dynamic)
  const eventRe = /EVENT\.([A-Za-z_]\w*)/g;
  while ((m = eventRe.exec(src)) !== null) {
    eventRefs.add(m[1]);
  }

  return { channelRefs, eventRefs };
}

// ── Step 4: Cross-reference and report ──

function check({ appRoot }) {
  const errors = [];
  const warnings = [];

  const sharedPath = path.join(appRoot, 'shared', 'ipc.js');
  const preloadPath = path.join(appRoot, 'preload', 'index.js');
  const ipcIndexPath = path.join(appRoot, 'main', 'ipc', 'index.js');
  const registerDir = path.join(appRoot, 'main', 'ipc', 'register');

  // Parse definitions
  const { channels, events, dynamicEvents } = parseIpcDefinitions(sharedPath);

  // Scan main handlers
  const { handled, fileMap, orphanedFiles } = scanMainHandlers(ipcIndexPath, registerDir);

  // Scan preload
  const { channelRefs, eventRefs } = scanPreload(preloadPath);

  // ── Undefined CHANNEL references in preload ──
  for (const ref of channelRefs) {
    if (!channels.has(ref)) {
      errors.push(`UNDEFINED: preload references CHANNEL.${ref} which is not defined in shared/ipc.js`);
    }
  }

  // ── Undefined EVENT references in preload ──
  for (const ref of eventRefs) {
    if (!events.has(ref) && !dynamicEvents.includes(ref)) {
      errors.push(`UNDEFINED: preload references EVENT.${ref} which is not defined in shared/ipc.js`);
    }
  }

  // ── Dead channels: defined but no handler AND no preload use ──
  for (const [key] of channels) {
    if (!handled.has(key) && !channelRefs.has(key)) {
      warnings.push(`DEAD CHANNEL: CHANNEL.${key} is defined but has no handler and no preload reference`);
    }
  }

  // ── Missing handlers: preload invokes but main doesn't handle ──
  // Classified as warnings (invoke will hang/timeout but not crash)
  for (const ref of channelRefs) {
    if (channels.has(ref) && !handled.has(ref)) {
      warnings.push(`MISSING HANDLER: preload invokes CHANNEL.${ref} but no ipcMain.handle() found in loaded register files`);
    }
  }

  // ── Missing preload: main handles but preload never invokes ──
  for (const key of handled) {
    if (channels.has(key) && !channelRefs.has(key)) {
      warnings.push(`UNUSED HANDLER: main handles CHANNEL.${key} (in ${fileMap.get(key)}) but preload never invokes it`);
    }
  }

  // ── Dead events: defined but never listened to in preload ──
  for (const [key] of events) {
    if (!eventRefs.has(key)) {
      warnings.push(`DEAD EVENT: EVENT.${key} is defined but never referenced in preload`);
    }
  }

  // ── Orphaned register files ──
  for (const file of orphanedFiles) {
    warnings.push(`ORPHANED FILE: main/ipc/register/${file} exists but is not loaded by main/ipc/index.js`);
  }

  // ── Dynamic events info (not errors, just FYI) ──
  const info = [];
  for (const name of dynamicEvents) {
    info.push(`DYNAMIC EVENT: EVENT.${name}() — skipped sync check (runtime-generated channel)`);
  }

  const ok = errors.length === 0;
  return { ok, errors, warnings, info, stats: {
    channelsDefined: channels.size,
    eventsDefined: events.size,
    dynamicEvents: dynamicEvents.length,
    mainHandled: handled.size,
    preloadChannelRefs: channelRefs.size,
    preloadEventRefs: eventRefs.size,
  }};
}

// ── CLI entry point ──

function main() {
  const appRoot = path.resolve(__dirname, '..');
  const result = check({ appRoot });

  const isTTY = process.stdout.isTTY;
  const red = isTTY ? '\x1b[31m' : '';
  const yellow = isTTY ? '\x1b[33m' : '';
  const green = isTTY ? '\x1b[32m' : '';
  const cyan = isTTY ? '\x1b[36m' : '';
  const reset = isTTY ? '\x1b[0m' : '';

  console.log(`\n${cyan}IPC Sync Check${reset}`);
  console.log(`  Channels defined: ${result.stats.channelsDefined}`);
  console.log(`  Events defined:   ${result.stats.eventsDefined} static + ${result.stats.dynamicEvents} dynamic`);
  console.log(`  Main handlers:    ${result.stats.mainHandled}`);
  console.log(`  Preload channels: ${result.stats.preloadChannelRefs}`);
  console.log(`  Preload events:   ${result.stats.preloadEventRefs}`);

  if (result.info.length) {
    console.log(`\n${cyan}Info:${reset}`);
    for (const msg of result.info) console.log(`  ${msg}`);
  }

  if (result.warnings.length) {
    console.log(`\n${yellow}Warnings (${result.warnings.length}):${reset}`);
    for (const msg of result.warnings) console.log(`  ${yellow}WARN${reset}  ${msg}`);
  }

  if (result.errors.length) {
    console.log(`\n${red}Errors (${result.errors.length}):${reset}`);
    for (const msg of result.errors) console.log(`  ${red}ERR${reset}   ${msg}`);
  }

  if (result.ok) {
    console.log(`\n${green}IPC sync check passed.${reset}\n`);
  } else {
    console.log(`\n${red}IPC sync check FAILED.${reset}\n`);
  }

  process.exit(result.ok ? 0 : 1);
}

// Run CLI if invoked directly
if (require.main === module) {
  main();
}

module.exports = { check };
