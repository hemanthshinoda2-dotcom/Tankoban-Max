(function registerContextMenuModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.contextMenu = function initContextMenuModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;

    function dep(name) { return (bridge.deps || {})[name]; }
    var escapeHtml = function () { var fn = dep('escapeHtml'); return fn ? fn.apply(null, arguments) : ''; };
    var createTab = function () { var fn = dep('createTab'); return fn && fn.apply(null, arguments); };
    var getActiveSearchEngine = function () { var fn = dep('getActiveSearchEngine'); return fn ? fn.apply(null, arguments) : 'yandex'; };
    var getSearchUrl = function () { var fn = dep('getSearchUrl'); return fn ? fn.apply(null, arguments) : ''; };

    var ctxParams = null;

    function truncate(str, max) {
      return str.length > max ? str.substring(0, max) + '...' : str;
    }

    // ── Show context menu with webview params (from main process IPC) ──

    function showWebviewContextMenu(params) {
      ctxParams = params;
      var items = [];

      // Navigation
      items.push({ label: 'Back', shortcut: 'Alt+Left', action: 'back', disabled: !params.canGoBack });
      items.push({ label: 'Forward', shortcut: 'Alt+Right', action: 'forward', disabled: !params.canGoForward });
      items.push({ label: 'Reload', shortcut: 'Ctrl+R', action: 'reload' });
      items.push({ separator: true });

      // Link
      if (params.linkURL) {
        items.push({ label: 'Open link in new tab', action: 'openLinkNewTab' });
        items.push({ label: 'Copy link address', action: 'copyLink' });
        items.push({ separator: true });
      }

      // Image
      if (params.mediaType === 'image') {
        items.push({ label: 'Save image as...', action: 'saveImage' });
        items.push({ label: 'Copy image', action: 'copyImage' });
        if (params.srcURL) {
          items.push({ label: 'Open image in new tab', action: 'openImageNewTab' });
        }
        items.push({ separator: true });
      }

      // Text selection
      if (params.selectionText) {
        items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: 'copy' });
        if (params.isEditable) {
          items.push({ label: 'Cut', shortcut: 'Ctrl+X', action: 'cut' });
        }
        var searchLabel = 'Search for "' + truncate(params.selectionText, 30) + '"';
        items.push({ label: searchLabel, action: 'searchSelection' });
        items.push({ separator: true });
      }

      // Editable field (no selection)
      if (params.isEditable && !params.selectionText) {
        items.push({ label: 'Paste', shortcut: 'Ctrl+V', action: 'paste' });
        items.push({ label: 'Select all', shortcut: 'Ctrl+A', action: 'selectAll' });
        items.push({ separator: true });
      }

      items.push({ label: 'Inspect', shortcut: 'Ctrl+Shift+I', action: 'inspect' });

      renderContextMenu(items, params.screenX || params.x || 0, params.screenY || params.y || 0);
    }

    // ── Generic context menu renderer (used by panels too) ──

    function showContextMenu(opts) {
      if (!opts) return;
      ctxParams = opts;

      var items = opts.items || [];
      renderContextMenu(items, opts.x || 0, opts.y || 0);
    }

    function renderContextMenu(items, x, y) {
      if (!el.contextMenu) return;
      el.contextMenu.innerHTML = '';
      if (el.webviewContainer) el.webviewContainer.classList.add('wb-pointer-disabled');

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.separator) {
          var sep = document.createElement('div');
          sep.className = 'ctx-separator';
          el.contextMenu.appendChild(sep);
          continue;
        }
        (function (itm) {
          var row = document.createElement('div');
          row.className = 'ctx-item' + (itm.disabled ? ' disabled' : '');
          row.innerHTML = '<span>' + (itm.label || '') + '</span>' +
            (itm.shortcut ? '<span class="ctx-shortcut">' + itm.shortcut + '</span>' : '');
          row.addEventListener('click', function () {
            if (itm.disabled) return;
            if (ctxParams && ctxParams.onAction) {
              ctxParams.onAction(itm.action);
            } else {
              execContextAction(itm.action);
            }
            hideContextMenu();
          });
          el.contextMenu.appendChild(row);
        })(item);
      }

      // Show overlay
      if (el.ctxOverlay) el.ctxOverlay.style.display = '';

      // Position
      el.contextMenu.style.display = '';
      var mw = el.contextMenu.offsetWidth;
      var mh = el.contextMenu.offsetHeight;
      var posX = Math.max(0, Math.min(x, window.innerWidth - mw - 4));
      var posY = Math.max(0, Math.min(y, window.innerHeight - mh - 4));
      el.contextMenu.style.left = posX + 'px';
      el.contextMenu.style.top = posY + 'px';
    }

    function hideContextMenu() {
      if (el.contextMenu) el.contextMenu.style.display = 'none';
      if (el.ctxOverlay) el.ctxOverlay.style.display = 'none';
      if (el.webviewContainer) el.webviewContainer.classList.remove('wb-pointer-disabled');
      ctxParams = null;
    }

    function execContextAction(action) {
      if (!ctxParams) return;
      var wcId = ctxParams.webContentsId;

      switch (action) {
        case 'back':
        case 'forward':
        case 'reload':
        case 'copy':
        case 'cut':
        case 'paste':
        case 'selectAll':
          api.webBrowserActions.ctxAction({ webContentsId: wcId, action: action });
          break;
        case 'openLinkNewTab':
          createTab(null, ctxParams.linkURL, { switchTo: true });
          break;
        case 'copyLink':
          api.webBrowserActions.ctxAction({ webContentsId: wcId, action: 'copyLink', url: ctxParams.linkURL });
          break;
        case 'saveImage':
          api.webBrowserActions.ctxAction({ webContentsId: wcId, action: 'saveImage', url: ctxParams.srcURL });
          break;
        case 'copyImage':
          api.webBrowserActions.ctxAction({ webContentsId: wcId, action: 'copyImage', position: { x: ctxParams.x, y: ctxParams.y } });
          break;
        case 'openImageNewTab':
          createTab(null, ctxParams.srcURL, { switchTo: true });
          break;
        case 'searchSelection':
          var searchUrl = getSearchUrl(ctxParams.selectionText);
          createTab(null, searchUrl, { switchTo: true });
          break;
        case 'inspect':
          api.webBrowserActions.ctxAction({ webContentsId: wcId, action: 'inspect', position: { x: ctxParams.x, y: ctxParams.y } });
          break;
      }
    }

    // ── URL bar context menu ──

    function showUrlBarContextMenu(e) {
      e.preventDefault();
      if (!el.urlBar) return;

      var selStart = el.urlBar.selectionStart;
      var selEnd = el.urlBar.selectionEnd;
      var hasSelection = selStart !== selEnd;

      var items = [];
      if (hasSelection) {
        items.push({ label: 'Cut', shortcut: 'Ctrl+X', action: 'urlCut' });
        items.push({ label: 'Copy', shortcut: 'Ctrl+C', action: 'urlCopy' });
      }
      items.push({ label: 'Paste', shortcut: 'Ctrl+V', action: 'urlPaste' });
      if (el.urlBar.value) {
        items.push({ label: 'Select all', shortcut: 'Ctrl+A', action: 'urlSelectAll' });
      }

      ctxParams = { isUrlBar: true, selStart: selStart, selEnd: selEnd };

      renderContextMenu(items, e.clientX, e.clientY);

      // Override the onAction since URL bar actions are local
      ctxParams.onAction = function (action) {
        var val = el.urlBar.value;
        switch (action) {
          case 'urlCut':
            navigator.clipboard.writeText(val.substring(selStart, selEnd)).catch(function () {});
            el.urlBar.value = val.substring(0, selStart) + val.substring(selEnd);
            el.urlBar.focus();
            el.urlBar.setSelectionRange(selStart, selStart);
            break;
          case 'urlCopy':
            navigator.clipboard.writeText(val.substring(selStart, selEnd)).catch(function () {});
            break;
          case 'urlPaste':
            navigator.clipboard.readText().then(function (clip) {
              el.urlBar.value = val.substring(0, selStart) + clip + val.substring(selEnd);
              el.urlBar.focus();
              var newPos = selStart + clip.length;
              el.urlBar.setSelectionRange(newPos, newPos);
            }).catch(function () {});
            break;
          case 'urlSelectAll':
            el.urlBar.focus();
            el.urlBar.select();
            break;
        }
      };
    }

    // ── Event wiring ──

    function initContextMenuEvents() {
      // Dismiss on overlay click
      if (el.ctxOverlay) {
        el.ctxOverlay.addEventListener('mousedown', function () {
          hideContextMenu();
        });
      }

      // Dismiss on outside click
      document.addEventListener('mousedown', function (e) {
        if (ctxParams && el.contextMenu && !el.contextMenu.contains(e.target) &&
            (!el.ctxOverlay || e.target !== el.ctxOverlay)) {
          hideContextMenu();
        }
      });

      // Dismiss on Escape
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && ctxParams) hideContextMenu();
      });

      // URL bar right-click
      if (el.urlBar) {
        el.urlBar.addEventListener('contextmenu', showUrlBarContextMenu);
      }

      // Context menu from main process IPC
      if (api.webBrowserActions && typeof api.webBrowserActions.onContextMenu === 'function') {
        api.webBrowserActions.onContextMenu(function (params) {
          showWebviewContextMenu(params);
        });
      }

      bridge.on('contextMenu', function (params) {
        showWebviewContextMenu(params || {});
      });
    }

    return {
      showWebviewContextMenu: showWebviewContextMenu,
      showContextMenu: showContextMenu,
      hideContextMenu: hideContextMenu,
      initContextMenuEvents: initContextMenuEvents
    };
  };
})();
