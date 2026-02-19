// MERIDIAN_CMD: Global command palette (Ctrl+K)
(function commandPaletteDomain() {
  'use strict';

  if (window.__tankoCmdPaletteBound) return;
  window.__tankoCmdPaletteBound = true;

  var api = window.Tanko && window.Tanko.api ? window.Tanko.api : null;

  function qs(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }

  var el = {
    overlay: qs('cmdPaletteOverlay'),
    input: qs('cmdPaletteInput'),
    results: qs('cmdPaletteResults')
  };

  if (!el.overlay || !el.input || !el.results) return;

  var state = {
    open: false,
    query: '',
    items: [],
    filtered: [],
    selectedIndex: 0
  };

  // ---- Fuzzy search ----

  function fuzzyMatch(needle, haystack) {
    var n = String(needle || '').toLowerCase();
    var h = String(haystack || '').toLowerCase();
    if (!n) return { match: true, score: 0 };
    var ni = 0;
    var score = 0;
    var lastPos = -1;
    for (var hi = 0; hi < h.length && ni < n.length; hi++) {
      if (h[hi] === n[ni]) {
        score += 1;
        if (lastPos >= 0 && hi === lastPos + 1) score += 2;
        if (hi === 0) score += 3;
        lastPos = hi;
        ni++;
      }
    }
    return { match: ni === n.length, score: score };
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  // ---- Item sources ----

  function gatherItems() {
    var items = [];

    // Mode switches
    items.push({ type: 'mode', label: 'Switch to Comics', hint: 'Mode', action: function () { try { window.setMode('comics'); } catch (e) {} } });
    items.push({ type: 'mode', label: 'Switch to Books', hint: 'Mode', action: function () { try { window.setMode('books'); } catch (e) {} } });
    items.push({ type: 'mode', label: 'Switch to Videos', hint: 'Mode', action: function () { try { window.setMode('videos'); } catch (e) {} } });
    items.push({ type: 'mode', label: 'Switch to Web', hint: 'Mode', action: function () { try { window.setMode('web'); } catch (e) {} } });

    // Quick actions
    items.push({ type: 'action', label: 'Toggle Fullscreen', hint: 'F11', action: function () { try { api.window.toggleFullscreen(); } catch (e) {} } });
    items.push({ type: 'action', label: 'Minimize Window', hint: '', action: function () { try { api.window.minimize(); } catch (e) {} } });
    items.push({ type: 'action', label: 'Refresh Library', hint: 'Ctrl+R', action: function () {
      try {
        var mode = window.Tanko && window.Tanko.modeRouter ? window.Tanko.modeRouter.getMode() : '';
        if (mode === 'books') { api.books.scan(); }
        else if (mode === 'videos') { api.video.scan(); }
        else if (mode === 'comics') { api.library.scan(); }
      } catch (e) {}
    }});
    items.push({ type: 'action', label: 'Open Settings', hint: '', action: function () {
      try {
        var overlay = document.getElementById('librarySettingsOverlay');
        if (overlay) overlay.classList.remove('hidden');
      } catch (e) {}
    }});
    items.push({ type: 'action', label: 'Close Window', hint: '', action: function () { try { api.window.close(); } catch (e) {} } });

    // Library items — comics series
    try {
      if (window.appState && Array.isArray(window.appState.series)) {
        for (var i = 0; i < window.appState.series.length && i < 200; i++) {
          var s = window.appState.series[i];
          if (!s || !s.name) continue;
          (function (series) {
            items.push({
              type: 'comic',
              label: series.name,
              hint: (series.bookCount || 0) + ' vols',
              action: function () {
                try {
                  window.setMode('comics');
                  if (typeof window.appState !== 'undefined') {
                    window.appState.selectedSeriesId = series.id;
                    if (typeof window.renderLibrary === 'function') window.renderLibrary();
                  }
                } catch (e) {}
              }
            });
          })(s);
        }
      }
    } catch (e) {}

    // Library items — books
    try {
      if (window.booksLibrary && window.booksLibrary.state && Array.isArray(window.booksLibrary.state.books)) {
        var books = window.booksLibrary.state.books;
        for (var j = 0; j < books.length && j < 200; j++) {
          var b = books[j];
          if (!b || !b.title) continue;
          (function (book) {
            items.push({
              type: 'book',
              label: book.title,
              hint: book.author || '',
              action: function () {
                try {
                  window.setMode('books');
                  if (window.booksLibrary && typeof window.booksLibrary.openBook === 'function') {
                    window.booksLibrary.openBook(book);
                  }
                } catch (e) {}
              }
            });
          })(b);
        }
      }
    } catch (e) {}

    return items;
  }

  // ---- Filter & render ----

  function filterItems(query) {
    if (!query) {
      state.filtered = state.items.slice(0, 50);
      return;
    }
    var results = [];
    for (var i = 0; i < state.items.length; i++) {
      var item = state.items[i];
      var m = fuzzyMatch(query, item.label);
      if (m.match) {
        results.push({ item: item, score: m.score });
      }
    }
    results.sort(function (a, b) { return b.score - a.score; });
    state.filtered = [];
    for (var j = 0; j < results.length && j < 50; j++) {
      state.filtered.push(results[j].item);
    }
  }

  function render() {
    if (!state.filtered.length) {
      el.results.innerHTML = '<div class="cmdPaletteEmpty">No results found</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < state.filtered.length; i++) {
      var item = state.filtered[i];
      var cls = 'cmdPaletteItem';
      if (i === state.selectedIndex) cls += ' active';
      html += '<div class="' + cls + '" data-cmd-idx="' + i + '">'
        + '<span class="cmdPaletteType">' + escapeHtml(item.type) + '</span>'
        + '<span class="cmdPaletteLabel">' + escapeHtml(item.label) + '</span>'
        + (item.hint ? '<span class="cmdPaletteHint">' + escapeHtml(item.hint) + '</span>' : '')
        + '</div>';
    }
    el.results.innerHTML = html;

    // Ensure active item is visible
    var activeEl = el.results.querySelector('.cmdPaletteItem.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---- Open / close ----

  function open() {
    if (state.open) return;
    state.open = true;
    state.query = '';
    state.selectedIndex = 0;
    state.items = gatherItems();
    filterItems('');
    el.overlay.classList.remove('hidden');
    el.input.value = '';
    render();
    setTimeout(function () { el.input.focus(); }, 20);
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    el.overlay.classList.add('hidden');
    el.input.value = '';
    el.results.innerHTML = '';
  }

  function executeSelected() {
    var item = state.filtered[state.selectedIndex];
    if (!item) return;
    close();
    if (typeof item.action === 'function') {
      try { item.action(); } catch (e) {}
    }
  }

  // ---- Event handlers ----

  document.addEventListener('keydown', function (e) {
    // Ctrl+K to toggle
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      e.stopPropagation();
      if (state.open) { close(); } else { open(); }
      return;
    }

    if (!state.open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.selectedIndex = Math.min(state.selectedIndex + 1, state.filtered.length - 1);
      render();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
      render();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      executeSelected();
      return;
    }
  }, true);

  el.input.addEventListener('input', function () {
    state.query = el.input.value;
    state.selectedIndex = 0;
    filterItems(state.query);
    render();
  });

  // Click on item
  el.results.addEventListener('click', function (e) {
    var target = e.target;
    while (target && target !== el.results && !target.hasAttribute('data-cmd-idx')) {
      target = target.parentNode;
    }
    if (!target || target === el.results) return;
    var idx = parseInt(target.getAttribute('data-cmd-idx'), 10);
    if (isNaN(idx)) return;
    state.selectedIndex = idx;
    executeSelected();
  });

  // Click outside card to close
  el.overlay.addEventListener('mousedown', function (e) {
    if (e.target === el.overlay) {
      close();
    }
  });

})();
