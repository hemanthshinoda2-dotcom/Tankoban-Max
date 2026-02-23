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
    // FIX-TILES: notify JS geometry schedulers (Video/Books continue shelves)
    try { document.body.dispatchEvent(new CustomEvent('tileDensityChanged')); } catch {}
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

  // Theme cycle: dark → light → nord → solarized → gruvbox → catppuccin → dark
  var APP_THEMES = ['dark', 'light', 'nord', 'solarized', 'gruvbox', 'catppuccin'];
  var THEME_LABELS = { dark: 'Dark', light: 'Light', nord: 'Nord', solarized: 'Solarized', gruvbox: 'Gruvbox', catppuccin: 'Catppuccin' };

  const applyAppTheme = (theme) => {
    var t = APP_THEMES.indexOf(theme) >= 0 ? theme : 'dark';
    try { document.body.dataset.appTheme = t; } catch {}
    // Shoelace theme: light for "light", dark for everything else
    try {
      if (t === 'light') {
        document.documentElement.classList.remove('sl-theme-dark');
      } else {
        document.documentElement.classList.add('sl-theme-dark');
      }
    } catch {}
    try { localStorage.setItem('appTheme', t); } catch {}
    // Swap icon: sun for dark themes (click = go lighter), moon for light theme
    if (el.themeToggleBtn) {
      try {
        var sunIcon = el.themeToggleBtn.querySelector('.themeIcon--sun');
        var moonIcon = el.themeToggleBtn.querySelector('.themeIcon--moon');
        if (sunIcon && moonIcon) {
          sunIcon.style.display = (t === 'light') ? 'none' : 'block';
          moonIcon.style.display = (t === 'light') ? 'block' : 'none';
        }
      } catch {}
      var nextIdx = (APP_THEMES.indexOf(t) + 1) % APP_THEMES.length;
      el.themeToggleBtn.title = THEME_LABELS[t] + ' — click for ' + THEME_LABELS[APP_THEMES[nextIdx]];
    }
  };
  const cycleAppTheme = () => {
    var cur = document.body.dataset.appTheme || 'dark';
    var idx = APP_THEMES.indexOf(cur);
    applyAppTheme(APP_THEMES[(idx + 1) % APP_THEMES.length]);
  };

  try { applyAppTheme(localStorage.getItem('appTheme') || 'dark'); } catch { applyAppTheme('dark'); }

  if (el.themeToggleBtn) {
    el.themeToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cycleAppTheme();
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

  const isReaderOrPlayerContext = () => {
    try {
      return !!(
        document.body.classList.contains('inPlayer') ||
        document.body.classList.contains('inVideoPlayer') ||
        document.body.classList.contains('inBooksReader')
      );
    } catch {
      return false;
    }
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
      if (isReaderOrPlayerContext()) return;
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

  // Global Settings overlay controller
  var LIB_DEFAULT_AUTO_BASE = 25;
  var LIB_DEFAULT_AUTO_STEP = 15;

  var webHubToggleBtn = document.getElementById('webHubToggleBtn');
  var openSettingsBtn = document.getElementById('openSettingsBtn');
  var librarySettingsOverlay = document.getElementById('librarySettingsOverlay');
  var settingsCloseBtn = document.getElementById('settingsClose');
  var settingsTabButtons = document.querySelectorAll('.settingsTab[data-settings-tab]');
  var settingsTabGeneral = document.getElementById('settingsTabGeneral');
  var settingsTabBrowser = document.getElementById('settingsTabBrowser');
  var settingsPanelGeneral = document.getElementById('settingsPanelGeneral');
  var settingsPanelBrowser = document.getElementById('settingsPanelBrowser');
  var settingsAutoBase = document.getElementById('settingsAutoBase');
  var settingsAutoStep = document.getElementById('settingsAutoStep');
  var settingsScanIgnore = document.getElementById('settingsScanIgnore');
  var settingsSaveBtn = document.getElementById('settingsSave');
  var settingsResetBtn = document.getElementById('settingsReset');
  var webHubAddSourceBtn = document.getElementById('webHubAddSourceBtn');

  // Cleanup deprecated Web Hub state.
  try { localStorage.removeItem('webHubCollapsedSections'); } catch (err) {}

  function normalizeSettingsTab(tab) {
    var t = String(tab || 'general').toLowerCase();
    if (t === 'browser') return 'browser';
    return 'general';
  }

  function isSettingsOpen() {
    return !!(librarySettingsOverlay && !librarySettingsOverlay.classList.contains('hidden'));
  }

  function readSettingsNumber(inputEl, fallbackValue, min, max) {
    var raw = parseInt(String((inputEl && inputEl.value) || ''), 10);
    var num = isFinite(raw) ? raw : fallbackValue;
    if (num < min) num = min;
    if (num > max) num = max;
    return num;
  }

  function syncGeneralSettingsInputs() {
    var base = LIB_DEFAULT_AUTO_BASE;
    var step = LIB_DEFAULT_AUTO_STEP;
    try {
      if (window.appState && window.appState.ui) {
        if (isFinite(Number(window.appState.ui.autoScrollBaseSecondsPerScreen))) {
          base = Number(window.appState.ui.autoScrollBaseSecondsPerScreen);
        }
        if (isFinite(Number(window.appState.ui.autoScrollStepPct))) {
          step = Number(window.appState.ui.autoScrollStepPct);
        }
      }
    } catch (err) {}
    try {
      var baseStored = parseInt(localStorage.getItem('autoScrollBaseSecondsPerScreen') || '', 10);
      var stepStored = parseInt(localStorage.getItem('autoScrollStepPct') || '', 10);
      if (isFinite(baseStored)) base = baseStored;
      if (isFinite(stepStored)) step = stepStored;
    } catch (err2) {}
    if (settingsAutoBase) settingsAutoBase.value = String(readSettingsNumber({ value: base }, base, 5, 60));
    if (settingsAutoStep) settingsAutoStep.value = String(readSettingsNumber({ value: step }, step, 1, 50));

    if (settingsScanIgnore) {
      var ignore = [];
      try {
        var list = window.appState && window.appState.library ? window.appState.library.scanIgnore : null;
        if (Array.isArray(list)) ignore = list;
      } catch (err3) {}
      settingsScanIgnore.value = ignore.join('\n');
    }
  }

  function persistGeneralSettings(baseSeconds, stepPct) {
    try { localStorage.setItem('autoScrollBaseSecondsPerScreen', String(baseSeconds)); } catch (err) {}
    try { localStorage.setItem('autoScrollStepPct', String(stepPct)); } catch (err2) {}
  }

  function showSettingsToast(msg) {
    try {
      if (typeof window.toast === 'function') {
        window.toast(String(msg || ''));
        return;
      }
    } catch (err) {}
  }

  function saveGeneralSettings() {
    if (!settingsAutoBase || !settingsAutoStep) return;
    var base = readSettingsNumber(settingsAutoBase, LIB_DEFAULT_AUTO_BASE, 5, 60);
    var step = readSettingsNumber(settingsAutoStep, LIB_DEFAULT_AUTO_STEP, 1, 50);
    persistGeneralSettings(base, step);
    try {
      if (window.appState && window.appState.ui) {
        window.appState.ui.autoScrollBaseSecondsPerScreen = base;
        window.appState.ui.autoScrollStepPct = step;
      }
    } catch (err) {}

    var ignoreLines = [];
    if (settingsScanIgnore) {
      ignoreLines = String(settingsScanIgnore.value || '')
        .split('\n')
        .map(function (line) { return String(line || '').trim(); })
        .filter(Boolean);
    }
    try {
      if (window.Tanko && window.Tanko.api && window.Tanko.api.library && typeof window.Tanko.api.library.setScanIgnore === 'function') {
        window.Tanko.api.library.setScanIgnore(ignoreLines).then(function (res) {
          try {
            if (res && res.ok && res.state && window.appState) window.appState.library = res.state;
          } catch (innerErr) {}
        }).catch(function () {});
      }
    } catch (err2) {}
    showSettingsToast('Settings saved');
    syncGeneralSettingsInputs();
  }

  function resetGeneralSettings() {
    persistGeneralSettings(LIB_DEFAULT_AUTO_BASE, LIB_DEFAULT_AUTO_STEP);
    try {
      if (window.appState && window.appState.ui) {
        window.appState.ui.autoScrollBaseSecondsPerScreen = LIB_DEFAULT_AUTO_BASE;
        window.appState.ui.autoScrollStepPct = LIB_DEFAULT_AUTO_STEP;
      }
    } catch (err) {}
    syncGeneralSettingsInputs();
    showSettingsToast('Settings reset');
  }

  function selectSettingsTab(tab) {
    var normalized = normalizeSettingsTab(tab);
    if (settingsTabGeneral) {
      var generalActive = normalized === 'general';
      settingsTabGeneral.classList.toggle('active', generalActive);
      settingsTabGeneral.setAttribute('aria-selected', generalActive ? 'true' : 'false');
    }
    if (settingsTabBrowser) {
      var browserActive = normalized === 'browser';
      settingsTabBrowser.classList.toggle('active', browserActive);
      settingsTabBrowser.setAttribute('aria-selected', browserActive ? 'true' : 'false');
    }
    if (settingsPanelGeneral) settingsPanelGeneral.classList.toggle('hidden', normalized !== 'general');
    if (settingsPanelBrowser) settingsPanelBrowser.classList.toggle('hidden', normalized !== 'browser');
    if (librarySettingsOverlay) librarySettingsOverlay.setAttribute('data-active-settings-tab', normalized);
  }

  function ensureWebModulesLoadedForSettings() {
    try {
      var d = window.Tanko && window.Tanko.deferred;
      if (d && typeof d.ensureWebModulesLoaded === 'function') d.ensureWebModulesLoaded().catch(function () {});
    } catch (err) {}
  }

  function ensureReaderModulesLoadedForSettings() {
    try {
      var d = window.Tanko && window.Tanko.deferred;
      if (d && typeof d.ensureReaderModulesLoaded === 'function') d.ensureReaderModulesLoaded().catch(function () {});
    } catch (err) {}
  }

  function getBrowserSettingsSectionId(section) {
    var key = String(section || '').toLowerCase();
    if (key === 'sources') return 'settingsBrowserSourcesSection';
    if (key === 'history' || key === 'browsinghistory' || key === 'browsing-history') return 'settingsBrowserHistorySection';
    if (key === 'bookmarks') return 'settingsBrowserBookmarksSection';
    if (key === 'privacy' || key === 'data' || key === 'privacy-data') return 'settingsBrowserPrivacySection';
    if (key === 'permissions' || key === 'site-permissions') return 'settingsBrowserPermissionsSection';
    if (key === 'adblock' || key === 'ad-blocker') return 'settingsBrowserAdblockSection';
    return '';
  }

  function openSettings(opts) {
    var options = (opts && typeof opts === 'object') ? opts : {};
    var tab = normalizeSettingsTab(options.tab);
    if (!librarySettingsOverlay) return;

    if (tab === 'browser') ensureWebModulesLoadedForSettings();
    else {
      ensureReaderModulesLoadedForSettings();
      syncGeneralSettingsInputs();
    }

    librarySettingsOverlay.classList.remove('hidden');
    try { librarySettingsOverlay.setAttribute('aria-hidden', 'false'); } catch (err) {}
    setDrawerOpen(false);
    selectSettingsTab(tab);

    if (tab === 'browser' && options.section) {
      var targetId = getBrowserSettingsSectionId(options.section);
      if (targetId) {
        setTimeout(function () {
          var target = document.getElementById(targetId);
          if (!target || !isSettingsOpen()) return;
          try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err2) {}
        }, 80);
      }
    }
  }

  function closeSettings() {
    if (!librarySettingsOverlay) return;
    librarySettingsOverlay.classList.add('hidden');
    try { librarySettingsOverlay.setAttribute('aria-hidden', 'true'); } catch (err) {}
  }

  for (var sti = 0; sti < settingsTabButtons.length; sti++) {
    settingsTabButtons[sti].addEventListener('click', function (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      var tab = this.getAttribute('data-settings-tab');
      selectSettingsTab(tab);
      if (normalizeSettingsTab(tab) === 'browser') ensureWebModulesLoadedForSettings();
      else {
        ensureReaderModulesLoadedForSettings();
        syncGeneralSettingsInputs();
      }
    });
  }

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', function (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      openSettings({ tab: 'general' });
    });
  }

  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', function (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      closeSettings();
    });
  }

  if (librarySettingsOverlay) {
    librarySettingsOverlay.addEventListener('click', function (e) {
      if (e.target === librarySettingsOverlay) closeSettings();
    });
  }

  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', function (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      saveGeneralSettings();
    });
  }

  if (settingsResetBtn) {
    settingsResetBtn.addEventListener('click', function (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      resetGeneralSettings();
    });
  }

  selectSettingsTab('general');

  function isWebBrowserOpen() {
    try {
      return !!(window.Tanko && window.Tanko.web && typeof window.Tanko.web.isBrowserOpen === 'function' && window.Tanko.web.isBrowserOpen());
    } catch (err) {
      return false;
    }
  }

  function openBrowserFromTopButton() {
    var d = window.Tanko && window.Tanko.deferred;
    if (!d || typeof d.ensureWebModulesLoaded !== 'function') return;
    d.ensureWebModulesLoaded().then(function () {
      if (window.Tanko && window.Tanko.web) {
        if (typeof window.Tanko.web.openDefault === 'function') {
          window.Tanko.web.openDefault();
          return;
        }
        if (typeof window.Tanko.web.openHome === 'function') {
          window.Tanko.web.openHome();
        }
      }
    }).catch(function () {});
  }

  if (webHubToggleBtn) {
    webHubToggleBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (isReaderOrPlayerContext()) return;
      openBrowserFromTopButton();
    });
  }

  if (webHubAddSourceBtn) {
    webHubAddSourceBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var d = window.Tanko && window.Tanko.deferred;
      if (!d || typeof d.ensureWebModulesLoaded !== 'function') return;
      d.ensureWebModulesLoaded().then(function () {
        if (window.Tanko && window.Tanko.web && typeof window.Tanko.web.openAddSourceDialog === 'function') {
          window.Tanko.web.openAddSourceDialog();
        } else {
          var overlay = document.getElementById('webAddSourceOverlay');
          if (overlay) overlay.classList.remove('hidden');
        }
      }).catch(function () {});
    });
  }

  // Escape closes pickers, settings, then drawer.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    var closed = false;
    if (isDownloadDestPickerOpen()) {
      closeDownloadDestPicker({ ok: false, cancelled: true, error: 'Cancelled' });
      closed = true;
    }
    if (isSettingsOpen()) {
      closeSettings();
      closed = true;
    }
    if (isReaderOrPlayerContext()) {
      if (closed) e.preventDefault();
      return;
    }
    if (document.body.classList.contains('libDrawerOpen')) {
      setDrawerOpen(false);
      closed = true;
    }
    if (closed) e.preventDefault();
  });

  try {
    window.Tanko = window.Tanko || {};
    window.Tanko.settings = window.Tanko.settings || {};
    window.Tanko.settings.open = openSettings;
    window.Tanko.settings.close = closeSettings;
    window.Tanko.settings.selectTab = selectSettingsTab;
  } catch (err) {}

  // In-app download destination picker (Books/Comics/Videos only)
  var downloadDestPickerOverlay = document.getElementById('downloadDestPickerOverlay');
  var downloadDestPickerTitle = document.getElementById('downloadDestPickerTitle');
  var downloadDestPickerSubtext = document.getElementById('downloadDestPickerSubtext');
  var downloadDestPickerCancelBtn = document.getElementById('downloadDestPickerCancelBtn');
  var downloadDestPickerModes = document.getElementById('downloadDestPickerModes');
  var downloadDestPickerRootSelect = document.getElementById('downloadDestPickerRootSelect');
  var downloadDestPickerPath = document.getElementById('downloadDestPickerPath');
  var downloadDestPickerList = document.getElementById('downloadDestPickerList');
  var downloadDestPickerEmpty = document.getElementById('downloadDestPickerEmpty');
  var downloadDestPickerUpBtn = document.getElementById('downloadDestPickerUpBtn');
  var downloadDestPickerUseBtn = document.getElementById('downloadDestPickerUseBtn');
  var pickerModes = ['books', 'comics', 'videos'];

  var downloadDestPickerState = {
    requestId: '',
    kind: 'direct',
    suggestedFilename: '',
    mode: '',
    roots: { books: [], comics: [], videos: [] },
    currentRoot: '',
    currentPath: '',
    navStack: [],
    loadToken: '',
  };

  function getWebSourcesApi() {
    try { return window.Tanko && window.Tanko.api && window.Tanko.api.webSources ? window.Tanko.api.webSources : null; } catch { return null; }
  }

  function isDownloadDestPickerOpen() {
    return !!(downloadDestPickerOverlay && !downloadDestPickerOverlay.classList.contains('hidden') && downloadDestPickerState.requestId);
  }

  function modeLabel(mode) {
    if (mode === 'books') return 'Books';
    if (mode === 'comics') return 'Comics';
    if (mode === 'videos') return 'Videos';
    return 'Library';
  }

  function pickerEscapeHtml(v) {
    var s = String(v == null ? '' : v);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPickerRoots(mode) {
    var m = String(mode || '').toLowerCase();
    var list = downloadDestPickerState.roots && Array.isArray(downloadDestPickerState.roots[m]) ? downloadDestPickerState.roots[m] : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = String(list[i] || '').trim();
      if (p) out.push(p);
    }
    return out;
  }

  function getAvailablePickerModes() {
    var out = [];
    for (var i = 0; i < pickerModes.length; i++) {
      if (getPickerRoots(pickerModes[i]).length) out.push(pickerModes[i]);
    }
    return out;
  }

  function pickDefaultMode(modeHint) {
    var hint = String(modeHint || '').trim().toLowerCase();
    var available = getAvailablePickerModes();
    if (available.indexOf(hint) !== -1) return hint;
    return available.length ? available[0] : '';
  }

  function setPickerModeButtons() {
    if (!downloadDestPickerModes) return;
    var btns = downloadDestPickerModes.querySelectorAll('.downloadDestPickerMode[data-mode]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var mode = String(b.getAttribute('data-mode') || '').toLowerCase();
      var enabled = getPickerRoots(mode).length > 0;
      b.disabled = !enabled;
      b.classList.toggle('active', mode === downloadDestPickerState.mode);
    }
  }

  function setPickerPathText() {
    if (!downloadDestPickerPath) return;
    var cur = String(downloadDestPickerState.currentPath || '').trim();
    downloadDestPickerPath.textContent = cur || 'No folder selected';
  }

  function setPickerTitleText() {
    if (!downloadDestPickerTitle || !downloadDestPickerSubtext) return;
    var kind = String(downloadDestPickerState.kind || 'direct');
    if (kind === 'torrent') downloadDestPickerTitle.textContent = 'Choose Torrent Destination';
    else downloadDestPickerTitle.textContent = 'Choose Download Folder';
    var modeTxt = modeLabel(downloadDestPickerState.mode);
    var suggested = String(downloadDestPickerState.suggestedFilename || '').trim();
    downloadDestPickerSubtext.textContent = suggested
      ? ('Save "' + suggested + '" in ' + modeTxt + '.')
      : ('Pick a folder in ' + modeTxt + '.');
  }

  function renderPickerRoots() {
    if (!downloadDestPickerRootSelect) return;
    var roots = getPickerRoots(downloadDestPickerState.mode);
    var html = '';
    for (var i = 0; i < roots.length; i++) {
      var r = String(roots[i] || '');
      var selected = (r === downloadDestPickerState.currentRoot) ? ' selected' : '';
      html += '<option value="' + pickerEscapeHtml(r) + '"' + selected + '>' + pickerEscapeHtml(r) + '</option>';
    }
    downloadDestPickerRootSelect.innerHTML = html;
    downloadDestPickerRootSelect.disabled = roots.length <= 1;
  }

  function renderPickerFolderNodes(folders) {
    if (!downloadDestPickerList || !downloadDestPickerEmpty) return;
    var list = Array.isArray(folders) ? folders : [];
    if (!list.length) {
      downloadDestPickerList.innerHTML = '';
      downloadDestPickerEmpty.classList.remove('hidden');
      return;
    }
    downloadDestPickerEmpty.classList.add('hidden');
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var f = list[i] || {};
      var name = String(f.name || '').trim();
      var p = String(f.path || '').trim();
      if (!name || !p) continue;
      html += '<button class="downloadDestPickerNode" type="button" data-folder-path="' + pickerEscapeHtml(p) + '">' + pickerEscapeHtml(name) + '</button>';
    }
    downloadDestPickerList.innerHTML = html;

    var nodes = downloadDestPickerList.querySelectorAll('.downloadDestPickerNode[data-folder-path]');
    for (var j = 0; j < nodes.length; j++) {
      nodes[j].addEventListener('click', function (e) {
        e.preventDefault();
        var next = String(this.getAttribute('data-folder-path') || '').trim();
        if (!next) return;
        if (downloadDestPickerState.currentPath) downloadDestPickerState.navStack.push(downloadDestPickerState.currentPath);
        downloadDestPickerState.currentPath = next;
        setPickerPathText();
        loadPickerFolders();
      });
    }
  }

  function syncPickerActionButtons() {
    if (downloadDestPickerUseBtn) downloadDestPickerUseBtn.disabled = !downloadDestPickerState.currentPath;
    if (downloadDestPickerUpBtn) {
      var atRoot = !downloadDestPickerState.currentPath || downloadDestPickerState.currentPath === downloadDestPickerState.currentRoot;
      downloadDestPickerUpBtn.disabled = atRoot && downloadDestPickerState.navStack.length === 0;
    }
  }

  function setPickerMode(mode) {
    var m = String(mode || '').trim().toLowerCase();
    if (pickerModes.indexOf(m) === -1) return;
    var roots = getPickerRoots(m);
    if (!roots.length) return;
    downloadDestPickerState.mode = m;
    downloadDestPickerState.currentRoot = roots[0];
    downloadDestPickerState.currentPath = roots[0];
    downloadDestPickerState.navStack = [];
    setPickerTitleText();
    setPickerModeButtons();
    renderPickerRoots();
    setPickerPathText();
    syncPickerActionButtons();
    loadPickerFolders();
  }

  function loadPickerFolders() {
    var api = getWebSourcesApi();
    if (!api || typeof api.listDestinationFolders !== 'function') {
      renderPickerFolderNodes([]);
      return;
    }
    var mode = downloadDestPickerState.mode;
    var currentPath = downloadDestPickerState.currentPath;
    if (!mode || !currentPath) {
      renderPickerFolderNodes([]);
      syncPickerActionButtons();
      return;
    }

    var token = String(downloadDestPickerState.requestId || '') + '|' + mode + '|' + currentPath;
    downloadDestPickerState.loadToken = token;
    renderPickerFolderNodes([]);
    if (downloadDestPickerEmpty) {
      downloadDestPickerEmpty.textContent = 'Loading folders...';
      downloadDestPickerEmpty.classList.remove('hidden');
    }

    api.listDestinationFolders({ mode: mode, path: currentPath }).then(function (res) {
      if (downloadDestPickerState.loadToken !== token) return;
      if (!res || !res.ok) {
        renderPickerFolderNodes([]);
        if (downloadDestPickerEmpty) downloadDestPickerEmpty.textContent = (res && res.error) ? String(res.error) : 'Could not load folders.';
        syncPickerActionButtons();
        return;
      }
      renderPickerFolderNodes(Array.isArray(res.folders) ? res.folders : []);
      if (downloadDestPickerEmpty) downloadDestPickerEmpty.textContent = 'No subfolders in this folder.';
      syncPickerActionButtons();
    }).catch(function () {
      if (downloadDestPickerState.loadToken !== token) return;
      renderPickerFolderNodes([]);
      if (downloadDestPickerEmpty) downloadDestPickerEmpty.textContent = 'Could not load folders.';
      syncPickerActionButtons();
    });
  }

  function closeDownloadDestPicker(result) {
    if (!downloadDestPickerOverlay) return;
    var reqId = String(downloadDestPickerState.requestId || '');
    downloadDestPickerState.requestId = '';
    downloadDestPickerState.loadToken = '';
    downloadDestPickerOverlay.classList.add('hidden');
    try { downloadDestPickerOverlay.setAttribute('aria-hidden', 'true'); } catch {}

    if (!reqId) return;
    var api = getWebSourcesApi();
    if (!api || typeof api.resolveDestinationPicker !== 'function') return;
    var payload = Object.assign({ requestId: reqId }, result || {});
    api.resolveDestinationPicker(payload).catch(function () {});
  }

  function openDownloadDestPicker(req) {
    var request = (req && typeof req === 'object') ? req : {};
    var reqId = String(request.requestId || '').trim();
    if (!reqId) return;

    if (downloadDestPickerState.requestId) {
      closeDownloadDestPicker({ ok: false, cancelled: true, error: 'Replaced by a new picker request' });
    }

    downloadDestPickerState.requestId = reqId;
    downloadDestPickerState.kind = String(request.kind || 'direct').toLowerCase();
    downloadDestPickerState.suggestedFilename = String(request.suggestedFilename || '').trim();
    downloadDestPickerState.roots = {
      books: Array.isArray(request.roots && request.roots.books) ? request.roots.books : [],
      comics: Array.isArray(request.roots && request.roots.comics) ? request.roots.comics : [],
      videos: Array.isArray(request.roots && request.roots.videos) ? request.roots.videos : [],
    };

    var mode = pickDefaultMode(request.modeHint);
    if (!mode) {
      closeDownloadDestPicker({ ok: false, cancelled: true, error: 'No configured library roots available' });
      return;
    }

    if (downloadDestPickerOverlay) {
      downloadDestPickerOverlay.classList.remove('hidden');
      try { downloadDestPickerOverlay.setAttribute('aria-hidden', 'false'); } catch {}
    }
    setPickerMode(mode);
  }

  if (downloadDestPickerModes) {
    downloadDestPickerModes.addEventListener('click', function (e) {
      var btn = e && e.target ? e.target.closest('.downloadDestPickerMode[data-mode]') : null;
      if (!btn) return;
      e.preventDefault();
      setPickerMode(btn.getAttribute('data-mode'));
    });
  }

  if (downloadDestPickerRootSelect) {
    downloadDestPickerRootSelect.addEventListener('change', function () {
      var nextRoot = String(downloadDestPickerRootSelect.value || '').trim();
      if (!nextRoot) return;
      downloadDestPickerState.currentRoot = nextRoot;
      downloadDestPickerState.currentPath = nextRoot;
      downloadDestPickerState.navStack = [];
      setPickerPathText();
      syncPickerActionButtons();
      loadPickerFolders();
    });
  }

  if (downloadDestPickerUpBtn) {
    downloadDestPickerUpBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (downloadDestPickerState.navStack.length > 0) {
        downloadDestPickerState.currentPath = downloadDestPickerState.navStack.pop();
      } else {
        downloadDestPickerState.currentPath = downloadDestPickerState.currentRoot;
      }
      setPickerPathText();
      syncPickerActionButtons();
      loadPickerFolders();
    });
  }

  if (downloadDestPickerUseBtn) {
    downloadDestPickerUseBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!downloadDestPickerState.currentPath) return;
      closeDownloadDestPicker({
        ok: true,
        cancelled: false,
        mode: downloadDestPickerState.mode,
        folderPath: downloadDestPickerState.currentPath,
      });
    });
  }

  if (downloadDestPickerCancelBtn) {
    downloadDestPickerCancelBtn.addEventListener('click', function (e) {
      e.preventDefault();
      closeDownloadDestPicker({ ok: false, cancelled: true, error: 'Cancelled' });
    });
  }

  if (downloadDestPickerOverlay) {
    downloadDestPickerOverlay.addEventListener('click', function (e) {
      if (e && e.target === downloadDestPickerOverlay) {
        closeDownloadDestPicker({ ok: false, cancelled: true, error: 'Cancelled' });
      }
    });
  }

  try {
    var _wsApi = getWebSourcesApi();
    if (_wsApi && typeof _wsApi.onDestinationPickerRequest === 'function') {
      _wsApi.onDestinationPickerRequest(function (payload) {
        openDownloadDestPicker(payload || {});
      });
    }
  } catch {}

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

  // MERIDIAN_KEYS: Global keyboard shortcut remapping
  var GLOBAL_SHORTCUTS = [
    { id: 'cmdPalette',   label: 'Command Palette',  defaultKey: 'Ctrl+K' },
    { id: 'toggleFs',     label: 'Toggle Fullscreen', defaultKey: 'F11' },
    { id: 'refreshLib',   label: 'Refresh Library',   defaultKey: 'Ctrl+R' },
    { id: 'pinSidebar',   label: 'Pin Sidebar',       defaultKey: '' },
    { id: 'drawerToggle', label: 'Toggle Drawer',     defaultKey: '' }
  ];

  var getGlobalShortcuts = function () {
    var map = {};
    try {
      var raw = localStorage.getItem('globalShortcuts');
      if (raw) map = JSON.parse(raw);
    } catch (e) {}
    var result = [];
    for (var i = 0; i < GLOBAL_SHORTCUTS.length; i++) {
      var s = GLOBAL_SHORTCUTS[i];
      result.push({
        id: s.id,
        label: s.label,
        defaultKey: s.defaultKey,
        key: (map[s.id] !== undefined) ? map[s.id] : s.defaultKey
      });
    }
    return result;
  };

  var saveGlobalShortcuts = function (shortcuts) {
    var map = {};
    for (var i = 0; i < shortcuts.length; i++) {
      map[shortcuts[i].id] = shortcuts[i].key;
    }
    try { localStorage.setItem('globalShortcuts', JSON.stringify(map)); } catch (e) {}
  };

  var getShortcutKey = function (id) {
    var shortcuts = getGlobalShortcuts();
    for (var i = 0; i < shortcuts.length; i++) {
      if (shortcuts[i].id === id) return shortcuts[i].key;
    }
    return '';
  };

  var formatKeyCombo = function (e) {
    var parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    var key = String(e.key || '');
    if (key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') return '';
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();
    parts.push(key);
    return parts.join('+');
  };

  var matchesShortcut = function (e, combo) {
    if (!combo) return false;
    var parts = combo.split('+');
    var needCtrl = false;
    var needAlt = false;
    var needShift = false;
    var targetKey = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === 'Ctrl') needCtrl = true;
      else if (p === 'Alt') needAlt = true;
      else if (p === 'Shift') needShift = true;
      else targetKey = p;
    }
    if (!!(e.ctrlKey || e.metaKey) !== needCtrl) return false;
    if (!!e.altKey !== needAlt) return false;
    if (!!e.shiftKey !== needShift) return false;
    var key = String(e.key || '');
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();
    return key === targetKey;
  };

  var renderShortcutsList = function () {
    var container = document.getElementById('globalShortcutsList');
    if (!container) return;
    var shortcuts = getGlobalShortcuts();
    var html = '';
    for (var i = 0; i < shortcuts.length; i++) {
      var s = shortcuts[i];
      var keyText = s.key || '(none)';
      html += '<div class="br-shortcut-row" data-shortcut-id="' + s.id + '">'
        + '<span class="br-shortcut-label">' + s.label + '</span>'
        + '<button class="br-shortcut-key-edit" data-shortcut-idx="' + i + '" title="Click to remap">' + keyText + '</button>'
        + '</div>';
    }
    container.innerHTML = html;

    var btns = container.querySelectorAll('.br-shortcut-key-edit');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () {
        var btn = this;
        var idx = parseInt(btn.getAttribute('data-shortcut-idx'), 10);
        if (isNaN(idx)) return;
        btn.textContent = 'Press key\u2026';
        btn.classList.add('capturing');

        var handler = function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          if (e.key === 'Escape') {
            // Cancel capture
            document.removeEventListener('keydown', handler, true);
            btn.classList.remove('capturing');
            btn.textContent = shortcuts[idx].key || '(none)';
            return;
          }

          var combo = formatKeyCombo(e);
          if (!combo) return; // modifier-only press

          document.removeEventListener('keydown', handler, true);
          btn.classList.remove('capturing');

          shortcuts[idx].key = combo;
          saveGlobalShortcuts(shortcuts);
          btn.textContent = combo;
        };

        document.addEventListener('keydown', handler, true);
      });
    }
  };

  renderShortcutsList();

  // Expose for external use
  window.__tankoMatchShortcut = matchesShortcut;
  window.__tankoGetShortcutKey = getShortcutKey;

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
      try { Tanko.api.window.toggleMaximize(); } catch (err) {}
    });
  }
  if (winCloseBtn) {
    winCloseBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { Tanko.api.window.close(); } catch (err) {}
    });
  }

  // FIX-WIN-CTRL2: browser overlay window controls (same actions, different IDs)
  var webWinMinBtn = document.getElementById('webWinMinBtn');
  var webWinMaxBtn = document.getElementById('webWinMaxBtn');
  var webWinCloseBtn = document.getElementById('webWinCloseBtn');
  if (webWinMinBtn) {
    webWinMinBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { Tanko.api.window.minimize(); } catch (err) {}
    });
  }
  if (webWinMaxBtn) {
    webWinMaxBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { Tanko.api.window.toggleMaximize(); } catch (err) {}
    });
  }
  if (webWinCloseBtn) {
    webWinCloseBtn.addEventListener('click', function (e) {
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
