// Tankoban Max - Books web sources & downloads sidebar
// Extracted from library.js (Phase 3, Session 9)
(function booksWebSourcesDomain() {
  'use strict';

  if (window.__tankoBooksWebSourcesBound) return;
  window.__tankoBooksWebSourcesBound = true;

  var B = window.__tankoBooksLibShared;
  if (!B) return;

  var api = B.api;
  var el = B.el;
  var toast = B.toast;
  var showCtx = B.showCtx;

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
      if (d.state === 'progressing' || d.state === 'downloading') active.push(d);
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
      var isActive = (d.state === 'progressing' || d.state === 'downloading');
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
        var openBook = window.openBook;
        if (api.books && api.books.bookFromPath) {
          api.books.bookFromPath(dest).then(function (res) {
            if (res && res.ok && res.book && res.book.path) {
              try { if (typeof openBook === 'function') openBook(res.book); } catch (err) {}
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
        var openBook = window.openBook;

        var menu = [];
        if (isOk && d.destination) {
          menu.push({ label: 'Open', onClick: function () {
            if (api.books && api.books.bookFromPath) {
              api.books.bookFromPath(d.destination).then(function (res) {
                if (res && res.ok && res.book) { try { if (typeof openBook === 'function') openBook(res.book); } catch (err2) {} }
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
            _booksDls = _booksDls.filter(function (x) { return x && (x.state === 'progressing' || x.state === 'downloading' || x.state === 'paused'); });
            renderBooksDownloads();
          }).catch(function () {});
        }
      }});
      showCtx({ x: e.clientX, y: e.clientY, items: items });
    };
  }

})();
