(function registerDownloadsModule() {
  'use strict';
  window.__tankoWebModules = window.__tankoWebModules || {};
  window.__tankoWebModules.downloads = function initDownloadsModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;

    function dep(name) { return (bridge.deps || {})[name]; }
    var escapeHtml = function () { var fn = dep('escapeHtml'); return fn ? fn.apply(null, arguments) : ''; };
    var showToast = function () { var fn = dep('showToast'); return fn && fn.apply(null, arguments); };
    var hideAllPanels = function () { var fn = dep('hideAllPanels'); return fn && fn.apply(null, arguments); };

    // ── Utilities ──

    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      var units = ['B', 'KB', 'MB', 'GB', 'TB'];
      var i = Math.floor(Math.log(bytes) / Math.log(1024));
      if (i >= units.length) i = units.length - 1;
      return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
    }

    function formatSpeed(bytesPerSec) {
      if (!bytesPerSec || bytesPerSec <= 0) return '';
      return formatBytes(bytesPerSec) + '/s';
    }

    function formatEta(totalBytes, received, speed) {
      if (!speed || speed <= 0 || received >= totalBytes) return '';
      var remaining = totalBytes - received;
      var secs = Math.round(remaining / speed);
      if (secs < 60) return secs + 's';
      if (secs < 3600) return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
      return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
    }

    // ── Download item rendering ──

    function renderDownloadItem(dl) {
      if (!el.downloadsList) return;

      var existing = document.getElementById('dl-' + dl.id);
      if (existing) {
        var pct = dl.totalBytes > 0 ? Math.round((dl.received / dl.totalBytes) * 100) : 0;
        var fill = existing.querySelector('.dl-progress-fill');
        var statusEl = existing.querySelector('.dl-status');
        var icon = existing.querySelector('.dl-icon');
        var actions = existing.querySelector('.dl-actions');

        if (dl.state === 'completed') {
          if (fill) fill.parentElement.style.display = 'none';
          statusEl.textContent = formatBytes(dl.totalBytes || dl.received);
          icon.className = 'dl-icon complete';
          icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 8.5l3 3 5-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          actions.innerHTML =
            '<button class="dl-btn" data-dl-action="open" title="Open file"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2h7v7M12 2L5.5 8.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
            '<button class="dl-btn" data-dl-action="show" title="Show in folder"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 4.5h3l1-1.5h4l1 1.5h1v6H2z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg></button>';
        } else if (dl.state === 'cancelled' || dl.state === 'interrupted') {
          if (fill) fill.parentElement.style.display = 'none';
          statusEl.textContent = dl.state === 'cancelled' ? 'Cancelled' : 'Failed';
          icon.className = 'dl-icon failed';
          icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
          actions.innerHTML = '';
        } else {
          if (fill) {
            fill.style.width = pct + '%';
            fill.parentElement.style.display = '';
          }
          var statusText = formatBytes(dl.received);
          if (dl.totalBytes > 0) statusText += ' / ' + formatBytes(dl.totalBytes) + ' \u2014 ' + pct + '%';
          if (dl.speed) statusText += ' \u2022 ' + formatSpeed(dl.speed);
          statusEl.textContent = statusText;
        }
        return;
      }

      // Create new download item element
      if (el.downloadsEmpty) el.downloadsEmpty.style.display = 'none';

      var item = document.createElement('div');
      item.className = 'dl-item';
      item.id = 'dl-' + dl.id;

      var pct = dl.totalBytes > 0 ? Math.round((dl.received / dl.totalBytes) * 100) : 0;

      item.innerHTML =
        '<div class="dl-icon">' +
          '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M3 13h10" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</div>' +
        '<div class="dl-info">' +
          '<div class="dl-name">' + escapeHtml(dl.filename) + '</div>' +
          '<div class="dl-status">' + formatBytes(dl.received) + (dl.totalBytes > 0 ? ' / ' + formatBytes(dl.totalBytes) + ' \u2014 ' + pct + '%' : '') + '</div>' +
          '<div class="dl-progress-bar"><div class="dl-progress-fill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<div class="dl-actions">' +
          '<button class="dl-btn" data-dl-action="cancel" title="Cancel"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>' +
        '</div>';

      el.downloadsList.insertBefore(item, el.downloadsList.firstChild);
    }

    // ── Panel ──

    function showDownloadsPanel() {
      hideAllPanels();
      state.downloadsOpen = true;
      if (el.downloadsPanel) el.downloadsPanel.style.display = '';
      if (el.menuOverlay) el.menuOverlay.style.display = '';
    }

    // ── Event wiring ──

    function initDownloadEvents() {
      if (el.downloadsList) {
        el.downloadsList.addEventListener('click', function (e) {
          var btn = e.target.closest('.dl-btn');
          if (!btn) return;
          var action = btn.dataset.dlAction;
          var item = btn.closest('.dl-item');
          if (!item) return;
          var id = item.id.replace('dl-', '');
          var dl = state.downloads[id];
          if (!dl) return;

          switch (action) {
            case 'cancel':
              api.webSources.cancelDownload({ id: id });
              break;
            case 'open':
              if (dl.savePath) api.webBrowserActions.downloadOpenFile({ path: dl.savePath });
              break;
            case 'show':
              if (dl.savePath) api.webBrowserActions.downloadShowInFolder({ path: dl.savePath });
              break;
          }
        });
      }

      if (el.downloadsClose) {
        el.downloadsClose.addEventListener('click', function () {
          hideAllPanels();
        });
      }

      // IPC: download lifecycle
      api.webSources.onDownloadStarted(function (info) {
        state.downloads[info.id] = {
          id: info.id,
          filename: info.filename || 'download',
          totalBytes: info.totalBytes || 0,
          received: 0,
          speed: 0,
          state: 'progressing',
          savePath: ''
        };
        renderDownloadItem(state.downloads[info.id]);
        if (!state.downloadsOpen) showDownloadsPanel();
      });

      api.webSources.onDownloadProgress(function (info) {
        var dl = state.downloads[info.id];
        if (!dl) return;
        dl.received = info.received || 0;
        dl.totalBytes = info.totalBytes || dl.totalBytes;
        dl.state = info.state || 'progressing';
        dl.speed = info.speed || 0;
        renderDownloadItem(dl);
      });

      api.webSources.onDownloadCompleted(function (info) {
        var dl = state.downloads[info.id];
        if (!dl) return;
        dl.state = info.state || 'completed';
        dl.savePath = info.savePath || '';
        dl.received = info.totalBytes || dl.received;
        renderDownloadItem(dl);
      });
    }

    return {
      formatBytes: formatBytes,
      formatSpeed: formatSpeed,
      formatEta: formatEta,
      renderDownloadItem: renderDownloadItem,
      showDownloadsPanel: showDownloadsPanel,
      initDownloadEvents: initDownloadEvents
    };
  };
})();
