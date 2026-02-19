// Shell (top bar / window controls) bindings extracted from reader HUD
// Build 7 (Phase 2): keep behavior identical, just relocate wiring.

(function bindShellBindings(){
  if (typeof el === 'undefined') return;

  // Build 8 (UI): Tile density (thumbnail size). Default is Large.
  const applyTileDensity = (density) => {
    const d = (density === 'compact') ? 'compact' : 'comfortable';
    try { document.body.dataset.tileDensity = d; } catch {}
    try { localStorage.setItem('tileDensity', d); } catch {}
    // Button label: keep it simple and visible.
    try {
      if (el.tileDensityBtn) el.tileDensityBtn.textContent = (d === 'compact') ? 'Tiles: Medium' : 'Tiles: Large';
    } catch {}
  };
  const toggleTileDensity = () => {
    const cur = (document.body.dataset.tileDensity || 'comfortable');
    applyTileDensity(cur === 'compact' ? 'comfortable' : 'compact');
  };

  // Initialize from persistence before first render.
  try { applyTileDensity(localStorage.getItem('tileDensity') || 'comfortable'); } catch { applyTileDensity('comfortable'); }

  if (el.tileDensityBtn) {
    el.tileDensityBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTileDensity();
    });
  }

  // Build 10.5: In Videos mode, the existing "Hidden" top-bar button becomes a thumbnails toggle.
  // We bind in CAPTURE phase and stop propagation so the Comics hidden-series overlay wiring remains untouched.
  if (el.hiddenSeriesBtn) {
    el.hiddenSeriesBtn.addEventListener('click', (e) => {
      try {
        if (!document.body.classList.contains('inVideoMode')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        try { window.videoApp && window.videoApp.toggleThumbs && window.videoApp.toggleThumbs(); } catch {}
        // Keep label in sync even if other code re-renders the top bar.
        try { window.videoApp && window.videoApp.syncThumbsBtn && window.videoApp.syncThumbsBtn(); } catch {}
      } catch {}
    }, true);
    el.hiddenSeriesBtn.addEventListener('click', (e) => {
      try {
        if (!document.body.classList.contains('inBooksMode')) return;
        // Block Comics hidden-series handler while in Books mode.
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch {}
    }, true);
  }

  // Build 12: keep the shared top-bar button label correct when switching between Comics/Videos.
  try {
    const mo = new MutationObserver(() => {
      try { window.videoApp && window.videoApp.syncThumbsBtn && window.videoApp.syncThumbsBtn(); } catch {}
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch {}

  // Build 7 (UI): Sidebar -> off-canvas drawer. Keep existing sidebar DOM + buttons, just toggle visibility.
  const setDrawerOpen = (open) => {
    const isOpen = !!open;
    document.body.classList.toggle('libDrawerOpen', isOpen);
    try { if (el.libMenuBtn) el.libMenuBtn.setAttribute('aria-expanded', String(isOpen)); } catch {}
  };

  const toggleDrawer = () => {
    const open = !document.body.classList.contains('libDrawerOpen');
    setDrawerOpen(open);
    if (open) {
      // Focus the first actionable item inside the drawer for keyboard users.
      try {
        const first = document.querySelector('.view:not(.hidden) .libSidebar button, .view:not(.hidden) .libSidebar [tabindex]');
        first && first.focus && first.focus();
      } catch {}
    }
  };

  if (el.libMenuBtn) {
    el.libMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Drawer is only relevant in library/video library views (not during reader/player).
      if (document.body.classList.contains('inPlayer')) return;
      toggleDrawer();
    });
  }

  if (el.libDrawerBackdrop) {
    el.libDrawerBackdrop.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDrawerOpen(false);
    });
  }

  // Escape closes drawer.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.body.classList.contains('libDrawerOpen')) return;
    if (document.body.classList.contains('inPlayer')) return;
    e.preventDefault();
    setDrawerOpen(false);
  });

  // MERIDIAN_PIN: Sidebar pin/float toggle
  var getSidebarPinned = function () {
    try { return localStorage.getItem('sidebarPinned') === '1'; } catch (e) { return false; }
  };
  var setSidebarPinned = function (pinned) {
    var val = !!pinned;
    document.body.classList.toggle('sidebarPinned', val);
    try { localStorage.setItem('sidebarPinned', val ? '1' : '0'); } catch (e) {}
    // When pinning, close the floating drawer (no longer needed)
    if (val) setDrawerOpen(false);
    // Update all pin button titles
    try {
      var btns = document.querySelectorAll('.sidebarPinBtn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].title = val ? 'Unpin sidebar' : 'Pin sidebar';
        btns[i].setAttribute('aria-label', val ? 'Unpin sidebar' : 'Pin sidebar');
      }
    } catch (e) {}
  };

  // Restore pinned state on boot
  if (getSidebarPinned()) setSidebarPinned(true);

  // Bind all pin buttons (one per sidebar)
  try {
    var pinBtns = document.querySelectorAll('.sidebarPinBtn');
    for (var pi = 0; pi < pinBtns.length; pi++) {
      pinBtns[pi].addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setSidebarPinned(!document.body.classList.contains('sidebarPinned'));
      });
    }
  } catch (e) {}

  // MERIDIAN_THEME: Color theme picker
  var THEME_PRESETS = [
    { id: 'noir',     label: 'Noir',     bg0: '#050505', bg1: '#0a0a0a', accent: '#c7a76b', accentRgb: '199,167,107', swatch: '#1a1c24' },
    { id: 'midnight', label: 'Midnight',  bg0: '#080d14', bg1: '#0d1117', accent: '#58a6ff', accentRgb: '88,166,255',  swatch: '#162030' },
    { id: 'ember',    label: 'Ember',     bg0: '#100808', bg1: '#1a0c0c', accent: '#ff6b4a', accentRgb: '255,107,74',  swatch: '#2a1410' },
    { id: 'forest',   label: 'Forest',    bg0: '#060e08', bg1: '#0c1a10', accent: '#4ade80', accentRgb: '74,222,128',  swatch: '#0f2418' },
    { id: 'lavender', label: 'Lavender',  bg0: '#0c080e', bg1: '#140c1a', accent: '#c084fc', accentRgb: '192,132,252', swatch: '#1e1228' },
    { id: 'arctic',   label: 'Arctic',    bg0: '#060c14', bg1: '#0c1420', accent: '#7dd3fc', accentRgb: '125,211,252', swatch: '#0e1c30' },
    { id: 'warm',     label: 'Warm',      bg0: '#0e0c04', bg1: '#1a1408', accent: '#fbbf24', accentRgb: '251,191,36',  swatch: '#2a2010' }
  ];

  var applyTheme = function (themeId) {
    var theme = null;
    for (var i = 0; i < THEME_PRESETS.length; i++) {
      if (THEME_PRESETS[i].id === themeId) { theme = THEME_PRESETS[i]; break; }
    }
    if (!theme) return;
    try {
      var root = document.documentElement;
      root.style.setProperty('--vx-bg0', theme.bg0);
      root.style.setProperty('--vx-bg1', theme.bg1);
      root.style.setProperty('--vx-accent', theme.accent);
      root.style.setProperty('--vx-accent-rgb', theme.accentRgb);
    } catch (e) {}
    try { localStorage.setItem('appTheme', themeId); } catch (e) {}
    // Sync active swatch
    try {
      var swatches = document.querySelectorAll('.themeSwatch');
      for (var j = 0; j < swatches.length; j++) {
        swatches[j].classList.toggle('active', swatches[j].getAttribute('data-theme') === themeId);
      }
    } catch (e) {}
  };

  var renderThemeSwatches = function () {
    var container = document.getElementById('appThemeSwatches');
    if (!container) return;
    var savedTheme = '';
    try { savedTheme = localStorage.getItem('appTheme') || ''; } catch (e) {}
    var html = '';
    for (var i = 0; i < THEME_PRESETS.length; i++) {
      var t = THEME_PRESETS[i];
      var cls = 'themeSwatch' + (t.id === savedTheme ? ' active' : '');
      html += '<button class="' + cls + '" data-theme="' + t.id + '" title="' + t.label + '" aria-label="' + t.label + ' theme" style="background:' + t.swatch + '"></button>';
    }
    container.innerHTML = html;
    container.addEventListener('click', function (e) {
      var btn = e.target;
      if (!btn.classList.contains('themeSwatch')) return;
      var themeId = btn.getAttribute('data-theme');
      if (themeId) applyTheme(themeId);
    });
  };

  // Restore saved theme on boot
  try {
    var savedTheme = localStorage.getItem('appTheme');
    if (savedTheme) applyTheme(savedTheme);
  } catch (e) {}

  // Render theme swatches when settings overlay opens (or immediately if present)
  renderThemeSwatches();

  el.refreshBtn.addEventListener('click', () => {
    if (document.body.classList.contains('inBooksMode')) {
      try { window.booksApp && window.booksApp.refresh && window.booksApp.refresh(); } catch {}
      return;
    }
    if (document.body.classList.contains('inVideoMode')) {
      try { window.videoApp && window.videoApp.refresh && window.videoApp.refresh(); } catch {}
      return;
    }
    refreshLibrary();
  });

  // BUILD27: cancel running scan
  el.libraryScanCancel?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await Tanko.api.library.cancelScan();
      if (res?.ok) toast('Scan canceled');
    } catch {}
  });

  // Library top toolbar back button (YAC-style shell). Keep behavior identical to the existing back affordance.
  if (el.libBackBtn) {
    el.libBackBtn.addEventListener('click', () => {
      if (document.body.classList.contains('inBooksMode')) {
        try { window.booksApp && window.booksApp.back && window.booksApp.back(); } catch {}
        return;
      }
      if (document.body.classList.contains('inVideoMode')) {
        try { window.videoApp && window.videoApp.back && window.videoApp.back(); } catch {}
        return;
      }
      if (appState.selectedSeriesId && el.seriesBackBtn) el.seriesBackBtn.click();
    });
  }

  if (el.minimizeBtn) el.minimizeBtn.addEventListener('click', () => Tanko.api.window.minimize());
  if (el.libFsBtn) {
    el.libFsBtn.addEventListener('click', async () => {
      try { await Tanko.api.window.toggleFullscreen(); } catch {}
      try { if (typeof syncLibraryFullscreenBtn === 'function') syncLibraryFullscreenBtn().catch(()=>{}); } catch {}
      try { if (typeof syncPlayerFullscreenBtn === 'function') syncPlayerFullscreenBtn().catch(()=>{}); } catch {}
    });
  }
  if (el.closeBtn) el.closeBtn.addEventListener('click', () => Tanko.api.window.close());

  // MERIDIAN_FRAME: custom window controls
  var winMinBtn = document.getElementById('winMinBtn');
  var winMaxBtn = document.getElementById('winMaxBtn');
  var winCloseBtn = document.getElementById('winCloseBtn');
  if (winMinBtn) {
    winMinBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { Tanko.api.window.minimize(); } catch (err) {}
    });
  }
  if (winMaxBtn) {
    winMaxBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { Tanko.api.window.toggleFullscreen(); } catch (err) {}
    });
  }
  if (winCloseBtn) {
    winCloseBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { Tanko.api.window.close(); } catch (err) {}
    });
  }

  el.seriesBackBtn.addEventListener('click', () => {
    appState.selectedSeriesId = null;
    renderLibrary();
  });

    el.playerMinBtn.addEventListener('click', () => Tanko.api.window.minimize());
  if (el.playerFsBtn) {
    el.playerFsBtn.addEventListener('click', async () => {
      try { await Tanko.api.window.toggleFullscreen(); } catch {}
      // Fullscreen toggles usually trigger a resize, but sync anyway.
      try { if (typeof syncPlayerFullscreenBtn === 'function') syncPlayerFullscreenBtn().catch(()=>{}); } catch {}
    });
  }
  el.playerCloseBtn.addEventListener('click', () => Tanko.api.window.close());

  // Sync fullscreen button titles at least once on startup.
  try { if (typeof syncPlayerFullscreenBtn === 'function') syncPlayerFullscreenBtn().catch(()=>{}); } catch {}
  try { if (typeof syncLibraryFullscreenBtn === 'function') syncLibraryFullscreenBtn().catch(()=>{}); } catch {}

})();
