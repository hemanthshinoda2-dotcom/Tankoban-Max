// IPC Scaffold Tool — Phase 5, Session 14
//
// Auto-generates a new IPC channel stub across all three files:
//   1. shared/ipc.js          — CHANNEL constant
//   2. preload/namespaces/*.js — preload method
//   3. main/ipc/register/*.js  — ipcMain.handle registration
//
// Usage:
//   node tools/ipc_scaffold.js --channel VIDEO_GET_METADATA --namespace video --method getMetadata
//   node tools/ipc_scaffold.js --channel VIDEO_GET_METADATA --namespace video --dry-run

const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');

// ── CLI argument parsing ──

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--') && i + 1 < argv.length) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = argv[++i];
    }
  }
  return args;
}

function deriveDefaults(args) {
  if (!args.channel) abort('--channel is required (e.g. VIDEO_GET_METADATA)');
  if (!args.namespace) abort('--namespace is required (e.g. video)');

  // Derive method from channel name: VIDEO_GET_METADATA → getMetadata
  if (!args.method) {
    const prefix = args.namespace.toUpperCase().replace(/-/g, '_') + '_';
    var suffix = args.channel;
    if (suffix.startsWith(prefix)) suffix = suffix.slice(prefix.length);
    // Convert UPPER_SNAKE to camelCase
    args.method = suffix.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  // Derive channel string: namespace:method
  if (!args.string) {
    args.string = args.namespace + ':' + args.method;
  }

  // Derive register file basename: namespace (camelCase → snake_case)
  if (!args.register) {
    args.register = args.namespace.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
  }

  // Derive domain variable: namespaceDomain
  if (!args.domain) {
    args.domain = args.namespace + 'Domain';
  }

  return args;
}

function abort(msg) {
  console.error('ERROR: ' + msg);
  process.exit(1);
}

// ── File paths ──

function getPaths(args) {
  return {
    shared: path.join(APP_ROOT, 'shared', 'ipc.js'),
    preload: path.join(APP_ROOT, 'preload', 'namespaces', args.namespace + '.js'),
    register: path.join(APP_ROOT, 'main', 'ipc', 'register', args.register + '.js'),
  };
}

// ── Step 1: Insert into shared/ipc.js ──

function insertSharedChannel(src, args) {
  // Safety: check if channel already exists
  if (src.includes(args.channel + ':') || src.includes("'" + args.string + "'")) {
    abort('CHANNEL.' + args.channel + ' already exists in shared/ipc.js');
  }

  // Find the closing }; of the CHANNEL object (line before `const EVENT`)
  var channelEnd = src.indexOf('};\n\n/**\n * EVENT');
  if (channelEnd === -1) {
    // Fallback: find the last }; before EVENT
    channelEnd = src.indexOf('};\n\nconst EVENT');
  }
  if (channelEnd === -1) {
    // Last resort: find the CHANNEL closing brace
    var eventStart = src.indexOf('const EVENT');
    if (eventStart === -1) abort('Cannot find EVENT definition in shared/ipc.js');
    // Search backward from EVENT for };
    channelEnd = src.lastIndexOf('};', eventStart);
  }
  if (channelEnd === -1) abort('Cannot find CHANNEL closing brace in shared/ipc.js');

  // Find the section for this namespace
  var sectionName = args.namespace.charAt(0).toUpperCase() + args.namespace.slice(1);
  // Look for section header like "// Video" or "// Shell"
  var sectionPattern = new RegExp(
    '// ={3,}[ \\t]*\\n[ \\t]*// ' + escapeRegex(sectionName) + '\\b[^\\n]*\\n[ \\t]*// ={3,}',
    'i'
  );
  var sectionMatch = sectionPattern.exec(src);

  var insertPos;
  if (sectionMatch) {
    // Found existing section — find the last constant in this section
    var sectionStart = sectionMatch.index + sectionMatch[0].length;
    // Find the next section header or the end of CHANNEL
    var nextSection = src.indexOf('\n\n  // ====', sectionStart);
    if (nextSection === -1 || nextSection >= channelEnd) nextSection = channelEnd;

    // Find the last constant line before the next section
    // (last line matching:  SOME_CONST: 'value',)
    var chunk = src.slice(sectionStart, nextSection);
    var lastConstRe = /^\s+[A-Z_][A-Z0-9_]*:\s*'[^']+',?\s*$/gm;
    var lastMatch = null;
    var m;
    while ((m = lastConstRe.exec(chunk)) !== null) lastMatch = m;
    if (lastMatch) {
      insertPos = sectionStart + lastMatch.index + lastMatch[0].length;
    } else {
      // No constants in section yet — insert after section header
      insertPos = sectionStart;
    }
  } else {
    // No matching section — create a new section before CHANNEL closing brace
    var newSection = '\n\n  // ========================================\n' +
                     '  // ' + sectionName + '\n' +
                     '  // ========================================\n' +
                     '  \n' +
                     '  /** TODO: describe. Returns: TODO */\n' +
                     '  ' + args.channel + ": '" + args.string + "',";
    return src.slice(0, channelEnd) + newSection + '\n' + src.slice(channelEnd);
  }

  // Insert the new constant
  var entry = '\n\n  /** TODO: describe. Returns: TODO */\n' +
              '  ' + args.channel + ": '" + args.string + "',";
  return src.slice(0, insertPos) + entry + src.slice(insertPos);
}

// ── Step 2: Insert into preload namespace ──

function insertPreloadMethod(src, args) {
  // Safety: check if method already exists
  var methodPat = new RegExp('\\b' + escapeRegex(args.method) + '\\s*:');
  if (methodPat.test(src)) {
    abort(args.method + ' already exists in preload namespace file');
  }

  // Find the namespace object: e.g. "video: {"
  var nsPat = new RegExp('(\\b' + escapeRegex(args.namespace) + '\\s*:\\s*\\{)');
  var nsMatch = nsPat.exec(src);
  if (!nsMatch) {
    // Namespace might be the first key in the return object
    // Try to find the closing of the return object's last namespace
    // Insert as a new namespace before the closing };
    var closingRe = /\n\s*\};\s*\n\};?\s*$/;
    var closingMatch = closingRe.exec(src);
    if (!closingMatch) abort('Cannot find insertion point in preload namespace file');

    // Add a new namespace
    var nsEntry = '\n\n    ' + args.namespace + ': {\n' +
                  '      ' + args.method + ': (opts) => ipcRenderer.invoke(CHANNEL.' + args.channel + ', opts),\n' +
                  '    },';
    return src.slice(0, closingMatch.index) + nsEntry + src.slice(closingMatch.index);
  }

  // Find the closing } of this namespace object
  var braceStart = nsMatch.index + nsMatch[0].length;
  var depth = 1;
  var i = braceStart;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  // i is now just past the closing }
  var closingBrace = i - 1;

  // Insert new method before the closing }
  var indent = '      ';
  var methodLine = indent + args.method + ': (opts) => ipcRenderer.invoke(CHANNEL.' + args.channel + ', opts),\n';

  // Check if there's already content — add a newline separator
  var beforeBrace = src.slice(braceStart, closingBrace).trimEnd();
  var needsComma = beforeBrace.length > 0 && !beforeBrace.endsWith(',');
  var prefix = needsComma ? ',' : '';

  return src.slice(0, closingBrace) + prefix + '\n' + methodLine + '    ' + src.slice(closingBrace);
}

// ── Step 3: Insert into main register file ──

function insertRegisterHandler(src, args) {
  // Safety: check if handler already exists
  if (src.includes('CHANNEL.' + args.channel)) {
    abort('Handler for CHANNEL.' + args.channel + ' already exists in register file');
  }

  // Find the closing }; of the module.exports function
  // Pattern: the last }; in the file
  var lastClose = src.lastIndexOf('};');
  if (lastClose === -1) abort('Cannot find closing }; in register file');

  // Insert before the closing };
  var handler = '  ipcMain.handle(CHANNEL.' + args.channel +
                ', (e, ...args) => domains.' + args.domain + '.' + args.method + '(ctx, e, ...args));\n';

  return src.slice(0, lastClose) + '\n' + handler + '\n' + src.slice(lastClose);
}

// ── Utilities ──

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Main ──

function main() {
  var rawArgs = parseArgs(process.argv);

  if (!rawArgs.channel && !rawArgs.namespace) {
    console.log('IPC Scaffold Tool — auto-generate IPC channel stubs\n');
    console.log('Usage:');
    console.log('  node tools/ipc_scaffold.js --channel NAME --namespace NS [options]\n');
    console.log('Required:');
    console.log('  --channel NAME    CHANNEL constant (e.g. VIDEO_GET_METADATA)');
    console.log('  --namespace NS    Preload namespace (e.g. video)\n');
    console.log('Optional:');
    console.log('  --method METHOD   Preload method name (default: derived from channel)');
    console.log('  --string STR      Channel string value (default: namespace:method)');
    console.log('  --register FILE   Register file basename (default: namespace)');
    console.log('  --domain DOM      Domain variable name (default: namespaceDomain)');
    console.log('  --dry-run         Show what would be generated without modifying files');
    process.exit(0);
  }

  var args = deriveDefaults(rawArgs);
  var paths = getPaths(args);
  var dryRun = args.dryRun || false;

  // Validate files exist
  if (!fs.existsSync(paths.shared)) abort('shared/ipc.js not found');
  if (!fs.existsSync(paths.preload)) abort('preload/namespaces/' + args.namespace + '.js not found');
  if (!fs.existsSync(paths.register)) abort('main/ipc/register/' + args.register + '.js not found');

  var isTTY = process.stdout.isTTY;
  var cyan = isTTY ? '\x1b[36m' : '';
  var green = isTTY ? '\x1b[32m' : '';
  var yellow = isTTY ? '\x1b[33m' : '';
  var reset = isTTY ? '\x1b[0m' : '';

  console.log(cyan + '\nIPC Scaffold' + reset);
  console.log('  Channel:   CHANNEL.' + args.channel);
  console.log('  String:    ' + args.string);
  console.log('  Namespace: ' + args.namespace + '.' + args.method);
  console.log('  Register:  main/ipc/register/' + args.register + '.js');
  console.log('  Domain:    domains.' + args.domain + '.' + args.method);
  console.log('  Mode:      ' + (dryRun ? yellow + 'DRY RUN' + reset : green + 'LIVE' + reset));
  console.log('');

  // Read current files (normalize line endings for cross-platform regex)
  var sharedSrc = fs.readFileSync(paths.shared, 'utf-8').replace(/\r\n/g, '\n');
  var preloadSrc = fs.readFileSync(paths.preload, 'utf-8').replace(/\r\n/g, '\n');
  var registerSrc = fs.readFileSync(paths.register, 'utf-8').replace(/\r\n/g, '\n');

  // Generate new content
  var newShared = insertSharedChannel(sharedSrc, args);
  var newPreload = insertPreloadMethod(preloadSrc, args);
  var newRegister = insertRegisterHandler(registerSrc, args);

  if (dryRun) {
    console.log(cyan + '── shared/ipc.js (new entry) ──' + reset);
    console.log('  ' + args.channel + ": '" + args.string + "'");
    console.log('');
    console.log(cyan + '── preload/namespaces/' + args.namespace + '.js (new method) ──' + reset);
    console.log('  ' + args.method + ': (opts) => ipcRenderer.invoke(CHANNEL.' + args.channel + ', opts)');
    console.log('');
    console.log(cyan + '── main/ipc/register/' + args.register + '.js (new handler) ──' + reset);
    console.log('  ipcMain.handle(CHANNEL.' + args.channel + ', (e, ...args) => domains.' + args.domain + '.' + args.method + '(ctx, e, ...args))');
    console.log('');
    console.log(yellow + 'Dry run complete. No files modified.' + reset);
  } else {
    fs.writeFileSync(paths.shared, newShared, 'utf-8');
    fs.writeFileSync(paths.preload, newPreload, 'utf-8');
    fs.writeFileSync(paths.register, newRegister, 'utf-8');
    console.log(green + 'Done. Stubs generated in all 3 files.' + reset);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Update the JSDoc comment in shared/ipc.js (replace TODO)');
    console.log('  2. Implement domains.' + args.domain + '.' + args.method + '() in main/domains/' + args.namespace + '/');
    console.log('  3. Wire it through api_gateway.js if needed');
    console.log('  4. Run: npm run smoke');
  }
}

if (require.main === module) {
  main();
}

module.exports = { insertSharedChannel, insertPreloadMethod, insertRegisterHandler };
