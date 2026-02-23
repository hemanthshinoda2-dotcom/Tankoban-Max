(function registerTorrentTabModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.torrentTab = function initTorrentTabModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;
    var webTabs = bridge.webTabs;
    function dep(name) { return (bridge.deps || {})[name]; }
    var escapeHtml = function () { var fn = dep('escapeHtml'); return fn ? fn.apply(null, arguments) : ''; };
    var shortPath = function () { var fn = dep('shortPath'); return fn ? fn.apply(null, arguments) : ''; };
    var getSourceColor = function () { var fn = dep('getSourceColor'); return fn ? fn.apply(null, arguments) : '#555'; };
    var getSourceById = function () { var fn = dep('getSourceById'); return fn ? fn.apply(null, arguments) : null; };
    var siteNameFromUrl = function () { var fn = dep('siteNameFromUrl'); return fn ? fn.apply(null, arguments) : ''; };
    var getFaviconUrl = function () { var fn = dep('getFaviconUrl'); return fn ? fn.apply(null, arguments) : ''; };
    var showToast = function () { var fn = dep('showToast'); return fn && fn.apply(null, arguments); };
    var renderTabs = function () { var fn = dep('renderTabs'); return fn && fn.apply(null, arguments); };
    var syncLoadBar = function () { var fn = dep('syncLoadBar'); return fn && fn.apply(null, arguments); };
    var syncReloadStopButton = function () { var fn = dep('syncReloadStopButton'); return fn && fn.apply(null, arguments); };
    var updateNavButtons = function () { var fn = dep('updateNavButtons'); return fn && fn.apply(null, arguments); };
    var updateUrlDisplay = function () { var fn = dep('updateUrlDisplay'); return fn && fn.apply(null, arguments); };
    var scheduleSessionSave = function () { var fn = dep('scheduleSessionSave'); return fn && fn.apply(null, arguments); };
    var openBrowserForTab = function () { var fn = dep('openBrowserForTab'); return fn && fn.apply(null, arguments); };
    var createTab = function () { var fn = dep('createTab'); return fn && fn.apply(null, arguments); };
    var getActiveTab = function () { var fn = dep('getActiveTab'); return fn ? fn.apply(null, arguments) : null; };
    var ensureTabRuntime = function () { var fn = dep('ensureTabRuntime'); return fn ? fn.apply(null, arguments) : null; };
    var closeOmniSuggestions = function () { var fn = dep('closeOmniSuggestions'); return fn && fn.apply(null, arguments); };
    var setOmniIconForUrl = function () { var fn = dep('setOmniIconForUrl'); return fn && fn.apply(null, arguments); };
    var isWebModeActive = function () { var fn = dep('isWebModeActive'); return fn ? fn.apply(null, arguments) : false; };
    var renderHubAll = function () { var fn = dep('renderHubAll'); return fn && fn.apply(null, arguments); };
    var renderDownloadsPanel = function () { var fn = dep('renderDownloadsPanel'); return fn && fn.apply(null, arguments); };
    var renderHomeDownloads = function () { var fn = dep('renderHomeDownloads'); return fn && fn.apply(null, arguments); };

    function renderTorrentTab(tab) {
        if (!tab || tab.type !== 'torrent' || !el.torrentPanelInner) return;
        var entry = state.torrentTabEntries[tab.id];
        var torrentState = entry ? String(entry.state || '') : 'resolving_metadata';
        var html = '';

        if (torrentState === 'resolving_metadata') {
          var hash = String(tab.url || '');
          try { hash = new URL(tab.url).searchParams.get('xt') || tab.url; } catch (e) {}
          html = '<div class="wtResolving">' +
            '<div class="wtResolvingSpinner"></div>' +
            '<div>Resolving torrent metadata...</div>' +
            '<div class="wtResolvingHash">' + escapeHtml(hash) + '</div>' +
            '</div>';
        } else if (torrentState === 'metadata_ready') {
          html = renderTorrentMetadataReady(tab, entry);
        } else if (torrentState === 'downloading' || torrentState === 'paused') {
          html = renderTorrentDownloading(tab, entry);
        } else if (torrentState === 'completed' || torrentState === 'completed_pending' || torrentState === 'completed_with_errors') {
          html = renderTorrentCompleted(tab, entry);
        } else if (torrentState === 'error') {
          html = '<div class="wtHeader"><div class="wtName">' + escapeHtml(entry.name || 'Torrent') + '</div></div>' +
            '<div class="wtMeta"><span style="color:#e57373">Error: ' + escapeHtml(entry.error || 'Unknown error') + '</span></div>' +
            '<div class="wtActions"><button class="wtBtn" data-wt-action="close">Close Tab</button></div>';
        } else {
          html = '<div class="wtResolving"><div>Status: ' + escapeHtml(torrentState) + '</div></div>';
        }

        el.torrentPanelInner.innerHTML = html;
        bindTorrentTabEvents(tab);
      }

      var _VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.m2ts'];
      function _torrentHasVideoFiles(files) {
        if (!files || !files.length) return false;
        for (var i = 0; i < files.length; i++) {
          var name = String(files[i].name || files[i].path || '').toLowerCase();
          var dotIdx = name.lastIndexOf('.');
          if (dotIdx > 0 && _VIDEO_EXTS.indexOf(name.substring(dotIdx)) !== -1) return true;
        }
        return false;
      }

      function renderTorrentMetadataReady(tab, entry) {
        var files = entry.files || [];
        var totalSize = 0;
        var selectedCount = 0;
        for (var i = 0; i < files.length; i++) {
          totalSize += Number(files[i].length || 0);
          if (files[i].selected !== false) selectedCount++;
        }

        var html = '<div class="wtHeader">' +
          '<div class="wtName">' + escapeHtml(entry.name || 'Torrent') + '</div>' +
          '<div class="wtMeta">' +
            '<span>' + files.length + ' file' + (files.length !== 1 ? 's' : '') + '</span>' +
            '<span>' + formatBytes(totalSize) + '</span>' +
            '<span>' + entry.numPeers + ' peer' + (entry.numPeers !== 1 ? 's' : '') + '</span>' +
          '</div></div>';

        // File tree
        html += '<div class="wtFileTree">';
        html += buildFileTreeHtml(files, true);
        html += '</div>';

        // Sequential download toggle
        html += '<label class="wtSequential"><input type="checkbox" id="wtSequentialCheck" /> Download in sequential order (for streaming)</label>';

        // Save path — qBittorrent-style: path display + Browse button + mode shortcuts
        html += '<div class="wtDestSection">';
        html += '<div class="wtDestLabel">Save to</div>';
        html += '<div class="wtSavePath">' +
          '<span class="wtSavePathText" id="wtSavePathText">' + escapeHtml(_wtDestState.selectedPath || 'No folder selected') + '</span>' +
          '<button class="wtBtn" data-wt-action="browse" style="padding:4px 12px;font-size:12px">Browse...</button>' +
          '</div>';
        html += '<div class="wtDestModes">';
        var modes = ['videos', 'comics', 'books'];
        for (var m = 0; m < modes.length; m++) {
          var active = _wtDestState.mode === modes[m];
          html += '<button class="wtDestModeBtn' + (active ? ' active' : '') + '" data-wt-dest-mode="' + modes[m] + '">' +
            modes[m].charAt(0).toUpperCase() + modes[m].slice(1) + '</button>';
        }
        html += '</div>';
        html += '</div>';

        // Actions
        var hasVideo = _torrentHasVideoFiles(files);
        html += '<div class="wtActions">' +
          '<button class="wtBtn primary" data-wt-action="start" id="wtStartBtn">Start Download</button>' +
          (hasVideo ? '<button class="wtBtn videoLib" data-wt-action="addToVideoLib">Save to Video Library</button>' : '') +
          '<button class="wtBtn" data-wt-action="cancel">Cancel</button>' +
          '</div>';

        return html;
      }

      function renderTorrentDownloading(tab, entry) {
        var pct = Math.round((entry.progress || 0) * 100);
        var speedText = formatBytes(entry.downloadRate || 0) + '/s';
        var isPaused = entry.state === 'paused';

        var html = '<div class="wtHeader">' +
          '<div class="wtName">' + escapeHtml(entry.name || 'Torrent') + '</div>' +
          '<div class="wtMeta">' +
            '<span>' + pct + '%</span>' +
            '<span>' + speedText + '</span>' +
            '<span>' + entry.numPeers + ' peer' + (entry.numPeers !== 1 ? 's' : '') + '</span>' +
            '<span>' + formatBytes(entry.downloaded || 0) + ' / ' + formatBytes(entry.totalSize || 0) + '</span>' +
            (isPaused ? '<span style="color:var(--vx-accent,rgba(var(--chrome-rgb),.55))">Paused</span>' : '') +
          '</div></div>';

        // Video library badge
        if (entry.videoLibrary) {
          html += '<div class="wtVideoLibBadge">Streaming to Video Library</div>';
        }

        // Overall progress bar
        html += '<div class="wtProgressWrap"><div class="wtProgressFill" style="width:' + pct + '%"></div></div>';

        // File tree with per-file progress (not editable)
        var files = entry.files || [];
        html += '<div class="wtFileTree">';
        html += buildFileTreeHtml(files, false);
        html += '</div>';

        // Actions
        html += '<div class="wtActions">';
        if (isPaused) {
          html += '<button class="wtBtn primary" data-wt-action="resume">Resume</button>';
        } else {
          html += '<button class="wtBtn" data-wt-action="pause">Pause</button>';
        }
        html += '<button class="wtBtn" data-wt-action="cancel">Cancel</button>';
        html += '</div>';

        return html;
      }

      function renderTorrentCompleted(tab, entry) {
        var html = '<div class="wtHeader">' +
          '<div class="wtName"><span class="wtCompleteIcon">&#10003;</span>' + escapeHtml(entry.name || 'Torrent') + '</div>' +
          '<div class="wtMeta"><span>Complete!</span><span>' + formatBytes(entry.totalSize || entry.downloaded || 0) + '</span></div>' +
          '</div>';

        if (entry.routedFiles || entry.ignoredFiles || entry.failedFiles) {
          html += '<div class="wtCompleteStats">';
          if (entry.routedFiles) html += '<span>Routed: ' + entry.routedFiles + '</span>';
          if (entry.ignoredFiles) html += '<span>Ignored: ' + entry.ignoredFiles + '</span>';
          if (entry.failedFiles) html += '<span style="color:#e57373">Failed: ' + entry.failedFiles + '</span>';
          html += '</div>';
        }

        // Video library badge
        if (entry.videoLibrary) {
          html += '<div class="wtVideoLibBadge complete">Available in Video Library</div>';
        }

        // Show destination if set
        if (entry.destinationRoot) {
          html += '<div class="wtSavePath"><span class="wtSavePathText">' + escapeHtml(entry.destinationRoot) + '</span></div>';
        }

        // If completed_pending, show save path picker
        if (entry.state === 'completed_pending') {
          html += '<div class="wtDestSection"><div class="wtDestLabel">Save to</div>' +
            '<div class="wtSavePath"><span class="wtSavePathText" id="wtSavePathText">' + escapeHtml(_wtDestState.selectedPath || 'No folder selected') + '</span>' +
            '<button class="wtBtn" data-wt-action="browse" style="padding:4px 12px;font-size:12px">Browse...</button></div></div>';
          html += '<div class="wtActions"><button class="wtBtn primary" data-wt-action="setDest">Route Files</button><button class="wtBtn" data-wt-action="close">Close Tab</button></div>';
        } else {
          html += '<div class="wtActions"><button class="wtBtn" data-wt-action="close">Close Tab</button></div>';
        }

        return html;
      }

      // ── File tree builder ──

      function buildFileTreeHtml(files, editable) {
        if (!files || !files.length) return '<div style="padding:12px;color:rgba(var(--chrome-rgb),.4);font-size:12px">No files</div>';

        // Group files by folder path
        var folders = {}; // folderPath -> [file]
        var rootFiles = [];
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          var path = String(f.path || f.name || '');
          var slashIdx = path.lastIndexOf('/');
          if (slashIdx > 0) {
            var folder = path.substring(0, slashIdx);
            if (!folders[folder]) folders[folder] = [];
            folders[folder].push(f);
          } else {
            rootFiles.push(f);
          }
        }

        var html = '';
        var folderKeys = Object.keys(folders).sort();

        for (var fi = 0; fi < folderKeys.length; fi++) {
          var folderPath = folderKeys[fi];
          var folderFiles = folders[folderPath];
          var folderSize = 0;
          for (var fs = 0; fs < folderFiles.length; fs++) folderSize += Number(folderFiles[fs].length || 0);

          html += '<div class="wtFolderRow" data-folder="' + escapeHtml(folderPath) + '">' +
            '<svg class="wtFolderChevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 3l5 5-5 5"/></svg>' +
            '<span>' + escapeHtml(folderPath) + '</span>' +
            '<span class="wtFileSize">' + formatBytes(folderSize) + '</span>' +
            '</div>';

          for (var ffi = 0; ffi < folderFiles.length; ffi++) {
            html += buildFileRowHtml(folderFiles[ffi], editable, folderPath);
          }
        }

        // Root-level files
        for (var ri = 0; ri < rootFiles.length; ri++) {
          html += buildFileRowHtml(rootFiles[ri], editable, '');
        }

        return html;
      }

      function buildFileRowHtml(file, editable, folderPath) {
        var name = String(file.name || file.path || '');
        var displayName = name;
        // Strip folder prefix from display name
        if (folderPath && displayName.indexOf(folderPath + '/') === 0) {
          displayName = displayName.substring(folderPath.length + 1);
        }
        var checked = file.selected !== false;
        var pct = Math.round((Number(file.progress || 0)) * 100);

        var html = '<div class="wtFileRow" data-file-index="' + file.index + '"' +
          (folderPath ? ' data-folder="' + escapeHtml(folderPath) + '"' : '') + '>';

        if (editable) {
          html += '<input type="checkbox" class="wtFileCheck" data-file-index="' + file.index + '"' + (checked ? ' checked' : '') + ' />';
        }

        html += '<span class="wtFileName" title="' + escapeHtml(name) + '">' + escapeHtml(displayName) + '</span>';
        html += '<span class="wtFileSize">' + formatBytes(file.length || 0) + '</span>';

        if (!editable) {
          html += '<div class="wtFileProgress"><div class="wtFileProgressFill" style="width:' + pct + '%"></div></div>';
        }

        html += '</div>';
        return html;
      }

      // ── Save path state ──

      var _wtDestState = { mode: 'videos', selectedPath: '' };

      function loadDefaultSavePath(mode) {
        _wtDestState.mode = mode || 'videos';
        if (!api.webSources || !api.webSources.listDestinationFolders) return;
        api.webSources.listDestinationFolders({ mode: _wtDestState.mode, path: '' }).then(function (res) {
          if (!res || !res.ok || !res.folders || !res.folders.length) return;
          // Auto-select the first root folder of this mode
          _wtDestState.selectedPath = String(res.folders[0].path || '');
          var tab = getActiveTab();
          if (tab && tab.type === 'torrent') renderTorrentTab(tab);
        }).catch(function () {});
      }

      // ── Torrent tab event delegation ──

      function bindTorrentTabEvents(tab) {
        if (!el.torrentPanelInner) return;
        el.torrentPanelInner.onclick = function (e) {
          var target = e.target;
          if (!target) return;

          // Action buttons
          var actionBtn = target.closest('[data-wt-action]');
          if (actionBtn) {
            var action = actionBtn.getAttribute('data-wt-action');
            handleTorrentAction(tab, action);
            return;
          }

          // Folder collapse toggle
          var folderRow = target.closest('.wtFolderRow');
          if (folderRow) {
            folderRow.classList.toggle('collapsed');
            var folderPath = folderRow.getAttribute('data-folder');
            var sibling = folderRow.nextElementSibling;
            while (sibling && sibling.classList.contains('wtFileRow')) {
              if (sibling.getAttribute('data-folder') === folderPath) {
                sibling.classList.toggle('hidden', folderRow.classList.contains('collapsed'));
              }
              sibling = sibling.nextElementSibling;
            }
            return;
          }

          // Mode quick-select buttons — switch to first root of that mode
          var modeBtn = target.closest('[data-wt-dest-mode]');
          if (modeBtn) {
            var mode = modeBtn.getAttribute('data-wt-dest-mode');
            loadDefaultSavePath(mode);
            return;
          }
        };

        // Checkbox change for file selection
        el.torrentPanelInner.onchange = function (e) {
          var target = e.target;
          if (!target || !target.classList.contains('wtFileCheck')) return;
          var fileIdx = parseInt(target.getAttribute('data-file-index'), 10);
          var entry = state.torrentTabEntries[tab.id];
          if (entry && entry.files) {
            for (var i = 0; i < entry.files.length; i++) {
              if (entry.files[i].index === fileIdx) {
                entry.files[i].selected = !!target.checked;
                break;
              }
            }
          }
        };
      }

      function handleTorrentAction(tab, action) {
        var entry = state.torrentTabEntries[tab.id];
        var torrentId = tab.torrentId;
        if (!torrentId) return;

        if (action === 'browse') {
          // Open native OS folder picker
          var browseApi = api.webSources && api.webSources.pickSaveFolder;
          if (!browseApi) { showToast('Browse not available'); return; }
          browseApi({ defaultPath: _wtDestState.selectedPath || '' }).then(function (res) {
            if (!res || !res.ok || !res.path) return;
            _wtDestState.selectedPath = res.path;
            var pathEl = document.getElementById('wtSavePathText');
            if (pathEl) pathEl.textContent = res.path;
          }).catch(function () {});
          return;
        }

        if (action === 'start') {
          // Gather selected file indices
          var selectedIndices = [];
          if (entry && entry.files) {
            for (var i = 0; i < entry.files.length; i++) {
              if (entry.files[i].selected !== false) selectedIndices.push(entry.files[i].index);
            }
          }
          if (!selectedIndices.length) {
            showToast('Select at least one file');
            return;
          }
          if (!_wtDestState.selectedPath) {
            showToast('Pick a destination folder first');
            return;
          }
          var seqCheck = document.getElementById('wtSequentialCheck');
          var sequential = !!(seqCheck && seqCheck.checked);
          api.webTorrent.selectFiles({
            id: torrentId,
            selectedIndices: selectedIndices,
            destinationRoot: _wtDestState.selectedPath,
            sequential: sequential
          }).then(function (res) {
            if (res && res.ok) {
              showToast('Download started');
              // Force immediate state update and re-render
              if (entry) entry.state = 'downloading';
              state.torrentTabEntries[tab.id] = entry;
              renderTorrentTab(tab);
              refreshTorrentState();
            } else {
              showToast((res && res.error) ? String(res.error) : 'Failed to start download');
            }
          }).catch(function () { showToast('Failed to start download'); });
        } else if (action === 'pause') {
          api.webTorrent.pause({ id: torrentId }).then(function () { refreshTorrentState(); }).catch(function () {});
        } else if (action === 'resume') {
          api.webTorrent.resume({ id: torrentId }).then(function () { refreshTorrentState(); }).catch(function () {});
        } else if (action === 'cancel') {
          api.webTorrent.cancel({ id: torrentId }).then(function () {
            refreshTorrentState();
            closeTab(tab.id);
          }).catch(function () {});
        } else if (action === 'close') {
          closeTab(tab.id);
        } else if (action === 'setDest') {
          if (!_wtDestState.selectedPath) {
            showToast('Pick a destination folder');
            return;
          }
          api.webTorrent.setDestination({
            id: torrentId,
            destinationRoot: _wtDestState.selectedPath
          }).then(function (res) {
            if (res && res.ok) {
              showToast('Files routed');
              refreshTorrentState();
            } else {
              showToast((res && res.error) ? String(res.error) : 'Failed to set destination');
            }
          }).catch(function () { showToast('Failed to route files'); });
        } else if (action === 'addToVideoLib') {
          // Open folder picker, then add torrent to video library
          var browseApi2 = api.webSources && api.webSources.pickSaveFolder;
          if (!browseApi2) { showToast('Browse not available'); return; }
          browseApi2({ defaultPath: _wtDestState.selectedPath || '' }).then(function (res) {
            if (!res || !res.ok || !res.path) return;
            var label = (entry && entry.name) ? entry.name : 'Torrent';
            showToast('Saving to Video Library \u2014 ' + label);
            api.webTorrent.addToVideoLibrary({
              id: torrentId,
              destinationRoot: res.path
            }).then(function (result) {
              if (result && result.ok) {
                showToast('Added to Video Library');
                if (entry) {
                  entry.state = 'downloading';
                  entry.videoLibrary = true;
                  entry.showFolderPath = result.showPath || '';
                }
                state.torrentTabEntries[tab.id] = entry;
                renderTorrentTab(tab);
                refreshTorrentState();
              } else {
                showToast((result && result.error) ? String(result.error) : 'Failed to add to video library');
              }
            }).catch(function (err) { showToast('Failed: ' + (err && err.message || err)); });
          }).catch(function () {});
        }
      }

      // ── Torrent tab IPC event updaters ──

      // Preserve the user's local file checkbox state when merging backend updates.
      // Backend sends selected=false for all files in metadata_ready (files deselected
      // until user picks), but the user may have checked files locally.
      function mergeLocalFileSelection(newEntry, prevEntry) {
        if (!newEntry || !newEntry.files || !prevEntry || !prevEntry.files) return;
        if (newEntry.state !== 'metadata_ready' && newEntry.state !== 'completed_pending') return;
        var prevMap = {};
        for (var i = 0; i < prevEntry.files.length; i++) {
          prevMap[prevEntry.files[i].index] = prevEntry.files[i].selected;
        }
        for (var j = 0; j < newEntry.files.length; j++) {
          var idx = newEntry.files[j].index;
          if (prevMap[idx] !== undefined) {
            newEntry.files[j].selected = prevMap[idx];
          }
        }
      }

      function updateTorrentTabFromEntry(torrentId, entryData) {
        var tab = findTorrentTabByTorrentId(torrentId);
        if (!tab) return;
        var prevEntry = state.torrentTabEntries[tab.id];
        var entry = normalizeTorrentEntry(entryData);
        if (!entry) return;
        mergeLocalFileSelection(entry, prevEntry);
        state.torrentTabEntries[tab.id] = entry;
        if (entry.name && tab.title !== entry.name) {
          tab.title = entry.name;
          renderTabs();
        }
        // When metadata first arrives: check all files by default + auto-select save path
        var wasResolving = !prevEntry || prevEntry.state === 'resolving_metadata';
        if (wasResolving && entry.state === 'metadata_ready') {
          // Check all files by default (qBittorrent behavior)
          if (entry.files) {
            for (var fi = 0; fi < entry.files.length; fi++) entry.files[fi].selected = true;
          }
          loadDefaultSavePath(_wtDestState.mode);
        }
        // Only re-render if this is the active tab AND state actually changed.
        // In metadata_ready, the user is interacting (checkboxes, dest picker) —
        // don't blow away the DOM on every 800ms progress tick.
        var stateChanged = !prevEntry || prevEntry.state !== entry.state;
        if (state.activeTabId === tab.id && stateChanged) {
          renderTorrentTab(tab);
        }
      }

      function updateTorrentTabProgress(torrentId, entryData) {
        var tab = findTorrentTabByTorrentId(torrentId);
        if (!tab) return;
        var prevEntry = state.torrentTabEntries[tab.id];
        var entry = normalizeTorrentEntry(entryData);
        if (!entry) return;
        mergeLocalFileSelection(entry, prevEntry);
        state.torrentTabEntries[tab.id] = entry;
        if (state.activeTabId !== tab.id || !el.torrentPanelInner) return;
        // If state changed (e.g. metadata_ready → downloading), do a full re-render
        var stateChanged = prevEntry && prevEntry.state !== entry.state;
        if (stateChanged) {
          renderTorrentTab(tab);
          return;
        }
        // Lightweight DOM update — only update progress values, not full re-render
        var pct = Math.round((entry.progress || 0) * 100);
        // Update overall progress bar
        var fillEl = el.torrentPanelInner.querySelector('.wtProgressFill');
        if (fillEl) fillEl.style.width = pct + '%';
        // Update meta text
        var metaEl = el.torrentPanelInner.querySelector('.wtMeta');
        if (metaEl) {
          metaEl.innerHTML = '<span>' + pct + '%</span>' +
            '<span>' + formatBytes(entry.downloadRate || 0) + '/s</span>' +
            '<span>' + entry.numPeers + ' peer' + (entry.numPeers !== 1 ? 's' : '') + '</span>' +
            '<span>' + formatBytes(entry.downloaded || 0) + ' / ' + formatBytes(entry.totalSize || 0) + '</span>' +
            (entry.state === 'paused' ? '<span style="color:var(--vx-accent,rgba(var(--chrome-rgb),.55))">Paused</span>' : '');
        }
        // Update per-file progress bars
        if (entry.files) {
          for (var i = 0; i < entry.files.length; i++) {
            var fileFill = el.torrentPanelInner.querySelector('.wtFileRow[data-file-index="' + entry.files[i].index + '"] .wtFileProgressFill');
            if (fileFill) fileFill.style.width = Math.round((entry.files[i].progress || 0) * 100) + '%';
          }
        }
      }

    return {
      renderTorrentTab: renderTorrentTab,
      _torrentHasVideoFiles: _torrentHasVideoFiles,
      renderTorrentMetadataReady: renderTorrentMetadataReady,
      renderTorrentDownloading: renderTorrentDownloading,
      renderTorrentCompleted: renderTorrentCompleted,
      buildFileTreeHtml: buildFileTreeHtml,
      buildFileRowHtml: buildFileRowHtml,
      loadDefaultSavePath: loadDefaultSavePath,
      bindTorrentTabEvents: bindTorrentTabEvents,
      handleTorrentAction: handleTorrentAction,
      mergeLocalFileSelection: mergeLocalFileSelection,
      updateTorrentTabFromEntry: updateTorrentTabFromEntry,
      updateTorrentTabProgress: updateTorrentTabProgress
    };
  };
})();
