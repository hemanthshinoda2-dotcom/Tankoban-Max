(function registerHubModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.hub = function initHubModule(bridge) {
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
    var renderDownloadsPanel = function () { var fn = dep('renderDownloadsPanel'); return fn && fn.apply(null, arguments); };
    var renderHomeDownloads = function () { var fn = dep('renderHomeDownloads'); return fn && fn.apply(null, arguments); };

    function isTorrentActiveState(stateStr) {
        var s = String(stateStr || '').toLowerCase();
        return s === 'downloading' || s === 'paused' || s === 'checking';
      }

      function isTorrentCompletedState(stateStr) {
        var s = String(stateStr || '').toLowerCase();
        return s === 'completed' || s === 'completed_pending' || s === 'completed_with_errors';
      }

      function isTorrentErroredState(stateStr) {
        var s = String(stateStr || '').toLowerCase();
        return s === 'failed' || s === 'error' || s === 'cancelled';
      }

      function formatWhen(ts) {
        var n = Number(ts || 0);
        if (!n) return '';
        try { return new Date(n).toLocaleString(); } catch (e) { return ''; }
      }

      function pctText(p) {
        var n = Number(p);
        if (!isFinite(n)) return '';
        if (n < 0) n = 0;
        if (n > 1) n = 1;
        return Math.round(n * 100) + '%';
      }

      function renderHubDirectActive() {
        if (!el.hubDirectActiveList || !el.hubDirectActiveEmpty) return;
        var active = [];
        for (var i = 0; i < state.downloads.length; i++) {
          var d = state.downloads[i];
          if (!d) continue;
          if (!isDirectActiveState(d.state)) continue;
          active.push(d);
        }
        active.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });

        if (!active.length) {
          el.hubDirectActiveList.innerHTML = '';
          el.hubDirectActiveEmpty.classList.remove('hidden');
          return;
        }
        el.hubDirectActiveEmpty.classList.add('hidden');

        var html = '';
        for (var j = 0; j < active.length; j++) {
          var x = active[j];
          var pTxt = pctText(x.progress);
          var sub = (x.library ? ('\u2192 ' + x.library) : 'Direct download') + (pTxt ? (' \u2022 ' + pTxt) : '');
          var pauseResume = '';
          var canPauseAction = !!(x.canPause && api && api.webSources && api.webSources.pauseDownload);
          var canResumeAction = !!(x.canResume && api && api.webSources && api.webSources.resumeDownload);
          var canCancelAction = !!(x.canCancel && api && api.webSources && api.webSources.cancelDownload);
          if (canPauseAction || canResumeAction) {
            if (String(x.state) === 'paused') {
              if (canResumeAction) pauseResume = '<button class="btn btn-ghost btn-sm" data-direct-action="resume" data-direct-id="' + escapeHtml(x.id) + '">Resume</button>';
            } else if (canPauseAction) {
              pauseResume = '<button class="btn btn-ghost btn-sm" data-direct-action="pause" data-direct-id="' + escapeHtml(x.id) + '">Pause</button>';
            }
          }

          html += '' +
            '<div class="webHubItem" data-direct-open-id="' + escapeHtml(x.id) + '">' +
              '<div class="webHubItemTop">' +
                '<div class="webHubItemTitle">' + escapeHtml(x.filename || 'Download') + '</div>' +
                '<span class="webHubBadge">Direct</span>' +
              '</div>' +
              '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
              (pTxt ? ('<div class="webHubProgress"><div class="webHubProgressFill" style="width:' + escapeHtml(pTxt) + '"></div></div>') : '') +
              '<div class="webHubItemActions">' +
                pauseResume +
                (canCancelAction ? ('<button class="btn btn-ghost btn-sm" data-direct-action="cancel" data-direct-id="' + escapeHtml(x.id) + '">Cancel</button>') : '') +
              '</div>' +
            '</div>';
        }
        el.hubDirectActiveList.innerHTML = html;
      }

      function normalizeTorrentEntry(t) {
        if (!t) return null;
        return {
          id: String(t.id || ''),
          infoHash: String(t.infoHash || ''),
          name: String(t.name || ''),
          state: String(t.state || ''),
          progress: Number(t.progress || 0),
          downloadRate: Number(t.downloadRate || 0),
          uploadSpeed: Number(t.uploadSpeed || 0),
          uploaded: Number(t.uploaded || 0),
          downloaded: Number(t.downloaded || 0),
          totalSize: Number(t.totalSize || 0),
          numPeers: Number(t.numPeers || 0),
          startedAt: Number(t.startedAt || 0),
          finishedAt: t.finishedAt != null ? Number(t.finishedAt) : null,
          error: String(t.error || ''),
          routedFiles: Number(t.routedFiles || 0),
          ignoredFiles: Number(t.ignoredFiles || 0),
          failedFiles: Number(t.failedFiles || 0),
          metadataReady: !!t.metadataReady,
          files: Array.isArray(t.files) ? t.files : null,
          destinationRoot: t.destinationRoot ? String(t.destinationRoot) : '',
        };
      }

      function findActiveTorrentById(id) {
        var key = String(id || '');
        if (!key) return null;
        for (var i = 0; i < state.torrentActive.length; i++) {
          var t = state.torrentActive[i];
          if (t && String(t.id || '') === key) return t;
        }
        return null;
      }

      function renderHubTorrentActive() {
        if (!el.hubTorrentActiveList || !el.hubTorrentActiveEmpty) return;
        var filterKey = String(state.hubTorrentFilter || 'active').toLowerCase();
        var combined = [];
        var seen = Object.create(null);
        var activeById = Object.create(null);
        for (var ai = 0; ai < state.torrentActive.length; ai++) {
          var a = state.torrentActive[ai];
          if (!a || !a.id) continue;
          seen[a.id] = 1;
          activeById[a.id] = 1;
          combined.push(a);
        }
        for (var hi = 0; hi < state.torrentHistory.length; hi++) {
          var h = state.torrentHistory[hi];
          if (!h || !h.id || seen[h.id]) continue;
          combined.push(h);
        }
        var rows = [];
        for (var i = 0; i < combined.length; i++) {
          var t = combined[i];
          if (!t) continue;
          var s = String(t.state || '').toLowerCase();
          var isLive = !!activeById[String(t.id || '')];
          if (filterKey === 'active' && !isLive) continue;
          if (filterKey === 'paused' && s !== 'paused') continue;
          if (filterKey === 'completed' && !isTorrentCompletedState(s)) continue;
          if (filterKey === 'errored' && !isTorrentErroredState(s) && s !== 'completed_with_errors') continue;
          rows.push(t);
        }
        rows.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });

        if (!rows.length) {
          el.hubTorrentActiveList.innerHTML = '';
          if (el.hubTorrentActiveEmpty) {
            var emptyText = 'No torrents.';
            if (filterKey === 'active') emptyText = 'No active torrent downloads.';
            else if (filterKey === 'paused') emptyText = 'No paused torrents.';
            else if (filterKey === 'completed') emptyText = 'No completed torrents.';
            else if (filterKey === 'errored') emptyText = 'No errored torrents.';
            el.hubTorrentActiveEmpty.textContent = emptyText;
          }
          el.hubTorrentActiveEmpty.classList.remove('hidden');
          return;
        }
        el.hubTorrentActiveEmpty.classList.add('hidden');

        var html = '';
        for (var j = 0; j < rows.length; j++) {
          var x = rows[j];
          var pTxt = pctText(x.progress);
          var speed = x.downloadRate > 0 ? (' \u2022 ' + formatSpeed(x.downloadRate)) : '';
          var stateLower = String(x.state || '').toLowerCase();
          var isLive = !!activeById[String(x.id || '')];
          var stateLabel = x.state || 'downloading';
          if (!isLive && isTorrentActiveState(stateLower)) stateLabel = 'session ended';
          var sub = stateLabel + (pTxt ? (' \u2022 ' + pTxt) : '') + speed;
          var pauseResume = '';
          if (isLive && stateLower === 'paused') {
            pauseResume = '<button class="btn btn-ghost btn-sm" data-torrent-action="resume" data-torrent-id="' + escapeHtml(x.id) + '">Resume</button>';
          } else if (isLive && isTorrentActiveState(stateLower)) {
            pauseResume = '<button class="btn btn-ghost btn-sm" data-torrent-action="pause" data-torrent-id="' + escapeHtml(x.id) + '">Pause</button>';
          }
          var actionButtons = pauseResume;
          if (isLive && isTorrentActiveState(stateLower)) {
            actionButtons += '<button class="btn btn-ghost btn-sm" data-torrent-action="cancel" data-torrent-id="' + escapeHtml(x.id) + '">Cancel</button>';
          } else {
            actionButtons += '<button class="btn btn-ghost btn-sm" data-torrent-action="remove-history" data-torrent-id="' + escapeHtml(x.id) + '">Remove</button>';
          }

          html += '' +
            '<div class="webHubItem">' +
              '<div class="webHubItemTop">' +
                '<div class="webHubItemTitle">' + escapeHtml(x.name || x.infoHash || 'Torrent') + '</div>' +
                '<span class="webHubBadge">Torrent</span>' +
              '</div>' +
              '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
              (pTxt ? ('<div class="webHubProgress"><div class="webHubProgressFill" style="width:' + escapeHtml(pTxt) + '"></div></div>') : '') +
              '<div class="webHubItemActions">' +
                actionButtons +
              '</div>' +
            '</div>';
        }
        el.hubTorrentActiveList.innerHTML = html;
      }

      function applyTorrentBulkAction(action) {
        if (!api.webTorrent) return;
        var ids = [];
        for (var i = 0; i < state.torrentActive.length; i++) {
          var t = state.torrentActive[i];
          if (!t || !t.id) continue;
          var s = String(t.state || '').toLowerCase();
          if (action === 'pause' && s === 'downloading') ids.push(t.id);
          else if (action === 'resume' && s === 'paused') ids.push(t.id);
          else if (action === 'cancel' && isTorrentActiveState(s)) ids.push(t.id);
        }
        if (!ids.length) {
          showToast('No torrents to ' + action);
          return;
        }
        var calls = [];
        var invoke = null;
        for (var j = 0; j < ids.length; j++) {
          var id = ids[j];
          if (action === 'pause' && api.webTorrent.pause) invoke = api.webTorrent.pause;
          else if (action === 'resume' && api.webTorrent.resume) invoke = api.webTorrent.resume;
          else if (action === 'cancel' && api.webTorrent.cancel) invoke = api.webTorrent.cancel;
          else invoke = null;
          if (!invoke) continue;
          calls.push(
            invoke({ id: id }).then(function (res) {
              return {
                ok: !(res && res.ok === false),
                error: (res && res.error) ? String(res.error) : ''
              };
            }).catch(function (err) {
              return {
                ok: false,
                error: String((err && err.message) || err || 'Request failed')
              };
            })
          );
        }
        if (!calls.length) {
          showToast('Action unavailable: ' + action);
          return;
        }
        Promise.all(calls).then(function (results) {
          var okCount = 0;
          var failCount = 0;
          for (var k = 0; k < results.length; k++) {
            if (results[k] && results[k].ok) okCount++;
            else failCount++;
          }
          var actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
          if (failCount === 0) {
            showToast(actionLabel + ' applied to ' + okCount + ' torrent' + (okCount === 1 ? '' : 's'));
          } else if (okCount === 0) {
            showToast(actionLabel + ' failed for ' + failCount + ' torrent' + (failCount === 1 ? '' : 's'));
          } else {
            showToast(actionLabel + ' applied to ' + okCount + ' torrent' + (okCount === 1 ? '' : 's') + ' (' + failCount + ' failed)');
          }
          refreshTorrentState();
        }).catch(function () {
          refreshTorrentState();
        });
      }

      function buildUnifiedHistory() {
        var merged = [];
        for (var i = 0; i < state.downloads.length; i++) {
          var d = state.downloads[i];
          if (!d || !d.id) continue;
          if (isDirectActiveState(d.state)) continue;
          merged.push({
            id: 'direct:' + d.id,
            transport: 'direct',
            rawId: d.id,
            filename: d.filename || 'Download',
            state: d.state || '',
            progress: d.progress,
            startedAt: Number(d.startedAt || 0),
            finishedAt: Number(d.finishedAt || 0) || null,
            library: d.library || '',
            error: d.error || '',
            destination: d.destination || ''
          });
        }

        for (var j = 0; j < state.torrentHistory.length; j++) {
          var t = state.torrentHistory[j];
          if (!t || !t.id) continue;
          if (isTorrentActiveState(t.state)) continue;
          merged.push({
            id: 'torrent:' + t.id,
            transport: 'torrent',
            rawId: t.id,
            filename: t.name || t.infoHash || 'Torrent',
            state: t.state || '',
            progress: t.progress,
            startedAt: Number(t.startedAt || 0),
            finishedAt: Number(t.finishedAt || 0) || null,
            library: '',
            error: t.error || '',
            destination: ''
          });
        }

        merged.sort(function (a, b) { return Number(b.startedAt || 0) - Number(a.startedAt || 0); });
        if (merged.length > MAX_UNIFIED_HISTORY_UI) merged.length = MAX_UNIFIED_HISTORY_UI;
        return merged;
      }

      function renderHubDownloadHistory() {
        if (!el.hubDownloadHistoryList || !el.hubDownloadHistoryEmpty) return;
        var list = buildUnifiedHistory();
        if (!list.length) {
          el.hubDownloadHistoryList.innerHTML = '';
          el.hubDownloadHistoryEmpty.classList.remove('hidden');
          return;
        }
        el.hubDownloadHistoryEmpty.classList.add('hidden');

        var html = '';
        for (var i = 0; i < list.length; i++) {
          var x = list[i];
          var when = formatWhen(x.finishedAt || x.startedAt);
          var sub = (x.state || 'done') + (x.library ? (' \u2022 ' + x.library) : '') + (when ? (' \u2022 ' + when) : '');
          var badge = x.transport === 'torrent' ? 'Torrent' : 'Direct';
          var removeBtn = '<button class="btn btn-ghost btn-sm" data-unified-remove-id="' + escapeHtml(x.id) + '">Remove</button>';
          html += '' +
            '<div class="webHubItem" data-unified-open-id="' + escapeHtml(x.id) + '">' +
              '<div class="webHubItemTop">' +
                '<div class="webHubItemTitle">' + escapeHtml(x.filename) + '</div>' +
                '<span class="webHubBadge">' + escapeHtml(badge) + '</span>' +
              '</div>' +
              '<div class="webHubItemSub">' + escapeHtml(sub) + (x.error ? (' \u2022 ' + escapeHtml(x.error)) : '') + '</div>' +
              '<div class="webHubItemActions">' + removeBtn + '</div>' +
            '</div>';
        }
        el.hubDownloadHistoryList.innerHTML = html;
      }

      function renderHubBrowsingHistory() {
        if (!el.hubBrowseHistoryList || !el.hubBrowseHistoryEmpty) return;
        var list = state.browsingHistory || [];
        if (!list.length) {
          el.hubBrowseHistoryList.innerHTML = '';
          el.hubBrowseHistoryEmpty.classList.remove('hidden');
          return;
        }
        el.hubBrowseHistoryEmpty.classList.add('hidden');

        var html = '';
        for (var i = 0; i < list.length; i++) {
          var x = list[i] || {};
          var title = x.title || x.url || 'History';
          var sub = (x.url || '') + (x.visitedAt ? (' \u2022 ' + formatWhen(x.visitedAt)) : '');
          html += '' +
            '<div class="webHubItem" data-history-open-id="' + escapeHtml(String(x.url || '')) + '">' +
              '<div class="webHubItemTop">' +
                '<div class="webHubItemTitle">' + escapeHtml(title) + '</div>' +
              '</div>' +
              '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
              '<div class="webHubItemActions">' +
                '<button class="btn btn-ghost btn-sm" data-history-remove-id="' + escapeHtml(String(x.id || '')) + '">Remove</button>' +
              '</div>' +
            '</div>';
        }
        el.hubBrowseHistoryList.innerHTML = html;
      }

      function renderHubAll() {
        renderHubDirectActive();
        renderHubTorrentActive();
        renderHubDownloadHistory();
        renderHubBrowsingHistory();
        renderHubBookmarks();
        renderPermissions();
        renderAdblockInfo();
      }

      function loadBrowsingHistory() {
        if (!api.webHistory || typeof api.webHistory.list !== 'function') return;
        api.webHistory.list({
          query: String(state.browsingHistoryQuery || ''),
          limit: (bridge.deps.MAX_BROWSING_HISTORY_UI || 500)
        }).then(function (res) {
          if (!res || !res.ok || !Array.isArray(res.entries)) return;
          state.browsingHistory = res.entries;
          renderHubBrowsingHistory();
        }).catch(function () {});
      }

      function refreshTorrentState() {
        if (!api.webTorrent) return;
        var p1 = (typeof api.webTorrent.getActive === 'function') ? api.webTorrent.getActive() : Promise.resolve({ ok: false, torrents: [] });
        var p2 = (typeof api.webTorrent.getHistory === 'function') ? api.webTorrent.getHistory() : Promise.resolve({ ok: false, torrents: [] });

        Promise.all([p1, p2]).then(function (results) {
          var activeRes = results[0] || {};
          var histRes = results[1] || {};
          state.torrentActive = [];
          state.torrentHistory = [];

          if (activeRes.ok && Array.isArray(activeRes.torrents)) {
            for (var i = 0; i < activeRes.torrents.length; i++) {
              var a = normalizeTorrentEntry(activeRes.torrents[i]);
              if (a) state.torrentActive.push(a);
            }
          }
          if (histRes.ok && Array.isArray(histRes.torrents)) {
            for (var j = 0; j < histRes.torrents.length; j++) {
              var h = normalizeTorrentEntry(histRes.torrents[j]);
              if (h) state.torrentHistory.push(h);
            }
          }
          renderHubTorrentActive();
          renderHubDownloadHistory();
        }).catch(function () {});
      }

      function maybeRecordBrowsingHistory(tab, url) {
        if (!tab || !url || !api.webHistory || typeof api.webHistory.add !== 'function') return;
        var u = String(url || '').trim();
        if (!/^https?:\/\//i.test(u)) return;
        var now = Date.now();
        if (tab._lastHistoryUrl === u && (now - Number(tab._lastHistoryAt || 0) < 3000)) return;
        tab._lastHistoryUrl = u;
        tab._lastHistoryAt = now;
        var payload = {
          url: u,
          title: String(tab.title || tab.sourceName || ''),
          visitedAt: now,
          sourceTabId: String(tab.id)
        };
        api.webHistory.add(payload).catch(function () {
          var retryKey = u + '|' + String(now);
          if (tab._lastHistoryRetryKey === retryKey) return;
          tab._lastHistoryRetryKey = retryKey;
          setTimeout(function () {
            api.webHistory.add(payload).catch(function () {});
          }, 800);
        });
      }

      function normalizeBookmarkEntry(b) {
        if (!b) return null;
        var url = String(b.url || '').trim();
        if (!url) return null;
        return {
          id: String(b.id || ''),
          url: url,
          title: String(b.title || '').trim(),
          folder: String(b.folder || '').trim(),
          createdAt: Number(b.createdAt || 0) || 0,
          updatedAt: Number(b.updatedAt || 0) || 0
        };
      }

      function findBookmarkByUrl(url) {
        var target = String(url || '').trim();
        if (!target) return null;
        for (var i = 0; i < state.bookmarks.length; i++) {
          var b = state.bookmarks[i];
          if (!b) continue;
          if (String(b.url || '').trim() === target) return b;
        }
        return null;
      }

      function isActiveTabBookmarked() {
        var tab = getActiveTab();
        if (!tab) return false;
        var url = String(tab.url || '').trim();
        if (!/^https?:\/\//i.test(url)) return false;
        return !!findBookmarkByUrl(url);
      }

      function updateBookmarkButton() {
        if (!el.bookmarkBtn) return;
        var active = isActiveTabBookmarked();
        el.bookmarkBtn.classList.toggle('active', active);
        el.bookmarkBtn.innerHTML = active ? '&#9733;' : '&#9734;';
        el.bookmarkBtn.title = active ? 'Remove bookmark' : 'Add bookmark';
      }

      function renderHubBookmarks() {
        if (!el.hubBookmarksList || !el.hubBookmarksEmpty) return;
        if (!state.bookmarks.length) {
          el.hubBookmarksList.innerHTML = '';
          el.hubBookmarksEmpty.classList.remove('hidden');
          return;
        }
        el.hubBookmarksEmpty.classList.add('hidden');
        var html = '';
        for (var i = 0; i < state.bookmarks.length; i++) {
          var b = state.bookmarks[i];
          if (!b) continue;
          var title = b.title || siteNameFromUrl(b.url) || b.url;
          var sub = b.url + (b.folder ? (' \u2022 ' + b.folder) : '');
          html += '' +
            '<div class="webHubItem" data-bookmark-open-id="' + escapeHtml(String(b.id || '')) + '">' +
              '<div class="webHubItemTop">' +
                '<div class="webHubItemTitle">' + escapeHtml(title) + '</div>' +
              '</div>' +
              '<div class="webHubItemSub">' + escapeHtml(sub) + '</div>' +
              '<div class="webHubItemActions">' +
                '<button class="btn btn-ghost btn-sm" data-bookmark-edit-id="' + escapeHtml(String(b.id || '')) + '">Edit</button>' +
                '<button class="btn btn-ghost btn-sm" data-bookmark-remove-id="' + escapeHtml(String(b.id || '')) + '">Remove</button>' +
              '</div>' +
            '</div>';
        }
        el.hubBookmarksList.innerHTML = html;
      }

      function loadBookmarks() {
        if (!api.webBookmarks || typeof api.webBookmarks.list !== 'function') return;
        api.webBookmarks.list().then(function (res) {
          if (!res || !res.ok || !Array.isArray(res.bookmarks)) return;
          state.bookmarks = [];
          for (var i = 0; i < res.bookmarks.length; i++) {
            var b = normalizeBookmarkEntry(res.bookmarks[i]);
            if (b) state.bookmarks.push(b);
          }
          renderHubBookmarks();
          updateBookmarkButton();
        }).catch(function () {});
      }

      function toggleBookmarkForActiveTab() {
        if (!api.webBookmarks || typeof api.webBookmarks.toggle !== 'function') return;
        var tab = getActiveTab();
        if (!tab) return;
        var url = String(tab.url || '').trim();
        if (!/^https?:\/\//i.test(url)) {
          showToast('Only web pages can be bookmarked');
          return;
        }
        api.webBookmarks.toggle({
          url: url,
          title: String(tab.title || tab.sourceName || siteNameFromUrl(url) || url)
        }).then(function (res) {
          if (!res || !res.ok) {
            showToast('Bookmark action failed');
            return;
          }
          if (res.added) showToast('Bookmarked');
          else showToast('Bookmark removed');
          loadBookmarks();
        }).catch(function () {
          showToast('Bookmark action failed');
        });
      }

      function updateFindCountLabel() {
        if (!el.findCount) return;
        var r = state.findResult || {};
        var current = Number(r.activeMatchOrdinal || 0) || 0;
        var total = Number(r.matches || 0) || 0;
        el.findCount.textContent = current + ' / ' + total;
      }

      function runFindAction(action, query) {
        var tab = getActiveTab();
        if (!tab || !tab.mainTabId) return;
        webTabs.findInPage({
          tabId: tab.mainTabId,
          action: action,
          query: query
        }).catch(function () {});
      }

      function openFindBar() {
        state.findBarOpen = true;
        if (el.findBar) el.findBar.classList.remove('hidden');
        updateFindCountLabel();
        if (el.findInput && el.findInput.focus) {
          try { el.findInput.focus(); el.findInput.select(); } catch (e) {}
        }
      }

      function closeFindBar() {
        if (!state.findBarOpen) return;
        state.findBarOpen = false;
        if (el.findBar) el.findBar.classList.add('hidden');
        state.findResult = { activeMatchOrdinal: 0, matches: 0 };
        updateFindCountLabel();
        runFindAction('stop', '');
      }

      function runFindFromInput(direction) {
        if (!el.findInput) return;
        var q = String(el.findInput.value || '').trim();
        state.findQuery = q;
        if (!q) {
          state.findResult = { activeMatchOrdinal: 0, matches: 0 };
          updateFindCountLabel();
          runFindAction('stop', '');
          return;
        }
        if (direction === 'prev') runFindAction('prev', q);
        else if (direction === 'next') runFindAction('next', q);
        else runFindAction('find', q);
      }

      function formatByteSize(bytes) {
        var n = Number(bytes || 0);
        if (!isFinite(n) || n <= 0) return '0 B';
        var units = ['B', 'KB', 'MB', 'GB', 'TB'];
        var idx = 0;
        while (n >= 1024 && idx < units.length - 1) {
          n = n / 1024;
          idx += 1;
        }
        return n.toFixed(idx > 1 ? 1 : 0) + ' ' + units[idx];
      }

      function rangeToFromTs(range) {
        var now = Date.now();
        var key = String(range || 'all').trim().toLowerCase();
        if (key === 'hour') return now - 3600 * 1000;
        if (key === 'day') return now - 24 * 3600 * 1000;
        if (key === 'week') return now - 7 * 24 * 3600 * 1000;
        if (key === 'month') return now - 28 * 24 * 3600 * 1000;
        return 0;
      }

      function loadDataUsage() {
        if (!api.webData || typeof api.webData.usage !== 'function' || !el.hubDataUsageText) return;
        api.webData.usage().then(function (res) {
          if (!res || !res.ok || !res.usage) return;
          var u = res.usage || {};
          var text = 'Total: ' + formatByteSize(u.totalBytes || 0)
            + ' (History ' + formatByteSize(u.historyBytes || 0)
            + ', Downloads ' + formatByteSize(u.downloadsBytes || 0)
            + ', Torrents ' + formatByteSize(u.torrentsBytes || 0) + ')';
          el.hubDataUsageText.textContent = text;
        }).catch(function () {
          el.hubDataUsageText.textContent = 'Failed to read data usage.';
        });
      }

      function clearSelectedBrowsingData() {
        if (!api.webData || typeof api.webData.clear !== 'function') return;
        var kinds = [];
        if (el.hubDataHistory && el.hubDataHistory.checked) kinds.push('history');
        if (el.hubDataDownloads && el.hubDataDownloads.checked) kinds.push('downloads');
        if (el.hubDataTorrents && el.hubDataTorrents.checked) kinds.push('torrents');
        if (el.hubDataCookies && el.hubDataCookies.checked) {
          kinds.push('cookies');
          kinds.push('siteData');
        }
        if (el.hubDataCache && el.hubDataCache.checked) kinds.push('cache');
        if (!kinds.length) {
          showToast('Select at least one data type');
          return;
        }
        var from = rangeToFromTs(el.hubDataRange ? el.hubDataRange.value : 'all');
        api.webData.clear({
          from: from,
          to: Date.now(),
          kinds: kinds
        }).then(function (res) {
          if (!res || !res.ok) {
            showToast('Failed to clear data');
            return;
          }
          showToast('Browsing data cleared');
          loadDownloadHistory();
          loadBrowsingHistory();
          refreshTorrentState();
          loadDataUsage();
        }).catch(function () {
          showToast('Failed to clear data');
        });
      }

      function normalizePermissionRule(rule) {
        if (!rule) return null;
        var origin = String(rule.origin || '').trim();
        var permission = String(rule.permission || '').trim();
        if (!origin || !permission) return null;
        return {
          origin: origin,
          permission: permission,
          decision: String(rule.decision || 'ask').trim().toLowerCase(),
          updatedAt: Number(rule.updatedAt || 0) || 0
        };
      }

      function renderPermissions() {
        if (!el.hubPermissionsList || !el.hubPermissionsEmpty) return;
        if (!state.permissions.length) {
          el.hubPermissionsList.innerHTML = '';
          el.hubPermissionsEmpty.classList.remove('hidden');
          return;
        }
        el.hubPermissionsEmpty.classList.add('hidden');
        var html = '';
        for (var i = 0; i < state.permissions.length; i++) {
          var r = state.permissions[i];
          if (!r) continue;
          html += '' +
            '<div class="webHubItem">' +
              '<div class="webHubItemTop">' +
                '<div class="webHubItemTitle">' + escapeHtml(r.origin) + '</div>' +
                '<span class="webHubBadge">' + escapeHtml(r.decision) + '</span>' +
              '</div>' +
              '<div class="webHubItemSub">' + escapeHtml(r.permission) + '</div>' +
              '<div class="webHubItemActions">' +
                '<button class="btn btn-ghost btn-sm" data-perm-remove-origin="' + escapeHtml(r.origin) + '" data-perm-remove-type="' + escapeHtml(r.permission) + '">Reset</button>' +
              '</div>' +
            '</div>';
        }
        el.hubPermissionsList.innerHTML = html;
      }

      function loadPermissions() {
        if (!api.webPermissions || typeof api.webPermissions.list !== 'function') return;
        api.webPermissions.list().then(function (res) {
          state.permissions = [];
          if (res && res.ok && Array.isArray(res.rules)) {
            for (var i = 0; i < res.rules.length; i++) {
              var r = normalizePermissionRule(res.rules[i]);
              if (r) state.permissions.push(r);
            }
          }
          state.permissions.sort(function (a, b) {
            var ao = String(a.origin || '');
            var bo = String(b.origin || '');
            if (ao === bo) return String(a.permission || '').localeCompare(String(b.permission || ''));
            return ao.localeCompare(bo);
          });
          renderPermissions();
        }).catch(function () {});
      }

      function savePermissionRuleFromHub() {
        if (!api.webPermissions || typeof api.webPermissions.set !== 'function') return;
        var origin = String((el.hubPermOrigin && el.hubPermOrigin.value) || '').trim();
        var permission = String((el.hubPermType && el.hubPermType.value) || '').trim();
        var decision = String((el.hubPermDecision && el.hubPermDecision.value) || '').trim();
        if (!origin) {
          showToast('Origin is required');
          return;
        }
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(origin)) {
          origin = 'https://' + origin;
        }
        api.webPermissions.set({
          origin: origin,
          permission: permission,
          decision: decision
        }).then(function (res) {
          if (!res || !res.ok) {
            showToast('Failed to save permission');
            return;
          }
          showToast('Permission saved');
          if (el.hubPermOrigin) el.hubPermOrigin.value = '';
          loadPermissions();
        }).catch(function () {
          showToast('Failed to save permission');
        });
      }

      function renderAdblockInfo(extra) {
        if (!el.hubAdblockInfo) return;
        var a = state.adblock || {};
        var parts = [];
        parts.push('Blocked: ' + Number(a.blockedCount || 0));
        parts.push('Domains: ' + Number(a.domainCount || 0));
        if (a.listUpdatedAt) parts.push('Updated: ' + formatWhen(a.listUpdatedAt));
        if (extra) parts.push(String(extra));
        el.hubAdblockInfo.textContent = parts.join(' • ');
      }

      function loadAdblockState() {
        if (!api.webAdblock || typeof api.webAdblock.get !== 'function') return;
        api.webAdblock.get().then(function (res) {
          if (!res || !res.ok) return;
          state.adblock.enabled = !!res.enabled;
          state.adblock.blockedCount = Number(res.blockedCount || 0) || 0;
          state.adblock.domainCount = Number(res.domainCount || 0) || 0;
          state.adblock.listUpdatedAt = Number(res.listUpdatedAt || 0) || 0;
          if (el.hubAdblockEnabled) el.hubAdblockEnabled.checked = !!state.adblock.enabled;
          renderAdblockInfo();
        }).catch(function () {});
      }

    return {
      isTorrentActiveState: isTorrentActiveState,
      isTorrentCompletedState: isTorrentCompletedState,
      isTorrentErroredState: isTorrentErroredState,
      formatWhen: formatWhen,
      pctText: pctText,
      renderHubDirectActive: renderHubDirectActive,
      normalizeTorrentEntry: normalizeTorrentEntry,
      findActiveTorrentById: findActiveTorrentById,
      renderHubTorrentActive: renderHubTorrentActive,
      applyTorrentBulkAction: applyTorrentBulkAction,
      buildUnifiedHistory: buildUnifiedHistory,
      renderHubDownloadHistory: renderHubDownloadHistory,
      renderHubBrowsingHistory: renderHubBrowsingHistory,
      renderHubAll: renderHubAll,
      loadBrowsingHistory: loadBrowsingHistory,
      refreshTorrentState: refreshTorrentState,
      maybeRecordBrowsingHistory: maybeRecordBrowsingHistory,
      normalizeBookmarkEntry: normalizeBookmarkEntry,
      findBookmarkByUrl: findBookmarkByUrl,
      isActiveTabBookmarked: isActiveTabBookmarked,
      updateBookmarkButton: updateBookmarkButton,
      renderHubBookmarks: renderHubBookmarks,
      loadBookmarks: loadBookmarks,
      toggleBookmarkForActiveTab: toggleBookmarkForActiveTab,
      updateFindCountLabel: updateFindCountLabel,
      runFindAction: runFindAction,
      openFindBar: openFindBar,
      closeFindBar: closeFindBar,
      runFindFromInput: runFindFromInput,
      formatByteSize: formatByteSize,
      rangeToFromTs: rangeToFromTs,
      loadDataUsage: loadDataUsage,
      clearSelectedBrowsingData: clearSelectedBrowsingData,
      normalizePermissionRule: normalizePermissionRule,
      renderPermissions: renderPermissions,
      loadPermissions: loadPermissions,
      savePermissionRuleFromHub: savePermissionRuleFromHub,
      renderAdblockInfo: renderAdblockInfo,
      loadAdblockState: loadAdblockState
    };
  };
})();
