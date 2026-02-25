// Lucide sprite bootstrap + renderer helpers for library UI.
(function iconsBootstrap() {
  'use strict';

  const SPRITE_URL = './ui/icons_sprite.svg';
  const DEFAULT_CLASS = 'ui-icon';

  const ICON_BY_ID = {
    libMenuBtn: 'menu',
    libBackBtn: 'chevron-left',
    libForwardBtn: 'chevron-right',
    refreshBtn: 'refresh-cw',
    minimizeBtn: 'minus',
    libFsBtn: 'maximize',
    closeBtn: 'x',

    addRootBtn: 'plus',
    addSeriesBtn: 'folder-plus',
    openFileBtn: 'file',
    openSettingsBtn: 'settings',
    libraryScanCancel: 'x',
    mangaLibTipsClose: 'x',
    seriesBackBtn: 'arrow-left',
    booksAddRootBtn: 'plus',
    booksAddSeriesBtn: 'folder-plus',
    booksAddFilesBtn: 'files',
    booksOpenFileBtn: 'file',
    booksRefreshBtn: 'refresh-cw',
    booksScanCancel: 'x',
    booksLibTipsClose: 'x',
    booksShowBackBtn: 'arrow-left',

    videoAddFolderBtn: 'plus',
    videoAddShowFolderBtn: 'folder-plus',
    videoAddFilesBtn: 'files',
    videoOpenFileBtn: 'file',
    videoRefreshBtn: 'refresh-cw',
    videoScanCancel: 'x',
    videoLibTipsClose: 'x',
    videoShowBackBtn: 'arrow-left',
  };

  window.Tanko = window.Tanko || {};
  window.Tanko.ui = window.Tanko.ui || {};

  function iconNameFor(el) {
    if (!el || !el.dataset) return '';
    return String(el.dataset.icon || '').trim().toLowerCase();
  }

  function renderIcon(name, attrs) {
    const icon = String(name || '').trim().toLowerCase();
    if (!icon) return '';

    const cfg = (attrs && typeof attrs === 'object') ? attrs : {};
    const className = String(cfg.className || DEFAULT_CLASS);
    const label = String(cfg.label || '').trim();
    const hidden = cfg.hidden !== false;
    const aria = hidden ? ' aria-hidden="true"' : (label ? ` aria-label="${escapeHtml(label)}"` : '');
    const role = hidden ? '' : ' role="img"';

    return `<svg class="${escapeHtml(className)}"${role}${aria} viewBox="0 0 24 24"><use href="#icon-${escapeHtml(icon)}"></use></svg>`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (c) => (
      c === '&' ? '&amp;'
      : c === '<' ? '&lt;'
      : c === '>' ? '&gt;'
      : c === '"' ? '&quot;'
      : '&#39;'
    ));
  }

  function hydrateIcons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const nodes = scope.querySelectorAll('[data-icon]');
    for (const node of nodes) {
      const name = iconNameFor(node);
      if (!name) continue;
      if (node.querySelector && node.querySelector('svg.ui-icon')) continue;

      const iconMarkup = renderIcon(name, { className: DEFAULT_CLASS, hidden: true });
      if (!iconMarkup) continue;

      if (node.classList && node.classList.contains('iconBtn')) {
        node.innerHTML = iconMarkup;
        node.classList.add('ui-icon-only');
        continue;
      }

      const txt = String(node.textContent || '').trim();
      if (!txt) {
        node.innerHTML = iconMarkup;
        continue;
      }

      node.innerHTML = `${iconMarkup}<span class="ui-btn-label">${escapeHtml(txt)}</span>`;
      node.classList.add('ui-icon-leading');
    }
  }

  function applyIconIds() {
    for (const [id, icon] of Object.entries(ICON_BY_ID)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.dataset.icon = icon;
    }
  }

  function setModeTheme(mode) {
    const m = String(mode || '').toLowerCase();
    const value = (m === 'books' || m === 'videos' || m === 'comics' || m === 'browser') ? m : 'comics';
    document.body.setAttribute('data-mode', value);
  }

  async function injectSprite() {
    try {
      if (document.getElementById('uiIconSpriteMount')) return true;
      let text = '';
      try {
        const res = await fetch(SPRITE_URL);
        if (res && res.ok) text = await res.text();
      } catch {}
      if (!text) {
        try {
          const req = new XMLHttpRequest();
          req.open('GET', SPRITE_URL, false);
          req.send(null);
          if (req.status >= 200 && req.status < 400) text = String(req.responseText || '');
        } catch {}
      }
      if (!text) return false;
      const mount = document.createElement('div');
      mount.id = 'uiIconSpriteMount';
      mount.style.display = 'none';
      mount.setAttribute('aria-hidden', 'true');
      mount.innerHTML = text;
      document.body.appendChild(mount);
      return true;
    } catch (err) {
      console.warn('[ui] icon sprite load failed', err);
      return false;
    }
  }

  window.Tanko.ui.renderIcon = renderIcon;
  window.Tanko.ui.hydrateIcons = hydrateIcons;
  window.Tanko.ui.setModeTheme = setModeTheme;

  async function start() {
    await injectSprite();
    applyIconIds();
    hydrateIcons(document);
    setModeTheme((window.Tanko && window.Tanko.modeRouter && typeof window.Tanko.modeRouter.getMode === 'function')
      ? window.Tanko.modeRouter.getMode()
      : 'comics');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { start().catch(() => {}); }, { once: true });
  } else {
    start().catch(() => {});
  }
})();
