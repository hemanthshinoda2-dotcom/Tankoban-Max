// Dead Export Check — Phase 5, Session 15
//
// Finds window.* assignments in src/ JS files that are never read
// by any other file in src/.
//
// Usage:
//   node tools/dead_export_check.js          (standalone)
//   const { check } = require('./dead_export_check');  (programmatic)

const fs = require('fs');
const path = require('path');

// ── Helpers ──

function readText(p) {
  return fs.readFileSync(p, 'utf-8');
}

function walkJsFiles(dir) {
  var out = [];
  var stack = [dir];
  while (stack.length) {
    var cur = stack.pop();
    var entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
    catch { continue; }
    for (var e of entries) {
      var full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'build' || e.name.startsWith('.') || e.name === 'vendor') continue;
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith('.js')) {
        out.push(full);
      }
    }
  }
  return out;
}

// ── Well-known exports (always valid, skip these) ──

var WHITELIST = new Set([
  'Tanko',           // Main API namespace
  'el',              // Global DOM ref cache
  'electronAPI',     // Preload bridge
  'appState',        // Global app state
]);

// ── Extract window.* assignments ──

function extractWindowExports(content) {
  var exports = new Map(); // name -> line number

  // Match: window.XYZ = (assignment)
  // Also: window.XYZ ||= or window.XYZ = window.XYZ ||
  var re = /\bwindow\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=|\|\|=)/g;
  var lines = content.split('\n');
  var m;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Skip comments
    var trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      var name = m[1];
      if (!WHITELIST.has(name) && !exports.has(name)) {
        exports.set(name, i + 1);
      }
    }
  }

  return exports;
}

// ── Check if a window export is read elsewhere ──

function isExportRead(name, sourceFile, allFiles, allContents) {
  // Search pattern: window.NAME (not followed by = or ||=)
  // or just NAME as a bare identifier (if it's a global)
  var windowRef = 'window.' + name;

  for (var i = 0; i < allFiles.length; i++) {
    if (allFiles[i] === sourceFile) continue; // Skip self

    var content = allContents[i];
    // Check for window.NAME reference (not as assignment target)
    var idx = 0;
    while ((idx = content.indexOf(windowRef, idx)) !== -1) {
      // Check what follows — skip if it's an assignment
      var after = content.slice(idx + windowRef.length, idx + windowRef.length + 4).trimStart();
      if (!after.startsWith('=') || after.startsWith('==') || after.startsWith('===')) {
        return true; // Read reference found
      }
      // Also allow ||= as a valid read-before-write
      if (after.startsWith('||=')) {
        return true;
      }
      idx += windowRef.length;
    }
  }

  return false;
}

// ── Main check ──

function check({ appRoot }) {
  var srcDir = path.join(appRoot, 'src');
  var allFiles = walkJsFiles(srcDir);
  var allContents = allFiles.map(f => readText(f));

  var warnings = [];
  var deadByFile = new Map(); // file -> [{name, line}]

  for (var i = 0; i < allFiles.length; i++) {
    var file = allFiles[i];
    var rel = path.relative(appRoot, file);
    var exports = extractWindowExports(allContents[i]);

    for (var [name, line] of exports) {
      if (!isExportRead(name, file, allFiles, allContents)) {
        if (!deadByFile.has(rel)) deadByFile.set(rel, []);
        deadByFile.get(rel).push({ name: name, line: line });
        warnings.push('DEAD EXPORT: window.' + name + ' (' + rel + ':' + line + ')');
      }
    }
  }

  return {
    ok: true, // Advisory — never fails
    warnings: warnings,
    stats: {
      filesScanned: allFiles.length,
      totalExports: Array.from(deadByFile.values()).reduce((sum, arr) => sum + arr.length, 0) +
                    (warnings.length === 0 ? 0 : 0), // just unused count
      deadExports: warnings.length,
      byFile: Object.fromEntries(
        Array.from(deadByFile.entries()).map(([file, items]) => [file, items.length])
      ),
    },
  };
}

// ── CLI entry point ──

function main() {
  var appRoot = path.resolve(__dirname, '..');
  var result = check({ appRoot: appRoot });

  var isTTY = process.stdout.isTTY;
  var cyan = isTTY ? '\x1b[36m' : '';
  var yellow = isTTY ? '\x1b[33m' : '';
  var green = isTTY ? '\x1b[32m' : '';
  var reset = isTTY ? '\x1b[0m' : '';

  console.log('\n' + cyan + 'Dead Export Check' + reset);
  console.log('  JS files scanned: ' + result.stats.filesScanned);
  console.log('  Dead exports:     ' + result.stats.deadExports);

  if (Object.keys(result.stats.byFile).length) {
    console.log('\n' + yellow + 'By file:' + reset);
    for (var [file, count] of Object.entries(result.stats.byFile)) {
      console.log('  ' + file + ': ' + count + ' dead');
    }
  }

  if (result.warnings.length) {
    console.log('\n' + yellow + 'Potentially dead exports (' + result.warnings.length + '):' + reset);
    for (var msg of result.warnings) {
      console.log('  ' + yellow + 'WARN' + reset + '  ' + msg);
    }
  } else {
    console.log('\n' + green + 'No dead window exports detected.' + reset);
  }

  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = { check };
