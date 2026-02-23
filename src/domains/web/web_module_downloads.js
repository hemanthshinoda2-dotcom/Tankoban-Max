(function registerDownloadsModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.downloads = function initDownloadsModule(bridge) {
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

    function formatBytes(n) {
        n = Number(n || 0);
        if (!isFinite(n) || n <= 0) return '0 B';
        var u = ['B', 'KB', 'MB', 'GB', 'TB'];
        var i = 0;
        while (n >= 1024 && i < u.length - 1) { n = n / 1024; i++; }
        var dp = i <= 1 ? 0 : (i === 2 ? 1 : 2);
        return n.toFixed(dp) + ' ' + u[i];
      }

      function formatSpeed(bps) {
        bps = Number(bps || 0);
        if (!isFinite(bps) || bps <= 0) return '';
        return formatBytes(bps) + '/s';
      }

      function formatEta(received, total, bps) {
        received = Number(received || 0);
        total = Number(total || 0);
        bps = Number(bps || 0);
        if (!isFinite(received) || !isFinite(total) || !isFinite(bps) || total <= 0 || bps <= 0) return '';
        var s = Math.max(0, Math.round((total - received) / bps));
        if (s <= 0) return '';
        var m = Math.floor(s / 60);
        var r = s % 60;
        if (m >= 60) {
          var h = Math.floor(m / 60);
          var mm = m % 60;
          return h + 'h ' + mm + 'm';
        }
        if (m > 0) return m + 'm ' + r + 's';
        return r + 's';
      }

      function hostFromUrl(u) {
        u = String(u || '').trim();
        if (!u) return '';
        try {
          if (u.indexOf('http') !== 0) u = 'https://' + u.replace(/^\/+/, '');
          var x = new URL(u);
          return x.hostname || '';
        } catch (e) {
          return '';
        }
      }

      function faviconFor(u) {
        var h = hostFromUrl(u);
        if (!h) return '';
        return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(h) + '&sz=128';
      }

      function normalizeDownload(d) {
        if (!d) return null;
        var out = {
          id: String(d.id || ''),
          filename: String(d.filename || ''),
          destination: d.destination != null ? String(d.destination) : '',
          library: d.library != null ? String(d.library) : '',
          state: String(d.state || ''),
          startedAt: d.startedAt != null ? Number(d.startedAt) : null,
          finishedAt: d.finishedAt != null ? Number(d.finishedAt) : null,
          error: d.error != null ? String(d.error) : '',
          pageUrl: d.pageUrl != null ? String(d.pageUrl) : '',
          downloadUrl: d.downloadUrl != null ? String(d.downloadUrl) : '',
          receivedBytes: d.receivedBytes != null ? Number(d.receivedBytes) : 0,
          totalBytes: d.totalBytes != null ? Number(d.totalBytes) : 0,
          progress: d.progress != null ? Number(d.progress) : null,
          bytesPerSec: d.bytesPerSec != null ? Number(d.bytesPerSec) : 0,
          transport: d.transport != null ? String(d.transport) : '',
          canPause: d.canPause != null ? !!d.canPause : null,
          canResume: d.canResume != null ? !!d.canResume : null,
          canCancel: d.canCancel != null ? !!d.canCancel : null,
        };
        if (out.state === 'downloading' || out.state === 'in_progress' || out.state === 'progressing') out.state = 'progressing';
        if (out.state === 'paused') out.state = 'paused';
        if (out.state === 'cancelled') out.state = 'cancelled';
        if (!out.transport) out.transport = 'electron-item';
        if (out.canPause == null) out.canPause = out.transport !== 'direct';
        if (out.canResume == null) out.canResume = out.transport !== 'direct';
        if (out.canCancel == null) out.canCancel = true;
        if (typeof out.progress === 'number') out.progress = Math.max(0, Math.min(1, out.progress));
        if (out.progress == null && out.totalBytes > 0 && out.receivedBytes >= 0) out.progress = Math.max(0, Math.min(1, out.receivedBytes / out.totalBytes));
        if (!out.id) out.id = 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        return out;
      }

      function recomputeDownloadingCount() {
        var active = 0;
        var hasProgress = false;
        for (var i = 0; i < state.downloads.length; i++) {
          var d = state.downloads[i];
          if (!d) continue;
          if (d.state === 'progressing') { active++; hasProgress = true; }
          else if (d.state === 'paused') { active++; }
        }
        state.downloading = active;
        state.downloadingHasProgress = hasProgress;
      }

      var dlRenderTimer = null;
      function scheduleDlRender() {
        if (dlRenderTimer) return;
        dlRenderTimer = setTimeout(function () {
          dlRenderTimer = null;
          renderDownloadsPanel();
          renderHomeDownloads();
          renderHubDirectActive();
          renderHubDownloadHistory();
        }, 120);
      }

      function upsertDownload(info) {
        if (!info) return;
        var id = info.id != null ? String(info.id) : '';
        var dest = info.destination || info.path || '';
        dest = dest ? String(dest) : '';
        var fn = info.filename != null ? String(info.filename) : '';

        var found = null;
        for (var i = 0; i < state.downloads.length; i++) {
          var d = state.downloads[i];
          if (!d) continue;
          if (id && d.id === id) { found = d; break; }
          if (!id && dest && d.destination === dest) { found = d; break; }
          if (!id && fn && d.filename === fn && d.state === 'progressing') { found = d; break; }
        }

        if (!found) {
          found = normalizeDownload(info);
          state.downloads.unshift(found);
        } else {
          var n = normalizeDownload(Object.assign({}, found, info));
          Object.assign(found, n);
        }

        if (state.downloads.length > 1000) state.downloads.length = 1000;
        recomputeDownloadingCount();
        scheduleDlRender();
      }

      function loadDownloadHistory() {
        if (!api || !api.webSources || !api.webSources.getDownloadHistory) return;
        api.webSources.getDownloadHistory().then(function (res) {
          if (!res || !res.ok || !Array.isArray(res.downloads)) return;
          state.downloads = [];
          for (var i = 0; i < res.downloads.length; i++) {
            var d = normalizeDownload(res.downloads[i]);
            if (d) state.downloads.push(d);
          }
          recomputeDownloadingCount();
          renderDownloadsPanel();
          renderHomeDownloads();
          renderHubDirectActive();
          renderHubDownloadHistory();
        }).catch(function () {});
      }

      function renderDownloadList(targetEl, emptyEl, list, opts) {
        if (!targetEl || !emptyEl) return;
        opts = opts || {};
        list = list || [];

        if (!list.length) {
          targetEl.innerHTML = '';
          emptyEl.classList.remove('hidden');
          return;
        }
        emptyEl.classList.add('hidden');

        var html = '';
        for (var i = 0; i < list.length; i++) {
          var d = list[i];
          if (!d) continue;

          var isActive = d.state === 'progressing' || d.state === 'paused';
          var isOk = d.state === 'completed';
          var isBad = d.state === 'failed' || d.state === 'interrupted';

          var stateTxt = isActive ? (d.state === 'paused' ? 'Paused' : 'Downloading') : (isOk ? 'Saved' : 'Failed');

          var sub = '';
          var libTag = d.library ? ('\u2192 ' + d.library) : '';
          if (isActive) {
            var left = (d.totalBytes > 0 && d.receivedBytes >= 0) ? (formatBytes(d.receivedBytes) + ' / ' + formatBytes(d.totalBytes)) : '';
            var sp = formatSpeed(d.bytesPerSec);
            var eta = formatEta(d.receivedBytes, d.totalBytes, d.bytesPerSec);
            sub = libTag;
            if (left) sub = (sub ? (sub + ' \u2022 ') : '') + left;
            if (sp) sub = (sub ? (sub + ' \u2022 ') : '') + sp;
            if (eta) sub = (sub ? (sub + ' \u2022 ') : '') + eta;
          } else if (isOk) {
            sub = libTag;
            if (d.destination) sub = (sub ? (sub + ' \u2022 ') : '') + shortPath(d.destination);
          } else {
            sub = d.error ? d.error : 'Download failed';
          }

          var p = null;
          if (isActive && !opts.compact) {
            if (typeof d.progress === 'number') p = Math.max(0, Math.min(1, d.progress));
            else if (d.totalBytes > 0) p = Math.max(0, Math.min(1, d.receivedBytes / d.totalBytes));
          }
          var pctTxt = (p != null) ? Math.round(p * 100) + '%' : '';
          var iconUrl = faviconFor(d.pageUrl || d.downloadUrl);
          var canPauseAction = !!(d.canPause && api && api.webSources && api.webSources.pauseDownload);
          var canResumeAction = !!(d.canResume && api && api.webSources && api.webSources.resumeDownload);
          var canCancelAction = !!(d.canCancel && api && api.webSources && api.webSources.cancelDownload);
          var actionsHtml = '';
          if (isActive) {
            if (d.state === 'paused') {
              if (canResumeAction) actionsHtml += '<button class="webDlAction" type="button" title="Resume" data-dl-action="resume">&#9654;</button>';
            } else {
              if (canPauseAction) actionsHtml += '<button class="webDlAction" type="button" title="Pause" data-dl-action="pause">&#10074;&#10074;</button>';
            }
            if (canCancelAction) actionsHtml += '<button class="webDlAction" type="button" title="Cancel" data-dl-action="cancel">&times;</button>';
          }

          html += '' +
            '<div class="webDlItem' + (opts.compact ? ' webDlItem--compact' : '') + '" data-dl-id="' + escapeHtml(d.id) + '">' +
              '<div class="webDlIcon">' +
                (iconUrl ? ('<img class="webDlFavicon" src="' + escapeHtml(iconUrl) + '" alt=""/>') : '<div class="webDlFaviconFallback"></div>') +
              '</div>' +
              '<div class="webDlMeta">' +
                '<div class="webDlName">' + escapeHtml(d.filename) + '</div>' +
                '<div class="webDlSub">' + escapeHtml(sub) + '</div>' +
                (isActive ? ('<div class="webDlProgressWrap">' +
                  '<div class="webDlProgressBar"><div class="webDlProgressFill" style="width:' + escapeHtml(pctTxt || '0%') + '"></div></div>' +
                  '<div class="webDlProgressText">' + escapeHtml(pctTxt) + '</div>' +
                '</div>') : '') +
              '</div>' +
              '<div class="webDlRight">' +
                '<div class="webDlState' + (isBad ? ' webDlState--bad' : '') + '">' + escapeHtml(stateTxt) + '</div>' +
                (actionsHtml ? ('<div class="webDlActions">' + actionsHtml + '</div>') : '') +
                (opts.allowRemove ? ('<button class="iconBtn webDlRemove" title="Remove" aria-label="Remove" data-dl-remove="1">&times;</button>') : '') +
              '</div>' +
            '</div>';
        }

        targetEl.innerHTML = html;

        var items = targetEl.querySelectorAll('.webDlItem');
        for (var j = 0; j < items.length; j++) {
          items[j].onclick = function (e) {
            var t = e && e.target;
            if (t && t.getAttribute && t.getAttribute('data-dl-action')) return;
            if (t && t.getAttribute && t.getAttribute('data-dl-remove') === '1') return;
            var id = this.getAttribute('data-dl-id');
            var d = null;
            for (var k = 0; k < state.downloads.length; k++) {
              if (state.downloads[k] && state.downloads[k].id === id) { d = state.downloads[k]; break; }
            }
            if (!d) return;
            if (d.state === 'completed' && d.destination && api && api.shell && api.shell.revealPath) {
              try { api.shell.revealPath(d.destination); } catch (err) {}
            } else if (d.state === 'progressing') {
              showToast('Download in progress');
            } else if (d.destination && api && api.shell && api.shell.revealPath) {
              try { api.shell.revealPath(d.destination); } catch (err2) {}
            }
          };

          var rm = items[j].querySelector('.webDlRemove');
          if (rm) {
            rm.onclick = function (e) {
              try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
              var p = this.parentElement;
              while (p && !p.classList.contains('webDlItem')) p = p.parentElement;
              if (!p) return;
              var id = p.getAttribute('data-dl-id');
              var d = null;
              for (var k = 0; k < state.downloads.length; k++) {
                if (state.downloads[k] && state.downloads[k].id === id) { d = state.downloads[k]; break; }
              }
              if (!d || d.state === 'progressing') {
                showToast('Can\'t remove an active download');
                return;
              }
              if (api && api.webSources && api.webSources.removeDownloadHistory) {
                api.webSources.removeDownloadHistory({ id: id }).then(function () {
                  state.downloads = state.downloads.filter(function (x) { return x && x.id !== id; });
                  recomputeDownloadingCount();
                  scheduleDlRender();
                }).catch(function () {});
              }
            };
          }

          var actionBtns = items[j].querySelectorAll('[data-dl-action]');
          for (var ai = 0; ai < actionBtns.length; ai++) {
            actionBtns[ai].onclick = function (e) {
              try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
              var action = String(this.getAttribute('data-dl-action') || '');
              var p = this.parentElement;
              while (p && !p.classList.contains('webDlItem')) p = p.parentElement;
              if (!p) return;
              var id = p.getAttribute('data-dl-id');
              if (!id || !api || !api.webSources) return;
              if (action === 'pause' && api.webSources.pauseDownload) {
                api.webSources.pauseDownload({ id: id }).catch(function () {});
              } else if (action === 'resume' && api.webSources.resumeDownload) {
                api.webSources.resumeDownload({ id: id }).catch(function () {});
              } else if (action === 'cancel' && api.webSources.cancelDownload) {
                api.webSources.cancelDownload({ id: id }).catch(function () {});
              }
            };
          }
        }
      }

      function renderDownloadsPanel() {
        if (!el.dlList || !el.dlEmpty) return;
        renderDownloadList(el.dlList, el.dlEmpty, state.downloads, { allowRemove: true });
      }

      function renderHomeDownloads() {
        if (!el.homeDlList || !el.homeDlEmpty) return;
        var act = [];
        var rest = [];
        for (var i = 0; i < state.downloads.length; i++) {
          var d = state.downloads[i];
          if (!d) continue;
          if (d.state === 'progressing' || d.state === 'paused') act.push(d);
          else rest.push(d);
        }
        var list = act.concat(rest).slice(0, 8);
        renderDownloadList(el.homeDlList, el.homeDlEmpty, list, { compact: true, allowRemove: true });
      }

    return {
      formatBytes: formatBytes,
      formatSpeed: formatSpeed,
      formatEta: formatEta,
      hostFromUrl: hostFromUrl,
      faviconFor: faviconFor,
      normalizeDownload: normalizeDownload,
      recomputeDownloadingCount: recomputeDownloadingCount,
      scheduleDlRender: scheduleDlRender,
      upsertDownload: upsertDownload,
      loadDownloadHistory: loadDownloadHistory,
      renderDownloadList: renderDownloadList,
      renderDownloadsPanel: renderDownloadsPanel,
      renderHomeDownloads: renderHomeDownloads
    };
  };
})();
