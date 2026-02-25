(function registerPanelsModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.panels = function initPanelsModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;

    function dep(name) { return (bridge.deps || {})[name]; }
    var escapeHtml = function () { var fn = dep('escapeHtml'); return fn ? fn.apply(null, arguments) : ''; };
    var getActiveTab = function () { var fn = dep('getActiveTab'); return fn ? fn.apply(null, arguments) : null; };
    var getActiveWebview = function () { var fn = dep('getActiveWebview'); return fn ? fn.apply(null, arguments) : null; };
    var createTab = function () { var fn = dep('createTab'); return fn && fn.apply(null, arguments); };
    var openNewTab = function () { var fn = dep('openNewTab'); return fn && fn.apply(null, arguments); };
    var showToast = function () { var fn = dep('showToast'); return fn && fn.apply(null, arguments); };
    var showDownloadsPanel = function () { var fn = dep('showDownloadsPanel'); return fn && fn.apply(null, arguments); };
    var openTorrentTab = function () { var fn = dep('openTorrentTab'); return fn && fn.apply(null, arguments); };
    var showContextMenu = function () { var fn = dep('showContextMenu'); return fn && fn.apply(null, arguments); };
    var hideContextMenu = function () { var fn = dep('hideContextMenu'); return fn && fn.apply(null, arguments); };
    var navigateUrl = function () { var fn = dep('navigateUrl'); return fn && fn.apply(null, arguments); };

    var bookmarkBarOverflowMenu = null;

    // ── Panel show/hide ──

    function hideAllPanels() {
      state.menuOpen = false;
      state.downloadsOpen = false;
      state.historyOpen = false;
      state.bookmarksOpen = false;
      if (el.menuPanel) el.menuPanel.style.display = 'none';
      if (el.downloadsPanel) el.downloadsPanel.style.display = 'none';
      if (el.historyPanel) el.historyPanel.style.display = 'none';
      if (el.bookmarksPanel) el.bookmarksPanel.style.display = 'none';
      if (el.menuOverlay) el.menuOverlay.style.display = 'none';
    }

    function showMenuPanel() {
      hideAllPanels();
      state.menuOpen = true;
      if (el.menuPanel) el.menuPanel.style.display = '';
      if (el.menuOverlay) el.menuOverlay.style.display = '';
    }

    function showHistoryPanel() {
      hideAllPanels();
      state.historyOpen = true;
      if (el.historyPanel) el.historyPanel.style.display = '';
      if (el.menuOverlay) el.menuOverlay.style.display = '';
      loadHistoryPanel();
    }

    function showBookmarksPanel() {
      hideAllPanels();
      state.bookmarksOpen = true;
      if (el.bookmarksPanel) el.bookmarksPanel.style.display = '';
      if (el.menuOverlay) el.menuOverlay.style.display = '';
      loadBookmarksPanel();
    }

    // ── History panel ──

    function loadHistoryPanel() {
      api.webHistory.list().then(function (res) {
        if (!el.historyList) return;
        if (!res || !res.ok || !Array.isArray(res.entries)) return;
        var entries = res.entries;
        var query = el.historySearch ? el.historySearch.value.toLowerCase().trim() : '';
        if (query) {
          entries = entries.filter(function (h) {
            return (h.title && h.title.toLowerCase().indexOf(query) !== -1) ||
                   (h.url && h.url.toLowerCase().indexOf(query) !== -1);
          });
        }

        el.historyList.innerHTML = '';
        if (!entries || entries.length === 0) {
          el.historyList.innerHTML = '<div class="history-empty">' +
            (query ? 'No matches' : 'No history yet') + '</div>';
          return;
        }

        // Group by date
        var groups = {};
        for (var i = 0; i < entries.length; i++) {
          var h = entries[i];
          var d = new Date(h.visitedAt);
          var key = d.toLocaleDateString(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          });
          if (!groups[key]) groups[key] = [];
          groups[key].push(h);
        }

        var count = 0;
        var keys = Object.keys(groups);
        for (var k = 0; k < keys.length; k++) {
          if (count >= 200) break;
          var dateLabel = keys[k];
          var header = document.createElement('div');
          header.className = 'history-date-group';
          header.textContent = dateLabel;
          el.historyList.appendChild(header);

          var items = groups[dateLabel];
          for (var j = 0; j < items.length; j++) {
            if (count >= 200) break;
            var hi = items[j];
            var row = document.createElement('div');
            row.className = 'history-item';
            row.dataset.url = hi.url;
            row.dataset.id = hi.id;

            var time = new Date(hi.visitedAt);
            var timeStr = time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            var faviconHtml = hi.favicon
              ? '<img class="history-item-favicon" src="' + escapeHtml(hi.favicon) + '">'
              : '<svg class="history-item-favicon" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="#5f6368" stroke-width="1" fill="none"/></svg>';

            row.innerHTML = faviconHtml +
              '<div class="history-item-info">' +
                '<div class="history-item-title">' + escapeHtml(hi.title || hi.url) + '</div>' +
                '<div class="history-item-url">' + escapeHtml(hi.url) + '</div>' +
              '</div>' +
              '<span class="history-item-time">' + timeStr + '</span>' +
              '<button class="history-item-delete" title="Remove"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>';

            el.historyList.appendChild(row);
            count++;
          }
        }
      });
    }

    // ── Bookmarks panel ──

    function loadBookmarksPanel() {
      api.webBookmarks.list().then(function (res) {
        if (!el.bookmarksList) return;
        if (!res || !res.ok || !Array.isArray(res.bookmarks)) return;
        var entries = res.bookmarks;
        var query = el.bookmarksSearch ? el.bookmarksSearch.value.toLowerCase().trim() : '';
        if (query) {
          entries = entries.filter(function (b) {
            return (b.title && b.title.toLowerCase().indexOf(query) !== -1) ||
                   (b.url && b.url.toLowerCase().indexOf(query) !== -1);
          });
        }

        el.bookmarksList.innerHTML = '';
        if (!entries || entries.length === 0) {
          el.bookmarksList.innerHTML = '<div class="bookmarks-empty">' +
            (query ? 'No matches' : 'No bookmarks yet') + '</div>';
          return;
        }

        for (var i = 0; i < entries.length; i++) {
          var b = entries[i];
          var row = document.createElement('div');
          row.className = 'bookmark-item';
          row.dataset.url = b.url;
          row.dataset.id = b.id;

          var faviconHtml = b.favicon
            ? '<img class="bookmark-item-favicon" src="' + escapeHtml(b.favicon) + '">'
            : '<svg class="bookmark-item-favicon" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="#5f6368" stroke-width="1" fill="none"/></svg>';

          row.innerHTML = faviconHtml +
            '<div class="bookmark-item-info">' +
              '<div class="bookmark-item-title">' + escapeHtml(b.title || b.url) + '</div>' +
              '<div class="bookmark-item-url">' + escapeHtml(b.url) + '</div>' +
            '</div>' +
            '<button class="bookmark-item-delete" title="Remove bookmark"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>';

          el.bookmarksList.appendChild(row);
        }
      });
    }

    // ── Bookmark star ──

    function toggleBookmark() {
      var wv = getActiveWebview();
      if (!wv) return;
      var url;
      try { url = wv.getURL(); } catch (e) { return; }
      if (!url || url === 'about:blank') return;

      api.webBookmarks.list().then(function (res) {
        if (!res || !res.ok || !Array.isArray(res.bookmarks)) return;
        var bookmarks = res.bookmarks;
        var matched = null;
        for (var i = 0; i < bookmarks.length; i++) {
          if (bookmarks[i].url === url) { matched = bookmarks[i]; break; }
        }

        if (matched) {
          api.webBookmarks.remove({ id: matched.id });
          setBookmarkIcon(false);
        } else {
          var tab = getActiveTab();
          api.webBookmarks.add({
            url: url,
            title: tab ? tab.title : url,
            favicon: tab ? tab.favicon : '',
            timestamp: Date.now()
          });
          setBookmarkIcon(true);
        }

        if (state.bookmarksOpen) loadBookmarksPanel();
        renderBookmarkBar();
      });
    }

    function setBookmarkIcon(filled) {
      if (el.iconBookmarkOutline) el.iconBookmarkOutline.style.display = filled ? 'none' : '';
      if (el.iconBookmarkFilled) el.iconBookmarkFilled.style.display = filled ? '' : 'none';
    }

    function updateBookmarkIcon() {
      var wv = getActiveWebview();
      if (!wv) { setBookmarkIcon(false); return; }
      var url;
      try { url = wv.getURL(); } catch (e) { setBookmarkIcon(false); return; }
      if (!url || url === 'about:blank') { setBookmarkIcon(false); return; }

      api.webBookmarks.list().then(function (res) {
        if (!res || !res.ok || !Array.isArray(res.bookmarks)) return;
        var bookmarks = res.bookmarks;
        var found = false;
        for (var i = 0; i < bookmarks.length; i++) {
          if (bookmarks[i].url === url) { found = true; break; }
        }
        setBookmarkIcon(found);
      });
    }

    // ── Bookmark bar ──

    function renderBookmarkBar() {
      if (!el.bookmarkBarItems) return;

      api.webBookmarks.list().then(function (res) {
        if (!res || !res.ok || !Array.isArray(res.bookmarks)) return;
        var entries = res.bookmarks;
        el.bookmarkBarItems.innerHTML = '';

        if (!entries || entries.length === 0) {
          var hint = document.createElement('span');
          hint.className = 'bookmark-bar-empty';
          hint.textContent = 'Bookmark pages with \u2606 or Ctrl+D';
          el.bookmarkBarItems.appendChild(hint);
          if (el.bookmarkBarOverflow) el.bookmarkBarOverflow.style.display = 'none';
          return;
        }

        for (var i = 0; i < entries.length; i++) {
          (function (b) {
            var item = document.createElement('div');
            item.className = 'bookmark-bar-item';
            item.dataset.url = b.url;
            item.title = (b.title || '') + '\n' + b.url;

            var faviconHtml = b.favicon
              ? '<img src="' + escapeHtml(b.favicon) + '">'
              : '<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="#5f6368" stroke-width="1" fill="none"/></svg>';

            item.innerHTML = faviconHtml + '<span>' + escapeHtml(b.title || b.url) + '</span>';

            item.addEventListener('click', function (e) {
              if (e.button !== 0) return;
              navigateUrl(b.url);
            });

            item.addEventListener('mousedown', function (e) {
              if (e.button === 1) {
                e.preventDefault();
                createTab(null, b.url, { switchTo: false });
              }
            });

            item.addEventListener('contextmenu', function (e) {
              e.preventDefault();
              showBookmarkBarCtxMenu(e.clientX, e.clientY, b);
            });

            el.bookmarkBarItems.appendChild(item);
          })(entries[i]);
        }

        checkBookmarkBarOverflow();
      });
    }

    function checkBookmarkBarOverflow() {
      if (!el.bookmarkBarItems || !el.bookmarkBarOverflow) return;
      var items = el.bookmarkBarItems.querySelectorAll('.bookmark-bar-item');
      if (items.length === 0) { el.bookmarkBarOverflow.style.display = 'none'; return; }

      for (var i = 0; i < items.length; i++) items[i].style.display = '';
      el.bookmarkBarOverflow.style.display = 'none';

      var containerRight = el.bookmarkBarItems.getBoundingClientRect().right;
      var hasOverflow = false;
      for (var j = 0; j < items.length; j++) {
        if (items[j].getBoundingClientRect().right > containerRight) {
          hasOverflow = true;
          break;
        }
      }
      if (hasOverflow) el.bookmarkBarOverflow.style.display = '';
    }

    function showBookmarkBarOverflowMenu() {
      dismissBookmarkBarOverflowMenu();
      if (!el.bookmarkBarItems) return;

      var items = el.bookmarkBarItems.querySelectorAll('.bookmark-bar-item');
      var containerRight = el.bookmarkBarItems.getBoundingClientRect().right;
      var overflowItems = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].getBoundingClientRect().right > containerRight) {
          overflowItems.push(items[i]);
        }
      }
      if (overflowItems.length === 0) return;

      var menu = document.createElement('div');
      menu.className = 'bookmark-bar-overflow-menu';
      document.body.appendChild(menu);
      bookmarkBarOverflowMenu = menu;

      for (var j = 0; j < overflowItems.length; j++) {
        (function (origItem) {
          var url = origItem.dataset.url;
          var row = document.createElement('div');
          row.className = 'bookmark-bar-overflow-item';
          row.innerHTML = origItem.innerHTML;
          row.title = origItem.title;

          row.addEventListener('click', function () {
            navigateUrl(url);
            dismissBookmarkBarOverflowMenu();
          });
          row.addEventListener('mousedown', function (e) {
            if (e.button === 1) {
              e.preventDefault();
              createTab(null, url, { switchTo: false });
              dismissBookmarkBarOverflowMenu();
            }
          });

          menu.appendChild(row);
        })(overflowItems[j]);
      }

      if (el.bookmarkBarOverflow) {
        var btnRect = el.bookmarkBarOverflow.getBoundingClientRect();
        menu.style.top = btnRect.bottom + 2 + 'px';
        menu.style.right = (window.innerWidth - btnRect.right) + 'px';
      }
    }

    function dismissBookmarkBarOverflowMenu() {
      if (bookmarkBarOverflowMenu) {
        bookmarkBarOverflowMenu.remove();
        bookmarkBarOverflowMenu = null;
      }
    }

    function showBookmarkBarCtxMenu(x, y, bookmark) {
      var items = [
        { label: 'Open in new tab', action: 'newTab' },
        { separator: true },
        { label: 'Remove bookmark', action: 'remove' }
      ];
      showContextMenu({
        items: items,
        x: x,
        y: y,
        onAction: function (action) {
          switch (action) {
            case 'newTab':
              createTab(null, bookmark.url, { switchTo: true });
              break;
            case 'remove':
              api.webBookmarks.remove({ id: bookmark.id });
              renderBookmarkBar();
              updateBookmarkIcon();
              if (state.bookmarksOpen) loadBookmarksPanel();
              break;
          }
        }
      });
    }

    // ── Tor toggle ──

    function toggleTor() {
      if (state.torConnecting) return;

      if (state.torActive) {
        api.torProxy.stop().then(function (result) {
          if (!result || !result.ok) showToast('Tor stop failed');
        });
      } else {
        api.torProxy.start().then(function (result) {
          if (!result || !result.ok) showToast('Tor start failed');
        });
      }
    }

    function updateTorUI(status) {
      state.torActive = status.active;
      state.torConnecting = status.connecting;

      if (el.btnTor) {
        el.btnTor.classList.toggle('tor-active', status.active);
        el.btnTor.classList.toggle('tor-connecting', status.connecting);
      }
      if (el.urlBar) el.urlBar.classList.toggle('tor-on', status.active);

      if (el.torBadge) {
        if (status.active) {
          el.torBadge.style.display = '';
          el.torBadge.className = 'tor-badge connected';
          if (el.btnTor) el.btnTor.title = 'Tor connected \u2014 click to disconnect (Ctrl+Shift+T)';
        } else if (status.connecting) {
          el.torBadge.style.display = '';
          el.torBadge.className = 'tor-badge connecting';
          var msg = status.statusMessage || 'Connecting...';
          if (status.bootstrapProgress > 0) msg = 'Bootstrapping... ' + status.bootstrapProgress + '%';
          if (el.btnTor) el.btnTor.title = msg;
        } else {
          el.torBadge.style.display = 'none';
          el.torBadge.className = 'tor-badge';
          if (el.btnTor) el.btnTor.title = 'Toggle Tor (Ctrl+Shift+T)';
        }
      }
    }

    // ── Event wiring ──

    function initPanelEvents() {
      // Three-dot menu
      if (el.btnMenu) {
        el.btnMenu.addEventListener('click', function () {
          if (state.menuOpen) hideAllPanels();
          else showMenuPanel();
        });
      }

      if (el.menuOverlay) {
        el.menuOverlay.addEventListener('mousedown', function () {
          hideAllPanels();
        });
      }

      // Menu item clicks
      if (el.menuPanel) {
        el.menuPanel.addEventListener('click', function (e) {
          var item = e.target.closest('.menu-item');
          if (!item) return;
          var action = item.dataset.action;
          hideAllPanels();

          switch (action) {
            case 'new-tab':
              if (openNewTab) openNewTab();
              else createTab(null, 'https://yandex.com/', { switchTo: true });
              break;
            case 'downloads': showDownloadsPanel(); break;
            case 'history': showHistoryPanel(); break;
            case 'bookmarks': showBookmarksPanel(); break;
            case 'print-pdf': {
              var wv = getActiveWebview();
              if (wv) api.webBrowserActions.printPdf({ webContentsId: wv.getWebContentsId() });
              break;
            }
            case 'screenshot': {
              var wv = getActiveWebview();
              if (wv) api.webBrowserActions.capturePage({ webContentsId: wv.getWebContentsId() });
              break;
            }
            case 'torrent': openTorrentTab(); break;
          }
        });
      }

      // History panel
      if (el.historyClose) {
        el.historyClose.addEventListener('click', function () { hideAllPanels(); });
      }
      if (el.historyClearAll) {
        el.historyClearAll.addEventListener('click', function () {
          api.webHistory.clear();
          if (el.historyList) el.historyList.innerHTML = '<div class="history-empty">No history yet</div>';
        });
      }
      if (el.historySearch) {
        el.historySearch.addEventListener('input', function () { loadHistoryPanel(); });
      }
      if (el.historyList) {
        el.historyList.addEventListener('click', function (e) {
          var deleteBtn = e.target.closest('.history-item-delete');
          var item = e.target.closest('.history-item');
          if (!item) return;

          if (deleteBtn) {
            api.webHistory.remove({ id: item.dataset.id });
            item.remove();
            return;
          }

          var url = item.dataset.url;
          if (url) {
            navigateUrl(url);
            hideAllPanels();
          }
        });
      }

      // Bookmarks panel
      if (el.bookmarksClose) {
        el.bookmarksClose.addEventListener('click', function () { hideAllPanels(); });
      }
      if (el.bookmarksSearch) {
        el.bookmarksSearch.addEventListener('input', function () { loadBookmarksPanel(); });
      }
      if (el.bookmarksList) {
        el.bookmarksList.addEventListener('click', function (e) {
          var deleteBtn = e.target.closest('.bookmark-item-delete');
          var item = e.target.closest('.bookmark-item');
          if (!item) return;

          if (deleteBtn) {
            api.webBookmarks.remove({ id: item.dataset.id });
            item.remove();
            updateBookmarkIcon();
            renderBookmarkBar();
            if (el.bookmarksList.children.length === 0) {
              el.bookmarksList.innerHTML = '<div class="bookmarks-empty">No bookmarks yet</div>';
            }
            return;
          }

          var url = item.dataset.url;
          if (url) {
            navigateUrl(url);
            hideAllPanels();
          }
        });
      }

      // Bookmark star button
      if (el.btnBookmark) {
        el.btnBookmark.addEventListener('click', function () { toggleBookmark(); });
      }

      // Bookmark bar overflow
      if (el.bookmarkBarOverflow) {
        el.bookmarkBarOverflow.addEventListener('click', function (e) {
          e.stopPropagation();
          if (bookmarkBarOverflowMenu) dismissBookmarkBarOverflowMenu();
          else showBookmarkBarOverflowMenu();
        });
      }

      // Dismiss overflow on outside click
      document.addEventListener('mousedown', function (e) {
        if (bookmarkBarOverflowMenu && !bookmarkBarOverflowMenu.contains(e.target) &&
            el.bookmarkBarOverflow && e.target !== el.bookmarkBarOverflow &&
            !el.bookmarkBarOverflow.contains(e.target)) {
          dismissBookmarkBarOverflowMenu();
        }
      });

      // Re-check overflow on resize
      window.addEventListener('resize', function () {
        checkBookmarkBarOverflow();
        dismissBookmarkBarOverflowMenu();
      });

      // Tor button
      if (el.btnTor) {
        el.btnTor.addEventListener('click', function () { toggleTor(); });
      }

      // Tor status IPC
      api.torProxy.onStatusChanged(function (status) {
        updateTorUI(status);
      });

      // Sync initial Tor state
      api.torProxy.getStatus().then(function (status) {
        if (status) updateTorUI(status);
      }).catch(function () {});
    }

    return {
      hideAllPanels: hideAllPanels,
      showMenuPanel: showMenuPanel,
      showHistoryPanel: showHistoryPanel,
      showBookmarksPanel: showBookmarksPanel,
      loadHistoryPanel: loadHistoryPanel,
      loadBookmarksPanel: loadBookmarksPanel,
      toggleBookmark: toggleBookmark,
      setBookmarkIcon: setBookmarkIcon,
      updateBookmarkIcon: updateBookmarkIcon,
      renderBookmarkBar: renderBookmarkBar,
      checkBookmarkBarOverflow: checkBookmarkBarOverflow,
      dismissBookmarkBarOverflowMenu: dismissBookmarkBarOverflowMenu,
      toggleTor: toggleTor,
      updateTorUI: updateTorUI,
      initPanelEvents: initPanelEvents
    };
  };
})();
