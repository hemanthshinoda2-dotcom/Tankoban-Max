// ── Torrent Tab UI — qBittorrent clone ──
// All DOM access uses addEventListener (CSP: no inline scripts).

(function () {
  'use strict';

  var initialized = false;
  var torrents = {};       // id -> entry
  var selectedIds = new Set();
  var activeFilter = 'all';
  var searchQuery = '';
  var activePropTab = 'general';
  var rowNum = 0;
  var savePath = '';
  var lastClickedFileIdx = null; // for shift+click range selection in file trees
  var selectedFileRows = new Set(); // DOM rows currently in shift-selection range

  // ── DOM refs (filled on init) ──
  var tbody, emptyEl, sidebar, searchInput;
  var statusDl, statusUl, statusDht, statusActive;

  // ── Init ──

  window.initTorrentTab = function () {
    if (initialized) return;
    initialized = true;

    tbody       = document.getElementById('tt-tbody');
    emptyEl     = document.getElementById('tt-empty');
    sidebar     = document.getElementById('tt-sidebar');
    searchInput = document.getElementById('tt-search');
    statusDl    = document.getElementById('tt-status-dl');
    statusUl    = document.getElementById('tt-status-ul');
    statusDht   = document.getElementById('tt-status-dht');
    statusActive = document.getElementById('tt-status-active');

    // Toolbar buttons
    document.getElementById('tt-btn-add').addEventListener('click', showAddDialog);
    document.getElementById('tt-btn-resume').addEventListener('click', function () { selectedAction('resume'); });
    document.getElementById('tt-btn-pause').addEventListener('click', function () { selectedAction('pause'); });
    document.getElementById('tt-btn-delete').addEventListener('click', function () { selectedAction('delete'); });
    document.getElementById('tt-btn-resume-all').addEventListener('click', function () { window.aspect.torrentResumeAll(); });
    document.getElementById('tt-btn-pause-all').addEventListener('click', function () { window.aspect.torrentPauseAll(); });

    // Search filter
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value.toLowerCase().trim();
      renderTable();
    });

    // Sidebar filters
    sidebar.addEventListener('click', function (e) {
      var f = e.target.closest('.tt-filter');
      if (!f) return;
      sidebar.querySelector('.tt-filter.active').classList.remove('active');
      f.classList.add('active');
      activeFilter = f.dataset.filter;
      renderTable();
    });

    // Property tabs
    document.getElementById('tt-props-tabs').addEventListener('click', function (e) {
      var t = e.target.closest('.tt-ptab');
      if (!t) return;
      document.querySelector('.tt-ptab.active').classList.remove('active');
      t.classList.add('active');
      document.querySelector('.tt-prop-panel.active').classList.remove('active');
      activePropTab = t.dataset.ptab;
      document.getElementById('tt-prop-' + activePropTab).classList.add('active');
      renderProps();
    });

    // Table click — select row
    tbody.addEventListener('click', function (e) {
      var tr = e.target.closest('tr');
      if (!tr || !tr.dataset.id) return;
      var id = tr.dataset.id;

      if (e.ctrlKey) {
        // Toggle selection
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
      } else if (e.shiftKey && selectedIds.size > 0) {
        // Range select
        var rows = Array.from(tbody.querySelectorAll('tr'));
        var lastId = Array.from(selectedIds).pop();
        var startIdx = rows.findIndex(function (r) { return r.dataset.id === lastId; });
        var endIdx = rows.findIndex(function (r) { return r.dataset.id === id; });
        if (startIdx > endIdx) { var tmp = startIdx; startIdx = endIdx; endIdx = tmp; }
        for (var i = startIdx; i <= endIdx; i++) {
          if (rows[i] && rows[i].dataset.id) selectedIds.add(rows[i].dataset.id);
        }
      } else {
        selectedIds.clear();
        selectedIds.add(id);
      }
      updateRowSelection();
      renderProps();
    });

    // Table right-click — context menu
    tbody.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var tr = e.target.closest('tr');
      if (!tr || !tr.dataset.id) return;
      var id = tr.dataset.id;
      if (!selectedIds.has(id)) {
        selectedIds.clear();
        selectedIds.add(id);
        updateRowSelection();
        renderProps();
      }
      showTorrentCtxMenu(e.clientX, e.clientY);
    });

    // Dismiss context menu
    document.addEventListener('mousedown', function (e) {
      var menu = document.getElementById('tt-ctx-menu');
      if (menu && menu.style.display !== 'none' && !menu.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    // File tree folder toggle (collapse/expand) + shift+click range selection
    document.getElementById('torrent-container').addEventListener('click', function (e) {
      // Folder toggle
      var toggle = e.target.closest('.tt-tree-toggle');
      if (toggle) {
        var targetId = toggle.dataset.target;
        if (!targetId) return;
        var group = document.getElementById(targetId);
        if (!group) return;
        var collapsed = group.style.display === 'none';
        group.style.display = collapsed ? '' : 'none';
        toggle.textContent = collapsed ? '\u25BC' : '\u25B6';
        return;
      }

      // Folder checkbox — toggle all descendant file checkboxes
      var folderCb = e.target.closest('.tt-folder-check');
      if (folderCb) {
        var folderRow = folderCb.closest('.tt-tree-folder-row');
        if (folderRow) {
          var group = folderRow.nextElementSibling;
          if (group && group.classList.contains('tt-tree-group')) {
            var childCbs = group.querySelectorAll('.tt-file-check, .tt-add-file-check, .tt-folder-check');
            childCbs.forEach(function (cb) { cb.checked = folderCb.checked; });
            fireFileChangeEvent(folderCb);
          }
        }
        return;
      }

      // Shift+click on file rows for range selection
      var fileRow = e.target.closest('.tt-tree-file-row');
      if (!fileRow) return;
      var cb = fileRow.querySelector('.tt-file-check, .tt-add-file-check');
      if (!cb) return;

      // If click was on the row itself (not directly on the checkbox), toggle the checkbox
      var clickedCheckbox = (e.target === cb || e.target.tagName === 'INPUT');
      if (!clickedCheckbox && !e.shiftKey) {
        cb.checked = !cb.checked;
        fireFileChangeEvent(cb);
      }

      var currentIdx = Number(cb.dataset.idx);

      if (e.shiftKey && lastClickedFileIdx !== null) {
        // If click wasn't directly on checkbox, toggle it first to get the new state
        if (!clickedCheckbox) cb.checked = !cb.checked;

        // Find all file checkboxes in the same container
        var container = fileRow.closest('#tt-add-files-list, #tt-prop-content');
        if (!container) return;
        var allCbs = Array.from(container.querySelectorAll('.tt-file-check, .tt-add-file-check'));
        var lastDomIdx = allCbs.findIndex(function (c) { return Number(c.dataset.idx) === lastClickedFileIdx; });
        var currDomIdx = allCbs.findIndex(function (c) { return Number(c.dataset.idx) === currentIdx; });
        if (lastDomIdx === -1 || currDomIdx === -1) return;

        var start = Math.min(lastDomIdx, currDomIdx);
        var end = Math.max(lastDomIdx, currDomIdx);
        var newState = cb.checked;

        // Clear previous visual selection
        selectedFileRows.forEach(function (r) { r.classList.remove('tt-file-selected'); });
        selectedFileRows.clear();

        for (var i = start; i <= end; i++) {
          allCbs[i].checked = newState;
          var row = allCbs[i].closest('.tt-tree-file-row');
          if (row) { row.classList.add('tt-file-selected'); selectedFileRows.add(row); }
        }
        fireFileChangeEvent(cb);
        // Don't update lastClickedFileIdx on shift+click — preserve anchor
      } else {
        // Normal click — update anchor, clear previous selection highlight
        lastClickedFileIdx = currentIdx;
        selectedFileRows.forEach(function (r) { r.classList.remove('tt-file-selected'); });
        selectedFileRows.clear();
      }
    });

    // File context menu (right-click on file rows)
    document.getElementById('torrent-container').addEventListener('contextmenu', function (e) {
      var fileRow = e.target.closest('.tt-tree-file-row');
      if (!fileRow) return;
      e.preventDefault();
      showFileCtxMenu(e.clientX, e.clientY, fileRow);
    });

    // Dismiss file context menu on outside click
    document.addEventListener('mousedown', function (e) {
      var fmenu = document.getElementById('tt-file-ctx-menu');
      if (fmenu && fmenu.style.display !== 'none' && !fmenu.contains(e.target)) {
        fmenu.style.display = 'none';
      }
    });

    // IPC listeners
    window.aspect.onTorrentStarted(function (entry) {
      torrents[entry.id] = entry;
      renderTable();
    });

    window.aspect.onTorrentMetadata(function (entry) {
      torrents[entry.id] = entry;
      renderTable();
      if (selectedIds.has(entry.id)) renderProps();
    });

    window.aspect.onTorrentProgress(function (entry) {
      torrents[entry.id] = entry;
      updateRow(entry);
      if (selectedIds.has(entry.id)) renderProps();
      updateStatusBar();
    });

    window.aspect.onTorrentCompleted(function (entry) {
      torrents[entry.id] = entry;
      renderTable();
      if (selectedIds.has(entry.id)) renderProps();
    });

    // Load existing torrents
    window.aspect.torrentGetActive().then(function (result) {
      if (result.ok && result.torrents) {
        result.torrents.forEach(function (t) { torrents[t.id] = t; });
      }
      return window.aspect.torrentGetHistory();
    }).then(function (result) {
      if (result.ok && result.torrents) {
        result.torrents.forEach(function (t) {
          if (!torrents[t.id]) torrents[t.id] = t;
        });
      }
      renderTable();
    });

    // Periodic DHT update
    setInterval(function () {
      window.aspect.torrentGetDhtNodes().then(function (n) {
        statusDht.textContent = 'DHT: ' + n + ' nodes';
      });
    }, 5000);
  };

  // ── Add source (called from renderer.js for magnets and .torrent files) ──

  var currentResolveId = null;
  var resolvedFiles = null;
  var resolveTimer = null;

  window.torrentTabAddSource = function (source) {
    if (!source) return;
    showAddDialog(source);
  };

  // ── Add dialog ──

  window.torrentTabOpenAddDialog = function () { showAddDialog(); };

  function showAddDialog(prefill) {
    var overlay = document.getElementById('tt-add-overlay');
    if (!overlay) {
      overlay = createAddDialog();
    }
    var input = document.getElementById('tt-add-source');
    var pathEl = document.getElementById('tt-add-path');
    var filesList = document.getElementById('tt-add-files-list');
    var fileSummary = document.getElementById('tt-add-file-summary');
    var okBtn = document.getElementById('tt-add-ok');

    // Reset state
    if (currentResolveId) {
      window.aspect.torrentCancelResolve(currentResolveId);
      currentResolveId = null;
    }
    resolvedFiles = null;
    input.value = (typeof prefill === 'string') ? prefill : '';
    filesList.innerHTML = '<div class="tt-add-placeholder">Paste a magnet link to see files</div>';
    fileSummary.textContent = '';
    okBtn.disabled = true;
    var seqCb = document.getElementById('tt-add-sequential');
    if (seqCb) seqCb.checked = false;

    // Set default save path
    if (!savePath) {
      window.aspect.torrentGetHistory().then(function (result) {
        if (result.ok && result.torrents && result.torrents.length > 0 && result.torrents[0].savePath) {
          savePath = result.torrents[0].savePath;
        }
        if (savePath) pathEl.textContent = savePath;
      });
    } else {
      pathEl.textContent = savePath;
    }

    overlay.classList.add('visible');
    input.focus();

    // If source is provided, auto-resolve
    if (typeof prefill === 'string' && prefill.trim()) {
      startResolve(prefill.trim());
    }
  }

  function startResolve(source) {
    var filesList = document.getElementById('tt-add-files-list');
    var fileSummary = document.getElementById('tt-add-file-summary');
    var okBtn = document.getElementById('tt-add-ok');

    // Cancel previous resolve if any
    if (currentResolveId) {
      window.aspect.torrentCancelResolve(currentResolveId);
      currentResolveId = null;
    }

    resolvedFiles = null;
    okBtn.disabled = true;
    lastClickedFileIdx = null;
    selectedFileRows.clear();
    filesList.innerHTML =
      '<div class="tt-add-resolving">' +
        '<div class="tt-spinner"></div>' +
        '<span>Resolving metadata...</span>' +
      '</div>';
    fileSummary.textContent = '';

    window.aspect.torrentResolveMetadata(source).then(function (result) {
      if (!result.ok) {
        filesList.innerHTML = '<div class="tt-add-error">Failed: ' + esc(result.error || 'Unknown error') + '</div>';
        return;
      }

      currentResolveId = result.resolveId;
      resolvedFiles = result.files;
      okBtn.disabled = false;

      fileSummary.textContent = '(' + result.files.length + ' file' + (result.files.length !== 1 ? 's' : '') + ', ' + fmtBytes(result.totalSize) + ')';

      // Build file tree with checkboxes
      var tree = buildFileTree(result.files);
      filesList.innerHTML = renderFileTree(tree, 0, 'add');
      updateSelectedSize();
    });
  }

  function updateSelectedSize() {
    var checks = document.querySelectorAll('#tt-add-files-list .tt-add-file-check');
    var totalSize = 0;
    var count = 0;
    checks.forEach(function (cb) {
      if (cb.checked && resolvedFiles) {
        var idx = Number(cb.dataset.idx);
        if (resolvedFiles[idx]) {
          totalSize += resolvedFiles[idx].length || 0;
          count++;
        }
      }
    });
    var summary = document.getElementById('tt-add-file-summary');
    if (summary && resolvedFiles) {
      summary.textContent = '(' + count + '/' + resolvedFiles.length + ' file' + (resolvedFiles.length !== 1 ? 's' : '') + ', ' + fmtBytes(totalSize) + ')';
    }
    // Disable download button if nothing selected
    var okBtn = document.getElementById('tt-add-ok');
    if (okBtn && currentResolveId) okBtn.disabled = (count === 0);
  }

  function dismissAddDialog() {
    if (currentResolveId) {
      window.aspect.torrentCancelResolve(currentResolveId);
      currentResolveId = null;
    }
    resolvedFiles = null;
    var overlay = document.getElementById('tt-add-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  function createAddDialog() {
    var overlay = document.createElement('div');
    overlay.id = 'tt-add-overlay';
    overlay.innerHTML =
      '<div id="tt-add-dialog">' +
        '<h3>Add Torrent</h3>' +
        '<label>Magnet URI or torrent source</label>' +
        '<input id="tt-add-source" type="text" placeholder="magnet:?xt=urn:btih:...">' +
        '<div class="tt-add-path-row">' +
          '<label style="margin:0">Save to:</label>' +
          '<div id="tt-add-path">Downloads</div>' +
          '<button id="tt-add-browse">Change...</button>' +
        '</div>' +
        '<label class="tt-add-check-label">' +
          '<input type="checkbox" id="tt-add-sequential">' +
          '<span>Sequential download</span>' +
        '</label>' +
        '<div id="tt-add-files-section">' +
          '<div class="tt-add-files-header">' +
            '<span>Files <span id="tt-add-file-summary"></span></span>' +
            '<div class="tt-add-files-actions">' +
              '<button id="tt-add-select-all" class="tt-link-btn">Select All</button>' +
              '<button id="tt-add-deselect-all" class="tt-link-btn">Deselect All</button>' +
            '</div>' +
          '</div>' +
          '<div id="tt-add-files-list">' +
            '<div class="tt-add-placeholder">Paste a magnet link to see files</div>' +
          '</div>' +
        '</div>' +
        '<div class="tt-add-buttons">' +
          '<button class="tt-add-btn cancel" id="tt-add-cancel">Cancel</button>' +
          '<button class="tt-add-btn primary" id="tt-add-ok" disabled>Download</button>' +
        '</div>' +
      '</div>';
    document.getElementById('torrent-container').appendChild(overlay);

    // Cancel
    document.getElementById('tt-add-cancel').addEventListener('click', dismissAddDialog);

    // Download
    document.getElementById('tt-add-ok').addEventListener('click', function () {
      if (!currentResolveId) return;

      var selectedFiles = [];
      document.querySelectorAll('#tt-add-files-list .tt-add-file-check').forEach(function (cb) {
        if (cb.checked) selectedFiles.push(Number(cb.dataset.idx));
      });
      if (selectedFiles.length === 0) return;

      window.aspect.torrentStartConfigured({
        resolveId: currentResolveId,
        savePath: savePath || undefined,
        selectedFiles: selectedFiles
      });
      currentResolveId = null;
      resolvedFiles = null;
      overlay.classList.remove('visible');
    });

    // Source input — auto-resolve on paste/change with debounce
    var sourceInput = document.getElementById('tt-add-source');

    // Right-click context menu for paste support
    sourceInput.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var menu = document.createElement('div');
      menu.className = 'tt-ctx-menu';
      menu.style.cssText = 'position:fixed;z-index:99999;background:#2a2a2e;border:1px solid #555;border-radius:4px;padding:2px 0;min-width:120px;box-shadow:0 4px 12px rgba(0,0,0,.5);';
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';

      function addItem(label, action) {
        var item = document.createElement('div');
        item.textContent = label;
        item.style.cssText = 'padding:6px 16px;cursor:pointer;color:#ddd;font-size:13px;';
        item.addEventListener('mouseenter', function () { item.style.background = '#3a3a44'; });
        item.addEventListener('mouseleave', function () { item.style.background = 'transparent'; });
        item.addEventListener('click', function () { action(); close(); });
        menu.appendChild(item);
      }
      function close() { try { menu.remove(); } catch (_e) {} document.removeEventListener('click', close, true); }

      addItem('Paste', function () {
        try {
          var clip = window.aspect && window.aspect.clipboardRead ? window.aspect.clipboardRead() : '';
          Promise.resolve(clip).then(function (text) {
            if (text) {
              sourceInput.value = String(text);
              sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }).catch(function () {});
        } catch (_e) {}
      });
      addItem('Cut', function () {
        try {
          if (window.aspect && window.aspect.clipboardWrite) window.aspect.clipboardWrite(sourceInput.value || '');
          sourceInput.value = '';
        } catch (_e) {}
      });
      addItem('Copy', function () {
        try {
          if (window.aspect && window.aspect.clipboardWrite) window.aspect.clipboardWrite(sourceInput.value || '');
        } catch (_e) {}
      });
      addItem('Select All', function () { sourceInput.select(); });

      document.body.appendChild(menu);
      setTimeout(function () { document.addEventListener('click', close, true); }, 0);
    });

    sourceInput.addEventListener('input', function () {
      clearTimeout(resolveTimer);
      var val = sourceInput.value.trim();
      if (val.indexOf('magnet:') === 0 && val.length > 20) {
        resolveTimer = setTimeout(function () { startResolve(val); }, 500);
      }
    });

    sourceInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var val = sourceInput.value.trim();
        if (val.indexOf('magnet:') === 0) startResolve(val);
      }
      if (e.key === 'Escape') dismissAddDialog();
    });

    // Browse save path
    document.getElementById('tt-add-browse').addEventListener('click', function () {
      window.aspect.torrentSelectSaveFolder().then(function (result) {
        if (result.ok && result.path) {
          savePath = result.path;
          document.getElementById('tt-add-path').textContent = savePath;
        }
      });
    });

    // Select all / deselect all
    document.getElementById('tt-add-select-all').addEventListener('click', function () {
      document.querySelectorAll('#tt-add-files-list .tt-add-file-check').forEach(function (cb) { cb.checked = true; });
      updateSelectedSize();
    });

    document.getElementById('tt-add-deselect-all').addEventListener('click', function () {
      document.querySelectorAll('#tt-add-files-list .tt-add-file-check').forEach(function (cb) { cb.checked = false; });
      updateSelectedSize();
    });

    // File checkbox changes
    document.getElementById('tt-add-files-list').addEventListener('change', function (e) {
      if (e.target.classList.contains('tt-add-file-check')) updateSelectedSize();
    });

    // Click overlay background to dismiss
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) dismissAddDialog();
    });

    return overlay;
  }

  // ── File change helper (for shift+click and folder checkbox) ──

  function fireFileChangeEvent(cb) {
    // Determine which container this belongs to (add dialog or content panel)
    var addContainer = cb.closest('#tt-add-files-list');
    if (addContainer) {
      updateSelectedSize();
      return;
    }
    var propsContainer = cb.closest('#tt-prop-content');
    if (propsContainer) {
      // Get the torrent entry for this panel
      var ids = Array.from(selectedIds);
      var entry = ids.length === 1 ? torrents[ids[0]] : null;
      if (!entry) return;
      var checked = [];
      propsContainer.querySelectorAll('.tt-file-check').forEach(function (c) {
        if (c.checked) checked.push(Number(c.dataset.idx));
      });
      window.aspect.torrentSelectFiles(entry.id, checked);
    }
  }

  // ── File context menu ──

  function showFileCtxMenu(x, y, fileRow) {
    var menu = document.getElementById('tt-file-ctx-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'tt-file-ctx-menu';
      document.getElementById('torrent-container').appendChild(menu);
    }

    // Determine which container
    var container = fileRow.closest('#tt-add-files-list, #tt-prop-content');
    if (!container) return;

    // Get all checkboxes that are in the shift-selected range, or just the right-clicked one
    var targetCbs = [];
    if (selectedFileRows.size > 0) {
      selectedFileRows.forEach(function (r) {
        var cb = r.querySelector('.tt-file-check, .tt-add-file-check');
        if (cb) targetCbs.push(cb);
      });
    }
    if (targetCbs.length === 0) {
      var cb = fileRow.querySelector('.tt-file-check, .tt-add-file-check');
      if (cb) targetCbs.push(cb);
    }

    menu.innerHTML = '';
    var items = [
      { label: '\u2713  Download (select)', action: 'select' },
      { label: '\u2717  Don\'t download (deselect)', action: 'deselect' },
    ];

    items.forEach(function (item) {
      var el = document.createElement('div');
      el.className = 'tt-ctx-item';
      el.textContent = item.label;
      el.addEventListener('click', function () {
        menu.style.display = 'none';
        var newState = item.action === 'select';
        targetCbs.forEach(function (cb) { cb.checked = newState; });
        if (targetCbs.length > 0) fireFileChangeEvent(targetCbs[0]);
      });
      menu.appendChild(el);
    });

    // Position
    menu.style.display = 'block';
    var cRect = document.getElementById('torrent-container').getBoundingClientRect();
    var mx = x - cRect.left;
    var my = y - cRect.top;
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    if (mx + mw > cRect.width) mx = cRect.width - mw - 4;
    if (my + mh > cRect.height) my = cRect.height - mh - 4;
    menu.style.left = Math.max(0, mx) + 'px';
    menu.style.top = Math.max(0, my) + 'px';
  }

  // ── Context menu ──

  function showTorrentCtxMenu(x, y) {
    var menu = document.getElementById('tt-ctx-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'tt-ctx-menu';
      document.getElementById('torrent-container').appendChild(menu);
    }

    var ids = Array.from(selectedIds);
    var entry = ids.length === 1 ? torrents[ids[0]] : null;
    var hasActive = ids.some(function (id) {
      var t = torrents[id];
      return t && (t.state === 'downloading' || t.state === 'seeding' || t.state === 'resolving_metadata');
    });
    var hasPaused = ids.some(function (id) { var t = torrents[id]; return t && t.state === 'paused'; });

    menu.innerHTML = '';
    var items = [];

    if (hasPaused) items.push({ label: '\u25B6  Resume', action: 'resume' });
    if (hasActive) items.push({ label: '\u275A\u275A  Pause', action: 'pause' });
    items.push({ sep: true });
    items.push({ label: '\u2716  Delete', action: 'delete' });
    items.push({ label: '\u2716  Delete with files', action: 'deleteFiles' });
    if (entry && entry.savePath) {
      items.push({ sep: true });
      items.push({ label: '\uD83D\uDCC1  Open folder', action: 'folder' });
    }
    if (entry) {
      items.push({ sep: true });
      items.push({ label: 'Copy name', action: 'copyName' });
      if (entry.magnetUri) items.push({ label: 'Copy magnet link', action: 'copyMagnet' });
      if (entry.infoHash) items.push({ label: 'Copy info hash', action: 'copyHash' });
    }

    items.forEach(function (item) {
      if (item.sep) {
        var sep = document.createElement('div');
        sep.className = 'tt-ctx-sep';
        menu.appendChild(sep);
        return;
      }
      var el = document.createElement('div');
      el.className = 'tt-ctx-item';
      el.textContent = item.label;
      el.addEventListener('click', function () {
        menu.style.display = 'none';
        handleCtxAction(item.action, ids, entry);
      });
      menu.appendChild(el);
    });

    // Position — must use 'block' since CSS default is display:none
    menu.style.display = 'block';
    var container = document.getElementById('torrent-container');
    var bounds = container.getBoundingClientRect();
    var mx = x - bounds.left;
    var my = y - bounds.top;
    // Keep on-screen
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    if (mx + mw > bounds.width) mx = bounds.width - mw - 4;
    if (my + mh > bounds.height) my = bounds.height - mh - 4;
    menu.style.left = Math.max(0, mx) + 'px';
    menu.style.top = Math.max(0, my) + 'px';
  }

  function handleCtxAction(action, ids, entry) {
    switch (action) {
      case 'resume':
        ids.forEach(function (id) { window.aspect.torrentResume(id); });
        break;
      case 'pause':
        ids.forEach(function (id) { window.aspect.torrentPause(id); });
        break;
      case 'delete':
        ids.forEach(function (id) {
          window.aspect.torrentRemove(id);
          delete torrents[id];
          selectedIds.delete(id);
        });
        renderTable();
        break;
      case 'deleteFiles':
        ids.forEach(function (id) {
          window.aspect.torrentCancel(id);
          delete torrents[id];
          selectedIds.delete(id);
        });
        renderTable();
        break;
      case 'folder':
        if (entry && entry.savePath) window.aspect.torrentOpenFolder(entry.savePath);
        break;
      case 'copyName':
        if (entry) window.aspect.clipboardWrite(entry.name || '');
        break;
      case 'copyMagnet':
        if (entry && entry.magnetUri) window.aspect.clipboardWrite(entry.magnetUri);
        break;
      case 'copyHash':
        if (entry && entry.infoHash) window.aspect.clipboardWrite(entry.infoHash);
        break;
    }
  }

  // ── Selected action (toolbar) ──

  function selectedAction(action) {
    var ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    switch (action) {
      case 'resume':
        ids.forEach(function (id) { window.aspect.torrentResume(id); });
        break;
      case 'pause':
        ids.forEach(function (id) { window.aspect.torrentPause(id); });
        break;
      case 'delete':
        ids.forEach(function (id) {
          window.aspect.torrentRemove(id);
          delete torrents[id];
          selectedIds.delete(id);
        });
        renderTable();
        break;
    }
  }

  // ── Filtering ──

  function getFilteredTorrents() {
    var list = Object.values(torrents);

    // Sidebar filter
    if (activeFilter !== 'all') {
      list = list.filter(function (t) {
        switch (activeFilter) {
          case 'downloading': return t.state === 'downloading' || t.state === 'resolving_metadata';
          case 'seeding':     return t.state === 'seeding';
          case 'completed':   return t.state === 'completed' || t.state === 'seeding';
          case 'paused':      return t.state === 'paused';
          case 'active':      return t.state === 'downloading' || t.state === 'seeding';
          case 'errored':     return t.state === 'failed' || t.state === 'cancelled';
          default: return true;
        }
      });
    }

    // Search filter
    if (searchQuery) {
      list = list.filter(function (t) {
        return (t.name && t.name.toLowerCase().indexOf(searchQuery) !== -1) ||
               (t.infoHash && t.infoHash.toLowerCase().indexOf(searchQuery) !== -1);
      });
    }

    // Sort: active first, then by addedOn desc
    list.sort(function (a, b) {
      var aActive = (a.state === 'downloading' || a.state === 'seeding' || a.state === 'resolving_metadata') ? 0 : 1;
      var bActive = (b.state === 'downloading' || b.state === 'seeding' || b.state === 'resolving_metadata') ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (b.addedOn || 0) - (a.addedOn || 0);
    });

    return list;
  }

  // ── Render table ──

  function renderTable() {
    var list = getFilteredTorrents();

    // Update sidebar counts
    var counts = { all: 0, downloading: 0, seeding: 0, completed: 0, paused: 0, active: 0, errored: 0 };
    Object.values(torrents).forEach(function (t) {
      counts.all++;
      if (t.state === 'downloading' || t.state === 'resolving_metadata') { counts.downloading++; counts.active++; }
      if (t.state === 'seeding') { counts.seeding++; counts.active++; counts.completed++; }
      if (t.state === 'completed') counts.completed++;
      if (t.state === 'paused') counts.paused++;
      if (t.state === 'failed' || t.state === 'cancelled') counts.errored++;
    });
    sidebar.querySelectorAll('.tt-filter').forEach(function (el) {
      var key = el.dataset.filter;
      el.querySelector('.tt-filter-count').textContent = counts[key] || 0;
    });

    // Empty state
    emptyEl.className = list.length > 0 ? 'hidden' : '';

    // Rebuild table
    tbody.innerHTML = '';
    rowNum = 0;
    list.forEach(function (entry) {
      rowNum++;
      var tr = document.createElement('tr');
      tr.dataset.id = entry.id;
      if (selectedIds.has(entry.id)) tr.className = 'selected';

      var pct = Math.round((entry.progress || 0) * 100);
      var stateClass = getStateClass(entry.state);

      tr.innerHTML =
        '<td class="tt-col-num">' + rowNum + '</td>' +
        '<td class="tt-col-name" title="' + esc(entry.name || entry.infoHash || 'Resolving...') + '">' + esc(entry.name || entry.infoHash || 'Resolving...') + '</td>' +
        '<td class="tt-col-size">' + fmtBytes(entry.totalSize) + '</td>' +
        '<td class="tt-col-progress"><div class="tt-progress-bar"><div class="tt-progress-fill ' + stateClass + '" style="width:' + pct + '%"></div><div class="tt-progress-text">' + pct + '%</div></div></td>' +
        '<td class="tt-col-status"><span class="tt-status-' + entry.state + '">' + fmtState(entry.state) + '</span></td>' +
        '<td class="tt-col-seeds">' + (entry.seeds || 0) + '</td>' +
        '<td class="tt-col-peers">' + (entry.peers || 0) + '</td>' +
        '<td class="tt-col-dlspeed">' + fmtSpeed(entry.downloadSpeed) + '</td>' +
        '<td class="tt-col-ulspeed">' + fmtSpeed(entry.uploadSpeed) + '</td>' +
        '<td class="tt-col-eta">' + fmtEta(entry.eta) + '</td>';

      tbody.appendChild(tr);
    });

    updateStatusBar();
  }

  // ── Update single row (fast path for progress ticks) ──

  function updateRow(entry) {
    var tr = tbody.querySelector('tr[data-id="' + entry.id + '"]');
    if (!tr) return;

    var cells = tr.cells;
    var pct = Math.round((entry.progress || 0) * 100);
    var stateClass = getStateClass(entry.state);

    // Name
    cells[1].textContent = entry.name || entry.infoHash || 'Resolving...';
    cells[1].title = entry.name || entry.infoHash || 'Resolving...';
    // Size
    cells[2].textContent = fmtBytes(entry.totalSize);
    // Progress bar
    var fill = cells[3].querySelector('.tt-progress-fill');
    var text = cells[3].querySelector('.tt-progress-text');
    if (fill) { fill.style.width = pct + '%'; fill.className = 'tt-progress-fill ' + stateClass; }
    if (text) text.textContent = pct + '%';
    // Status
    cells[4].innerHTML = '<span class="tt-status-' + entry.state + '">' + fmtState(entry.state) + '</span>';
    // Seeds / Peers
    cells[5].textContent = entry.seeds || 0;
    cells[6].textContent = entry.peers || 0;
    // Speeds
    cells[7].textContent = fmtSpeed(entry.downloadSpeed);
    cells[8].textContent = fmtSpeed(entry.uploadSpeed);
    // ETA
    cells[9].textContent = fmtEta(entry.eta);

    // Update sidebar counts on every tick is expensive, do it less often
  }

  function updateRowSelection() {
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.classList.toggle('selected', selectedIds.has(tr.dataset.id));
    });
  }

  // ── Status bar ──

  function updateStatusBar() {
    var totalDl = 0, totalUl = 0, activeCount = 0;
    Object.values(torrents).forEach(function (t) {
      totalDl += (t.downloadSpeed || 0);
      totalUl += (t.uploadSpeed || 0);
      if (t.state === 'downloading' || t.state === 'seeding' || t.state === 'resolving_metadata') activeCount++;
    });
    statusDl.innerHTML = '&#8595; ' + fmtSpeed(totalDl);
    statusUl.innerHTML = '&#8593; ' + fmtSpeed(totalUl);
    statusActive.textContent = activeCount + ' active';
  }

  // ── Properties panel ──

  function renderProps() {
    var ids = Array.from(selectedIds);
    var entry = ids.length === 1 ? torrents[ids[0]] : null;

    // General
    var genPanel = document.getElementById('tt-prop-general');
    if (!entry) {
      genPanel.innerHTML = '<div style="color:#5f6368">Select a torrent to view details</div>';
    } else {
      genPanel.innerHTML =
        '<div class="tt-prop-grid">' +
          row('Save path', entry.savePath || '-') +
          row('Total size', fmtBytes(entry.totalSize)) +
          row('Info hash', entry.infoHash || '-') +
          row('Added on', entry.addedOn ? new Date(entry.addedOn).toLocaleString() : '-') +
          row('Completed', entry.completedOn ? new Date(entry.completedOn).toLocaleString() : '-') +
          row('Downloaded', fmtBytes(entry.downloaded || 0)) +
          row('Uploaded', fmtBytes(entry.uploaded || 0)) +
          row('Ratio', (entry.ratio || 0).toFixed(3)) +
          row('Seeds', (entry.seeds || 0) + ' / ' + (entry.seedsTotal || 0)) +
          row('Peers', (entry.peers || 0) + ' / ' + (entry.peersTotal || 0)) +
          row('Down speed', fmtSpeed(entry.downloadSpeed || 0)) +
          row('Up speed', fmtSpeed(entry.uploadSpeed || 0)) +
          row('ETA', fmtEta(entry.eta)) +
          row('Pieces', (entry.numPieces || 0) + ' x ' + fmtBytes(entry.pieceLength || 0)) +
          row('Time active', fmtDuration(entry.timeActive || 0)) +
        '</div>';
    }

    // Content (files)
    var contentPanel = document.getElementById('tt-prop-content');
    if (!entry || !entry.files || entry.files.length === 0) {
      contentPanel.innerHTML = '<div style="color:#5f6368">No file information available</div>';
    } else {
      var tree = buildFileTree(entry.files);
      contentPanel.innerHTML = renderFileTree(tree, 0, 'props');

      // File checkbox changes
      contentPanel.querySelectorAll('.tt-file-check').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var checked = [];
          contentPanel.querySelectorAll('.tt-file-check').forEach(function (c) {
            if (c.checked) checked.push(Number(c.dataset.idx));
          });
          window.aspect.torrentSelectFiles(entry.id, checked);
        });
      });
    }

    // Peers
    var peersPanel = document.getElementById('tt-prop-peers');
    if (!entry) {
      peersPanel.innerHTML = '<div style="color:#5f6368">Select a torrent to view peers</div>';
    } else {
      window.aspect.torrentGetPeers(entry.id).then(function (result) {
        if (!result.ok || !result.peers || result.peers.length === 0) {
          peersPanel.innerHTML = '<div style="color:#5f6368">No peers connected</div>';
          return;
        }
        var html = '<table class="tt-peers-table"><thead><tr><th>IP</th><th>Client</th><th>Progress</th><th>Down</th><th>Up</th></tr></thead><tbody>';
        result.peers.forEach(function (p) {
          html += '<tr><td>' + esc(p.ip) + '</td><td>' + esc(p.client) + '</td><td>' + Math.round(p.progress * 100) + '%</td><td>' + fmtSpeed(p.dlSpeed) + '</td><td>' + fmtSpeed(p.ulSpeed) + '</td></tr>';
        });
        html += '</tbody></table>';
        peersPanel.innerHTML = html;
      });
    }

    // Trackers
    var trackersPanel = document.getElementById('tt-prop-trackers');
    if (!entry || !entry.trackers || entry.trackers.length === 0) {
      trackersPanel.innerHTML = '<div style="color:#5f6368">No trackers</div>';
    } else {
      var html = '<table class="tt-trackers-table"><thead><tr><th>URL</th><th>Status</th><th>Peers</th></tr></thead><tbody>';
      entry.trackers.forEach(function (tr) {
        html += '<tr><td>' + esc(tr.url) + '</td><td>' + esc(tr.status || '-') + '</td><td>' + (tr.peers || 0) + '</td></tr>';
      });
      html += '</tbody></table>';
      trackersPanel.innerHTML = html;
    }
  }

  // ── Formatting helpers ──

  function fmtBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= units.length) i = units.length - 1;
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }

  function fmtSpeed(bps) {
    if (!bps || bps <= 0) return '0 B/s';
    return fmtBytes(bps) + '/s';
  }

  function fmtEta(seconds) {
    if (!seconds || seconds === Infinity || seconds <= 0) return '\u221E';
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function fmtDuration(seconds) {
    if (!seconds || seconds <= 0) return '0s';
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h < 24) return h + 'h ' + m + 'm';
    var d = Math.floor(h / 24);
    return d + 'd ' + (h % 24) + 'h';
  }

  function fmtState(state) {
    switch (state) {
      case 'downloading': return 'Downloading';
      case 'seeding':     return 'Seeding';
      case 'completed':   return 'Completed';
      case 'paused':      return 'Paused';
      case 'failed':      return 'Error';
      case 'cancelled':   return 'Cancelled';
      case 'resolving_metadata': return 'Resolving...';
      default: return state || 'Unknown';
    }
  }

  function getStateClass(state) {
    switch (state) {
      case 'downloading':
      case 'resolving_metadata': return 'downloading';
      case 'seeding': return 'seeding';
      case 'completed': return 'completed';
      case 'paused': return 'paused';
      case 'failed':
      case 'cancelled': return 'error';
      default: return 'downloading';
    }
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function row(label, value) {
    return '<div class="tt-prop-label">' + label + '</div><div class="tt-prop-value">' + esc(String(value)) + '</div>';
  }

  // ── File tree helpers ──

  var treeIdCounter = 0;

  function buildFileTree(files) {
    var root = { children: [], files: [] };
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var filePath = String(f.path || f.name || '').replace(/\\/g, '/');
      var parts = filePath.split('/').filter(function (p) { return p; });
      var node = root;
      for (var p = 0; p < parts.length - 1; p++) {
        var folderName = parts[p];
        var found = null;
        for (var c = 0; c < node.children.length; c++) {
          if (node.children[c].name === folderName) { found = node.children[c]; break; }
        }
        if (!found) {
          found = { name: folderName, children: [], files: [] };
          node.children.push(found);
        }
        node = found;
      }
      var fileName = parts.length > 0 ? parts[parts.length - 1] : (f.name || '?');
      node.files.push({
        index: f.index !== undefined ? f.index : i,
        name: fileName,
        length: f.length || 0,
        progress: f.progress || 0,
        selected: f.selected !== false,
        fullPath: filePath
      });
    }
    return root;
  }

  function calcTreeSize(node) {
    var total = 0;
    for (var i = 0; i < node.files.length; i++) total += node.files[i].length || 0;
    for (var i = 0; i < node.children.length; i++) total += calcTreeSize(node.children[i]);
    return total;
  }

  function renderFileTree(node, depth, mode) {
    var html = '';
    var indent = depth * 24;
    var folders = node.children.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var fileList = node.files.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });

    for (var fi = 0; fi < folders.length; fi++) {
      var folder = folders[fi];
      var fid = 'tt-tree-' + (++treeIdCounter);
      var fsize = calcTreeSize(folder);
      html +=
        '<div class="tt-tree-row tt-tree-folder-row" style="padding-left:' + indent + 'px">' +
          '<span class="tt-tree-toggle" data-target="' + fid + '">\u25BC</span>' +
          '<input type="checkbox" class="tt-folder-check" checked>' +
          '<span class="tt-tree-icon">\uD83D\uDCC1</span>' +
          '<span class="tt-tree-name">' + esc(folder.name) + '</span>' +
          '<span class="tt-tree-size">' + fmtBytes(fsize) + '</span>' +
        '</div>' +
        '<div class="tt-tree-group" id="' + fid + '">' +
          renderFileTree(folder, depth + 1, mode) +
        '</div>';
    }

    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var cls = mode === 'add' ? 'tt-add-file-check' : 'tt-file-check';
      var chk = f.selected !== false ? ' checked' : '';
      html += '<div class="tt-tree-row tt-tree-file-row" style="padding-left:' + (indent + 4) + 'px">';
      html += '<input type="checkbox" class="' + cls + '" data-idx="' + f.index + '"' + chk + '>';
      html += '<span class="tt-tree-name" title="' + esc(f.fullPath) + '">' + esc(f.name) + '</span>';
      html += '<span class="tt-tree-size">' + fmtBytes(f.length) + '</span>';
      if (mode === 'props') {
        var fpct = Math.round((f.progress || 0) * 100);
        html += '<div class="tt-file-prog"><div class="tt-file-prog-fill" style="width:' + fpct + '%"></div></div>';
      }
      html += '</div>';
    }

    return html;
  }

})();
