// BUILD_OVERHAUL: In-book search functionality extracted from controller
(function () {
  'use strict';

  var RS = window.booksReaderState;
  var bus = window.booksReaderBus;

  // ── resetSearchState ─────────────────────────────────────────
  function resetSearchState() {
    var state = RS.state;
    state.searchHits = [];
    state.searchActiveIndex = -1;
    if (state.engine && typeof state.engine.clearSearch === 'function') {
      try { state.engine.clearSearch(); } catch (e) { /* swallow */ }
    }
    updateSearchUI();
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
    onOpen: function () {},
    onClose: resetSearchState,
  };
})();
