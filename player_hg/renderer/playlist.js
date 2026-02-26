// Playlist — folder-scoped playlist drawer with auto-advance.
// Matches Qt player's PlaylistDrawer (run_player.py lines 2429-2555).
(function () {
  'use strict';

  var naturalCompare = window.TankoPlayer.utils.naturalCompare;

  var drawer = null;
  var listEl = null;
  var folderLabel = null;
  var autoAdvanceCheckbox = null;
  var prevBtn = null;
  var nextBtn = null;

  var playlist = [];       // array of full paths
  var currentIndex = -1;
  var autoAdvance = true;
  var loadFileFn = null;   // set by init
  var fixedContext = null; // optional explicit playlist context from host

  // ── Build drawer content ──

  function buildContent(contentEl) {
    folderLabel = document.createElement('div');
    folderLabel.className = 'playlist-folder';
    folderLabel.textContent = '';
    contentEl.appendChild(folderLabel);

    // Auto-advance checkbox
    var checkRow = document.createElement('label');
    checkRow.className = 'playlist-check-row';
    autoAdvanceCheckbox = document.createElement('input');
    autoAdvanceCheckbox.type = 'checkbox';
    autoAdvanceCheckbox.checked = true;
    autoAdvanceCheckbox.addEventListener('change', function () {
      autoAdvance = autoAdvanceCheckbox.checked;
      window.TankoPlayer.toast.show(autoAdvance ? 'Auto-advance on' : 'Auto-advance off');
    });
    var checkLabel = document.createElement('span');
    checkLabel.textContent = 'Auto-advance';
    checkRow.appendChild(autoAdvanceCheckbox);
    checkRow.appendChild(checkLabel);
    contentEl.appendChild(checkRow);

    // Episode list
    listEl = document.createElement('div');
    listEl.className = 'playlist-list';
    contentEl.appendChild(listEl);

    // Navigation buttons
    var navRow = document.createElement('div');
    navRow.className = 'playlist-nav';

    prevBtn = document.createElement('button');
    prevBtn.className = 'drawer-btn';
    prevBtn.textContent = '\u23EE\uFE0E'; // ⏮
    prevBtn.title = 'Previous episode';
    prevBtn.addEventListener('click', function () { navigate(-1); });

    nextBtn = document.createElement('button');
    nextBtn.className = 'drawer-btn';
    nextBtn.textContent = '\u23ED\uFE0E'; // ⏭
    nextBtn.title = 'Next episode';
    nextBtn.addEventListener('click', function () { navigate(+1); });

    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);
    contentEl.appendChild(navRow);
  }

  // ── Playlist logic ──

  function buildFromFolder(filePath) {
    if (!filePath) return Promise.resolve();
    if (fixedContext && Array.isArray(fixedContext.paths) && fixedContext.paths.length) {
      setPlaylist(fixedContext.paths, filePath, fixedContext.folderLabel || '');
      return Promise.resolve();
    }
    // Extract folder from file path
    var folder = filePath.replace(/\\/g, '/');
    var lastSlash = folder.lastIndexOf('/');
    if (lastSlash >= 0) folder = folder.substring(0, lastSlash);
    // On Windows, backslash version for IPC
    var folderNative = filePath.replace(/\//g, '\\');
    var lastBackslash = folderNative.lastIndexOf('\\');
    if (lastBackslash >= 0) folderNative = folderNative.substring(0, lastBackslash);

    if (!window.PlayerBridge || !window.PlayerBridge.listFolderVideos) {
      playlist = [filePath];
      currentIndex = 0;
      renderList();
      return Promise.resolve();
    }

    return window.PlayerBridge.listFolderVideos(folderNative).then(function (files) {
      if (!files || !files.length) {
        playlist = [filePath];
        currentIndex = 0;
      } else {
        // Natural sort
        playlist = files.slice().sort(naturalCompare);
        // Find current file
        var normalizedPath = filePath.replace(/\\/g, '/');
        currentIndex = -1;
        for (var i = 0; i < playlist.length; i++) {
          if (playlist[i].replace(/\\/g, '/') === normalizedPath) {
            currentIndex = i;
            break;
          }
        }
        if (currentIndex === -1) {
          playlist.unshift(filePath);
          currentIndex = 0;
        }
      }
      folderLabel.textContent = folder;
      renderList();
    });
  }

  function setPlaylist(paths, currentPath, label) {
    var out = Array.isArray(paths) ? paths.filter(function (p) { return !!p; }) : [];
    if (!out.length && currentPath) out = [String(currentPath)];
    playlist = out.slice();
    var normalizedCurrent = String(currentPath || '').replace(/\\/g, '/');
    currentIndex = -1;
    for (var i = 0; i < playlist.length; i++) {
      if (String(playlist[i]).replace(/\\/g, '/') === normalizedCurrent) {
        currentIndex = i;
        break;
      }
    }
    if (currentIndex < 0 && playlist.length) currentIndex = 0;
    if (folderLabel) folderLabel.textContent = String(label || '');
    renderList();
  }

  function setContext(ctx) {
    if (!ctx || !Array.isArray(ctx.paths) || !ctx.paths.length) {
      fixedContext = null;
      return;
    }
    fixedContext = {
      paths: ctx.paths.slice(),
      folderLabel: String(ctx.folderLabel || ''),
    };
    setPlaylist(fixedContext.paths, ctx.currentPath || fixedContext.paths[0], fixedContext.folderLabel);
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    for (var i = 0; i < playlist.length; i++) {
      var item = document.createElement('div');
      item.className = 'playlist-item' + (i === currentIndex ? ' active' : '');
      var name = playlist[i].replace(/\\/g, '/').split('/').pop();
      // Strip extension
      name = name.replace(/\.[^.]+$/, '');
      var prefix = i === currentIndex ? '\u25B6 ' : ''; // ▶
      item.textContent = prefix + name;
      item.dataset.index = i;
      item.addEventListener('dblclick', onItemDoubleClick);
      listEl.appendChild(item);
    }
    // Scroll active item into view
    var activeItem = listEl.querySelector('.playlist-item.active');
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });

    // Update nav buttons
    if (prevBtn) prevBtn.disabled = currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentIndex >= playlist.length - 1;
  }

  function onItemDoubleClick(e) {
    var idx = parseInt(e.currentTarget.dataset.index, 10);
    if (isFinite(idx) && idx >= 0 && idx < playlist.length) {
      loadEpisode(idx);
    }
  }

  function navigate(direction) {
    var newIdx = currentIndex + direction;
    if (newIdx >= 0 && newIdx < playlist.length) {
      loadEpisode(newIdx);
    }
  }

  function loadEpisode(idx) {
    currentIndex = idx;
    renderList();
    if (loadFileFn && playlist[idx]) {
      loadFileFn(playlist[idx], { source: 'playlist', index: idx, size: playlist.length });
    }
  }

  function nextEpisode() {
    if (currentIndex < playlist.length - 1) {
      loadEpisode(currentIndex + 1);
    }
  }

  function prevEpisode() {
    if (currentIndex > 0) {
      loadEpisode(currentIndex - 1);
    }
  }

  // Called when EOF is reached — auto-advance if enabled
  function onEnded() {
    if (autoAdvance && currentIndex < playlist.length - 1) {
      nextEpisode();
    }
  }

  // ── Init / Destroy ──

  function init(loadFile) {
    loadFileFn = loadFile;
    drawer = window.TankoPlayer.createDrawer({
      id: 'playlistDrawer',
      title: 'Playlist',
      side: 'right',
    });
    buildContent(drawer.contentEl);
  }

  function toggle() {
    if (drawer) drawer.toggle();
  }

  function isOpen() {
    return drawer ? drawer.isOpen() : false;
  }

  function destroy() {
    if (drawer && drawer.el && drawer.el.parentNode) {
      drawer.el.parentNode.removeChild(drawer.el);
    }
    drawer = null;
    playlist = [];
    currentIndex = -1;
  }

  window.TankoPlayer = window.TankoPlayer || {};
  window.TankoPlayer.playlist = {
    init: init,
    destroy: destroy,
    toggle: toggle,
    isOpen: isOpen,
    setContext: setContext,
    setPlaylist: setPlaylist,
    buildFromFolder: buildFromFolder,
    nextEpisode: nextEpisode,
    prevEpisode: prevEpisode,
    onEnded: onEnded,
  };
})();
