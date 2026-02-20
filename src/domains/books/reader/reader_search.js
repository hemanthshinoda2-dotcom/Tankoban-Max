// BUILD_OVERHAUL: In-book search functionality extracted from controller
(function () {
  'use strict';

  var RS = window.booksReaderState;
  var bus = window.booksReaderBus;

  function ensureSearchResultsUi() {
    var els = RS.ensureEls();
    if (!els.overlaySearch) return { root: null, list: null };

    // One-time style injection (keeps patches script-only)
    if (!document.getElementById('brSearchResultsStyle')) {
      var st = document.createElement('style');
      st.id = 'brSearchResultsStyle';
      st.textContent = [
        '#brOverlaySearch .br-search-results{margin-top:10px;max-height:45vh;overflow:auto;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;}',
        '#brOverlaySearch .br-search-group{margin:10px 0 6px 0;opacity:0.9;font-size:12px;letter-spacing:0.2px;}',
        '#brOverlaySearch .br-search-item{display:block;width:100%;text-align:left;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.18);margin:6px 0;cursor:pointer;}',
        '#brOverlaySearch .br-search-item:hover{background:rgba(0,0,0,0.28);}',
        '#brOverlaySearch .br-search-item.is-active{outline:2px solid rgba(255,255,255,0.25);}',
        '#brOverlaySearch .br-search-excerpt{font-size:13px;line-height:1.3;opacity:0.95;}',
        '#brOverlaySearch .br-search-excerpt mark{background:rgba(255,255,255,0.16);color:inherit;padding:0 2px;border-radius:4px;}',
        '#brOverlaySearch .br-search-meta{font-size:11px;opacity:0.75;margin-top:4px;}',
        '#brOverlaySearch .br-search-empty{opacity:0.75;font-size:13px;padding:8px 0;}',
      ].join('\n');
      document.head.appendChild(st);
    }

    var body = els.overlaySearch.querySelector('.br-overlay-body');
    if (!body) return { root: null, list: null };

    var root = body.querySelector('.br-search-results');
    if (!root) {
      root = document.createElement('div');
      root.className = 'br-search-results';
      body.appendChild(root);
    }
    return { root: root };
  }

  function fmtExcerpt(excerpt) {
    if (!excerpt || typeof excerpt !== 'object') return '';
    var pre = String(excerpt.pre || '');
    var match = String(excerpt.match || '');
    var post = String(excerpt.post || '');
    // Escape minimal
    pre = RS.escHtml(pre);
    match = RS.escHtml(match);
    post = RS.escHtml(post);
    return pre + '<mark>' + match + '</mark>' + post;
  }

  function renderResultsList() {
    var ui = ensureSearchResultsUi();
    if (!ui.root) return;

    var state = RS.state;
    var flat = Array.isArray(state.searchFlat) ? state.searchFlat : [];
    var groups = Array.isArray(state.searchGroups) ? state.searchGroups : [];

    ui.root.innerHTML = '';

    if (!flat.length) {
      var empty = document.createElement('div');
      empty.className = 'br-search-empty';
      empty.textContent = 'No results yet.';
      ui.root.appendChild(empty);
      return;
    }

    // Build an index map for active highlight
    var activeCfi = state.searchHits && state.searchHits[state.searchActiveIndex] ? String(state.searchHits[state.searchActiveIndex]) : '';

    // Prefer grouped display when available
    if (groups.length) {
      var idx = 0;
      groups.forEach(function (g) {
        var title = document.createElement('div');
        title.className = 'br-search-group';
        title.textContent = String(g.label || '');
        ui.root.appendChild(title);

        (g.subitems || []).forEach(function (it) {
          var cfi = String(it && it.cfi || '');
          var excerpt = it && it.excerpt ? it.excerpt : null;

          // Map to flat index (walk-forward; preserves order)
          var myIndex = -1;
          for (var k = idx; k < flat.length; k++) {
            if (String(flat[k].cfi || '') === cfi) { myIndex = k; idx = k + 1; break; }
          }
          if (myIndex < 0) return;

          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'br-search-item' + (cfi && cfi === activeCfi ? ' is-active' : '');
          btn.dataset.index = String(myIndex);
          btn.innerHTML = '<div class="br-search-excerpt">' + (fmtExcerpt(excerpt) || RS.escHtml('Match')) + '</div>' +
            '<div class="br-search-meta">Result ' + (myIndex + 1) + ' of ' + flat.length + '</div>';
          btn.addEventListener('click', function () {
            var i = Number(btn.dataset.index);
            if (!Number.isFinite(i)) return;
            jumpToIndex(i);
          });
          ui.root.appendChild(btn);
        });
      });
      return;
    }

    // Fallback: flat list
    flat.forEach(function (hit, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'br-search-item' + (hit && String(hit.cfi || '') === activeCfi ? ' is-active' : '');
      btn.dataset.index = String(i);
      btn.innerHTML = '<div class="br-search-excerpt">' + (fmtExcerpt(hit.excerpt) || RS.escHtml('Match')) + '</div>' +
        '<div class="br-search-meta">Result ' + (i + 1) + ' of ' + flat.length + '</div>';
      btn.addEventListener('click', function () {
        var ix = Number(btn.dataset.index);
        if (!Number.isFinite(ix)) return;
        jumpToIndex(ix);
      });
      ui.root.appendChild(btn);
    });
  }

  async function jumpToIndex(i) {
    var state = RS.state;
    if (!state.searchHits.length || !state.engine) return;
    state.searchActiveIndex = Math.max(0, Math.min(state.searchHits.length - 1, i));
    if (typeof state.engine.searchGoTo === 'function') {
      try { await state.engine.searchGoTo(state.searchActiveIndex); } catch (e) { /* swallow */ }
    }
    updateSearchUI();
    renderResultsList();
    await RS.saveProgress();
    bus.emit('nav:progress-sync');
  }

  // ── resetSearchState ─────────────────────────────────────────
  function resetSearchState() {
    var state = RS.state;
    state.searchHits = [];
    state.searchActiveIndex = -1;
    state.searchGroups = [];
    state.searchFlat = [];
    if (state.engine && typeof state.engine.clearSearch === 'function') {
      try { state.engine.clearSearch(); } catch (e) { /* swallow */ }
    }
    updateSearchUI();
    renderResultsList();
    var els = RS.ensureEls();
    if (els.utilSearchInput) els.utilSearchInput.value = '';
  }

  // ── updateSearchUI ───────────────────────────────────────────
  function updateSearchUI() {
    var els = RS.ensureEls();
    var state = RS.state;
    var hasHits = state.searchHits.length > 0;

    if (els.utilSearchPrev) els.utilSearchPrev.disabled = !hasHits;
    if (els.utilSearchNext) els.utilSearchNext.disabled = !hasHits;

    if (els.utilSearchCount) {
      if (hasHits) {
        els.utilSearchCount.textContent = (state.searchActiveIndex + 1) + '/' + state.searchHits.length;
      } else {
        var query = els.utilSearchInput ? els.utilSearchInput.value.trim() : '';
        els.utilSearchCount.textContent = query ? 'No matches for \u201c' + query + '\u201d' : '';
      }
    }
  }

  // ── searchNow ────────────────────────────────────────────────
  async function searchNow(queryOverride) {
    var els = RS.ensureEls();
    var state = RS.state;
    var q = String(queryOverride || (els.utilSearchInput && els.utilSearchInput.value) || '').trim();

    if (!q) {
      resetSearchState();
      return;
    }
    if (!state.engine || typeof state.engine.search !== 'function') return;

    RS.setStatus('Searching...', true);
    var res = null;
    try { res = await state.engine.search(q); } catch (e) { res = null; }

    var count = Number(res && res.count || 0);
    var hits = (res && Array.isArray(res.hits)) ? res.hits : [];
    state.searchHits = hits;
    state.searchGroups = (res && Array.isArray(res.groups)) ? res.groups : [];
    state.searchFlat = (res && Array.isArray(res.flat)) ? res.flat : hits.map(function (cfi) { return { cfi: String(cfi || ''), excerpt: null, label: '' }; });
    state.searchActiveIndex = hits.length > 0 ? 0 : -1;

    if (hits.length > 0 && state.engine && typeof state.engine.searchGoTo === 'function') {
      try { await state.engine.searchGoTo(0); } catch (e) { /* swallow */ }
    }

    if (count > 0) {
      RS.setStatus(count + ' match' + (count !== 1 ? 'es' : ''));
    } else {
      RS.setStatus('No matches');
    }
    updateSearchUI();
    renderResultsList();
  }

  // ── searchPrev ───────────────────────────────────────────────
  async function searchPrev() {
    var state = RS.state;
    if (!state.searchHits.length || !state.engine) return;
    state.searchActiveIndex = (state.searchActiveIndex - 1 + state.searchHits.length) % state.searchHits.length;
    if (typeof state.engine.searchGoTo === 'function') {
      try { await state.engine.searchGoTo(state.searchActiveIndex); } catch (e) { /* swallow */ }
    }
    updateSearchUI();
    renderResultsList();
    await RS.saveProgress();
    bus.emit('nav:progress-sync');
  }

  // ── searchNext ───────────────────────────────────────────────
  async function searchNext() {
    var state = RS.state;
    if (!state.searchHits.length || !state.engine) return;
    state.searchActiveIndex = (state.searchActiveIndex + 1) % state.searchHits.length;
    if (typeof state.engine.searchGoTo === 'function') {
      try { await state.engine.searchGoTo(state.searchActiveIndex); } catch (e) { /* swallow */ }
    }
    updateSearchUI();
    renderResultsList();
    await RS.saveProgress();
    bus.emit('nav:progress-sync');
  }

  // ── clearSearch ──────────────────────────────────────────────
  function clearSearch() {
    resetSearchState();
    RS.setStatus('');
  }

  // ── bind ─────────────────────────────────────────────────────
  function bind() {
    var els = RS.ensureEls();

    if (els.utilSearchBtn) {
      els.utilSearchBtn.addEventListener('click', function () { searchNow().catch(function () {}); });
    }

    if (els.utilSearchInput) {
      els.utilSearchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); searchNow().catch(function () {}); }
        if (e.key === 'Escape') { e.preventDefault(); bus.emit('overlay:close'); }
      });
      // Readest-ish: debounce search on input for quicker iteration
      var t = null;
      els.utilSearchInput.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          var q = String(els.utilSearchInput.value || '').trim();
          if (q.length >= 2) searchNow(q).catch(function () {});
          if (!q) resetSearchState();
        }, 220);
      });
    }

    if (els.utilSearchPrev) {
      els.utilSearchPrev.addEventListener('click', function () { searchPrev().catch(function () {}); });
    }

    if (els.utilSearchNext) {
      els.utilSearchNext.addEventListener('click', function () { searchNext().catch(function () {}); });
    }

    // Bus events
    bus.on('search:run', function (query) { searchNow(query).catch(function () {}); });
    bus.on('search:prev', function () { searchPrev().catch(function () {}); });
    bus.on('search:next', function () { searchNext().catch(function () {}); });
    bus.on('search:clear', function () { clearSearch(); });
  }

  // ── Export ───────────────────────────────────────────────────
  window.booksReaderSearch = {
    bind: bind,
    resetSearchState: resetSearchState,
    clearSearch: clearSearch,
    onOpen: function () { renderResultsList(); },
    onClose: resetSearchState,
  };
})();
