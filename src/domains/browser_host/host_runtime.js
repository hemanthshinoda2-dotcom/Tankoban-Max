// Browser Host Runtime (groundwork build)
// Goal: decouple Tankoban shell from the current embedded browser implementation
// so Aspect Browser can be re-integrated later behind a stable adapter contract.
(function browserHostRuntime() {
  'use strict';

  window.Tanko = window.Tanko || {};
  const tanko = window.Tanko;
  tanko.config = tanko.config || {};

  const defaults = {
    enabled: false, // Browser-less by default in this groundwork build.
    adapter: 'none', // future: 'legacy-web-embed' | 'aspect-embed'
    hideLaunchButtons: true,
    showDisabledToast: true
  };

  const cfg = Object.assign({}, defaults, (tanko.config.browserHost || {}));
  tanko.config.browserHost = cfg;

  function toast(msg) {
    try {
      if (typeof window.toast === 'function') {
        window.toast(String(msg || ''));
        return;
      }
    } catch (_err) {}
    try { console.info('[browserHost]', msg); } catch (_err2) {}
  }

  function disabledNotice(actionLabel) {
    if (!cfg.showDisabledToast) return;
    const action = String(actionLabel || 'Browser');
    toast(action + ' is unavailable right now.');
  }

  function makeDisabledAdapter() {
    return {
      name: 'none',
      mode: 'disabled',
      async ensureReady() { return { ok: true, disabled: true, adapter: 'none' }; },
      async openDefault() { disabledNotice('Browser'); return { ok: false, disabled: true }; },
      async openTorrentWorkspace() { disabledNotice('Torrent workspace'); return { ok: false, disabled: true }; },
      async openAddSourceDialog() { disabledNotice('Add source'); return { ok: false, disabled: true }; },
      async openUrl(_url) { disabledNotice('Browser'); return { ok: false, disabled: true }; },
      canOpenAddSource() { return false; },
      isBrowserOpen() { return false; }
    };
  }

  function makeLegacyAdapter() {
    return {
      name: 'legacy-web-embed',
      mode: 'legacy',
      async ensureReady() {
        const d = tanko.deferred;
        if (d && typeof d.ensureWebModulesLoadedLegacy === 'function') {
          await d.ensureWebModulesLoadedLegacy();
          return { ok: true, adapter: 'legacy-web-embed' };
        }
        return { ok: false, error: 'legacy loader unavailable' };
      },
      async openDefault() {
        await this.ensureReady();
        const web = tanko.web;
        if (web && typeof web.openDefault === 'function') return web.openDefault();
        if (web && typeof web.openHome === 'function') return web.openHome();
        if (web && typeof web.openBrowser === 'function') return web.openBrowser(null);
      },
      async openTorrentWorkspace() {
        await this.ensureReady();
        const web = tanko.web;
        if (web && typeof web.openTorrentWorkspace === 'function') return web.openTorrentWorkspace();
        return this.openDefault();
      },
      async openAddSourceDialog() {
        await this.ensureReady();
        const web = tanko.web;
        if (web && typeof web.openAddSourceDialog === 'function') return web.openAddSourceDialog();
        return this.openDefault();
      },
      async openUrl(url) {
        await this.ensureReady();
        const web = tanko.web;
        if (web && typeof web.openBrowser === 'function') return web.openBrowser(url || null);
        return this.openDefault();
      },
      canOpenAddSource() { return true; },
      isBrowserOpen() {
        try {
          const web = tanko.web;
          if (web && typeof web.isBrowserOpen === 'function') return !!web.isBrowserOpen();
        } catch (_err) {}
        return false;
      }
    };
  }

  let customAdapter = null;
  let resolvedAdapter = null;

  function resolveAdapter() {
    if (customAdapter) return customAdapter;
    if (!cfg.enabled || cfg.adapter === 'none') return makeDisabledAdapter();
    if (cfg.adapter === 'legacy-web-embed') return makeLegacyAdapter();
    return makeDisabledAdapter();
  }

  function getAdapter() {
    if (!resolvedAdapter) resolvedAdapter = resolveAdapter();
    return resolvedAdapter;
  }

  function resetAdapterCache() {
    resolvedAdapter = null;
  }

  function ensureLegacyWebStub() {
    if (tanko.web && typeof tanko.web === 'object') return;
    tanko.web = {
      openDefault: function () { disabledNotice('Browser'); },
      openHome: function () { disabledNotice('Browser'); },
      openBrowser: function () { disabledNotice('Browser'); },
      openTorrentWorkspace: function () { disabledNotice('Torrent workspace'); },
      openAddSourceDialog: function () { disabledNotice('Add source'); },
      isBrowserOpen: function () { return false; }
    };
  }

  ensureLegacyWebStub();

  function updateUiHints() {
    const ids = ['webHubToggleBtn', 'webHubAddSourceBtn'];
    ids.forEach(function (id) {
      const node = document.getElementById(id);
      if (!node) return;
      if (cfg.hideLaunchButtons) {
        node.classList.add('hidden');
        node.setAttribute('aria-hidden', 'true');
      } else {
        node.classList.remove('hidden');
        node.removeAttribute('aria-hidden');
      }
    });
    const webView = document.getElementById('webBrowserView');
    if (webView && cfg.hideLaunchButtons) webView.classList.add('hidden');
  }

  const api = {
    version: '1.0.0',
    registerAdapter(adapter) {
      if (!adapter || typeof adapter !== 'object') return false;
      customAdapter = adapter;
      resetAdapterCache();
      return true;
    },
    unregisterAdapter() {
      customAdapter = null;
      resetAdapterCache();
    },
    getConfig() { return Object.assign({}, cfg); },
    setConfig(partial) {
      if (!partial || typeof partial !== 'object') return this.getConfig();
      Object.assign(cfg, partial);
      tanko.config.browserHost = cfg;
      resetAdapterCache();
      try { updateUiHints(); } catch (_err) {}
      return this.getConfig();
    },
    showBrowserPane(opts) {
      const _opts = (opts && typeof opts === 'object') ? opts : {};
      const browserView = document.getElementById('webBrowserView');
      const libraryView = document.getElementById('webLibraryView');
      if (libraryView) {
        libraryView.classList.add('hidden');
        libraryView.style.display = 'none';
        libraryView.setAttribute('aria-hidden', 'true');
      }
      if (browserView) {
        browserView.classList.remove('hidden');
        browserView.style.display = '';
        browserView.removeAttribute('aria-hidden');
      }
      // Optional hint: hide launch buttons if requested.
      if (_opts.hideLaunchButtons === true) {
        try { this.showLaunchButtons(false); } catch (_e) {}
      }
      return true;
    },

    showLibraryPane() {
      const browserView = document.getElementById('webBrowserView');
      const libraryView = document.getElementById('webLibraryView');
      if (browserView) {
        browserView.classList.add('hidden');
        browserView.style.display = 'none';
        browserView.setAttribute('aria-hidden', 'true');
      }
      if (libraryView) {
        libraryView.classList.remove('hidden');
        libraryView.style.display = '';
        libraryView.removeAttribute('aria-hidden');
      }
      return true;
    },

    showLaunchButtons(_visible) {
      const visible = (_visible !== false);
      const ids = ['webHubToggleBtn', 'webHubAddSourceBtn'];
      ids.forEach(function (id) {
        const node = document.getElementById(id);
        if (!node) return;
        if (visible) {
          node.classList.remove('hidden');
          node.removeAttribute('aria-hidden');
        } else {
          node.classList.add('hidden');
          node.setAttribute('aria-hidden', 'true');
        }
      });
      return true;
    },

    status() {
      const adapter = getAdapter();
      if (!cfg.enabled || (adapter && adapter.mode === 'disabled')) return 'disabled';
      return 'ready';
    },
    adapterName() {
      const adapter = getAdapter();
      return adapter && adapter.name ? String(adapter.name) : 'none';
    },
    isEnabled() { return !!cfg.enabled; },
    shouldHideLaunchButtons() { return !!cfg.hideLaunchButtons && !cfg.enabled; },
    canOpenAddSource() {
      try {
        const adapter = getAdapter();
        return !!(adapter && typeof adapter.canOpenAddSource === 'function' && adapter.canOpenAddSource());
      } catch (_err) {
        return false;
      }
    },
    async ensureReady() {
      const adapter = getAdapter();
      if (!adapter || typeof adapter.ensureReady !== 'function') return { ok: false, error: 'no adapter' };
      return adapter.ensureReady();
    },
    async openDefault() {
      const adapter = getAdapter();
      if (adapter && typeof adapter.openDefault === 'function') return adapter.openDefault();
      disabledNotice('Browser');
      return { ok: false };
    },
    async openTorrentWorkspace() {
      const adapter = getAdapter();
      if (adapter && typeof adapter.openTorrentWorkspace === 'function') return adapter.openTorrentWorkspace();
      disabledNotice('Torrent workspace');
      return { ok: false };
    },
    async openAddSourceDialog() {
      const adapter = getAdapter();
      if (adapter && typeof adapter.openAddSourceDialog === 'function') return adapter.openAddSourceDialog();
      disabledNotice('Add source');
      return { ok: false };
    },
    async openUrl(url) {
      const adapter = getAdapter();
      if (adapter && typeof adapter.openUrl === 'function') return adapter.openUrl(url);
      disabledNotice('Browser');
      return { ok: false };
    },
    isBrowserOpen() {
      const adapter = getAdapter();
      try {
        return !!(adapter && typeof adapter.isBrowserOpen === 'function' && adapter.isBrowserOpen());
      } catch (_err) { return false; }
    },
    getIntegrationSpec() {
      return {
        contractVersion: 1,
        config: this.getConfig(),
        mountPoints: {
          rootViewId: 'webBrowserView',
          launchButtonId: 'webHubToggleBtn',
          addSourceButtonId: 'webHubAddSourceBtn'
        },
        requiredAdapterMethods: [
          'ensureReady',
          'openDefault',
          'openTorrentWorkspace',
          'openAddSourceDialog'
        ],
        optionalAdapterMethods: [
          'openUrl',
          'isBrowserOpen',
          'canOpenAddSource'
        ]
      };
    }
  };

  tanko.browserHost = api;

  function onReady() {
    try { updateUiHints(); } catch (_err) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }

  try {
    console.info('[browserHost] groundwork runtime active:', api.getIntegrationSpec());
  } catch (_err) {}
})();
