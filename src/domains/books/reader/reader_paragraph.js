++ b/src/domains/books/reader/reader_paragraph.js
(function () {
  'use strict';

  var RS = window.booksReaderState;
  var bus = window.booksReaderBus;
  if (!RS || !bus) return;

  var PREF_KEY = 'tanko.books.reader.paragraph_mode';
  var DOC_STYLE_ID = 'tanko-br-paragraph-style';
  var UI_STYLE_ID = 'tanko-br-paragraph-ui-style';
  var PARA_BTN_ID = 'booksReaderParagraphModeBtn';
  var PARA_CTRL_ID = 'booksReaderParagraphControls';
  var PARA_STATUS_ID = 'booksReaderParagraphStatus';

  var enabled = false;
  var currentIndex = -1;
  var currentList = [];
  var observer = null;
  var syncTimer = 0;
  var syncSeq = 0;
  var pendingEdge = '';
  var bound = false;
  var lastFallbackKey = '';
  var lastSyncAt = 0;

  function isReaderOpen() {
    try { return !!(RS.state && RS.state.open); } catch (e) { return false; }
  }

  function getEngine() {
    try { return RS.state ? RS.state.engine : null; } catch (e) { return null; }
  }

  function isSupportedEngine() {
    var engine = getEngine();
    return !!(engine && typeof engine.getFoliateRenderer === 'function' && typeof engine.getFoliateView === 'function');
  }

  function isModeActive() {
    return !!(enabled && isReaderOpen() && isSupportedEngine());
  }

  function loadPref() {
    try { enabled = localStorage.getItem(PREF_KEY) === '1'; } catch (e) { enabled = false; }
  }

  function savePref() {
    try { localStorage.setItem(PREF_KEY, enabled ? '1' : '0'); } catch (e) {}
  }

  function injectUiStyles() {
    if (document.getElementById(UI_STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = UI_STYLE_ID;
    st.textContent = '' +
      '#booksReaderView .br-para-toolbar-btn.is-active{background:rgba(255,255,255,0.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.22);}\n' +
      '#booksReaderView .br-para-toolbar-btn[disabled]{opacity:.45;cursor:not-allowed;}\n' +
      '#booksReaderView .br-para-controls{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:999px;background:rgba(14,14,18,0.88);border:1px solid rgba(255,255,255,0.12);backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(0,0,0,0.35);}\n' +
      '#booksReaderView .br-para-controls.hidden{display:none !important;}\n' +
      '#booksReaderView .br-para-controls .br-para-btn{min-width:34px;height:34px;padding:0 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:inherit;cursor:pointer;font-size:16px;line-height:1;}\n' +
      '#booksReaderView .br-para-controls .br-para-btn:hover{background:rgba(255,255,255,0.12);}\n' +
      '#booksReaderView .br-para-controls .br-para-btn:disabled{opacity:.4;cursor:not-allowed;}\n' +
      '#booksReaderView .br-para-controls .br-para-status{min-width:160px;text-align:center;font-size:12px;line-height:1.2;opacity:.96;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\n';
    document.head.appendChild(st);
  }

  function getEls() {
    return RS.ensureEls ? RS.ensureEls() : (RS.state && RS.state.els ? RS.state.els : null);
  }

  function ensureUi() {
    injectUiStyles();
    var els = getEls();
    if (!els || !els.readerView) return;

    var toolbarRight = els.readerView.querySelector('.br-toolbar-right');
    if (toolbarRight && !document.getElementById(PARA_BTN_ID)) {
      var btn = document.createElement('button');
      btn.id = PARA_BTN_ID;
      btn.className = 'br-btn br-para-toolbar-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Paragraph mode');
      btn.setAttribute('aria-pressed', 'false');
      btn.title = 'Paragraph mode';
      btn.innerHTML = '<span aria-hidden="true" style="font-weight:700;font-size:14px;line-height:1;">\u00b6</span>';
      btn.addEventListener('click', function () {
        toggle();
      });
      var anchor = document.getElementById('booksReaderSearchBtn') || document.getElementById('booksReaderListenBtn');
      if (anchor && anchor.parentNode === toolbarRight) {
        toolbarRight.insertBefore(btn, anchor);
      } else {
        toolbarRight.appendChild(btn);
      }
    }

    if (els.readerView && !document.getElementById(PARA_CTRL_ID)) {
      var host = els.readerView.querySelector('.br-reading-area') || els.readerView;
      if (host && getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
      }
      var wrap = document.createElement('div');
      wrap.id = PARA_CTRL_ID;
      wrap.className = 'br-para-controls hidden';
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', 'Paragraph navigation');
      wrap.innerHTML = '' +
        '<button type="button" class="br-para-btn" data-act="prev" aria-label="Previous paragraph" title="Previous paragraph">\u2039</button>' +
        '<div id="' + PARA_STATUS_ID + '" class="br-para-status">Paragraph mode</div>' +
        '<button type="button" class="br-para-btn" data-act="next" aria-label="Next paragraph" title="Next paragraph">\u203a</button>';
      wrap.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        var act = t.getAttribute('data-act');
        if (act === 'prev') {
          ev.preventDefault();
          step(-1);
        } else if (act === 'next') {
          ev.preventDefault();
          step(1);
        }
      });
      host.appendChild(wrap);
    }

    refreshUiState();
  }

  function refreshUiState() {
    var btn = document.getElementById(PARA_BTN_ID);
    var ctrls = document.getElementById(PARA_CTRL_ID);
    var status = document.getElementById(PARA_STATUS_ID);
    var active = isModeActive();
    var supported = isSupportedEngine();

    if (btn) {
      btn.disabled = !!(isReaderOpen() && !supported);
      btn.classList.toggle('is-active', !!enabled);
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      if (!isReaderOpen()) btn.title = 'Paragraph mode';
      else if (!supported) btn.title = 'Paragraph mode (EPUB foliate view only)';
      else btn.title = enabled ? 'Paragraph mode (on)' : 'Paragraph mode';
    }
    if (ctrls) ctrls.classList.toggle('hidden', !active);
    if (status && !active) {
      if (!isReaderOpen()) status.textContent = 'Paragraph mode';
      else if (!supported) status.textContent = 'Unavailable here';
      else status.textContent = enabled ? 'Scanning paragraphs…' : 'Paragraph mode';
    }
    updateNavButtons();
  }

  function updateStatus(text) {
    var el = document.getElementById(PARA_STATUS_ID);
    if (el) el.textContent = text || 'Paragraph mode';
  }

  function updateNavButtons() {
    var ctrls = document.getElementById(PARA_CTRL_ID);
    if (!ctrls) return;
    var prev = ctrls.querySelector('[data-act="prev"]');
    var next = ctrls.querySelector('[data-act="next"]');
    var has = currentList && currentList.length > 0;
    if (prev) prev.disabled = !isModeActive() || !has;
    if (next) next.disabled = !isModeActive() || !has;
  }

  function ensureDocStyle(doc) {
    if (!doc || !doc.head) return;
    if (doc.getElementById(DOC_STYLE_ID)) return;
    var st = doc.createElement('style');
    st.id = DOC_STYLE_ID;
    st.textContent = '' +
      'html.tanko-br-para-mode body{position:relative !important;}\n' +
      'html.tanko-br-para-mode body::before{content:"";position:fixed;inset:0;background:rgba(0,0,0,0.34);pointer-events:none;z-index:2147483000;}\n' +
      '.tanko-br-para-cand{transition:background-color .12s ease, box-shadow .12s ease, opacity .12s ease;}\n' +
      'html.tanko-br-para-mode .tanko-br-para-cand{opacity:.86;}\n' +
      'html.tanko-br-para-mode .tanko-br-para-active{position:relative !important;z-index:2147483001 !important;opacity:1 !important;background:rgba(255,230,120,0.18);box-shadow:0 0 0 2px rgba(255,230,120,0.22);border-radius:.4em;}\n';
    doc.head.appendChild(st);
  }

  function getContents() {
    try {
      var engine = getEngine();
      if (!engine || typeof engine.getFoliateRenderer !== 'function') return [];
      var renderer = engine.getFoliateRenderer();
      if (!renderer || typeof renderer.getContents !== 'function') return [];
      var list = renderer.getContents();
      return Array.isArray(list) ? list.slice() : [];
    } catch (e) {
      return [];
    }
  }

  function clearClassesFromDoc(doc) {
    if (!doc || !doc.documentElement) return;
    try { doc.documentElement.classList.remove('tanko-br-para-mode'); } catch (e) {}
    try {
      var activeEls = doc.querySelectorAll('.tanko-br-para-active');
      var i;
      for (i = 0; i < activeEls.length; i++) activeEls[i].classList.remove('tanko-br-para-active');
      var candEls = doc.querySelectorAll('.tanko-br-para-cand');
      for (i = 0; i < candEls.length; i++) candEls[i].classList.remove('tanko-br-para-cand');
    } catch (e) {}
  }

  function clearAllHighlights() {
    var i;
    if (currentList && currentList.length) {
      for (i = 0; i < currentList.length; i++) {
        try {
          if (currentList[i] && currentList[i].el) {
            currentList[i].el.classList.remove('tanko-br-para-active');
            currentList[i].el.classList.remove('tanko-br-para-cand');
          }
        } catch (e) {}
      }
    }
    var contents = getContents();
    for (i = 0; i < contents.length; i++) {
      try { clearClassesFromDoc(contents[i] && contents[i].doc); } catch (e) {}
    }
    currentList = [];
    currentIndex = -1;
    lastFallbackKey = '';
    updateNavButtons();
  }

  function textScore(el) {
    var t = '';
    try { t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(); } catch (e) { t = ''; }
    if (!t) return 0;
    return t.length;
  }

  function isVisibleRect(rect) {
    return !!(rect && rect.width > 2 && rect.height > 2);
  }

  function collectParagraphCandidates() {
    var contents = getContents();
    var out = [];
    var i;
    var j;
    var seq = 0;
    var selectors = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6';
    var viewH = window.innerHeight || document.documentElement.clientHeight || 800;
    var targetY = Math.max(40, Math.round(viewH * 0.33));

    contents.sort(function (a, b) {
      var ai = a && typeof a.index === 'number' ? a.index : 0;
      var bi = b && typeof b.index === 'number' ? b.index : 0;
      return ai - bi;
    });

    for (i = 0; i < contents.length; i++) {
      var c = contents[i];
      var doc = c && c.doc;
      if (!doc || !doc.querySelectorAll) continue;
      ensureDocStyle(doc);
      var frame = null;
      var frameRect = null;
      try {
        frame = doc.defaultView && doc.defaultView.frameElement ? doc.defaultView.frameElement : null;
        frameRect = frame && frame.getBoundingClientRect ? frame.getBoundingClientRect() : { top: 0, left: 0 };
      } catch (e) {
        frameRect = { top: 0, left: 0 };
      }
      var nodes;
      try { nodes = doc.querySelectorAll(selectors); } catch (e) { nodes = []; }
      for (j = 0; j < nodes.length; j++) {
        var el = nodes[j];
        if (!el || !el.getBoundingClientRect) continue;
        if (el.closest && el.closest('script, style, nav, header, footer, [hidden], [aria-hidden="true"]')) continue;
        if (el.tagName === 'LI') {
          try {
            if (el.querySelector('p')) {}
          } catch (e) {}
        }
        var score = textScore(el);
        if (score < 12) continue;
        var rect;
        try { rect = el.getBoundingClientRect(); } catch (e) { rect = null; }
        if (!isVisibleRect(rect)) continue;

        var globalTop = (frameRect && typeof frameRect.top === 'number' ? frameRect.top : 0) + rect.top;
        var globalBottom = globalTop + rect.height;
        var inView = globalBottom > 0 && globalTop < viewH;
        var dist;
        if (inView) {
          if (globalTop <= targetY && globalBottom >= targetY) dist = 0;
          else dist = Math.min(Math.abs(globalTop - targetY), Math.abs(globalBottom - targetY));
        } else {
          dist = Math.abs(globalTop - targetY) + 800;
        }

        seq += 1;
        out.push({
          el: el,
          doc: doc,
          contentIndex: (c && typeof c.index === 'number') ? c.index : 0,
          seq: seq,
          globalTop: globalTop,
          globalBottom: globalBottom,
          inView: inView,
          dist: dist,
          textLen: score
        });
      }
    }

    out.sort(function (a, b) {
      if (a.contentIndex !== b.contentIndex) return a.contentIndex - b.contentIndex;
      if (a.globalTop !== b.globalTop) return a.globalTop - b.globalTop;
      return a.seq - b.seq;
    });

    return out;
  }

  function chooseCurrentIndex(list) {
    if (!list || !list.length) return -1;
    var i;
    var bestInView = -1;
    var bestDist = Infinity;

    for (i = 0; i < list.length; i++) {
      if (list[i].inView && list[i].dist < bestDist) {
        bestDist = list[i].dist;
        bestInView = i;
      }
    }
    if (bestInView >= 0) return bestInView;

    if (lastFallbackKey) {
      for (i = 0; i < list.length; i++) {
        if (makeRecordKey(list[i]) === lastFallbackKey) return i;
      }
    }

    if (pendingEdge === 'start') return 0;
    if (pendingEdge === 'end') return list.length - 1;

    return 0;
  }

  function makeRecordKey(rec) {
    if (!rec || !rec.el) return '';
    var text = '';
    try { text = (rec.el.innerText || rec.el.textContent || '').replace(/\s+/g, ' ').trim(); } catch (e) { text = ''; }
    if (text.length > 80) text = text.slice(0, 80);
    return String(rec.contentIndex) + '|' + text;
  }

  function applyListClasses(list, activeIdx) {
    var i;
    var seenDocs = [];
    var seenDocSet = [];
    for (i = 0; i < list.length; i++) {
      var rec = list[i];
      if (!rec || !rec.el || !rec.doc) continue;
      try {
        rec.doc.documentElement.classList.add('tanko-br-para-mode');
        rec.el.classList.add('tanko-br-para-cand');
        if (i === activeIdx) rec.el.classList.add('tanko-br-para-active');
        else rec.el.classList.remove('tanko-br-para-active');
      } catch (e) {}
      if (seenDocSet.indexOf(rec.doc) === -1) {
        seenDocSet.push(rec.doc);
        seenDocs.push(rec.doc);
      }
    }
    var contents = getContents();
    for (i = 0; i < contents.length; i++) {
      var d = contents[i] && contents[i].doc;
      if (!d) continue;
      if (seenDocSet.indexOf(d) === -1) clearClassesFromDoc(d);
    }
  }

  function syncParagraphState() {
    syncTimer = 0;
    syncSeq += 1;
    if (!isModeActive()) {
      clearAllHighlights();
      refreshUiState();
      return;
    }

    var now = Date.now();
    lastSyncAt = now;
    var list = collectParagraphCandidates();
    currentList = list;
    if (!list.length) {
      currentIndex = -1;
      updateStatus('No paragraphs on this page');
      updateNavButtons();
      clearAllHighlights();
      refreshUiState();
      return;
    }

    var idx = chooseCurrentIndex(list);
    if (idx < 0) idx = 0;
    if (idx >= list.length) idx = list.length - 1;
    currentIndex = idx;
    pendingEdge = '';
    lastFallbackKey = makeRecordKey(list[idx]);

    applyListClasses(list, idx);
    updateStatus('Paragraph ' + String(idx + 1) + ' / ' + String(list.length));
    updateNavButtons();
    refreshUiState();
  }

  function scheduleSync(delay) {
    if (typeof delay !== 'number') delay = 40;
    if (syncTimer) {
      try { clearTimeout(syncTimer); } catch (e) {}
      syncTimer = 0;
    }
    syncTimer = setTimeout(function () {
      syncParagraphState();
    }, delay);
  }

  function scheduleFollowupSync(delay) {
    setTimeout(function () {
      if (!enabled) return;
      scheduleSync(0);
    }, typeof delay === 'number' ? delay : 120);
  }

  function scrollRecordIntoView(rec) {
    if (!rec || !rec.el) return;
    try {
      rec.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      return;
    } catch (e) {}
    try { rec.el.scrollIntoView(true); } catch (e2) {}
  }

  function goToRecord(rec) {
    var engine = getEngine();
    if (!rec || !rec.el || !engine) return false;

    try {
      var view = typeof engine.getFoliateView === 'function' ? engine.getFoliateView() : null;
      if (view && typeof view.getCFI === 'function' && typeof engine.goTo === 'function') {
        var doc = rec.el.ownerDocument;
        var range = doc.createRange();
        range.selectNodeContents(rec.el);
        var cfi = view.getCFI(rec.contentIndex, range);
        if (cfi) {
          var p = engine.goTo(cfi);
          if (p && typeof p.catch === 'function') p.catch(function () {});
          return true;
        }
      }
    } catch (e) {}

    scrollRecordIntoView(rec);
    return true;
  }

  function step(dir) {
    if (!isModeActive()) return;
    if (!currentList || !currentList.length) {
      scheduleSync(0);
      return;
    }

    var nextIdx = currentIndex + (dir < 0 ? -1 : 1);
    if (nextIdx >= 0 && nextIdx < currentList.length) {
      var rec = currentList[nextIdx];
      currentIndex = nextIdx;
      lastFallbackKey = makeRecordKey(rec);
      applyListClasses(currentList, currentIndex);
      updateStatus('Paragraph ' + String(currentIndex + 1) + ' / ' + String(currentList.length));
      updateNavButtons();
      goToRecord(rec);
      scheduleSync(120);
      scheduleFollowupSync(260);
      return;
    }

    pendingEdge = dir > 0 ? 'start' : 'end';
    try { bus.emit(dir > 0 ? 'nav:next' : 'nav:prev'); } catch (e) {}
    scheduleSync(180);
    scheduleFollowupSync(420);
  }

  function setEnabled(nextEnabled) {
    enabled = !!nextEnabled;
    savePref();
    refreshUiState();
    if (!enabled) {
      clearAllHighlights();
      return;
    }
    if (isReaderOpen() && !isSupportedEngine()) {
      try { RS.setStatus('Paragraph mode is available in EPUB foliate view', true); } catch (e) {}
      return;
    }
    ensureUi();
    scheduleSync(10);
    scheduleFollowupSync(180);
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function onRelocated() {
    if (!isModeActive()) return;
    scheduleSync(20);
  }

  function onFlowChanged() {
    if (!enabled) return;
    scheduleSync(80);
    scheduleFollowupSync(260);
  }

  function onGlobalKeydown(ev) {
    if (!ev || ev.defaultPrevented) return;
    if (!isModeActive()) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    var t = ev.target;
    if (t && ((t.tagName === 'INPUT') || (t.tagName === 'TEXTAREA') || (t.tagName === 'SELECT') || t.isContentEditable)) return;

    var key = ev.key || '';
    if (key === 'ArrowRight' || key === 'PageDown' || key === ']') {
      ev.preventDefault();
      ev.stopPropagation();
      step(1);
    } else if (key === 'ArrowLeft' || key === 'PageUp' || key === '[') {
      ev.preventDefault();
      ev.stopPropagation();
      step(-1);
    }
  }

  function attachObserver() {
    detachObserver();
    var els = getEls();
    if (!els || !els.host || typeof MutationObserver === 'undefined') return;
    try {
      observer = new MutationObserver(function () {
        if (!enabled) return;
        scheduleSync(40);
      });
      observer.observe(els.host, { childList: true, subtree: true });
    } catch (e) {
      observer = null;
    }
  }

  function detachObserver() {
    if (!observer) return;
    try { observer.disconnect(); } catch (e) {}
    observer = null;
  }

  var api = {
    bind: function () {
      if (bound) return;
      bound = true;
      loadPref();
      injectUiStyles();
      bus.on('reader:relocated', onRelocated);
      bus.on('appearance:flow-mode-changed', onFlowChanged);
      document.addEventListener('keydown', onGlobalKeydown, true);
    },

    onOpen: function () {
      ensureUi();
      attachObserver();
      refreshUiState();
      if (enabled) {
        scheduleSync(40);
        scheduleFollowupSync(220);
      }
    },

    onClose: function () {
      detachObserver();
      if (syncTimer) {
        try { clearTimeout(syncTimer); } catch (e) {}
        syncTimer = 0;
      }
      clearAllHighlights();
      refreshUiState();
    },

    toggle: toggle,
    isEnabled: function () { return !!enabled; },
    stepPrev: function () { step(-1); },
    stepNext: function () { step(1); }
  };

  window.booksReaderParagraph = api;
})();
