// Tankoban Max - Books library renderer
(function booksLibraryDomain() {
  'use strict';

  if (window.__tankoBooksLibraryBound) return;
  window.__tankoBooksLibraryBound = true;

  const api = window.Tanko && window.Tanko.api ? window.Tanko.api : null;
  if (!api || !api.books) return;

  const qs = (id) => {
    try { return document.getElementById(id); } catch { return null; }
  };

  // LISTEN_P2: listen mode flag — routes openBook() to TTS player
  let _listenMode = false;

  const el = {
    homeView: qs('booksHomeView'),
    showView: qs('booksShowView') || qs('booksSeriesView'),
    readerView: qs('booksReaderView'),

    addRootBtn: qs('booksAddRootBtn'),
    addSeriesBtn: qs('booksAddSeriesBtn'),
    addFilesBtn: qs('booksAddFilesBtn'),
    restoreHiddenBtn: qs('booksRestoreHiddenBtn'),
    openFileBtn: qs('booksOpenFileBtn'),
    refreshBtn: qs('booksRefreshBtn'),
    foldersList: qs('booksFoldersList') || qs('booksFoldersTree'),

    continuePanel: qs('booksContinuePanel') || qs('booksContinueRow'),
    continueList: qs('booksContinueList'),
    continueEmpty: qs('booksContinueEmpty'),
    scanPill: qs('booksScanPill'),
    scanText: qs('booksScanText'),
    scanCancel: qs('booksScanCancel'),
    clearContinueBtn: qs('booksClearContinueBtn'),

    rootLabel: qs('booksRootLabel'),
    showsGrid: qs('booksShowsGrid') || qs('booksSeriesGrid'),
    showsEmpty: qs('booksShowsEmpty') || qs('booksSeriesEmpty'),

    crumb: qs('booksCrumb'),
    crumbText: qs('booksCrumbText'),
    showBackBtn: qs('booksShowBackBtn') || qs('booksSeriesBackBtn'),
    episodesWrap: qs('booksEpisodesWrap') || qs('booksVolumesWrap'),
    epPreviewInfo: qs('booksEpPreviewInfo') || qs('booksVolPreviewInfo'),
    epPreviewImg: qs('booksEpPreviewImg') || qs('booksVolPreviewImg'),
    epTableHead: qs('booksEpTableHead') || qs('booksVolTableHead'),
    episodesGrid: qs('booksEpisodesGrid') || qs('booksVolumesList'),
    episodesEmpty: qs('booksEpisodesEmpty') || qs('booksVolumesEmpty'),

    // Web sources in Books sidebar
    booksSourcesList: qs('booksSourcesList'),
    booksAddSourceBtn: qs('booksAddSourceBtn'),
    booksSourcesItems: qs('booksSourcesItems'),
    booksSourcesHeader: qs('booksSourcesHeader'),

    // Downloads in Books sidebar
    booksDownloadsList: qs('booksDownloadsList'),
    booksDownloadsEmpty: qs('booksDownloadsEmpty'),
    booksDownloadsItems: qs('booksDownloadsItems'),
    booksDownloadsHeader: qs('booksDownloadsHeader'),
  };

  const state = {
    bound: false,
    initialized: false,
    readerOpen: false,
    viewBeforeReader: 'home',

    snap: {
      series: [],
      books: [],
      folders: [],
      bookSeriesFolders: [],
      scanning: false,
    },
    scanStatus: {
      scanning: false,
      progress: null,
    },
    progressAll: {},
    // LISTEN_P5: listening progress map (booksTtsProgress)
    ttsProgressAll: {},
    // RENAME-BOOK: custom display names keyed by bookId
    displayNames: {},

    ui: {
      selectedRootId: null,
      booksSubView: 'home',
      selectedShowId: null,
      selectedBookId: null,
      showFolderRel: '',
      hideFinishedShows: false,
      showTreeExpanded: {},
      dismissedContinueShows: {},
      hiddenShowIds: new Set(),
      epSort: 'title_asc',
      globalSearchSel: 0,
    },

    derived: {
      roots: [],
      rootsById: new Map(),
      folderByRootRel: new Map(),
      folderChildrenByParent: new Map(),
      seriesById: new Map(),
      seriesByFolder: new Map(),
      seriesList: [],
      books: [],
      bookById: new Map(),
      explicitSeriesPathSet: new Set(),

      shows: [],
      showsById: new Map(),
      showsByRoot: new Map(),
      booksByShow: new Map(),
      bookToShowIds: new Map(),
      rootShowCount: new Map(),
      showProgressSummary: new Map(),
    },

    uiSaveTimer: null,
    globalSearchItems: [],
  };

  const thumbMem = new Map();
  const thumbInFlight = new Map();
  const thumbBookRef = new WeakMap();
  const fallbackMem = new Map();
  let foliateViewModulePromise = null;
  function withLimit(limit) {
    let active = 0;
    const q = [];
    const runNext = () => {
      if (active >= limit || q.length === 0) return;
      active += 1;
      const job = q.shift();
      Promise.resolve()
        .then(job.fn)
        .then((v) => { active -= 1; job.resolve(v); runNext(); })
        .catch((e) => { active -= 1; job.reject(e); runNext(); });
    };
    return (fn) => new Promise((resolve, reject) => {
      q.push({ fn, resolve, reject });
      runNext();
    });
  }

  const thumbQueue = withLimit(2);
  const thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      const bid = String(img && img.dataset && img.dataset.bookid || '');
      if (!bid) continue;
      const book = thumbBookRef.get(img) || state.derived.bookById.get(bid) || null;
      if (!book) {
        try { thumbObserver.unobserve(img); } catch {}
        continue;
      }
      getOrCreateBookThumb(book).then((url) => {
        if (!url) return;
        if (img && img.dataset && String(img.dataset.bookid || '') === bid) img.src = url;
        try { thumbObserver.unobserve(img); } catch {}
      }).catch(() => {});
    }
  }, { root: null, rootMargin: '500px', threshold: 0.01 });

  const escHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'));
  const normalizeRel = (rel) => String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const normalizePathKey = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const rootRelKey = (rootId, rel) => `${String(rootId || '')}::${normalizeRel(rel)}`;
  const folderKey = (rootId, rel) => `${String(rootId || '')}:${normalizeRel(rel) || '.'}`;
  const naturalCompare = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
  const parentRel = (rel) => { const x = normalizeRel(rel); const i = x.lastIndexOf('/'); return i < 0 ? '' : x.slice(0, i); };
  const relBase = (rel) => { const x = normalizeRel(rel); if (!x) return ''; const i = x.lastIndexOf('/'); return i < 0 ? x : x.slice(i + 1); };
  const pathBase = (p) => { const x = String(p || '').replace(/\\/g, '/').replace(/\/+$/, ''); if (!x) return ''; const i = x.lastIndexOf('/'); return i < 0 ? x : x.slice(i + 1); };

  const clamp = (n, a, b) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return a;
    return Math.max(a, Math.min(b, v));
  };

  function fmtBytes(n) {
    const v = Number(n || 0);
    if (!Number.isFinite(v) || v <= 0) return '-';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function fmtDate(ms) {
    const v = Number(ms || 0);
    if (!Number.isFinite(v) || v <= 0) return '-';
    try { return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
    catch { return '-'; }
  }

  function toast(msg) {
    const text = String(msg || '').trim();
    if (!text) return;
    try {
      if (typeof window.toast === 'function') window.toast(text);
      else console.log(`[books] ${text}`);
    } catch {}
  }

  function showCtx(payload) {
    try { if (typeof window.showContextMenu === 'function') window.showContextMenu(payload); } catch {}
  }

  function canReveal() {
    return !!(api.shell && typeof api.shell.revealPath === 'function');
  }

  // RENAME-BOOK: display name helpers
  function effectiveTitle(book) {
    var dn = book && state.displayNames[book.id];
    return dn || (book && book.title) || pathBase((book && book.path) || '') || 'Untitled';
  }

  // RENAME-SERIES: series/folder display name helper
  function effectiveShowName(show) {
    var key = 'show:' + (show && show.id || '');
    var dn = state.displayNames[key];
    return dn || (show && show.name) || 'Series';
  }

  function showRenamePrompt(currentName) {
    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;';
      var box = document.createElement('div');
      box.style.cssText = 'background:#2a2a2e;border:1px solid #555;border-radius:8px;padding:20px;min-width:340px;max-width:480px;color:#eee;font-family:inherit;';
      var lbl = document.createElement('div');
      lbl.textContent = 'Rename:';
      lbl.style.cssText = 'margin-bottom:10px;font-size:14px;';
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = currentName;
      inp.style.cssText = 'width:100%;box-sizing:border-box;padding:8px;border-radius:4px;border:1px solid #666;background:#1a1a1d;color:#eee;font-size:14px;outline:none;';
      var btns = document.createElement('div');
      btns.style.cssText = 'margin-top:14px;display:flex;justify-content:flex-end;gap:8px;';
      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'padding:6px 16px;border-radius:4px;border:1px solid #666;background:transparent;color:#ccc;cursor:pointer;';
      var okBtn = document.createElement('button');
      okBtn.textContent = 'OK';
      okBtn.style.cssText = 'padding:6px 16px;border-radius:4px;border:none;background:#4a8fe7;color:#fff;cursor:pointer;';
      btns.appendChild(cancelBtn);
      btns.appendChild(okBtn);
      box.appendChild(lbl);
      box.appendChild(inp);
      box.appendChild(btns);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);
      inp.focus();
      inp.select();
      function finish(val) { document.body.removeChild(backdrop); resolve(val); }
      okBtn.onclick = function () { finish(inp.value); };
      cancelBtn.onclick = function () { finish(null); };
      backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop) finish(null); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') finish(inp.value);
        if (e.key === 'Escape') finish(null);
      });
    });
  }

  async function renameBook(book) {
    if (!book || !book.id) return;
    var current = effectiveTitle(book);
    var newName = await showRenamePrompt(current);
    if (newName === null) return;
    newName = newName.trim();
    var original = book.title || pathBase(book.path || '') || 'Untitled';
    if (newName && newName !== original) {
      state.displayNames[book.id] = newName;
      if (api.booksDisplayNames) api.booksDisplayNames.save(book.id, newName);
    } else if (!newName || newName === original) {
      delete state.displayNames[book.id];
      if (api.booksDisplayNames) api.booksDisplayNames.clear(book.id);
    }
    if (state.ui.booksSubView === 'show') renderShowView();
    renderContinue();
  }

  // RENAME-SERIES: rename a series/folder display name
  async function renameShow(show) {
    if (!show || !show.id) return;
    var current = effectiveShowName(show);
    var newName = await showRenamePrompt(current);
    if (newName === null) return;
    newName = newName.trim();
    var original = show.name || 'Series';
    var key = 'show:' + show.id;
    if (newName && newName !== original) {
      state.displayNames[key] = newName;
      if (api.booksDisplayNames) api.booksDisplayNames.save(key, newName);
    } else if (!newName || newName === original) {
      delete state.displayNames[key];
      if (api.booksDisplayNames) api.booksDisplayNames.clear(key);
    }
    renderAll();
  }

  function placeholderThumb(label, a, b) {
    const key = `${label}|${a}|${b}`;
    if (fallbackMem.has(key)) return fallbackMem.get(key);
    const glyph = (String(label || '?').slice(0, 1).toUpperCase() || '?');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="460"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient></defs><rect width="300" height="460" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, sans-serif" font-size="148" fill="rgba(255,255,255,.86)">${escHtml(glyph)}</text></svg>`;
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    fallbackMem.set(key, url);
    return url;
  }

  function fallbackForBook(book) {
    const fmt = String(book && book.format || '').toLowerCase();
    const title = String(effectiveTitle(book) || '?');
    if (fmt === 'epub') return placeholderThumb(title, '#35557d', '#6c3d2f');
    if (fmt === 'pdf') return placeholderThumb(title, '#5a3f71', '#2f4e6d');
    return placeholderThumb(title, '#4e5e4a', '#6f4f33');
  }

  function fallbackForFolder(name) {
    return placeholderThumb(name, '#3f4d62', '#5f4734');
  }

  function isSvgThumbDataUrl(url) {
    return typeof url === 'string' && /^data:image\/svg\+xml/i.test(url);
  }
  function guessBookMime(book) {
    const fmt = String(book && book.format || '').toLowerCase();
    if (fmt === 'epub') return 'application/epub+zip';
    if (fmt === 'pdf') return 'application/pdf';
    if (fmt === 'txt') return 'text/plain';
    const lowerPath = String(book && book.path || '').toLowerCase();
    if (lowerPath.endsWith('.epub')) return 'application/epub+zip';
    if (lowerPath.endsWith('.pdf')) return 'application/pdf';
    if (lowerPath.endsWith('.txt')) return 'text/plain';
    return 'application/octet-stream';
  }

  function shouldSkipHeavyThumbWork() {
    try {
      if (document.body && document.body.classList.contains('inBooksReader')) return true;
    } catch {}
    return false;
  }

  async function loadFoliateViewModule() {
    if (foliateViewModulePromise) return foliateViewModulePromise;
    const url = new URL('./vendor/foliate/view.js', window.location.href).toString();
    foliateViewModulePromise = import(url);
    return foliateViewModulePromise;
  }

  async function readBookAsFile(book) {
    if (!api.files || typeof api.files.read !== 'function') return null;
    if (!book || !book.path) return null;
    let bytes = null;
    try { bytes = await api.files.read(book.path); } catch { return null; }
    if (!bytes) return null;
    let ab = null;
    if (bytes instanceof ArrayBuffer) ab = bytes;
    else if (ArrayBuffer.isView(bytes) && bytes.buffer instanceof ArrayBuffer) {
      const start = Number(bytes.byteOffset || 0);
      const end = start + Number(bytes.byteLength || 0);
      ab = bytes.buffer.slice(start, end);
    } else if (bytes && bytes.buffer instanceof ArrayBuffer) {
      ab = bytes.buffer;
    }
    if (!ab || !ab.byteLength) return null;
    const name = pathBase(book.path) || `${String(book.format || 'book').toLowerCase() || 'book'}.bin`;
    const type = guessBookMime(book);
    try { return new File([ab], name, { type }); } catch { return null; }
  }

  async function coverBlobViaFoliate(book) {
    const file = await readBookAsFile(book);
    if (!file) return null;
    const mod = await loadFoliateViewModule();
    if (!mod || typeof mod.makeBook !== 'function') return null;
    let fb = null;
    try {
      fb = await mod.makeBook(file);
      if (!fb || typeof fb.getCover !== 'function') return null;
      const cover = await fb.getCover();
      if (!cover || !cover.size) return null;
      return cover;
    } catch {
      return null;
    } finally {
      try { fb && fb.destroy && fb.destroy(); } catch {}
    }
  }

  async function drawCoverBlobToThumbDataUrl(blob) {
    if (!blob || !blob.size) return null;
    const w = 180;
    const h = 252;
    let bmp = null;
    try {
      bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const s = Math.max(w / Math.max(1, bmp.width), h / Math.max(1, bmp.height));
      const dw = Math.round(Math.max(1, bmp.width) * s);
      const dh = Math.round(Math.max(1, bmp.height) * s);
      const dx = Math.floor((w - dw) / 2);
      const dy = Math.floor((h - dh) / 2);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bmp, 0, 0, bmp.width, bmp.height, dx, dy, dw, dh);
      return c.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    } finally {
      try { bmp && bmp.close && bmp.close(); } catch {}
    }
  }

  async function generateBookThumbDataUrl(book) {
    if (!book || !book.path) return null;
    if (shouldSkipHeavyThumbWork()) return null;
    const fmt = String(book.format || '').toLowerCase();
    if (fmt === 'txt') return null;
    const coverBlob = await coverBlobViaFoliate(book);
    if (!coverBlob) return null;
    return drawCoverBlobToThumbDataUrl(coverBlob);
  }

  async function getOrCreateBookThumb(book) {
    if (!book || !book.id) return fallbackForBook(book);
    const id = String(book.id);
    const cachedMem = thumbMem.get(id);
    if (cachedMem) return cachedMem;
    const inflight = thumbInFlight.get(id);
    if (inflight) return inflight;

    const p = (async () => {
      let url = null;
      try { url = await api.thumbs.get(id); } catch {}
      if (url) {
        const fmt = String(book && book.format || '').toLowerCase();
        if (fmt !== 'txt' && isSvgThumbDataUrl(url)) {
          try { await api.thumbs.delete(id); } catch {}
          url = null;
        } else {
          thumbMem.set(id, url);
          return url;
        }
      }

      try {
        const generated = await thumbQueue(() => generateBookThumbDataUrl(book));
        if (generated) {
          thumbMem.set(id, generated);
          try { await api.thumbs.save(id, generated); } catch {}
          return generated;
        }
      } catch {}

      const fallback = fallbackForBook(book);
      thumbMem.set(id, fallback);
      const fmt = String(book && book.format || '').toLowerCase();
      if (fmt === 'txt') {
        try { await api.thumbs.save(id, fallback); } catch {}
      }
      return fallback;
    })().finally(() => {
      thumbInFlight.delete(id);
    });

    thumbInFlight.set(id, p);
    return p;
  }

  function attachThumb(img, book) {
    if (!img || !book || !book.id) return;
    const id = String(book.id);
    img.dataset.bookid = id;
    thumbBookRef.set(img, book);

    const cached = thumbMem.get(id);
    if (cached) {
      img.src = cached;
      return;
    }
    img.src = fallbackForBook(book);
    try { thumbObserver.observe(img); } catch {}
  }

  function getRootName(rootId, rootPath) {
    if (rootPath) return pathBase(rootPath) || String(rootPath);
    const rid = String(rootId || '');
    if (rid === 'single-files') return 'Single files';
    if (rid.startsWith('series:')) return 'Series folder';
    if (rid.startsWith('root:')) return 'Library root';
    return rid || 'Library';
  }

  function resolveRootRelPath(rootPath, relPath) {
    const base = String(rootPath || '');
    if (!base) return null;
    const rel = normalizeRel(relPath);
    if (!rel) return base;
    const sep = base.includes('\\') ? '\\' : '/';
    const trimmed = base.replace(/[\\/]+$/, '');
    return `${trimmed}${sep}${rel.split('/').join(sep)}`;
  }

  function getReaderController() {
    const c = window.booksReaderController;
    if (!c || typeof c.open !== 'function' || typeof c.close !== 'function') return null;
    return c;
  }

  
  // LISTEN_P5: resolve TTS progress entry by id or normalized path
  function normPath(p) {
    return String(p || '').replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase();
  }
  function getBookTtsProgress(book) {
    if (!book) return null;
    const by = state.ttsProgressAll && typeof state.ttsProgressAll === 'object' ? state.ttsProgressAll : {};
    const rawId = String(book.id || '');
    const rawPath = String(book.path || '');
    const canonId = normPath(rawId);
    const canonPath = normPath(rawPath);
    return by[rawId] || by[canonId] || by[rawPath] || by[canonPath] || null;
  }
  function getBookTtsPct(book) {
    const e = getBookTtsProgress(book);
    if (!e) return null;
    const idx = Number(e.blockIdx || 0);
    const cnt = Number(e.blockCount || 0);
    if (!(cnt > 0)) return null;
    const pct = Math.round(Math.min(100, Math.max(0, (idx / cnt) * 100)));
    return pct;
  }

function getBookProgress(bookId) {
    if (!state.progressAll || typeof state.progressAll !== 'object') return null;
    const raw = String(bookId || '');
    const p = state.progressAll[raw];
    if (p && typeof p === 'object') return p;
    // FIX-CONT-TRACK: progress domain lowercases base64url IDs via normPath(); fallback to lowercased key
    const canon = normPath(raw);
    if (canon && canon !== raw) {
      const p2 = state.progressAll[canon];
      if (p2 && typeof p2 === 'object') return p2;
    }
    return null;
  }

  function getBookPct(book, progress) {
    const p = progress && typeof progress === 'object' ? progress : null;
    if (!p) return null;
    if (p.finished) return 100;
    if (Number.isFinite(Number(p.percent))) return clamp(Math.round(Number(p.percent)), 0, 100);
    const loc = p.locator && typeof p.locator === 'object' ? p.locator : null;
    if (loc && Number.isFinite(Number(loc.fraction))) return clamp(Math.round(Number(loc.fraction) * 100), 0, 100);
    if (loc && Number.isFinite(Number(loc.pageIndex)) && Number.isFinite(Number(loc.pageCount)) && Number(loc.pageCount) > 0) {
      return clamp(Math.round(((Number(loc.pageIndex) + 1) / Number(loc.pageCount)) * 100), 0, 100);
    }
    return null;
  }

  function getShowById(showId) {
    return state.derived.showsById.get(String(showId || '')) || null;
  }

  function getBooksForShow(showId) {
    return (state.derived.booksByShow.get(String(showId || '')) || []).slice();
  }
  function showProgressForShowId(showId) {
    return state.derived.showProgressSummary.get(String(showId || '')) || { total: 0, finished: 0, inProgress: 0, percent: 0 };
  }

  function rebuildShowProgressSummary() {
    const out = new Map();
    for (const show of state.derived.shows || []) {
      const books = state.derived.booksByShow.get(String(show.id || '')) || [];
      const total = books.length;
      let finished = 0;
      let inProgress = 0;
      let sum = 0;
      for (const b of books) {
        const p = getBookProgress(b.id);
        const pct = getBookPct(b, p);
        if (pct == null) continue;
        if (pct >= 100 || (p && p.finished)) {
          finished += 1;
          sum += 1;
          continue;
        }
        if (pct > 0) {
          inProgress += 1;
          sum += (pct / 100);
        }
      }
      const percent = total ? clamp(Math.round((sum / total) * 100), 0, 100) : 0;
      out.set(String(show.id || ''), { total, finished, inProgress, percent });
    }
    state.derived.showProgressSummary = out;
  }

  // FIX-CONT-TRACK: resolve the actual key in progressAll (may be lowercased by main process)
  function resolveProgressKey(bookId) {
    const raw = String(bookId || '');
    if (state.progressAll && state.progressAll[raw]) return raw;
    const canon = normPath(raw);
    if (canon && state.progressAll && state.progressAll[canon]) return canon;
    return canon || raw;
  }

  // R3: book-level progress actions
  async function clearBookProgress(bookId) {
    if (!bookId) return;
    try { await api.booksProgress.clear(bookId); } catch {}
    // FIX-CONT-TRACK: resolve actual key (may be lowercased)
    const key = resolveProgressKey(bookId);
    delete state.progressAll[key];
    rebuildShowProgressSummary();
    renderContinue();
    if (state.ui.booksSubView === 'show') renderShowView();
    toast('Progress cleared');
  }

  async function markBookFinished(bookId) {
    if (!bookId) return;
    const key = resolveProgressKey(bookId);
    const existing = state.progressAll[key] || {};
    const payload = { ...existing, finished: true, updatedAt: Date.now() };
    try { await api.booksProgress.save(bookId, payload); } catch {}
    state.progressAll[key] = payload;
    rebuildShowProgressSummary();
    renderContinue();
    if (state.ui.booksSubView === 'show') renderShowView();
    toast('Marked as finished');
  }

  async function markBookInProgress(bookId) {
    if (!bookId) return;
    const key = resolveProgressKey(bookId);
    const existing = state.progressAll[key] || {};
    const payload = { ...existing, finished: false, updatedAt: Date.now() };
    try { await api.booksProgress.save(bookId, payload); } catch {}
    state.progressAll[key] = payload;
    rebuildShowProgressSummary();
    renderContinue();
    if (state.ui.booksSubView === 'show') renderShowView();
    toast('Marked as in-progress');
  }

  function scheduleSaveUi() {
    if (state.uiSaveTimer) clearTimeout(state.uiSaveTimer);
    state.uiSaveTimer = setTimeout(() => {
      state.uiSaveTimer = null;
      api.booksUi.save({
        selectedRootId: state.ui.selectedRootId || null,
        booksSubView: state.ui.booksSubView || 'home',
        selectedShowId: state.ui.selectedShowId || null,
        selectedBookId: state.ui.selectedBookId || null,
        showFolderRel: normalizeRel(state.ui.showFolderRel),
        hideFinishedShows: !!state.ui.hideFinishedShows,
        showTreeExpanded: { ...(state.ui.showTreeExpanded || {}) },
        dismissedContinueShows: { ...(state.ui.dismissedContinueShows || {}) },
        epSort: String(state.ui.epSort || 'title_asc'),
        hiddenShowIds: state.ui.hiddenShowIds ? Array.from(state.ui.hiddenShowIds) : [],

        // Backward compat
        booksHideFinished: !!state.ui.hideFinishedShows,
        booksTreeExpanded: { ...(state.ui.showTreeExpanded || {}) },
        selectedSeriesId: state.ui.selectedShowId || null,
        selectedFolderRel: normalizeRel(state.ui.showFolderRel),
        booksVolSort: String(state.ui.epSort || 'title_asc'),
        booksVolSelBookId: state.ui.selectedBookId || null,
      }).catch(() => {});
    }, 150);
  }

  async function loadUi() {
    try {
      const res = await api.booksUi.get();
      const ui = res && res.ui && typeof res.ui === 'object' ? res.ui : {};

      state.ui.selectedRootId = ui.selectedRootId ? String(ui.selectedRootId) : null;
      state.ui.booksSubView = (ui.booksSubView === 'show') ? 'show' : 'home';
      state.ui.selectedShowId = ui.selectedShowId ? String(ui.selectedShowId) : null;
      state.ui.selectedBookId = ui.selectedBookId ? String(ui.selectedBookId) : null;
      state.ui.showFolderRel = normalizeRel(ui.showFolderRel);
      state.ui.hideFinishedShows = !!ui.hideFinishedShows;
      state.ui.showTreeExpanded = ui.showTreeExpanded && typeof ui.showTreeExpanded === 'object' ? ui.showTreeExpanded : {};
      state.ui.dismissedContinueShows = ui.dismissedContinueShows && typeof ui.dismissedContinueShows === 'object' ? ui.dismissedContinueShows : {};
      state.ui.epSort = String(ui.epSort || 'title_asc');
      state.ui.hiddenShowIds = Array.isArray(ui.hiddenShowIds) ? new Set(ui.hiddenShowIds.map(String)) : new Set();

      if (!state.ui.hideFinishedShows && typeof ui.booksHideFinished === 'boolean') state.ui.hideFinishedShows = !!ui.booksHideFinished;
      if (!Object.keys(state.ui.showTreeExpanded || {}).length && ui.booksTreeExpanded && typeof ui.booksTreeExpanded === 'object') {
        state.ui.showTreeExpanded = ui.booksTreeExpanded;
      }
      if (!state.ui.selectedShowId && ui.selectedSeriesId) state.ui.selectedShowId = String(ui.selectedSeriesId);
      if (!state.ui.selectedBookId && ui.booksVolSelBookId) state.ui.selectedBookId = String(ui.booksVolSelBookId);
      if (!state.ui.showFolderRel && ui.selectedFolderRel) state.ui.showFolderRel = normalizeRel(ui.selectedFolderRel);
      if (!ui.showFolderRel && !state.ui.showFolderRel && ui.selectedFolderRel) state.ui.showFolderRel = normalizeRel(ui.selectedFolderRel);
      if (!ui.epSort && ui.booksVolSort) {
        const prevSort = String(ui.booksVolSort || '');
        if (prevSort === 'newest') state.ui.epSort = 'modified_desc';
        else if (prevSort === 'alphabetical') state.ui.epSort = 'title_asc';
      }
      if (!ui.booksSubView && ui.selectedSeriesId) state.ui.booksSubView = 'show';
    } catch {}
  }

  async function loadProgress() {
    try {
      const p = await api.booksProgress.getAll();
      state.progressAll = p && typeof p === 'object' ? p : {};
    } catch {
      state.progressAll = {};
    }
    rebuildShowProgressSummary();
  }
  function rebuildDerived() {
    const snap = state.snap || {};
    const books = Array.isArray(snap.books) ? snap.books.slice() : [];
    const seriesRaw = Array.isArray(snap.series) ? snap.series.slice() : [];
    const foldersRaw = Array.isArray(snap.folders) ? snap.folders.slice() : [];
    const explicitSeriesPaths = new Set((Array.isArray(snap.bookSeriesFolders) ? snap.bookSeriesFolders : []).map((p) => normalizePathKey(p)).filter(Boolean));

    const rootsById = new Map();
    const ensureRoot = (rootId, rootPath) => {
      const rid = String(rootId || '').trim();
      if (!rid) return null;
      let r = rootsById.get(rid);
      if (!r) {
        r = { id: rid, path: String(rootPath || '') || null, name: getRootName(rid, rootPath) };
        rootsById.set(rid, r);
      } else if (!r.path && rootPath) {
        r.path = String(rootPath);
        r.name = getRootName(rid, rootPath);
      }
      return r;
    };

    for (const f of foldersRaw) ensureRoot(f && f.rootId, f && f.rootPath);
    for (const s of seriesRaw) ensureRoot(s && s.rootId, s && s.rootPath);
    for (const b of books) ensureRoot(b && b.rootId, b && b.rootPath);

    const folderByRootRel = new Map();
    const folderChildrenByParent = new Map();

    const ensureFolder = (raw) => {
      const rid = String(raw && raw.rootId || '').trim();
      if (!rid) return null;
      const rel = normalizeRel(raw && raw.relPath);
      const k = rootRelKey(rid, rel);
      if (folderByRootRel.has(k)) return folderByRootRel.get(k);
      const rec = {
        rootId: rid,
        relPath: rel,
        parentRelPath: raw && raw.parentRelPath == null ? null : normalizeRel(raw && raw.parentRelPath),
        name: String(raw && raw.name || relBase(rel) || getRootName(rid, raw && raw.rootPath)),
        folderKey: String(raw && raw.folderKey || folderKey(rid, rel)),
        seriesCount: Number(raw && raw.seriesCount || 0),
      };
      folderByRootRel.set(k, rec);
      const pKey = rootRelKey(rid, rec.parentRelPath || '');
      if (!folderChildrenByParent.has(pKey)) folderChildrenByParent.set(pKey, []);
      folderChildrenByParent.get(pKey).push(rec);
      return rec;
    };

    const ensureFolderChain = (rootId, relPath) => {
      const rid = String(rootId || '').trim();
      if (!rid) return;
      const rel = normalizeRel(relPath);
      const seg = rel ? rel.split('/') : [];
      let cur = '';
      if (!folderByRootRel.has(rootRelKey(rid, ''))) {
        ensureFolder({
          rootId: rid,
          relPath: '',
          parentRelPath: null,
          name: getRootName(rid, null),
          folderKey: folderKey(rid, ''),
        });
      }
      for (let i = 0; i < seg.length; i += 1) {
        const part = seg[i];
        cur = cur ? `${cur}/${part}` : part;
        ensureFolder({
          rootId: rid,
          relPath: cur,
          parentRelPath: parentRel(cur),
          name: relBase(cur),
          folderKey: folderKey(rid, cur),
        });
      }
    };

    for (const f of foldersRaw) ensureFolder(f);
    for (const root of rootsById.values()) {
      ensureFolder({ rootId: root.id, relPath: '', parentRelPath: null, name: root.name, folderKey: folderKey(root.id, '') });
    }
    for (const s of seriesRaw) {
      const rid = String(s && s.rootId || '').trim();
      if (!rid) continue;
      ensureFolderChain(rid, s && s.folderRelPath);
    }
    for (const b of books) {
      const rid = String(b && b.rootId || '').trim();
      if (!rid) continue;
      ensureFolderChain(rid, b && b.folderRelPath);
    }

    const seriesById = new Map();
    const seriesList = [];
    const ensureSeries = (raw, synthetic) => {
      const sid = String(raw && raw.id || '').trim();
      if (!sid) return null;
      if (seriesById.has(sid)) return seriesById.get(sid);
      const s = {
        id: sid,
        name: String(raw && raw.name || 'Series'),
        path: String(raw && raw.path || '') || null,
        rootId: String(raw && raw.rootId || '') || null,
        folderRelPath: normalizeRel(raw && raw.folderRelPath),
        folderKey: String(raw && raw.folderKey || ''),
        synthetic: !!synthetic,
        books: [],
      };
      seriesById.set(sid, s);
      seriesList.push(s);
      return s;
    };

    for (const s of seriesRaw) ensureSeries(s, false);

    const bookById = new Map();
    const singleGroups = new Map();
    for (const b of books) {
      if (!b || !b.id) continue;
      const bid = String(b.id);
      bookById.set(bid, b);
      // FIX-CONT-TRACK: also index by lowercased ID so progress-domain lowercased keys can resolve
      const bidLower = normalizePathKey(bid);
      if (bidLower !== bid) bookById.set(bidLower, b);
      const sid = String(b.seriesId || '').trim();
      if (sid) {
        const s = ensureSeries({
          id: sid,
          name: b.series || relBase(b.folderRelPath) || pathBase(b.path),
          path: b.seriesPath || null,
          rootId: b.rootId || null,
          folderRelPath: b.folderRelPath || '',
          folderKey: b.folderKey || '',
        }, false);
        if (!s) continue;
        s.books.push(b);
      } else {
        const rid = String(b.rootId || 'single-files');
        const rel = normalizeRel(b.folderRelPath);
        const gk = `single:${rid}:${rel || '.'}`;
        let s = singleGroups.get(gk);
        if (!s) {
          s = ensureSeries({
            id: gk,
            name: relBase(rel) || pathBase(String(b.path || '').replace(/[\\/][^\\/]+$/, '')) || 'Single files',
            path: null,
            rootId: rid,
            folderRelPath: rel,
            folderKey: folderKey(rid, rel),
          }, true);
          singleGroups.set(gk, s);
        }
        s.books.push(b);
      }
    }

    for (const s of seriesList) {
      s.books.sort((a, b) => naturalCompare(a.title || '', b.title || '') || naturalCompare(a.path || '', b.path || ''));
      if (!s.rootId && s.books[0] && s.books[0].rootId) s.rootId = String(s.books[0].rootId);
      if (!s.folderRelPath && s.books[0] && s.books[0].folderRelPath) s.folderRelPath = normalizeRel(s.books[0].folderRelPath);
      if (!s.folderKey && s.rootId) s.folderKey = folderKey(s.rootId, s.folderRelPath || '');
    }
    seriesList.sort((a, b) => naturalCompare(a.name || '', b.name || ''));

    const seriesByFolder = new Map();
    for (const s of seriesList) {
      if (!s.rootId) continue;
      const k = rootRelKey(s.rootId, s.folderRelPath || '');
      if (!seriesByFolder.has(k)) seriesByFolder.set(k, []);
      seriesByFolder.get(k).push(s);
    }

    const roots = Array.from(rootsById.values()).sort((a, b) => naturalCompare(a.name || '', b.name || ''));
    for (const arr of folderChildrenByParent.values()) arr.sort((a, b) => naturalCompare(a.name || '', b.name || ''));
    for (const arr of seriesByFolder.values()) arr.sort((a, b) => naturalCompare(a.name || '', b.name || ''));

    const getChildFoldersLocal = (rootId, rel) => (folderChildrenByParent.get(rootRelKey(rootId, rel)) || []).filter((f) => normalizeRel(f.relPath) !== normalizeRel(rel));
    const getSeriesForFolderLocal = (rootId, rel) => (seriesByFolder.get(rootRelKey(rootId, rel)) || []).slice();

    const collectBooksInSubtree = (rootId, rel) => {
      const rid = String(rootId || '');
      const start = normalizeRel(rel);
      const out = [];
      const stack = [start];
      const seen = new Set();
      while (stack.length) {
        const cur = normalizeRel(stack.pop());
        const rk = rootRelKey(rid, cur);
        if (seen.has(rk)) continue;
        seen.add(rk);
        for (const s of getSeriesForFolderLocal(rid, cur)) {
          for (const b of s.books || []) out.push(b);
        }
        const children = getChildFoldersLocal(rid, cur);
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(normalizeRel(children[i].relPath));
      }
      return out;
    };
    const shows = [];
    const showsById = new Map();
    const showsByRoot = new Map();
    const booksByShow = new Map();
    const bookToShowIds = new Map();
    const rootShowCount = new Map();

    const addShow = (show, list) => {
      const sid = String(show && show.id || '');
      if (!sid || !list || !list.length) return;
      if (showsById.has(sid)) return;
      const booksList = list.slice();
      const rootId = String(show.rootId || '');
      const rec = {
        id: sid,
        type: show.type === 'series' ? 'series' : 'folder',
        rootId,
        name: String(show.name || 'Collection'),
        path: show.path ? String(show.path) : null,
        relPath: normalizeRel(show.relPath || ''),
        seriesId: show.seriesId ? String(show.seriesId) : null,
        removableSeriesPath: show.removableSeriesPath ? String(show.removableSeriesPath) : null,
        bookCount: booksList.length,
        firstBookId: booksList[0] && booksList[0].id ? String(booksList[0].id) : null,
      };
      showsById.set(sid, rec);
      booksByShow.set(sid, booksList);
      if (!showsByRoot.has(rootId)) showsByRoot.set(rootId, []);
      showsByRoot.get(rootId).push(rec);
      shows.push(rec);
      for (const b of booksList) {
        const bid = String(b && b.id || '');
        if (!bid) continue;
        if (!bookToShowIds.has(bid)) bookToShowIds.set(bid, []);
        bookToShowIds.get(bid).push(sid);
      }
    };

    for (const root of roots) {
      const rid = String(root.id || '');

      const topFolders = getChildFoldersLocal(rid, '');
      for (const f of topFolders) {
        const rel = normalizeRel(f.relPath);
        if (!rel) continue;
        const booksInFolder = collectBooksInSubtree(rid, rel);
        if (!booksInFolder.length) continue;
        addShow({
          id: `folder:${rid}:${rel || '.'}`,
          type: 'folder',
          rootId: rid,
          name: String(f.name || relBase(rel) || 'Folder'),
          path: resolveRootRelPath(root.path, rel),
          relPath: rel,
        }, booksInFolder);
      }

      const rootSeries = getSeriesForFolderLocal(rid, '');
      for (const s of rootSeries) {
        const list = (s.books || []).slice();
        if (!list.length) continue;
        addShow({
          id: `series:${String(s.id || '')}`,
          type: 'series',
          rootId: rid,
          name: String(s.name || 'Series'),
          path: s.path || resolveRootRelPath(root.path, s.folderRelPath || ''),
          relPath: normalizeRel(s.folderRelPath || ''),
          seriesId: String(s.id || ''),
          removableSeriesPath: (s.path || '') ? String(s.path || '') : null,
        }, list);
      }
    }

    for (const [rid, arr] of showsByRoot.entries()) {
      arr.sort((a, b) => naturalCompare(a.name || '', b.name || '') || naturalCompare(a.id || '', b.id || ''));
      rootShowCount.set(rid, arr.length);
    }
    shows.sort((a, b) => naturalCompare(a.name || '', b.name || '') || naturalCompare(a.id || '', b.id || ''));

    state.derived = {
      roots,
      rootsById,
      folderByRootRel,
      folderChildrenByParent,
      seriesById,
      seriesByFolder,
      seriesList,
      books,
      bookById,
      explicitSeriesPathSet: explicitSeriesPaths,
      shows,
      showsById,
      showsByRoot,
      booksByShow,
      bookToShowIds,
      rootShowCount,
      showProgressSummary: new Map(),
    };

    rebuildShowProgressSummary();
  }

  function getRoot(rootId) {
    return state.derived.rootsById.get(String(rootId || '')) || null;
  }

  function ensureSelectionTreeExpanded() {
    const rid = String(state.ui.selectedRootId || '');
    if (!rid) return;
    if (!state.ui.showTreeExpanded || typeof state.ui.showTreeExpanded !== 'object') state.ui.showTreeExpanded = {};
    state.ui.showTreeExpanded[rid] = true;
  }

  function ensureSelection() {
    const roots = state.derived.roots;
    if (!roots.length) {
      state.ui.selectedRootId = null;
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      return;
    }

    if (state.ui.selectedRootId && !getRoot(state.ui.selectedRootId)) state.ui.selectedRootId = null;

    if (state.ui.selectedShowId) {
      const show = getShowById(state.ui.selectedShowId);
      if (!show) {
        state.ui.selectedShowId = null;
        state.ui.selectedBookId = null;
        state.ui.showFolderRel = '';
        state.ui.booksSubView = 'home';
      } else {
        state.ui.selectedRootId = show.rootId || state.ui.selectedRootId;
      }
    }

    if (state.ui.booksSubView !== 'show') {
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
    } else if (!state.ui.selectedShowId) {
      state.ui.booksSubView = 'home';
    }

    if (state.ui.selectedBookId && !state.derived.bookById.has(String(state.ui.selectedBookId))) state.ui.selectedBookId = null;

    ensureSelectionTreeExpanded();
  }

  function isExplicitSeriesFolder(seriesPath) {
    if (!seriesPath) return false;
    return state.derived.explicitSeriesPathSet.has(normalizePathKey(seriesPath));
  }

  async function removeRootFolderAction(rootPath) {
    if (!rootPath) return;
    const ok = window.confirm('Remove this root folder from Books library? Files on disk are not deleted.');
    if (!ok) return;
    const res = await api.books.removeRootFolder(rootPath);
    if (res && res.state) applySnapshot(res.state);
    await loadProgress();
    renderAll();
    toast('Root folder removed');
  }

  async function removeSeriesFolderAction(seriesPath, showId) {
    if (!seriesPath) return;
    var ok = window.confirm('Remove this series from Books library?\nFiles on disk are not deleted.\nUse "Restore hidden" in the sidebar to bring it back.');
    if (!ok) return;
    if (showId) {
      if (!state.ui.hiddenShowIds) state.ui.hiddenShowIds = new Set();
      state.ui.hiddenShowIds.add(String(showId));
      scheduleSaveUi();
    }
    var res = await api.books.removeSeriesFolder(seriesPath);
    if (res && res.state) applySnapshot(res.state);
    await loadProgress();
    renderAll();
    toast('Series folder removed');
  }
  function showRootContextMenu(evt, root) {
    if (!root) return;
    showCtx({
      x: evt.clientX,
      y: evt.clientY,
      items: [
        {
          label: 'Refresh library',
          onClick: async () => {
            await refresh();
          },
        },
        {
          label: 'Reveal in Explorer',
          disabled: !(canReveal() && root.path),
          onClick: async () => {
            if (root.path) await api.shell.revealPath(root.path);
          },
        },
        { separator: true },
        {
          label: 'Remove root folder',
          danger: true,
          disabled: !root.path,
          onClick: async () => {
            await removeRootFolderAction(root.path);
          },
        },
      ],
    });
  }

  // R6: expanded show context menu
  function showShowContextMenu(evt, show) {
    if (!show) return;
    const removableSeriesPath = show && show.removableSeriesPath ? String(show.removableSeriesPath) : '';
    const summary = showProgressForShowId(show.id);
    const hasProgress = summary && (summary.inProgress > 0 || summary.finished > 0);
    showCtx({
      x: evt.clientX,
      y: evt.clientY,
      items: [
        { label: 'Open series', onClick: () => openShow(show.id) },
        { label: (_listenMode ? 'Continue listening' : 'Continue reading'), disabled: _listenMode ? false : !(summary && summary.inProgress > 0), onClick: () => {
          if (_listenMode) {
            const shell = window.booksListeningShell;
            if (shell && typeof shell.openListenShow === 'function') shell.openListenShow(show.id);
            return;
          }
          const items = getContinueItems().filter(it => String(it.show && it.show.id || '') === String(show.id || ''));
          if (items.length && items[0].book) openBook(items[0].book).catch(() => {});
          else openShow(show.id);
        }},
        // LISTEN_P2: switch to Listening mode scoped to this series
        { label: 'Listen to series', onClick: () => {
          const shell = window.booksListeningShell;
          if (shell && typeof shell.openListenShow === 'function') shell.openListenShow(show.id);
          else if (shell) shell.setMode(shell.MODE_LISTEN);
        }},
        { separator: true },
        { label: 'Mark all finished', disabled: !hasProgress, onClick: async () => {
          const books = getBooksForShow(show.id);
          for (const b of books) await markBookFinished(b.id);
        }},
        { label: 'Clear all progress', disabled: !hasProgress, onClick: async () => {
          const books = getBooksForShow(show.id);
          for (const b of books) await clearBookProgress(b.id);
        }},
        { separator: true },
        { label: 'Rename\u2026', onClick: function() { renameShow(show); } },
        { label: 'Hide series', onClick: () => {
          if (!state.ui.hiddenShowIds) state.ui.hiddenShowIds = new Set();
          state.ui.hiddenShowIds.add(String(show.id || ''));
          scheduleSaveUi();
          renderAll();
          toast('Series hidden');
        }},
        { label: 'Reveal in Explorer', disabled: !(canReveal() && show.path), onClick: async () => {
          if (show.path) await api.shell.revealPath(show.path);
        }},
        { label: 'Copy path', disabled: !show.path, onClick: () => {
          if (show.path && api.clipboard && api.clipboard.copyText) {
            api.clipboard.copyText(show.path).then(() => toast('Path copied')).catch(() => {});
          }
        }},
        { separator: true },
        { label: 'Remove series folder', danger: true, disabled: !removableSeriesPath, onClick: async () => {
          if (removableSeriesPath) await removeSeriesFolderAction(removableSeriesPath, show.id);
        }},
      ],
    });
  }

  function renderScan() {
    // Toast-only UX: never render a persistent in-panel refresh pill.
    if (el.scanPill) el.scanPill.classList.add('hidden');
  }

  const booksContinueGeom = { raf: 0, lastCoverH: 0 };
  function scheduleBooksContinueGeometry() {
    if (booksContinueGeom.raf) return;
    booksContinueGeom.raf = requestAnimationFrame(() => {
      booksContinueGeom.raf = 0;
      const row = el.continuePanel || el.continueList;
      if (!row) return;
      const listH = row.clientHeight || 0;
      if (!listH) return;
      // Match comics geometry exactly:
      // coverHeight = list.height - (verticalPadding * 2)
      // coverWidth  = floor(coverHeight * 0.65)
      const verticalPadding = 20;
      // FIX-TILES: density-aware clamping (match video continue geometry)
      const density = (document.body && document.body.getAttribute('data-tile-density')) || 'comfortable';
      const maxH = (density === 'compact') ? 261 : 323;
      const minH = (density === 'compact') ? 210 : 240;
      const coverH = Math.min(maxH, Math.max(minH, listH - (verticalPadding * 2)));
      if (coverH === booksContinueGeom.lastCoverH) return;
      booksContinueGeom.lastCoverH = coverH;
      const coverW = Math.floor(coverH * 0.65);
      row.style.setProperty('--cont-cover-h', `${coverH}px`);
      row.style.setProperty('--cont-cover-w', `${coverW}px`);
    });
  }

  // FIX-TILES: retrigger continue geometry when tile density changes
  try {
    document.body.addEventListener('tileDensityChanged', function () {
      booksContinueGeom.lastCoverH = 0;
      scheduleBooksContinueGeometry();
    });
  } catch {}

  function getContinueItems() {
    const dismissed = (state.ui.dismissedContinueShows && typeof state.ui.dismissedContinueShows === 'object') ? state.ui.dismissedContinueShows : {};
    const out = [];

    for (const show of state.derived.shows || []) {
      const books = state.derived.booksByShow.get(String(show.id || '')) || [];
      let best = null;
      let bestAt = -1;
      const dismissedAt = Number(dismissed[String(show.id || '')] || 0);

      for (const b of books) {
        const p = getBookProgress(b.id);
        if (!p) continue;
        if (p.finished) continue;
        const at = Number(p.updatedAt || 0);
        if (!Number.isFinite(at) || at <= 0) continue;
        if (dismissedAt > 0 && at <= dismissedAt) continue;
        const pct = getBookPct(b, p);
        if (pct != null && pct >= 100) continue;
        if (at > bestAt) {
          bestAt = at;
          best = { show, book: b, progress: p, updatedAt: at };
        }
      }

      if (best) out.push(best);
    }

    out.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return out;
  }

  async function clearContinueShow(showId, bookId) {
    const sid = String(showId || '');
    if (!sid) return;
    state.ui.dismissedContinueShows = (state.ui.dismissedContinueShows && typeof state.ui.dismissedContinueShows === 'object')
      ? state.ui.dismissedContinueShows
      : {};
    state.ui.dismissedContinueShows[sid] = Date.now();
    scheduleSaveUi();

    const bid = String(bookId || '');
    if (bid) {
      try { await api.booksProgress.clear(bid); } catch {}
      // FIX-CONT-TRACK: resolve actual key (may be lowercased)
      if (state.progressAll && typeof state.progressAll === 'object') {
        const key = resolveProgressKey(bid);
        delete state.progressAll[key];
      }
    }

    rebuildShowProgressSummary();
    renderContinue();
    if (state.ui.booksSubView === 'show') renderShowView();
    else renderHome();
  }

  function openContinueTileContextMenu(e, item) {
    e.preventDefault();
    e.stopPropagation();
    var show = item && item.show;
    var book = item && item.book;
    if (!show || !book) return;
    showCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: _listenMode ? 'Continue listening' : 'Continue reading', onClick: function () { openBook(book).catch(function () {}); } },
        { label: 'Open series', onClick: function () { openShow(show.id); } },
        { label: 'Listen to book', onClick: function () {
          var shell = window.booksListeningShell;
          if (shell && typeof shell.openListenBook === 'function') shell.openListenBook(book);
          else if (shell) shell.setMode(shell.MODE_LISTEN);
        }},
        { separator: true },
        { label: 'Mark as finished', onClick: function () { markBookFinished(book.id); } },
        { label: 'Clear from Continue Reading', onClick: function () { clearContinueShow(show.id, book.id); } },
        { separator: true },
        { label: 'Rename\u2026', onClick: function () { renameBook(book); } },
        { separator: true },
        { label: 'Reveal in Explorer', disabled: !(canReveal() && book.path), onClick: function () {
          if (book.path) api.shell.revealPath(book.path);
        }},
        { label: 'Copy path', disabled: !book.path, onClick: function () {
          if (book.path && api.clipboard && api.clipboard.copyText) {
            api.clipboard.copyText(book.path).then(function () { toast('Path copied'); }).catch(function () {});
          }
        }},
        { separator: true },
        { label: 'Remove from library\u2026', danger: true, onClick: async function () {
          var ok = window.confirm('Remove from library?\n\nThis removes it from the library. It does not delete files from disk.');
          if (!ok) return;
          var res = show.removableSeriesPath
            ? await api.books.removeSeriesFolder(show.removableSeriesPath)
            : await api.books.removeFile(book.path);
          if (res && res.state) applySnapshot(res.state);
          await loadProgress();
          renderAll();
          toast('Removed from library');
        }},
      ],
    });
  }

  function makeContinueTile(item) {
    const show = item && item.show;
    const book = item && item.book;
    if (!show || !book) return document.createElement('div');

    const tile = document.createElement('div');
    tile.className = 'contTile';

    const cover = document.createElement('div');
    cover.className = 'contCover';

    const img = document.createElement('img');
    img.className = 'thumb contCoverImg';
    img.alt = '';
    attachThumb(img, book);
    cover.appendChild(img);

    const remove = document.createElement('button');
    remove.className = 'contRemove';
    remove.title = 'Clear from Continue Reading';
    remove.textContent = 'X';
    remove.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await clearContinueShow(show.id, book.id);
    };
    cover.appendChild(remove);

    const pct = getBookPct(book, item.progress);
    if (pct !== null) {
      const pctWrap = document.createElement('div');
      pctWrap.className = 'contPctBadge';
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = pct >= 99 ? 'Finished' : `${pct}%`;
      pctWrap.appendChild(badge);
      cover.appendChild(pctWrap);
    }

    tile.appendChild(cover);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'contTitleWrap';
    const title = document.createElement('div');
    title.className = 'contTileTitle u-clamp2';
    title.title = effectiveTitle(book) || effectiveShowName(show) || '';
    title.textContent = effectiveTitle(book) || effectiveShowName(show) || 'Untitled';
    titleWrap.appendChild(title);
    tile.appendChild(titleWrap);

    tile.onclick = () => {
      openBook(book).catch(() => {});
    };
    tile.addEventListener('contextmenu', (e) => {
      openContinueTileContextMenu(e, item);
    });
    return tile;
  }

  function renderContinue() {
    // LISTEN_P2: delegate continue shelf to listening shell when in listen mode
    if (_listenMode) {
      if (el.continuePanel) el.continuePanel.innerHTML = '';
      try {
        const shell = window.booksListeningShell;
        if (shell && typeof shell.renderListenContinue === 'function') shell.renderListenContinue();
      } catch {}
      scheduleBooksContinueGeometry();
      return;
    }
    if (!el.continuePanel || !el.continueEmpty) return;
    if (el.continueList) el.continueList.classList.add('hidden');
    const row = el.continuePanel;
    row.innerHTML = '';
    row.classList.remove('videoList', 'videoContinueRow');
    row.classList.add('continueRow', 'continueYacRow');

    const items = getContinueItems().slice(0, 10);
    row.classList.toggle('hidden', !items.length);
    el.continueEmpty.classList.toggle('hidden', !!items.length);
    if (!items.length) return;

    for (const it of items) row.appendChild(makeContinueTile(it));
    scheduleBooksContinueGeometry();
  }
  function getVisibleShows() {
    const rid = String(state.ui.selectedRootId || '');
    let list = rid ? (state.derived.showsByRoot.get(rid) || []).slice() : (state.derived.shows || []).slice();
    // R1: filter out soft-hidden collections
    if (state.ui.hiddenShowIds && state.ui.hiddenShowIds.size) {
      list = list.filter((s) => !state.ui.hiddenShowIds.has(String(s.id || '')));
    }
    if (state.ui.hideFinishedShows) {
      list = list.filter((s) => {
        const pr = showProgressForShowId(s.id);
        return !(pr.total > 0 && pr.finished >= pr.total);
      });
    }
    list.sort((a, b) => naturalCompare(a.name || '', b.name || '') || naturalCompare(a.id || '', b.id || ''));
    return list;
  }

  function makeShowCard(show) {
    const card = document.createElement('div');
    card.className = 'seriesCard';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'seriesRemove';
    removeBtn.title = 'Remove series';
    removeBtn.textContent = 'X';
    const removableSeriesPath = show && show.removableSeriesPath ? String(show.removableSeriesPath) : '';
    if (!removableSeriesPath) {
      removeBtn.disabled = true;
      removeBtn.style.opacity = '0';
      removeBtn.style.pointerEvents = 'none';
    } else {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeSeriesFolderAction(removableSeriesPath, show.id).catch(() => {});
      });
    }
    card.appendChild(removeBtn);

    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const coverWrap = document.createElement('div');
    coverWrap.className = 'seriesCoverWrap';
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumbWrap';
    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';
    const firstBook = show.firstBookId ? state.derived.bookById.get(String(show.firstBookId)) : null;
    if (firstBook) attachThumb(img, firstBook);
    else img.src = fallbackForFolder(show.name || '?');
    thumbWrap.appendChild(img);
    coverWrap.appendChild(thumbWrap);

    const name = document.createElement('div');
    name.className = 'seriesName';
    name.textContent = effectiveShowName(show);

    const pr = showProgressForShowId(show.id);
    const prBits = [];
    if (pr.finished > 0) prBits.push(`${pr.finished} read`);
    if (pr.inProgress > 0) prBits.push(`${pr.inProgress} in progress`);
    if (pr.percent > 0) prBits.push(`${pr.percent}%`);

    const info = document.createElement('div');
    info.className = 'seriesInfo';
    const meta = document.createElement('div');
    meta.className = 'seriesMeta';
    const s1 = document.createElement('span');
    s1.textContent = `${show.bookCount} volume${show.bookCount === 1 ? '' : 's'}`;
    const s2 = document.createElement('span');
    s2.className = 'mono u-ellipsis';
    s2.textContent = prBits.length ? prBits.join(' - ') : (show.path || '');
    meta.appendChild(s1);
    meta.appendChild(s2);
    info.appendChild(meta);

    card.appendChild(coverWrap);
    card.appendChild(name);
    card.appendChild(info);

    const open = () => openShow(show.id);
    card.onclick = open;
    card.addEventListener('contextmenu', (e) => showShowContextMenu(e, show));
    card.onkeydown = (e) => {
      const k = String(e.key || '');
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        open();
      }
    };

    return card;
  }

  function renderHome() {
    if (!el.showsGrid || !el.showsEmpty) return;

    if (el.rootLabel) {
      if (state.ui.selectedRootId) {
        const r = getRoot(state.ui.selectedRootId);
        el.rootLabel.textContent = (r && (r.name || r.path)) ? (r.name || r.path) : 'Filtered folder';
      } else {
        el.rootLabel.textContent = 'All folders';
      }
    }

    const shows = getVisibleShows();
    el.showsGrid.textContent = '';
    el.showsEmpty.classList.toggle('hidden', !!shows.length);
    if (!shows.length) return;

    const CHUNK = 60;
    renderHome._token = (renderHome._token || 0) + 1;
    const token = renderHome._token;

    const appendChunk = (startIdx) => {
      if (token !== renderHome._token) return;
      const frag = document.createDocumentFragment();
      const end = Math.min(startIdx + CHUNK, shows.length);
      for (let i = startIdx; i < end; i += 1) frag.appendChild(makeShowCard(shows[i]));
      el.showsGrid.appendChild(frag);
      if (end >= shows.length) return;
      if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(() => appendChunk(end), { timeout: 120 });
      else requestAnimationFrame(() => appendChunk(end));
    };

    if (shows.length <= CHUNK) {
      const frag = document.createDocumentFragment();
      for (const s of shows) frag.appendChild(makeShowCard(s));
      el.showsGrid.appendChild(frag);
    } else {
      appendChunk(0);
    }

    // R1: sync restore-hidden button state
    if (el.restoreHiddenBtn) {
      const hasHidden = !!(state.ui.hiddenShowIds && state.ui.hiddenShowIds.size);
      el.restoreHiddenBtn.disabled = !hasHidden;
      el.restoreHiddenBtn.setAttribute('aria-disabled', hasHidden ? 'false' : 'true');
    }
  }

  function getRootExpanded(rootId) {
    const rid = String(rootId || '');
    if (Object.prototype.hasOwnProperty.call(state.ui.showTreeExpanded || {}, rid)) return !!state.ui.showTreeExpanded[rid];
    if (state.ui.selectedRootId) return String(state.ui.selectedRootId) === rid;
    return true;
  }

  function renderSidebar() {
    if (!el.foldersList) return;
    el.foldersList.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `folderItem${(!state.ui.selectedRootId && state.ui.booksSubView === 'home') ? ' active' : ''}`;
    allBtn.innerHTML = `
      <span class="folderIcon"></span>
      <span class="folderLabel">All</span>
    `;
    allBtn.onclick = () => {
      state.ui.selectedRootId = null;
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      scheduleSaveUi();
      renderAll();
    };
    el.foldersList.appendChild(allBtn);

    if (!state.derived.roots.length) {
      const empty = document.createElement('div');
      empty.className = 'folderTreeEmpty';
      empty.textContent = 'No folders yet';
      el.foldersList.appendChild(empty);
      return;
    }

    for (const root of state.derived.roots) {
      const rid = String(root.id || '');
      const expanded = getRootExpanded(rid);

      const row = document.createElement('button');
      row.type = 'button';
      row.className = `folderItem${(rid && String(state.ui.selectedRootId || '') === rid && state.ui.booksSubView === 'home') ? ' active' : ''}`;

      const twisty = document.createElement('span');
      twisty.className = 'folderIcon';
      twisty.textContent = expanded ? '▾' : '▸';
      twisty.title = expanded ? 'Collapse' : 'Expand';
      twisty.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.ui.showTreeExpanded = (state.ui.showTreeExpanded && typeof state.ui.showTreeExpanded === 'object') ? state.ui.showTreeExpanded : {};
        state.ui.showTreeExpanded[rid] = !expanded;
        renderSidebar();
        scheduleSaveUi();
      });

      const label = document.createElement('span');
      label.className = 'folderLabel';
      label.textContent = root.name || root.path || rid;

      const count = document.createElement('span');
      count.className = 'folderCount';
      count.textContent = String(Number(state.derived.rootShowCount.get(rid) || 0));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'videoRootRemove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeRootFolderAction(root.path).catch(() => {});
      });

      row.appendChild(twisty);
      row.appendChild(label);
      row.appendChild(count);
      row.appendChild(remove);
      row.addEventListener('click', () => {
        state.ui.selectedRootId = rid;
        state.ui.booksSubView = 'home';
        state.ui.selectedShowId = null;
        state.ui.selectedBookId = null;
        state.ui.showFolderRel = '';
        state.ui.showTreeExpanded = (state.ui.showTreeExpanded && typeof state.ui.showTreeExpanded === 'object') ? state.ui.showTreeExpanded : {};
        state.ui.showTreeExpanded[rid] = true;
        renderAll();
        scheduleSaveUi();
      });

      row.addEventListener('contextmenu', (e) => {
        const t = e.target;
        const tag = (t && t.tagName) ? String(t.tagName).toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
        showRootContextMenu(e, root);
      });

      el.foldersList.appendChild(row);

      if (!expanded) continue;

      const children = (state.derived.showsByRoot.get(rid) || []).slice()
        .sort((a, b) => naturalCompare(a.name || '', b.name || '') || naturalCompare(a.id || '', b.id || ''));

      for (const show of children) {
        const sid = String(show.id || '');
        const srow = document.createElement('button');
        srow.type = 'button';
        srow.className = `folderItem folderChild${(sid && String(state.ui.selectedShowId || '') === sid && state.ui.booksSubView === 'show') ? ' active' : ''}`;

        const icon = document.createElement('span');
        icon.className = 'folderIcon';
        icon.textContent = '';

        const slabel = document.createElement('span');
        slabel.className = 'folderLabel';
        slabel.textContent = effectiveShowName(show);

        const scount = document.createElement('span');
        scount.className = 'folderCount';
        scount.textContent = String(Number(show.bookCount || 0));

        srow.appendChild(icon);
        srow.appendChild(slabel);
        srow.appendChild(scount);

        srow.addEventListener('click', () => {
          openShow(show.id);
        });

        srow.addEventListener('contextmenu', (e) => {
          const t = e.target;
          const tag = (t && t.tagName) ? String(t.tagName).toLowerCase() : '';
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
          showShowContextMenu(e, show);
        });

        el.foldersList.appendChild(srow);
      }
    }
  }

  function deriveBookFolderRelInShow(book, show) {
    if (!book || !show) return '';
    const bookFolderRel = normalizeRel(book.folderRelPath || '');
    const showRel = normalizeRel(show.relPath || '');
    if (!showRel) return bookFolderRel;
    if (bookFolderRel === showRel) return '';
    if (bookFolderRel.startsWith(`${showRel}/`)) return normalizeRel(bookFolderRel.slice(showRel.length + 1));
    return bookFolderRel;
  }

  function buildShowFolderModel(show) {
    const allBooks = getBooksForShow(show && show.id);
    if (!allBooks.length) {
      return {
        show,
        allEntries: [],
        allFolders: new Set(['']),
        folderLatest: new Map([['', 0]]),
        currentFolder: '',
        folders: [],
        files: [],
        totalBooks: 0,
        fallbackBook: null,
      };
    }

    const allFolders = new Set(['']);
    const folderLatest = new Map();
    folderLatest.set('', 0);
    const entries = [];

    for (const b of allBooks) {
      const relFolder = normalizeRel(deriveBookFolderRelInShow(b, show));
      entries.push({ book: b, relFolder });

      const mtime = Number(b && b.mtimeMs || 0);
      const parts = relFolder ? relFolder.split('/').filter(Boolean) : [];
      let cur = '';
      const chain = [''];
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part;
        chain.push(cur);
        allFolders.add(cur);
      }
      for (const one of chain) {
        const prev = Number(folderLatest.get(one) || 0);
        if (mtime > prev) folderLatest.set(one, mtime);
      }
    }

    let curFolder = normalizeRel(state.ui.showFolderRel || '');
    if (curFolder && !allFolders.has(curFolder)) {
      curFolder = '';
      state.ui.showFolderRel = '';
    }

    const sortMode = String(state.ui.epSort || 'title_asc');

    // R12: include book count per subfolder
    let folders = Array.from(allFolders.values())
      .filter((f) => f && parentRel(f) === curFolder)
      .map((f) => {
        const prefix = f ? `${f}/` : '';
        const count = entries.filter((e) => { const rf = normalizeRel(e.relFolder); return rf === f || rf.startsWith(prefix); }).length;
        return { relPath: f, name: relBase(f), mtimeMs: Number(folderLatest.get(f) || 0), bookCount: count };
      });

    let files = entries.filter((e) => normalizeRel(e.relFolder) === curFolder).map((e) => e.book);

    if (sortMode === 'modified_desc' || sortMode === 'modified_asc') {
      const dir = sortMode === 'modified_asc' ? 1 : -1;
      folders.sort((a, b) => ((Number(a.mtimeMs || 0) - Number(b.mtimeMs || 0)) * dir) || naturalCompare(a.name, b.name));
      files.sort((a, b) => ((Number(a.mtimeMs || 0) - Number(b.mtimeMs || 0)) * dir) || naturalCompare(a.title || '', b.title || '') || naturalCompare(a.path || '', b.path || ''));
    } else {
      folders.sort((a, b) => naturalCompare(a.name, b.name));
      files.sort((a, b) => naturalCompare(a.title || '', b.title || '') || naturalCompare(a.path || '', b.path || ''));
    }

    const curPrefix = curFolder ? `${curFolder}/` : '';
    let fallbackBook = files[0] || null;
    if (!fallbackBook) {
      for (const e of entries) {
        const rf = normalizeRel(e.relFolder);
        if (!curFolder || rf === curFolder || rf.startsWith(curPrefix)) {
          fallbackBook = e.book;
          break;
        }
      }
    }
    if (!fallbackBook) fallbackBook = allBooks[0] || null;

    return {
      show,
      allEntries: entries,
      allFolders,
      folderLatest,
      currentFolder: curFolder,
      folders,
      files,
      totalBooks: allBooks.length,
      fallbackBook,
    };
  }
  function updateShowPreview(model, selectedBook) {
    if (!el.epPreviewInfo || !el.epPreviewImg) return;
    const show = model && model.show ? model.show : null;
    const fallbackBook = model && model.fallbackBook ? model.fallbackBook : null;
    const currentFolder = model ? normalizeRel(model.currentFolder) : '';
    const book = selectedBook || fallbackBook || null;

    if (selectedBook) {
      const pct = getBookPct(selectedBook, getBookProgress(selectedBook.id));
      const bits = [effectiveTitle(selectedBook)];
      if (pct != null) bits.push(`${pct}%`);
      bits.push(String((selectedBook.format || '').toUpperCase() || '-'));
      el.epPreviewInfo.textContent = bits.join(' - ');
      el.epPreviewInfo.title = selectedBook.path || selectedBook.title || '';
    } else {
      const folderName = currentFolder ? relBase(currentFolder) : '';
      const label = folderName ? `${effectiveShowName(show)} / ${folderName}` : effectiveShowName(show);
      el.epPreviewInfo.textContent = label;
      const root = show && show.rootId ? getRoot(show.rootId) : null;
      const fullFolderPath = show ? resolveRootRelPath(root && root.path, show.relPath ? (currentFolder ? `${show.relPath}/${currentFolder}` : show.relPath) : currentFolder) : '';
      el.epPreviewInfo.title = fullFolderPath || (show && show.path) || label;
    }

    if (book) attachThumb(el.epPreviewImg, book);
    else el.epPreviewImg.src = fallbackForFolder(show && show.name ? show.name : 'Books');
  }

  function selectBookInShow(bookId, model, opts = {}) {
    const id = String(bookId || '');
    state.ui.selectedBookId = id || null;
    const rows = el.episodesGrid ? Array.from(el.episodesGrid.querySelectorAll('.volTrow')) : [];
    let selectedRow = null;
    for (const row of rows) {
      const isSel = String(row.dataset.id || '') === id;
      row.classList.toggle('sel', isSel);
      if (isSel) selectedRow = row;
    }

    let selectedBook = null;
    if (id) selectedBook = state.derived.bookById.get(id) || null;
    if (selectedBook) {
      const visible = (model && model.files || []).some((b) => String(b.id || '') === id);
      if (!visible) selectedBook = null;
    }

    updateShowPreview(model, selectedBook);
    if (selectedRow && opts.ensureVisible !== false) {
      try { selectedRow.scrollIntoView({ block: 'nearest' }); } catch {}
    }
    if (opts.persist !== false) scheduleSaveUi();
  }

  function navigateShowFolder(relPath) {
    state.ui.showFolderRel = normalizeRel(relPath || '');
    state.ui.selectedBookId = null;
    renderShowView();
    scheduleSaveUi();
  }

  // R12: enhanced folder rows with book count + context menu
  function makeFolderRow(opts, altIdx) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    const row = document.createElement('div');
    row.className = `volTrow folderRow${(altIdx % 2) ? ' alt' : ''}`;
    row.dataset.kind = 'folder';
    row.dataset.folderRelPath = String(o.relPath || '');

    const mkCell = (cls, txt) => {
      const d = document.createElement('div');
      d.className = `cell ${cls}`;
      d.textContent = txt || '';
      return d;
    };

    row.appendChild(mkCell('num', ''));
      row.appendChild(mkCell('title', `${o.isUp ? '<- ' : '[Folder] '}${String(o.name || 'Folder')}`));
    const bookCount = Number(o.bookCount || 0);
    row.appendChild(mkCell('size', bookCount > 0 ? `${bookCount} volumes` : ''));
    row.appendChild(mkCell('duration', ''));
    row.appendChild(mkCell('progress', ''));
    row.appendChild(mkCell('date', Number.isFinite(Number(o.mtimeMs)) ? fmtDate(Number(o.mtimeMs)) : ''));

    row.onclick = () => {
      navigateShowFolder(String(o.relPath || ''));
    };

    if (!o.isUp) {
      row.addEventListener('contextmenu', (e) => {
        showCtx({
          x: e.clientX, y: e.clientY,
          items: [
            { label: 'Open folder', onClick: () => navigateShowFolder(String(o.relPath || '')) },
            { label: 'Reveal in Explorer', disabled: !canReveal(), onClick: async () => {
              const show = getShowById(state.ui.selectedShowId);
              const root = show && show.rootId ? getRoot(show.rootId) : null;
              const showRel = show ? normalizeRel(show.relPath || '') : '';
              const folderRel = normalizeRel(o.relPath || '');
              const fullRel = showRel ? (folderRel ? `${showRel}/${folderRel}` : showRel) : folderRel;
              const full = resolveRootRelPath(root && root.path, fullRel);
              if (full) await api.shell.revealPath(full);
            }},
          ],
        });
      });
    }
    return row;
  }

  function makeBookRow(book, altIdx, displayNum) {
    const row = document.createElement('div');
    row.className = `volTrow${(altIdx % 2) ? ' alt' : ''}`;
    row.dataset.id = String(book.id || '');
    if (String(book.id || '') === String(state.ui.selectedBookId || '')) row.classList.add('sel');

    const mkCell = (cls, txt) => {
      const d = document.createElement('div');
      d.className = `cell ${cls}`;
      d.textContent = txt || '';
      return d;
    };

    const pct = _listenMode ? getBookTtsPct(book) : getBookPct(book, getBookProgress(book.id));
    const pctTxt = (pct !== null) ? (pct >= 100 ? '100%' : `${pct}%`) : '-';

    row.appendChild(mkCell('num', String(displayNum || '')));

    const titleCell = document.createElement('div');
    titleCell.className = 'cell title';
    const titleMain = document.createElement('div');
    titleMain.className = 'videoEpTitleMain';
    titleMain.textContent = effectiveTitle(book);
    titleCell.appendChild(titleMain);

    const fileBase = pathBase(book.path || '');
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const stem = fileBase ? fileBase.replace(/\.[^/.]+$/, '') : '';
    const hasCustomName = !!(state.displayNames[book.id]);
    const showSub = !hasCustomName && !!(fileBase && norm(fileBase) && norm(fileBase) !== norm(titleMain.textContent) && norm(stem) !== norm(titleMain.textContent));
    if (showSub) {
      const titleSub = document.createElement('div');
      titleSub.className = 'videoEpTitleSub';
      titleSub.textContent = fileBase;
      titleCell.appendChild(titleSub);
    }

    titleCell.title = fileBase ? `${titleMain.textContent}\n${fileBase}` : titleMain.textContent;
    row.appendChild(titleCell);
    row.appendChild(mkCell('size', fmtBytes(book.size || book.sizeBytes || 0)));
    row.appendChild(mkCell('duration', String((book.format || '').toUpperCase() || '-')));

    const progressCell = document.createElement('div');
    progressCell.className = 'cell progress';
    const track = document.createElement('div');
    track.className = 'videoEpProgressTrack';
    const fill = document.createElement('div');
    fill.className = 'videoEpProgressFill';
    fill.style.width = (pct !== null) ? `${Math.max(0, Math.min(100, pct))}%` : '0%';
    track.appendChild(fill);
    const label = document.createElement('div');
    label.className = 'videoEpProgressLabel';
    label.textContent = pctTxt;
    progressCell.appendChild(track);
    progressCell.appendChild(label);
    row.appendChild(progressCell);

    row.appendChild(mkCell('date', fmtDate(book.mtimeMs || 0)));

    row.onclick = () => {
      selectBookInShow(book.id, buildShowFolderModel(getShowById(state.ui.selectedShowId)), { persist: true });
    };
    row.ondblclick = () => {
      selectBookInShow(book.id, buildShowFolderModel(getShowById(state.ui.selectedShowId)), { persist: true });
      openBook(book).catch(() => {});
    };
    // R6: expanded book row context menu
    row.addEventListener('contextmenu', (e) => {
      const progress = getBookProgress(book.id);
      const pct = getBookPct(book, progress);
      const hasProgress = progress && (pct > 0 || progress.finished);
      const isFinished = !!(progress && progress.finished);
      showCtx({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: (pct > 0 && pct < 100) ? (_listenMode ? 'Continue listening' : 'Continue reading') : (_listenMode ? 'Listen' : 'Open book'), onClick: () => openBook(book).catch(() => {}) },
          { label: 'Open from beginning', onClick: async () => {
            try {
              if (_listenMode && api && typeof api.clearBooksTtsProgress === 'function') await api.clearBooksTtsProgress(book.id || book.path);
              else if (api && api.booksProgress && typeof api.booksProgress.clear === 'function') await api.booksProgress.clear(book.id);
            } catch {}
            // FIX-CONT-TRACK: resolve actual key (may be lowercased)
            delete state.progressAll[resolveProgressKey(book.id)];
            openBook(book).catch(() => {});
          }},
          // LISTEN_P2: launch TTS player for this book
          { label: 'Listen to book', onClick: () => {
            const shell = window.booksListeningShell;
            if (shell && typeof shell.openListenBook === 'function') shell.openListenBook(book);
            else if (shell) shell.setMode(shell.MODE_LISTEN);
          }},
          { separator: true },
          { label: isFinished ? 'Mark as in-progress' : 'Mark as finished',
            onClick: () => (isFinished ? markBookInProgress(book.id) : markBookFinished(book.id)) },
          { label: 'Clear progress', disabled: !hasProgress, onClick: () => clearBookProgress(book.id) },
          { separator: true },
          { label: 'Rename\u2026', onClick: function() { renameBook(book); } },
          { separator: true },
          { label: 'Reveal in Explorer', disabled: !(canReveal() && book.path), onClick: async () => {
            if (book.path) await api.shell.revealPath(book.path);
          }},
          { label: 'Copy path', disabled: !book.path, onClick: () => {
            if (book.path && api.clipboard && api.clipboard.copyText) {
              api.clipboard.copyText(book.path).then(() => toast('Path copied')).catch(() => {});
            }
          }},
        ],
      });
    });

    return row;
  }

  // R10: folder-level continue helper
  function renderFolderContinue() {
    const container = qs('booksFolderContinue');
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('hidden');

    if (state.ui.booksSubView !== 'show' || !state.ui.selectedShowId) return;

    const books = getBooksForShow(state.ui.selectedShowId);
    let best = null;
    let bestAt = -1;

    for (const b of books) {
      if (_listenMode) {
        const e = getBookTtsProgress(b);
        if (!e) continue;
        const pct = getBookTtsPct(b);
        if (pct == null || pct <= 0 || pct >= 100) continue;
        const at = Number(e.updatedAt || 0);
        if (at > bestAt) { bestAt = at; best = b; }
      } else {
        const p = getBookProgress(b.id);
        if (!p || p.finished) continue;
        const pct = getBookPct(b, p);
        if (pct == null || pct <= 0 || pct >= 100) continue;
        const at = Number(p.updatedAt || 0);
        if (at > bestAt) { bestAt = at; best = b; }
      }
    }
    if (!best) return;

    const pct = _listenMode ? (getBookTtsPct(best) || 0) : (getBookPct(best, getBookProgress(best.id)) || 0);
    const label = _listenMode ? 'Continue listening' : 'Continue reading';
    container.classList.remove('hidden');
    container.innerHTML = `<div class="booksFolderContinueInner">` +
      `<span class="booksFolderContinueLabel">${label}</span>` +
      `<span class="booksFolderContinueTitle">${escHtml(effectiveTitle(best))}</span>` +
      `<div class="booksFolderContinueBar"><div class="booksFolderContinueFill" style="width:${pct}%"></div></div>` +
      `<span class="booksFolderContinueHint">${pct}%</span>` +
      `<button class="iconBtn booksFolderContinueBtn" title="${label}">&#9654;</button>` +
      `</div>`;
    const bestRef = best;
    container.querySelector('.booksFolderContinueBtn')?.addEventListener('click', (ev) => { ev.stopPropagation(); openBook(bestRef).catch(() => {}); });
    container.addEventListener('click', () => openBook(bestRef).catch(() => {}));
  }

  function renderShowView() {
    const show = getShowById(state.ui.selectedShowId);
    if (!show) {
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      renderAll();
      return;
    }

    if (!el.episodesGrid || !el.episodesWrap || !el.episodesEmpty) return;

    const allowedSort = new Set(['title_asc', 'modified_desc', 'modified_asc']);
    if (!allowedSort.has(String(state.ui.epSort || ''))) state.ui.epSort = 'title_asc';

    const model = buildShowFolderModel(show);
    const files = model.files;

    if (el.crumb) el.crumb.classList.remove('hidden');
    if (el.crumbText) {
      const folderBase = model.currentFolder ? relBase(model.currentFolder) : '';
      el.crumbText.textContent = folderBase ? `${effectiveShowName(show)} / ${folderBase}` : effectiveShowName(show);
      const root = getRoot(show.rootId);
      const relForTitle = show.relPath ? (model.currentFolder ? `${show.relPath}/${model.currentFolder}` : show.relPath) : model.currentFolder;
      const titlePath = resolveRootRelPath(root && root.path, relForTitle);
      el.crumbText.title = titlePath || show.path || show.name || '';
    }

    if (!model.totalBooks) {
      el.episodesWrap.classList.add('hidden');
      el.episodesEmpty.classList.remove('hidden');
      el.episodesEmpty.innerHTML = 'No volumes found in this folder.<br><span class="muted tiny">Try adding an EPUB, PDF, or TXT file to this folder.</span>';
      if (el.epTableHead) el.epTableHead.classList.add('hidden');
      updateShowPreview(model, null);
      return;
    }

    if (!model.folders.length && !files.length) {
      el.episodesWrap.classList.add('hidden');
      el.episodesEmpty.classList.remove('hidden');
      el.episodesEmpty.textContent = 'This folder is empty.';
      if (el.epTableHead) el.epTableHead.classList.add('hidden');
      updateShowPreview(model, null);
      return;
    }

    el.episodesEmpty.classList.add('hidden');
    if (el.epTableHead) el.epTableHead.classList.remove('hidden');
    el.episodesWrap.classList.remove('hidden');
    el.episodesGrid.innerHTML = '';

    let stripe = 0;
    if (model.currentFolder) {
      const up = parentRel(model.currentFolder);
      el.episodesGrid.appendChild(makeFolderRow({ name: '..', relPath: up, isUp: true, mtimeMs: Number(model.folderLatest.get(model.currentFolder) || 0) }, stripe));
      stripe += 1;
    }

    for (const f of model.folders) {
      el.episodesGrid.appendChild(makeFolderRow(f, stripe));
      stripe += 1;
    }

    // R11: chunked rendering for large book lists
    const BOOK_CHUNK = 200;
    renderShowView._token = (renderShowView._token || 0) + 1;
    const svToken = renderShowView._token;

    const finishShowView = () => {
      const visibleIds = new Set(files.map((b) => String(b.id || '')));
      if (!state.ui.selectedBookId || !visibleIds.has(String(state.ui.selectedBookId || ''))) {
        let best = null;
        let bestAt = -1;
        for (const b of files) {
          const p = getBookProgress(b.id);
          if (!p || p.finished) continue;
          const pct = getBookPct(b, p);
          if (pct == null || pct <= 0 || pct >= 100) continue;
          const at = Number(p.updatedAt || 0);
          if (at > bestAt) { bestAt = at; best = b; }
        }
        state.ui.selectedBookId = best ? String(best.id || '') : (files[0] ? String(files[0].id || '') : null);
      }
      if (state.ui.selectedBookId) {
        selectBookInShow(state.ui.selectedBookId, { ...model, files }, { persist: false });
      } else {
        updateShowPreview(model, null);
      }
      renderFolderContinue();
    };

    if (files.length > BOOK_CHUNK) {
      const appendBookChunk = (startIdx) => {
        if (svToken !== renderShowView._token) return;
        const frag = document.createDocumentFragment();
        const end = Math.min(startIdx + BOOK_CHUNK, files.length);
        for (let i = startIdx; i < end; i++) {
          frag.appendChild(makeBookRow(files[i], stripe + i, i + 1));
        }
        el.episodesGrid.appendChild(frag);
        if (end >= files.length) { finishShowView(); return; }
        requestAnimationFrame(() => appendBookChunk(end));
      };
      appendBookChunk(0);
    } else {
      let displayNum = 1;
      for (const b of files) {
        el.episodesGrid.appendChild(makeBookRow(b, stripe, displayNum));
        stripe += 1;
        displayNum += 1;
      }
      finishShowView();
    }
  }

  function renderViews() {
    if (!el.homeView || !el.showView) return;
    const showOn = !state.readerOpen && state.ui.booksSubView === 'show' && !!state.ui.selectedShowId;
    const homeOn = !state.readerOpen && !showOn;
    el.homeView.classList.toggle('hidden', !homeOn);
    el.showView.classList.toggle('hidden', !showOn);
  }

  function renderAll() {
    ensureSelection();
    renderScan();
    renderSidebar();
    renderContinue();
    renderViews();
    if (!state.readerOpen && state.ui.booksSubView === 'show' && state.ui.selectedShowId) renderShowView();
    else if (!state.readerOpen) renderHome();
  }
  function applySnapshot(snap) {
    const s = snap && typeof snap === 'object' ? snap : {};
    state.snap = {
      series: Array.isArray(s.series) ? s.series : [],
      books: Array.isArray(s.books) ? s.books : [],
      folders: Array.isArray(s.folders) ? s.folders : [],
      bookSeriesFolders: Array.isArray(s.bookSeriesFolders) ? s.bookSeriesFolders : [],
      scanning: !!s.scanning,
    };
    rebuildDerived();
    ensureSelection();
    renderAll();
  }

  async function refreshState() {
    const snap = await api.books.getState();
    applySnapshot(snap || {});
    try {
      const s = snap && typeof snap === 'object' ? snap : {};
      const hasRoots = Array.isArray(s.bookRootFolders) && s.bookRootFolders.length > 0;
      const hasBooks = Array.isArray(s.books) && s.books.length > 0;
      const hasFolders = Array.isArray(s.folders) && s.folders.length > 0;
      const shouldNudge = hasRoots && hasBooks && !hasFolders && !s.scanning;
      if (shouldNudge && !state.scanStatus._hierNudgeSent) {
        state.scanStatus._hierNudgeSent = true;
        api.books.scan({ force: true }).catch(() => {});
      } else if (!shouldNudge) {
        state.scanStatus._hierNudgeSent = false;
      }
    } catch {}
  }

  async function refresh() {
    try { await api.books.scan({ force: true }); } catch {}
    await refreshState();
    await loadProgress();
    renderAll();
  }

  function findPreferredShowForBook(book) {
    if (!book || !book.id) return null;
    const bid = String(book.id || '');

    const current = getShowById(state.ui.selectedShowId);
    if (current) {
      const list = state.derived.booksByShow.get(String(current.id || '')) || [];
      if (list.some((b) => String(b.id || '') === bid)) return current;
    }

    const showIds = state.derived.bookToShowIds.get(bid) || [];
    if (!showIds.length) return null;

    let seriesPick = null;
    let folderPick = null;
    for (const sid of showIds) {
      const show = getShowById(sid);
      if (!show) continue;
      if (!seriesPick && show.type === 'series') seriesPick = show;
      if (!folderPick && show.type === 'folder') folderPick = show;
    }
    return seriesPick || folderPick || getShowById(showIds[0]);
  }

  function resolveBook(input) {
    if (!input) return null;
    if (typeof input === 'string') return state.derived.bookById.get(String(input || '')) || null;
    if (typeof input === 'object') {
      if (input.id) {
        const hit = state.derived.bookById.get(String(input.id || ''));
        if (hit) return hit;
      }
      if (input.path) {
        const key = normalizePathKey(input.path);
        const hit = (state.derived.books || []).find((b) => normalizePathKey(b && b.path) === key);
        if (hit) return hit;
      }
      return input.path ? input : null;
    }
    return null;
  }

  function openShow(showId) {
    const show = getShowById(showId);
    if (!show) return;
    const prev = String(state.ui.selectedShowId || '');
    const next = String(show.id || '');
    state.ui.selectedRootId = show.rootId || state.ui.selectedRootId;
    state.ui.booksSubView = 'show';
    state.ui.selectedShowId = next;
    if (prev !== next) {
      state.ui.showFolderRel = '';
      state.ui.selectedBookId = null;
    }
    ensureSelectionTreeExpanded();
    renderViews();
    renderShowView();
    renderSidebar();
    scheduleSaveUi();
  }

  async function openBook(input) {
    const b = resolveBook(input);
    if (!b) return false;
    // NOTE: listen-mode routing disabled. Always open in reader.

    const ctl = getReaderController();
    if (!ctl) {
      toast('Books reader is unavailable');
      return false;
    }

    const show = findPreferredShowForBook(b);
    if (show) {
      state.ui.selectedRootId = show.rootId || state.ui.selectedRootId;
      state.ui.booksSubView = 'show';
      state.ui.selectedShowId = String(show.id || '');
      state.ui.selectedBookId = String(b.id || '');
      state.ui.showFolderRel = normalizeRel(deriveBookFolderRelInShow(b, show));
    } else if (b.rootId) {
      state.ui.selectedRootId = String(b.rootId);
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
    }

    ensureSelectionTreeExpanded();
    scheduleSaveUi();
    state.viewBeforeReader = (state.ui.booksSubView === 'show') ? 'show' : 'home';

    try {
      // RENAME-BOOK: overlay display name for reader title bar
      var bookForReader = b;
      if (state.displayNames[b.id]) { bookForReader = Object.assign({}, b); bookForReader.title = state.displayNames[b.id]; }
      await ctl.open(bookForReader);
      state.readerOpen = true;
      renderViews();
      return true;
    } catch {
      state.readerOpen = false;
      state.ui.booksSubView = (state.viewBeforeReader === 'show' && state.ui.selectedShowId) ? 'show' : 'home';
      renderAll();
      return false;
    }
  }

  // LISTEN_P7: open reader directly, bypassing _listenMode routing (used by listening_player.js)
  async function openBookInReader(input) {
    const b = resolveBook(input);
    if (!b) return false;
    const ctl = getReaderController();
    if (!ctl) {
      toast('Books reader is unavailable');
      return false;
    }

    const show = findPreferredShowForBook(b);
    if (show) {
      state.ui.selectedRootId = show.rootId || state.ui.selectedRootId;
      state.ui.booksSubView = 'show';
      state.ui.selectedShowId = String(show.id || '');
      state.ui.selectedBookId = String(b.id || '');
      state.ui.showFolderRel = normalizeRel(deriveBookFolderRelInShow(b, show));
    } else if (b.rootId) {
      state.ui.selectedRootId = String(b.rootId);
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
    }

    ensureSelectionTreeExpanded();
    scheduleSaveUi();
    state.viewBeforeReader = (state.ui.booksSubView === 'show') ? 'show' : 'home';

    try {
      // RENAME-BOOK: overlay display name for reader title bar
      var bookForReader = b;
      if (state.displayNames[b.id]) { bookForReader = Object.assign({}, b); bookForReader.title = state.displayNames[b.id]; }
      await ctl.open(bookForReader);
      state.readerOpen = true;
      renderViews();
      return true;
    } catch {
      state.readerOpen = false;
      state.ui.booksSubView = (state.viewBeforeReader === 'show' && state.ui.selectedShowId) ? 'show' : 'home';
      renderAll();
      return false;
    }
  }

  async function back() {
    const ctl = getReaderController();
    if (ctl && ctl.isOpen && ctl.isOpen()) {
      await ctl.close();
      state.readerOpen = false;
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      scheduleSaveUi();
      renderAll();
      return true;
    }

    if (state.ui.booksSubView === 'show') {
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      scheduleSaveUi();
      renderAll();
      return true;
    }

    if (state.ui.selectedRootId) {
      state.ui.selectedRootId = null;
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      scheduleSaveUi();
      renderAll();
      return true;
    }

    try { if (typeof window.setMode === 'function') window.setMode('comics'); } catch {}
    return true;
  }
  // R8: Books library tips overlay toggle
  function toggleBooksLibTipsOverlay(force) {
    const overlay = qs('booksLibTipsOverlay');
    if (!overlay) return;
    const shouldShow = typeof force === 'boolean' ? force : overlay.classList.contains('hidden');
    overlay.classList.toggle('hidden', !shouldShow);
  }

  function getTopSearchEls() {
    const wEl = window.el || null;
    return {
      input: wEl && wEl.globalSearch ? wEl.globalSearch : qs('globalSearch'),
      results: wEl && wEl.globalSearchResults ? wEl.globalSearchResults : qs('globalSearchResults'),
    };
  }

  function hideGlobalSearchResults() {
    state.globalSearchItems = [];
    const { results } = getTopSearchEls();
    if (!results) return;
    results.innerHTML = '';
    results.classList.add('hidden');
  }

  function setGlobalSearchSelection(idx) {
    const items = state.globalSearchItems || [];
    const next = clamp(Number(idx || 0), 0, Math.max(0, items.length - 1));
    state.ui.globalSearchSel = next;
    try { if (window.appState && window.appState.ui) window.appState.ui.globalSearchSel = next; } catch {}

    const { results } = getTopSearchEls();
    if (!results) return;
    results.querySelectorAll('.resItem').forEach((node) => {
      const i = Number(node.dataset.idx || 0);
      node.classList.toggle('active', i === next);
    });
    const active = results.querySelector(`.resItem[data-idx="${next}"]`);
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
  }

  async function activateGlobalSearchSelection() {
    const pick = state.globalSearchItems[state.ui.globalSearchSel];
    if (!pick) return;

    hideGlobalSearchResults();
    const { input } = getTopSearchEls();
    if (input) {
      input.value = '';
      try { input.blur(); } catch {}
    }

    if (pick.type === 'show') {
      openShow(pick.showId);
      return;
    }

    if (pick.type === 'book') {
      const b = state.derived.bookById.get(String(pick.bookId || ''));
      if (b) await openBook(b);
    }
  }

  // R9: scored global search
  function renderGlobalSearchResults() {
    const { input, results } = getTopSearchEls();
    if (!input || !results) return;

    const q = String(input.value || '').trim().toLowerCase();
    if (!q) {
      hideGlobalSearchResults();
      return;
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = [];

    for (const show of state.derived.shows || []) {
      let score = 0;
      const nameNorm = effectiveShowName(show).toLowerCase();
      const pathNorm = String(show.path || '').toLowerCase();
      if (nameNorm.includes(q)) score += 140;
      if (pathNorm.includes(q)) score += 35;
      for (const t of tokens) { if (nameNorm.includes(t)) score += 12; }
      if (score > 0) scored.push({ type: 'show', item: show, score, name: effectiveShowName(show) });
    }

    for (const b of state.derived.books || []) {
      let score = 0;
      const titleNorm = effectiveTitle(b).toLowerCase();
      const seriesNorm = String(b.series || '').toLowerCase();
      const fileNorm = pathBase(b.path || '').toLowerCase();
      const pathNorm = String(b.path || '').toLowerCase();
      if (titleNorm.includes(q)) score += 150;
      if (seriesNorm.includes(q)) score += 90;
      if (fileNorm.includes(q)) score += 80;
      if (pathNorm.includes(q)) score += 30;
      for (const t of tokens) { if (titleNorm.includes(t)) score += 10; }
      if (score > 0) scored.push({ type: 'book', item: b, score, name: effectiveTitle(b) });
    }

    scored.sort((a, b) => (b.score - a.score) || naturalCompare(a.name, b.name));

    const showResults = scored.filter(r => r.type === 'show').slice(0, 24);
    const bookResults = scored.filter(r => r.type === 'book').slice(0, 80);

    results.innerHTML = '';
    state.globalSearchItems = [];
    let idx = 0;

    const addGroup = (label, arr, type) => {
      if (!arr.length) return;
      const g = document.createElement('div');
      g.className = 'resGroup';
      g.innerHTML = `<div class="resHead">${escHtml(label)}</div>`;

      for (const entry of arr) {
        const it = entry.item;
        const rowIdx = idx;
        const row = document.createElement('div');
        row.className = 'resItem';
        row.dataset.idx = String(rowIdx);
        if (type === 'show') {
          row.innerHTML = `<div class="resType">S</div><div class="resText"><div class="resMain">${escHtml(effectiveShowName(it))}</div><div class="resSub">${Number(it.bookCount || 0)} volumes</div></div>`;
          state.globalSearchItems.push({ type: 'show', showId: String(it.id || '') });
        } else {
          row.innerHTML = `<div class="resType">V</div><div class="resText"><div class="resMain">${escHtml(effectiveTitle(it))}</div><div class="resSub">${escHtml(it.series || '')}</div></div>`;
          state.globalSearchItems.push({ type: 'book', bookId: String(it.id || '') });
        }

        row.addEventListener('mouseenter', () => setGlobalSearchSelection(rowIdx));
        row.addEventListener('click', () => {
          setGlobalSearchSelection(rowIdx);
          activateGlobalSearchSelection().catch(() => {});
        });
        g.appendChild(row);
        idx += 1;
      }

      results.appendChild(g);
    };

    addGroup('Matching series', showResults, 'show');
    addGroup('Matching volumes', bookResults, 'book');

    if (!state.globalSearchItems.length) {
      const empty = document.createElement('div');
      empty.className = 'resEmpty';
      empty.textContent = 'No matches';
      results.appendChild(empty);
    }

    results.classList.remove('hidden');
    setGlobalSearchSelection(0);
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;

    // R1: wire restore-hidden button
    el.restoreHiddenBtn && el.restoreHiddenBtn.addEventListener('click', () => {
      if (!state.ui.hiddenShowIds || !state.ui.hiddenShowIds.size) return;
      state.ui.hiddenShowIds.clear();
      scheduleSaveUi();
      renderAll();
      toast('Hidden series restored');
    });

    // R5: action feedback toasts
    el.addRootBtn && el.addRootBtn.addEventListener('click', async () => {
      const res = await api.books.addRootFolder();
      if (res && res.state) { applySnapshot(res.state); await loadProgress(); renderAll(); toast('Root folder added'); }
    });

    el.addSeriesBtn && el.addSeriesBtn.addEventListener('click', async () => {
      const res = await api.books.addSeriesFolder();
      if (res && res.state) { applySnapshot(res.state); await loadProgress(); renderAll(); toast('Series folder added'); }
    });

    el.addFilesBtn && el.addFilesBtn.addEventListener('click', async () => {
      const res = await api.books.addFiles();
      if (res && res.state) { applySnapshot(res.state); await loadProgress(); renderAll(); toast('Files added'); }
    });

    el.openFileBtn && el.openFileBtn.addEventListener('click', async () => {
      const res = await api.books.openFileDialog();
      if (res && res.book) await openBook(res.book);
    });

    // R4: refresh + cancel toasts
    el.refreshBtn && el.refreshBtn.addEventListener('click', () => {
      toast('Refreshing...');
      refresh().catch(() => toast('Refresh failed'));
    });

    el.scanCancel && el.scanCancel.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { await api.books.cancelScan(); toast('Refresh canceled'); } catch {}
    });

    el.clearContinueBtn && el.clearContinueBtn.addEventListener('click', async function () {
      var ok = window.confirm('Clear all Continue items? This will remove saved reading progress.');
      if (!ok) return;
      try { await api.booksProgress.clearAll(); } catch {}
      state.progressAll = {};
      state.ui.dismissedContinueShows = {};
      scheduleSaveUi();
      rebuildShowProgressSummary();
      renderContinue();
      if (state.ui.booksSubView === 'home') renderHome();
      toast('Continue cleared');
    });

    el.showBackBtn && el.showBackBtn.addEventListener('click', () => {
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      scheduleSaveUi();
      renderAll();
    });

    // R7: keyboard navigation (Backspace, K)
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('inBooksMode')) return;
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;
      if (state.readerOpen) return;

      const key = String(e.key || '');

      if (key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        back().catch(() => {});
        return;
      }

      if (key === 'k' || key === 'K') {
        e.preventDefault();
        e.stopPropagation();
        toggleBooksLibTipsOverlay();
        return;
      }

      if (key === 'Escape') {
        const overlay = qs('booksLibTipsOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
          e.preventDefault();
          e.stopPropagation();
          toggleBooksLibTipsOverlay(false);
        }
      }
    });

    // R8: wire tips overlay close button
    const booksLibTipsClose = qs('booksLibTipsClose');
    booksLibTipsClose && booksLibTipsClose.addEventListener('click', () => toggleBooksLibTipsOverlay(false));

    api.books.onUpdated((snap) => {
      applySnapshot(snap || {});
      loadProgress().then(() => renderAll()).catch(() => {});
    });

    // R4: scan lifecycle toasts
    api.books.onScanStatus((s) => {
      const next = s && typeof s === 'object' ? s : {};
      const wasScanning = state.scanStatus.scanning;
      state.scanStatus = {
        scanning: !!next.scanning,
        progress: next.progress && typeof next.progress === 'object' ? next.progress : null,
      };
      renderScan();
      if (!wasScanning && state.scanStatus.scanning) toast('Refreshing books library...');
      if (wasScanning && !state.scanStatus.scanning) {
        toast('Books refresh complete');
        loadProgress().then(() => renderAll()).catch(() => renderAll());
      }
    });

    window.addEventListener('books-reader-opened', () => {
      state.readerOpen = true;
      renderViews();
    });

    // R2: always return to home view when reader closes
    window.addEventListener('books-reader-closed', () => {
      state.readerOpen = false;
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      scheduleSaveUi();
      loadProgress().then(() => renderAll()).catch(() => renderAll());
      if (el.continuePanel) {
        try { el.continuePanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      }
    });

    window.addEventListener('books-reader-error', () => {
      state.readerOpen = false;
      state.ui.booksSubView = 'home';
      state.ui.selectedShowId = null;
      state.ui.selectedBookId = null;
      state.ui.showFolderRel = '';
      scheduleSaveUi();
      renderAll();
    });
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;
    bind();
    await loadUi();
    // Always start at home view — navigating into a show requires an explicit click
    state.ui.booksSubView = 'home';
    state.ui.selectedShowId = null;
    state.ui.selectedBookId = null;
    state.ui.showFolderRel = '';
    await loadProgress();
    // RENAME-BOOK: load custom display names
    try { state.displayNames = (await api.booksDisplayNames.getAll()) || {}; } catch(_e) { state.displayNames = {}; }
    await refreshState();
    renderAll();
  }

  function resetToHome() {
    state.ui.booksSubView = 'home';
    state.ui.selectedShowId = null;
    state.ui.selectedBookId = null;
    state.ui.showFolderRel = '';
    scheduleSaveUi();
    renderAll();
  }

  window.booksApp = {
    refresh: () => refresh(),
    back: () => back(),
    resetToHome,
    openBook: (input) => openBook(input),
    // LISTEN_P7: bypass _listenMode routing — used by listening_player.js
    openBookInReader: (input) => openBookInReader(input),
    renderGlobalSearchResults: () => renderGlobalSearchResults(),
    hideGlobalSearchResults: () => hideGlobalSearchResults(),
    // LISTEN_P2: data accessors for listening_shell.js
    getBooks: () => (state.derived.books || []).slice(),
    getShows: () => (state.derived.shows || []).slice(),
    getBookById: (id) => {
      const k = String(id || '');
      const m = state.derived.bookById;
      return (m.get(k) || m.get(normalizePathKey(k)) || null);
    },
    attachThumb: (imgEl, book) => attachThumb(imgEl, book),
    setGlobalSearchSelection: (idx) => setGlobalSearchSelection(idx),
    activateGlobalSearchSelection: () => activateGlobalSearchSelection(),
    // NOTE: listen mode toggle disabled. Always stay in reader mode.
    setListenMode: (v) => { _listenMode = false; state.ttsProgressAll = {}; renderContinue(); },
    isListenMode: () => _listenMode,
    setAllProgress: (p) => {
      state.progressAll = p && typeof p === 'object' ? p : {};
      rebuildShowProgressSummary();
      renderContinue();
      if (state.ui.booksSubView === 'show') renderShowView();
      else renderHome();
    },
  };

  // Reset to home view when entering books mode from another tab
  const tanko = window.Tanko || {};
  if (tanko.modeRouter && typeof tanko.modeRouter.registerModeHandler === 'function') {
    tanko.modeRouter.registerModeHandler('books', {
      setMode: (mode, opts) => {
        if (opts && opts.previousMode && opts.previousMode !== 'books') {
          resetToHome();
        }
      },
    });
  }

  // ---- Web Sources in Books sidebar ----
  var _booksSources = [];

  function renderBooksSources() {
    var wrap = el.booksSourcesList;
    if (!wrap) return;
    wrap.innerHTML = '';
    for (var i = 0; i < _booksSources.length; i++) {
      var s = _booksSources[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'folderItem';
      btn.dataset.sourceId = s.id;
      var dot = document.createElement('span');
      dot.className = 'folderIcon';
      var faviconUrl = '';
      try { faviconUrl = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(new URL(s.url).hostname) + '&sz=32'; } catch (e) {}
      if (faviconUrl) {
        var fImg = document.createElement('img');
        fImg.className = 'folderFavicon';
        fImg.alt = '';
        fImg.src = faviconUrl;
        fImg.onerror = function () {
          var fallback = document.createElement('span');
          fallback.className = 'webSourceDot';
          fallback.style.background = s.color || '#888';
          fImg.replaceWith(fallback);
        };
        dot.appendChild(fImg);
      } else {
        dot.innerHTML = '<span class="webSourceDot" style="background:' + (s.color || '#888') + '"></span>';
      }
      var label = document.createElement('span');
      label.className = 'folderLabel';
      label.textContent = s.name;
      btn.appendChild(dot);
      btn.appendChild(label);
      btn.addEventListener('click', (function (source) {
        return function () {
          var d = (window.Tanko && window.Tanko.deferred) || {};
          if (typeof d.ensureWebModulesLoaded === 'function') {
            d.ensureWebModulesLoaded().then(function () {
              if (window.Tanko.web && typeof window.Tanko.web.openBrowser === 'function') {
                window.Tanko.web.openBrowser(source);
              }
            });
          }
        };
      })(s));
      wrap.appendChild(btn);
    }
  }

  function loadBooksSources() {
    if (!api || !api.webSources) return;
    api.webSources.get().then(function (res) {
      if (res && res.ok && Array.isArray(res.sources)) {
        _booksSources = res.sources;
        renderBooksSources();
      }
    }).catch(function () {});
  }

  // Load sources on init + listen for changes
  try { loadBooksSources(); } catch (e) {}
  try {
    if (api && api.webSources && typeof api.webSources.onUpdated === 'function') {
      api.webSources.onUpdated(loadBooksSources);
    }
  } catch (e) {}

  // Collapsible header toggle
  if (el.booksSourcesHeader && el.booksSourcesItems) {
    el.booksSourcesHeader.addEventListener('click', function () {
      var hidden = el.booksSourcesItems.classList.toggle('hidden');
      el.booksSourcesHeader.textContent = (hidden ? '\u25B8 ' : '\u25BE ') + 'Sources';
    });
  }

  // Add source button → open the shared add-source dialog
  if (el.booksAddSourceBtn) {
    el.booksAddSourceBtn.addEventListener('click', function () {
      var d = (window.Tanko && window.Tanko.deferred) || {};
      if (typeof d.ensureWebModulesLoaded === 'function') {
        d.ensureWebModulesLoaded().then(function () {
          var overlay = document.getElementById('webAddSourceOverlay');
          if (overlay) overlay.classList.remove('hidden');
        });
      }
    });
  }

  // ---- Downloads in Books sidebar ----
  var _booksDls = [];
  var _booksDlTimer = null;

  function _bkEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderBooksDownloads() {
    var wrap = el.booksDownloadsList;
    var empty = el.booksDownloadsEmpty;
    if (!wrap || !empty) return;

    var active = [];
    var rest = [];
    for (var i = 0; i < _booksDls.length; i++) {
      var d = _booksDls[i];
      if (!d) continue;
      if (d.library !== 'books') continue;
      if (d.state === 'progressing') active.push(d);
      else rest.push(d);
    }
    var list = active.concat(rest).slice(0, 5);

    if (!list.length) {
      wrap.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    var html = '';
    for (var j = 0; j < list.length; j++) {
      var d = list[j];
      var isActive = d.state === 'progressing';
      var isBad = d.state === 'interrupted' || d.state === 'cancelled';
      var p = null;
      if (isActive) {
        if (typeof d.progress === 'number') p = Math.max(0, Math.min(1, d.progress));
        else if (d.totalBytes > 0 && d.receivedBytes != null) p = Math.max(0, Math.min(1, d.receivedBytes / d.totalBytes));
      }
      var pctTxt = (p != null) ? Math.round(p * 100) + '%' : '';
      var sub = isActive ? (pctTxt || 'Downloading...') : (isBad ? 'Failed' : 'Saved');
      html += '<div class="sidebarDlItem' + (isActive ? ' sidebarDlItem--active' : '') + (isBad ? ' sidebarDlItem--bad' : '') + '" data-dl-id="' + _bkEsc(d.id || '') + '" data-dl-dest="' + _bkEsc(d.destination || '') + '">'
        + '<div class="sidebarDlName">' + _bkEsc(d.filename) + '</div>'
        + '<div class="sidebarDlSub">' + _bkEsc(sub) + '</div>'
        + (isActive ? '<div class="sidebarDlBar"><div class="sidebarDlFill" style="width:' + (pctTxt || '0%') + '"></div></div>' : '')
        + '</div>';
    }
    wrap.innerHTML = html;

    var items = wrap.querySelectorAll('.sidebarDlItem');
    for (var k = 0; k < items.length; k++) {
      items[k].addEventListener('click', function () {
        var dest = this.getAttribute('data-dl-dest');
        if (!dest || !api) return;
        if (api.books && api.books.bookFromPath) {
          api.books.bookFromPath(dest).then(function (res) {
            if (res && res.ok && res.book && res.book.path) {
              try { openBook(res.book); } catch (err) {}
            } else if (api.shell && api.shell.revealPath) {
              try { api.shell.revealPath(dest); } catch (err) {}
            }
          }).catch(function () {
            if (api.shell && api.shell.revealPath) {
              try { api.shell.revealPath(dest); } catch (err) {}
            }
          });
        } else if (api.shell && api.shell.revealPath) {
          try { api.shell.revealPath(dest); } catch (err) {}
        }
      });

      items[k].oncontextmenu = function (e) {
        try { e.preventDefault(); } catch (err) {}
        var id = this.getAttribute('data-dl-id');
        var d = null;
        for (var m = 0; m < _booksDls.length; m++) { if (_booksDls[m] && _booksDls[m].id === id) { d = _booksDls[m]; break; } }
        if (!d) return;

        var isActive = (d.state === 'progressing' || d.state === 'paused');
        var isPaused = d.state === 'paused';
        var isOk = d.state === 'completed';

        var menu = [];
        if (isOk && d.destination) {
          menu.push({ label: 'Open', onClick: function () {
            if (api.books && api.books.bookFromPath) {
              api.books.bookFromPath(d.destination).then(function (res) {
                if (res && res.ok && res.book) { try { openBook(res.book); } catch (err2) {} }
                else if (api.shell && api.shell.revealPath) { try { api.shell.revealPath(d.destination); } catch (err3) {} }
              }).catch(function () { if (api.shell && api.shell.revealPath) { try { api.shell.revealPath(d.destination); } catch (err4) {} } });
            } else if (api.shell && api.shell.openPath) { try { api.shell.openPath(d.destination); } catch (err5) {} }
          }});
          menu.push({ label: 'Show in folder', onClick: function () { if (api.shell && api.shell.revealPath) { try { api.shell.revealPath(d.destination); } catch (err6) {} } } });
        }
        if (isActive && api.webSources) {
          if (isPaused && api.webSources.resumeDownload) menu.push({ label: 'Resume', onClick: function () { api.webSources.resumeDownload({ id: d.id }).catch(function () {}); } });
          if (!isPaused && api.webSources.pauseDownload) menu.push({ label: 'Pause', onClick: function () { api.webSources.pauseDownload({ id: d.id }).catch(function () {}); } });
          if (api.webSources.cancelDownload) menu.push({ label: 'Cancel', onClick: function () { api.webSources.cancelDownload({ id: d.id }).catch(function () {}); } });
        }
        if (!isActive && api.webSources && api.webSources.removeDownloadHistory) {
          menu.push({ label: 'Remove', onClick: function () { api.webSources.removeDownloadHistory({ id: d.id }).then(function () { _booksDls = _booksDls.filter(function (x) { return x && x.id !== d.id; }); renderBooksDownloads(); }).catch(function () {}); } });
        }
        if (!menu.length) return;
        showCtx({ x: e.clientX, y: e.clientY, items: menu });
      };
    }
  }

  function scheduleBkDlRender() {
    if (_booksDlTimer) return;
    _booksDlTimer = setTimeout(function () {
      _booksDlTimer = null;
      renderBooksDownloads();
    }, 150);
  }

  function booksDlUpsert(info) {
    if (!info) return;
    var id = info.id != null ? String(info.id) : '';
    var found = null;
    for (var i = 0; i < _booksDls.length; i++) {
      if (_booksDls[i] && id && _booksDls[i].id === id) { found = _booksDls[i]; break; }
    }
    if (!found) {
      found = {};
      _booksDls.unshift(found);
    }
    if (info.id != null) found.id = String(info.id);
    if (info.filename != null) found.filename = String(info.filename);
    if (info.destination != null) found.destination = String(info.destination);
    if (info.library != null) found.library = String(info.library);
    if (info.state != null) found.state = String(info.state);
    if (info.progress != null) found.progress = Number(info.progress);
    if (info.receivedBytes != null) found.receivedBytes = Number(info.receivedBytes);
    if (info.totalBytes != null) found.totalBytes = Number(info.totalBytes);
    if (info.error != null) found.error = String(info.error);
    if (_booksDls.length > 50) _booksDls.length = 50;
    scheduleBkDlRender();
  }

  function loadBooksDownloads() {
    if (!api || !api.webSources || !api.webSources.getDownloadHistory) return;
    api.webSources.getDownloadHistory().then(function (res) {
      if (!res || !res.ok || !Array.isArray(res.downloads)) return;
      _booksDls = res.downloads;
      renderBooksDownloads();
    }).catch(function () {});
  }

  try { loadBooksDownloads(); } catch (e) {}

  try {
    if (api && api.webSources) {
      if (typeof api.webSources.onDownloadStarted === 'function') {
        api.webSources.onDownloadStarted(function (info) { booksDlUpsert(info); });
      }
      if (typeof api.webSources.onDownloadProgress === 'function') {
        api.webSources.onDownloadProgress(function (info) { booksDlUpsert(info); });
      }
      if (typeof api.webSources.onDownloadCompleted === 'function') {
        api.webSources.onDownloadCompleted(function (info) { booksDlUpsert(info); });
      }
      if (typeof api.webSources.onDownloadsUpdated === 'function') {
        api.webSources.onDownloadsUpdated(function (data) {
          if (data && Array.isArray(data.downloads)) {
            _booksDls = data.downloads;
            renderBooksDownloads();
          }
        });
      }
    }
  } catch (e) {}

  if (el.booksDownloadsHeader && el.booksDownloadsItems) {
    el.booksDownloadsHeader.addEventListener('click', function () {
      var hidden = el.booksDownloadsItems.classList.toggle('hidden');
      el.booksDownloadsHeader.textContent = (hidden ? '\u25B8 ' : '\u25BE ') + 'Downloads';
    });
    el.booksDownloadsHeader.oncontextmenu = function (e) {
      try { e.preventDefault(); } catch (err) {}
      var items = [];
      items.push({ label: 'Remove all', onClick: function () {
        if (api.webSources && api.webSources.clearDownloadHistory) {
          api.webSources.clearDownloadHistory().then(function () {
            _booksDls = _booksDls.filter(function (x) { return x && (x.state === 'progressing' || x.state === 'paused'); });
            renderBooksDownloads();
          }).catch(function () {});
        }
      }});
      showCtx({ x: e.clientX, y: e.clientY, items: items });
    };
  }

  init().catch((err) => {
    try { console.error('[books] init failed', err); } catch {}
  });
})();
