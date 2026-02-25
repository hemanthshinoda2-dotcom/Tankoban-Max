(function registerDownloadsModule() {
  'use strict';

  window.__tankoWebModules = window.__tankoWebModules || {};

  window.__tankoWebModules.downloads = function initDownloadsModule(bridge) {
    var state = bridge.state;
    var el = bridge.el;
    var api = bridge.api;

    function dep(name) { return (bridge.deps || {})[name]; }
    function hideAllPanels() {
      var fn = dep('hideAllPanels');
      return fn && fn.apply(null, arguments);
    }

    state.downloadsById = state.downloadsById || Object.create(null);
    if (!Array.isArray(state.downloads)) state.downloads = [];

    function formatBytes(bytes) {
      var n = Number(bytes || 0);
      if (!n) return '0 B';
      var units = ['B', 'KB', 'MB', 'GB', 'TB'];
      var i = Math.floor(Math.log(n) / Math.log(1024));
      if (i >= units.length) i = units.length - 1;
      return (n / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
    }

    function formatSpeed(bytesPerSec) {
      var n = Number(bytesPerSec || 0);
      if (!n) return '';
      return formatBytes(n) + '/s';
    }

    function snapshotDownloads() {
      var list = [];
      var keys = Object.keys(state.downloadsById);
      for (var i = 0; i < keys.length; i++) {
        list.push(state.downloadsById[keys[i]]);
      }
      list.sort(function (a, b) {
        return Number(b.startedAt || 0) - Number(a.startedAt || 0);
      });
      return list;
    }

    function emitDownloadsChanged() {
      state.downloads = snapshotDownloads();
      bridge.emit('downloads:changed', { downloads: state.downloads.slice() });
    }

    function renderDownloadsPanel() {
      if (!el.downloadsList || !el.downloadsEmpty) return;
      var list = snapshotDownloads();

      if (!list.length) {
        el.downloadsList.innerHTML = '';
        el.downloadsEmpty.style.display = '';
        return;
      }

      el.downloadsEmpty.style.display = 'none';
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var dl = list[i];
        var pct = dl.totalBytes > 0 ? Math.round((dl.received / dl.totalBytes) * 100) : 0;
        var status = formatBytes(dl.received || 0);
        if (dl.totalBytes > 0) status += ' / ' + formatBytes(dl.totalBytes) + ' - ' + pct + '%';
        if (dl.speed) status += ' - ' + formatSpeed(dl.speed);
        if (dl.state === 'completed') status = 'Completed - ' + formatBytes(dl.totalBytes || dl.received);
        if (dl.state === 'cancelled') status = 'Cancelled';
        if (dl.state === 'interrupted' || dl.state === 'failed') status = 'Failed';

        html += '' +
          '<div class="dl-item" id="dl-' + String(dl.id) + '">' +
            '<div class="dl-info">' +
              '<div class="dl-name">' + escapeHtml(dl.filename || 'download') + '</div>' +
              '<div class="dl-status">' + escapeHtml(status) + '</div>' +
              ((dl.state === 'progressing' || dl.state === 'started')
                ? ('<div class="dl-progress-bar"><div class="dl-progress-fill" style="width:' + pct + '%"></div></div>')
                : '') +
            '</div>' +
            '<div class="dl-actions">' +
              ((dl.state === 'progressing' || dl.state === 'started')
                ? '<button class="dl-btn" data-dl-action="cancel" title="Cancel">Cancel</button>'
                : '') +
              (dl.savePath ? '<button class="dl-btn" data-dl-action="open" title="Open file">Open</button>' : '') +
              (dl.savePath ? '<button class="dl-btn" data-dl-action="show" title="Show in folder">Folder</button>' : '') +
            '</div>' +
          '</div>';
      }

      el.downloadsList.innerHTML = html;
    }

    function escapeHtml(v) {
      var d = document.createElement('div');
      d.textContent = String(v || '');
      return d.innerHTML;
    }

    function showDownloadsPanel() {
      hideAllPanels();
      state.downloadsOpen = true;
      if (el.downloadsPanel) el.downloadsPanel.style.display = '';
      if (el.menuOverlay) el.menuOverlay.style.display = '';
      renderDownloadsPanel();
    }

    function upsertDownload(id, patch) {
      var key = String(id || '');
      if (!key) return;
      var prev = state.downloadsById[key] || {
        id: key,
        filename: 'download',
        totalBytes: 0,
        received: 0,
        speed: 0,
        state: 'started',
        savePath: '',
        startedAt: Date.now(),
        finishedAt: 0,
        progress: 0
      };
      var next = Object.assign({}, prev, patch || {});
      if (next.totalBytes > 0) {
        next.progress = Math.max(0, Math.min(1, Number(next.received || 0) / Number(next.totalBytes || 1)));
      }
      if (next.state === 'completed' || next.state === 'cancelled' || next.state === 'failed' || next.state === 'interrupted') {
        if (!next.finishedAt) next.finishedAt = Date.now();
      }
      state.downloadsById[key] = next;
      emitDownloadsChanged();
      if (state.downloadsOpen) renderDownloadsPanel();
    }

    function initDownloadEvents() {
      if (el.downloadsClose) {
        el.downloadsClose.addEventListener('click', function () {
          hideAllPanels();
        });
      }

      if (el.downloadsList) {
        el.downloadsList.addEventListener('click', function (e) {
          var btn = e.target.closest('.dl-btn');
          if (!btn) return;
          var item = e.target.closest('.dl-item');
          if (!item) return;
          var id = item.id.replace('dl-', '');
          var dl = state.downloadsById[id];
          if (!dl) return;

          var action = String(btn.getAttribute('data-dl-action') || '');
          if (action === 'cancel' && api.webSources && api.webSources.cancelDownload) {
            api.webSources.cancelDownload({ id: id }).catch(function () {});
            return;
          }
          if (action === 'open' && dl.savePath && api.webBrowserActions && api.webBrowserActions.downloadOpenFile) {
            api.webBrowserActions.downloadOpenFile({ path: dl.savePath }).catch(function () {});
            return;
          }
          if (action === 'show' && dl.savePath && api.webBrowserActions && api.webBrowserActions.downloadShowInFolder) {
            api.webBrowserActions.downloadShowInFolder({ path: dl.savePath }).catch(function () {});
          }
        });
      }

      if (api.webSources && api.webSources.onDownloadStarted) {
        api.webSources.onDownloadStarted(function (info) {
          upsertDownload(info && info.id, {
            filename: (info && info.filename) || 'download',
            totalBytes: (info && info.totalBytes) || 0,
            received: 0,
            speed: 0,
            state: 'started',
            savePath: '',
            startedAt: Date.now(),
            progress: 0
          });
        });
      }

      if (api.webSources && api.webSources.onDownloadProgress) {
        api.webSources.onDownloadProgress(function (info) {
          var total = Number((info && info.totalBytes) || 0);
          var recv = Number((info && info.received) || 0);
          upsertDownload(info && info.id, {
            totalBytes: total,
            received: recv,
            speed: Number((info && info.speed) || 0),
            state: String((info && info.state) || 'progressing'),
            progress: total > 0 ? (recv / total) : 0
          });
        });
      }

      if (api.webSources && api.webSources.onDownloadCompleted) {
        api.webSources.onDownloadCompleted(function (info) {
          upsertDownload(info && info.id, {
            state: String((info && info.state) || 'completed'),
            savePath: String((info && info.savePath) || ''),
            received: Number((info && info.totalBytes) || 0),
            totalBytes: Number((info && info.totalBytes) || 0),
            speed: 0,
            finishedAt: Date.now(),
            progress: 1
          });
        });
      }

      emitDownloadsChanged();
      renderDownloadsPanel();
    }

    return {
      formatBytes: formatBytes,
      formatSpeed: formatSpeed,
      renderDownloadsPanel: renderDownloadsPanel,
      showDownloadsPanel: showDownloadsPanel,
      initDownloadEvents: initDownloadEvents,
      emitDownloadsChanged: emitDownloadsChanged
    };
  };
})();
