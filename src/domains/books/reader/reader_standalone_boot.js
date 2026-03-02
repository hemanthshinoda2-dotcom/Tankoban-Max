// Standalone Ebook Reader — Boot Script
// Loaded LAST by ebook_reader.html after all reader modules are ready.
// Provides window.__ebookOpenBook(filePath) for Python to call via runJavaScript.
//
// In standalone mode the reader is always visible (CSS override), so we skip
// the shell, mode router, and library — just wire the open path.

(function () {
  'use strict';

  var controller = window.booksReaderController;
  if (!controller || typeof controller.open !== 'function') {
    console.error('[ebook-standalone] booksReaderController not found — reader modules may have failed to load.');
    return;
  }

  // Wire the back button to close the reader (return to app shell)
  var backBtn = document.getElementById('booksReaderBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      if (window.__ebookNav && typeof window.__ebookNav.requestClose === 'function') {
        window.__ebookNav.requestClose();
      }
    });
  }

  /**
   * Open a book by file path.
   * Called from Python via QWebEngineView.runJavaScript():
   *   window.__ebookOpenBook('C:\\Users\\...\\book.epub')
   *
   * @param {string} filePath - absolute path to the book file
   */
  async function openBook(filePath) {
    console.log('[ebook-standalone] Opening: ' + filePath);

    // Determine format from extension
    var ext = (filePath.split('.').pop() || '').toLowerCase();
    var formatMap = { epub: 'epub', pdf: 'pdf', txt: 'txt', mobi: 'mobi', fb2: 'fb2' };
    var format = formatMap[ext];
    if (!format) {
      console.error('[ebook-standalone] Unknown format: ' + ext);
      return;
    }

    // Build book input (matches normalizeBookInput expectations)
    var fileName = filePath.replace(/\\/g, '/').split('/').pop() || 'book';
    var bookInput = {
      id: filePath,      // use file path as ID for standalone
      path: filePath,
      title: fileName.replace(/\.\w+$/, ''),
      format: format,
    };

    try {
      await controller.open(bookInput);
      console.log('[ebook-standalone] Book opened successfully.');
    } catch (err) {
      console.error('[ebook-standalone] Failed to open book:', err);
    }
  }

  // Expose to Python bridge
  window.__ebookOpenBook = openBook;

  console.log('[ebook-standalone] Boot complete. Waiting for __ebookOpenBook(path)...');
})();
