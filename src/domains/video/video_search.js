// Tankoban Max - Video global search index & results
// Extracted from video.js (Phase 3, Session 10)
// Also includes search UI functions moved from video_utils.js (they share
// scope with videoGlobalSearchItems which is local to this IIFE).
(function videoSearchDomain() {
  'use strict';

  if (window.__tankoVideoSearchBound) return;
  window.__tankoVideoSearchBound = true;

  const V = window.__tankoVideoShared;
  if (!V) return;

  const state = V.state;
  const effectiveShowName = V.effectiveShowName;
  const getShowById = V.getShowById;
  const basename = V.basename;
  const openVideoShow = V.openVideoShow;
  const getEpisodeById = V.getEpisodeById;
  const openVideo = V.openVideo;

  // From video_utils.js (loaded before this file)
  const __vutil = (window.tankobanVideoUtils || {});
  const _videoNatCmp = __vutil._videoNatCmp || ((a, b) => String(a||'').localeCompare(String(b||''), undefined, { numeric:true, sensitivity:'base' }));
  const _videoEscHtml = __vutil._videoEscHtml || (s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c)));

  // BUILD40_S5_VIDEO_GLOBAL_SEARCH: Top-bar global search support while in Videos mode.
  // volume_nav_overlay.js branches the existing global search input to these handlers.
  let videoGlobalSearchItems = [];
  let videoSearchIndex = null;
  let videoSearchIndexGeneration = 0;

  function videoSearchNorm(s) {
    return String(s || '').toLowerCase();
  }

  function videoTokenize(s) {
    return videoSearchNorm(s).split(/[^a-z0-9]+/g).filter(Boolean);
  }

  function videoIndexAdd(map, key, id) {
    if (!key) return;
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(id);
  }

  function videoIndexEntry(id, item, fields) {
    const tokens = new Set();
    for (const f of fields) for (const t of videoTokenize(f)) tokens.add(t);
    return {
      id,
      item,
      tokens,
      showNorm: videoSearchNorm(fields[0]),
      titleNorm: videoSearchNorm(fields[1]),
      fileNorm: videoSearchNorm(fields[2]),
      pathNorm: videoSearchNorm(fields[3]),
    };
  }

  function rebuildVideoSearchIndex() {
    videoSearchIndexGeneration += 1;
    const shows = Array.isArray(state.shows) ? state.shows : [];
    const episodes = Array.isArray(state.videos) ? state.videos : [];

    const next = {
      generation: videoSearchIndexGeneration,
      showById: new Map(),
      episodeById: new Map(),
      showTokenMap: new Map(),
      showPrefixMap: new Map(),
      episodeTokenMap: new Map(),
      episodePrefixMap: new Map(),
    };

    for (const s of shows) {
      const id = String(s?.id || '');
      if (!id) continue;
      const entry = videoIndexEntry(id, s, [effectiveShowName(s), '', '', s?.path]);
      next.showById.set(id, entry);
      for (const t of entry.tokens) {
        videoIndexAdd(next.showTokenMap, t, id);
        for (let i = 1, m = Math.min(t.length, 12); i <= m; i++) videoIndexAdd(next.showPrefixMap, t.slice(0, i), id);
      }
    }

    for (const ep of episodes) {
      const id = String(ep?.id || '');
      if (!id) continue;
      const file = basename(String(ep?.path || ''));
      const showName = effectiveShowName(getShowById(ep?.showId));
      const entry = videoIndexEntry(id, ep, [showName, ep?.title, file, ep?.path]);
      next.episodeById.set(id, entry);
      for (const t of entry.tokens) {
        videoIndexAdd(next.episodeTokenMap, t, id);
        for (let i = 1, m = Math.min(t.length, 12); i <= m; i++) videoIndexAdd(next.episodePrefixMap, t.slice(0, i), id);
      }
    }

    videoSearchIndex = next;
  }

  function videoIntersect(sets) {
    if (!sets.length) return null;
    const sorted = sets.slice().sort((a, b) => a.size - b.size);
    const out = new Set(sorted[0]);
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      for (const id of out) if (!cur.has(id)) out.delete(id);
      if (!out.size) break;
    }
    return out;
  }

  function videoSearchFromIndex({ q, tokenMap, prefixMap, byId, limit, rank }) {
    const qNorm = videoSearchNorm(q).trim();
    if (!qNorm) return [];
    const qTokens = qNorm.split(/[^a-z0-9]+/g).filter(Boolean);
    const postingSets = [];
    for (const t of qTokens) {
      const set = prefixMap.get(t) || tokenMap.get(t);
      if (!set || !set.size) return [];
      postingSets.push(set);
    }
    const candidates = videoIntersect(postingSets);
    if (!candidates || !candidates.size) return [];

    const cap = Math.max(limit * 3, limit + 6);
    const top = [];
    const put = (entry, score) => {
      if (score <= 0) return;
      if (top.length < cap) { top.push({ entry, score }); return; }
      let minIdx = 0;
      for (let i = 1; i < top.length; i++) if (top[i].score < top[minIdx].score) minIdx = i;
      if (score > top[minIdx].score) top[minIdx] = { entry, score };
    };

    for (const id of candidates) {
      const entry = byId.get(id);
      if (!entry) continue;
      put(entry, rank(entry, qNorm, qTokens));
    }

    top.sort((a, b) => b.score - a.score);
    return top.slice(0, limit).map(x => x.entry.item);
  }

  // ---- Search UI helpers (moved from video_utils.js — need shared scope with videoGlobalSearchItems) ----

  function videoHideGlobalSearchResults(){
    const resultsEl = document.getElementById('globalSearchResults');
    if (resultsEl) {
      resultsEl.classList.add('hidden');
      resultsEl.innerHTML = '';
    }
    videoGlobalSearchItems = [];
  }

  function videoSetGlobalSearchSelection(idx){
    const resultsEl = document.getElementById('globalSearchResults');
    const items = Array.from(resultsEl?.querySelectorAll?.('.resItem') || []);
    if (!items.length) {
      if (appState?.ui) appState.ui.globalSearchSel = 0;
      return;
    }
    const max = items.length - 1;
    const next = Math.max(0, Math.min(max, Number(idx || 0)));
    if (appState?.ui) appState.ui.globalSearchSel = next;

    for (const it of items) {
      it.classList.toggle('sel', Number(it.dataset.idx) === next);
    }
    const sel = items.find(it => Number(it.dataset.idx) === next);
    try { sel?.scrollIntoView?.({ block: 'nearest' }); } catch {}
  }

  async function videoActivateGlobalSearchSelection(){
    const sel = Number(appState?.ui?.globalSearchSel || 0);
    const item = videoGlobalSearchItems[sel];

    const gs = document.getElementById('globalSearch');
    if (gs) {
      gs.value = '';
      gs.blur();
    }
    if (appState?.ui) appState.ui.globalSearch = '';

    videoHideGlobalSearchResults();

    if (!item) return;

    if (item.type === 'show') {
      openVideoShow(item.showId);
      return;
    }

    if (item.type === 'episode') {
      const ep = getEpisodeById(item.episodeId);
      if (ep) await openVideo(ep);
      return;
    }
  }

  // ---- Render global search results ----

  function videoRenderGlobalSearchResults(){
    const gs = document.getElementById('globalSearch');
    const resultsEl = document.getElementById('globalSearchResults');
    if (!gs || !resultsEl) return;

    const raw = String(gs.value || '');
    if (appState?.ui) appState.ui.globalSearch = raw;

    const q = raw.trim();
    if (!q) { videoHideGlobalSearchResults(); return; }

    const maxShows = 20;
    const maxEpisodes = 64;
    if (!videoSearchIndex) rebuildVideoSearchIndex();
    const searchIdx = videoSearchIndex;

    const shows = videoSearchFromIndex({
      q,
      tokenMap: searchIdx.showTokenMap,
      prefixMap: searchIdx.showPrefixMap,
      byId: searchIdx.showById,
      limit: maxShows,
      rank: (entry, qNorm, qTokens) => {
        let score = 0;
        if (entry.showNorm.includes(qNorm)) score += 140;
        if (entry.pathNorm.includes(qNorm)) score += 45;
        for (const t of qTokens) if (entry.tokens.has(t)) score += 12;
        return score;
      },
    }).sort((a, b) => _videoNatCmp(String(a?.name || ''), String(b?.name || '')));

    const episodes = videoSearchFromIndex({
      q,
      tokenMap: searchIdx.episodeTokenMap,
      prefixMap: searchIdx.episodePrefixMap,
      byId: searchIdx.episodeById,
      limit: maxEpisodes,
      rank: (entry, qNorm, qTokens) => {
        let score = 0;
        if (entry.titleNorm.includes(qNorm)) score += 160;
        if (entry.showNorm.includes(qNorm)) score += 100;
        if (entry.fileNorm.includes(qNorm)) score += 85;
        if (entry.pathNorm.includes(qNorm)) score += 35;
        for (const t of qTokens) if (entry.tokens.has(t)) score += 10;
        return score;
      },
    }).sort((a, b) => {
      const asn = String(getShowById(a?.showId)?.name || '');
      const bsn = String(getShowById(b?.showId)?.name || '');
      const c1 = _videoNatCmp(asn, bsn);
      if (c1) return c1;
      const at = String(a?.title || basename(String(a?.path || '')));
      const bt = String(b?.title || basename(String(b?.path || '')));
      const c2 = _videoNatCmp(at, bt);
      if (c2) return c2;
      return String(a?.path || '').localeCompare(String(b?.path || ''));
    });

    resultsEl.innerHTML = '';
    videoGlobalSearchItems = [];

    if (!shows.length && !episodes.length) {
      resultsEl.innerHTML = '<div class="resEmpty">No matches</div>';
      resultsEl.classList.remove('hidden');
      if (appState?.ui) appState.ui.globalSearchSel = 0;
      return;
    }

    const addGroup = (label) => {
      const g = document.createElement('div');
      g.className = 'resGroup';
      const h = document.createElement('div');
      h.className = 'resGroupTitle';
      h.textContent = label;
      g.appendChild(h);
      resultsEl.appendChild(g);
      return g;
    };

    let idx = 0;

    if (shows.length) {
      const g = addGroup('Matching shows');
      for (const s of shows) {
        const row = document.createElement('div');
        row.className = 'resItem';
        row.dataset.idx = String(idx);
        row.innerHTML = `<div class="resType">S</div><div class="resTitle">${_videoEscHtml(effectiveShowName(s))}</div><div class="resSub">Show</div>`;
        row.addEventListener('mouseenter', () => videoSetGlobalSearchSelection(idx));
        row.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (appState?.ui) appState.ui.globalSearchSel = idx;
          videoSetGlobalSearchSelection(idx);
        });
        row.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (appState?.ui) appState.ui.globalSearchSel = idx;
          videoActivateGlobalSearchSelection();
        });
        g.appendChild(row);
        videoGlobalSearchItems.push({ type: 'show', showId: String(s?.id || '') });
        idx++;
      }
    }

    if (episodes.length) {
      const g = addGroup('Matching episodes');
      for (const ep of episodes) {
        const showName = effectiveShowName(getShowById(ep?.showId));
        const title = String(ep?.title || basename(String(ep?.path || '')) || 'Episode');
        const sub = showName ? showName : 'Episode';
        const row = document.createElement('div');
        row.className = 'resItem';
        row.dataset.idx = String(idx);
        row.innerHTML = `<div class="resType">E</div><div class="resTitle">${_videoEscHtml(title)}</div><div class="resSub">${_videoEscHtml(sub)}</div>`;
        row.addEventListener('mouseenter', () => videoSetGlobalSearchSelection(idx));
        row.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (appState?.ui) appState.ui.globalSearchSel = idx;
          videoSetGlobalSearchSelection(idx);
        });
        row.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (appState?.ui) appState.ui.globalSearchSel = idx;
          videoActivateGlobalSearchSelection();
        });
        g.appendChild(row);
        videoGlobalSearchItems.push({ type: 'episode', episodeId: String(ep?.id || '') });
        idx++;
      }
    }

    resultsEl.classList.remove('hidden');
    videoSetGlobalSearchSelection(appState?.ui?.globalSearchSel || 0);
  }

  // Expose for video.js callers
  window.__tankoVideoSearch = {
    rebuildVideoSearchIndex,
    videoRenderGlobalSearchResults,
    videoGlobalSearchItems: () => videoGlobalSearchItems,
    videoHideGlobalSearchResults,
    videoSetGlobalSearchSelection,
    videoActivateGlobalSearchSelection,
  };

})();
