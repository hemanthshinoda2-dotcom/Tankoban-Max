// CSS Usage Check — Phase 5, Session 15
//
// Finds CSS class selectors defined in src/styles/*.css that are never
// referenced in any HTML or JS file under src/.
//
// Usage:
//   node tools/css_usage_check.js          (standalone)
//   const { check } = require('./css_usage_check');  (programmatic)

const fs = require('fs');
const path = require('path');

// ── Helpers ──

function readText(p) {
  return fs.readFileSync(p, 'utf-8');
}

function walkFiles(dir, exts) {
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
        if (e.name === 'node_modules' || e.name === 'build' || e.name.startsWith('.')) continue;
        stack.push(full);
      } else if (e.isFile()) {
        var ext = path.extname(e.name).toLowerCase();
        if (exts.includes(ext)) out.push(full);
      }
    }
  }
  return out;
}

// ── Extract CSS class selectors ──

function extractCssClasses(cssContent) {
  var classes = new Set();

  // Remove CSS comments
  var clean = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

  // Match class selectors: .foo-bar, .foo_bar, .fooBar
  // Must handle compound selectors like .foo.bar, .foo > .bar, .foo:hover
  var re = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  var m;
  while ((m = re.exec(clean)) !== null) {
    // Skip pseudo-elements and pseudo-classes that look like classes
    // e.g. after ::before, :hover, :not(.x)
    var before = clean.slice(Math.max(0, m.index - 1), m.index);
    if (before === ':') continue; // pseudo like :not(.foo) — the .foo IS a class, but : before . means it's after a pseudo
    classes.add(m[1]);
  }

  return classes;
}

// ── Check if a class is referenced in source files ──

function isClassReferenced(className, sourceContents) {
  // Search for the class name as a substring in all source content
  // This catches:
  //   class="foo-bar"
  //   classList.add('foo-bar')
  //   querySelector('.foo-bar')
  //   className = 'foo-bar'
  //   template literals: `foo-bar`
  //   string concatenation: 'foo-bar'
  for (var i = 0; i < sourceContents.length; i++) {
    if (sourceContents[i].includes(className)) return true;
  }
  return false;
}

// ── Main check ──

function check({ appRoot }) {
  var stylesDir = path.join(appRoot, 'src', 'styles');
  var srcDir = path.join(appRoot, 'src');

  // Collect all CSS classes from stylesheets
  var cssFiles = walkFiles(stylesDir, ['.css']);
  var classByFile = new Map(); // file -> Set of classes
  var allClasses = new Map(); // className -> [files that define it]

  for (var cssFile of cssFiles) {
    var content = readText(cssFile);
    var classes = extractCssClasses(content);
    var rel = path.relative(appRoot, cssFile);
    classByFile.set(rel, classes);
    for (var cls of classes) {
      if (!allClasses.has(cls)) allClasses.set(cls, []);
      allClasses.get(cls).push(rel);
    }
  }

  // Read all source files (HTML + JS) for reference checking
  var sourceFiles = walkFiles(srcDir, ['.html', '.js']);
  var sourceContents = sourceFiles.map(f => readText(f));

  // Check each class for references
  var warnings = [];
  var unused = new Map(); // file -> [unused classes]

  for (var [className, definedIn] of allClasses) {
    // Skip very short class names (1-2 chars) — too many false positives
    if (className.length <= 2) continue;

    if (!isClassReferenced(className, sourceContents)) {
      for (var file of definedIn) {
        if (!unused.has(file)) unused.set(file, []);
        unused.get(file).push(className);
      }
      warnings.push('UNUSED CSS: .' + className + ' (defined in ' + definedIn.join(', ') + ')');
    }
  }

  return {
    ok: true, // CSS usage is advisory — never fails
    warnings: warnings,
    stats: {
      cssFiles: cssFiles.length,
      totalClasses: allClasses.size,
      unusedClasses: warnings.length,
      byFile: Object.fromEntries(
        Array.from(unused.entries()).map(([file, classes]) => [file, classes.length])
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

  console.log('\n' + cyan + 'CSS Usage Check' + reset);
  console.log('  CSS files scanned:  ' + result.stats.cssFiles);
  console.log('  Total classes:      ' + result.stats.totalClasses);
  console.log('  Potentially unused: ' + result.stats.unusedClasses);

  if (Object.keys(result.stats.byFile).length) {
    console.log('\n' + yellow + 'By file:' + reset);
    for (var [file, count] of Object.entries(result.stats.byFile)) {
      console.log('  ' + file + ': ' + count + ' unused');
    }
  }

  if (result.warnings.length) {
    console.log('\n' + yellow + 'Potentially unused classes (' + result.warnings.length + '):' + reset);
    for (var msg of result.warnings) {
      console.log('  ' + yellow + 'WARN' + reset + '  ' + msg);
    }
  } else {
    console.log('\n' + green + 'No unused CSS classes detected.' + reset);
  }

  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = { check };
