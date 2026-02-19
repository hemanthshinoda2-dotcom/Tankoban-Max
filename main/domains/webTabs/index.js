// BUILD_WCV: Web Tabs domain — manages WebContentsView instances for browser mode.
// Replaces renderer-side <webview> tags with main-process-managed views.

const { WebContentsView, session } = require('electron');

var PARTITION = 'persist:webmode';
var tabs = new Map(); // tabId → { view, id, bounds }
var nextId = 1;
var activeBounds = { x: 0, y: 0, width: 0, height: 0 };
var activeTabId = null;

function getIpc() {
  try { return require('../../../shared/ipc'); } catch (e) { return null; }
}

// ---- Handlers ----

async function create(ctx, _evt, payload) {
  var url = String((payload && payload.url) || '').trim();
  if (!url) return { ok: false, error: 'No URL' };

  var ipc = getIpc();
  var EVENT = ipc ? ipc.EVENT : {};

  var ses;
  try {
    ses = session.fromPartition(PARTITION);
  } catch (e) {
    return { ok: false, error: 'Failed to create session' };
  }

  var view;
  try {
    view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      }
    });
  } catch (e) {
    return { ok: false, error: 'Failed to create WebContentsView: ' + (e && e.message || e) };
  }

  var tabId = nextId++;
  var entry = { view: view, id: tabId, bounds: { x: 0, y: 0, width: 0, height: 0 } };
  tabs.set(tabId, entry);

  try {
    ctx.win.contentView.addChildView(view);
  } catch (e) {
    tabs.delete(tabId);
    return { ok: false, error: 'Failed to add child view' };
  }

  // Start hidden
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  var wc = view.webContents;

  // Forward events to renderer
  wc.on('page-title-updated', function (_e, title) {
    try { ctx.win.webContents.send(EVENT.WEB_TAB_TITLE_UPDATED, { tabId: tabId, title: title }); } catch (e2) {}
  });

  wc.on('did-start-loading', function () {
    try { ctx.win.webContents.send(EVENT.WEB_TAB_LOADING, { tabId: tabId, loading: true }); } catch (e2) {}
  });

  wc.on('did-stop-loading', function () {
    try { ctx.win.webContents.send(EVENT.WEB_TAB_LOADING, { tabId: tabId, loading: false }); } catch (e2) {}
    // Also send nav state after loading finishes
    try {
      ctx.win.webContents.send(EVENT.WEB_TAB_NAV_STATE, {
        tabId: tabId,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward()
      });
    } catch (e3) {}
  });

  wc.on('did-navigate', function (_e, navUrl) {
    try { ctx.win.webContents.send(EVENT.WEB_TAB_URL_UPDATED, { tabId: tabId, url: navUrl }); } catch (e2) {}
    try {
      ctx.win.webContents.send(EVENT.WEB_TAB_NAV_STATE, {
        tabId: tabId,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward()
      });
    } catch (e3) {}
  });

  wc.on('did-navigate-in-page', function (_e, navUrl) {
    try { ctx.win.webContents.send(EVENT.WEB_TAB_URL_UPDATED, { tabId: tabId, url: navUrl }); } catch (e2) {}
    try {
      ctx.win.webContents.send(EVENT.WEB_TAB_NAV_STATE, {
        tabId: tabId,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward()
      });
    } catch (e3) {}
  });

  // Popup handling
  wc.setWindowOpenHandler(function (details) {
    try {
      ctx.win.webContents.send(EVENT.WEB_POPUP_OPEN, {
        url: details && details.url ? details.url : '',
        disposition: details && details.disposition ? details.disposition : '',
        tabId: tabId
      });
    } catch (e2) {}
    return { action: 'deny' };
  });

  // Load URL
  try {
    wc.loadURL(url);
  } catch (e) {}

  return { ok: true, tabId: tabId };
}

async function close(ctx, _evt, payload) {
  var tabId = payload && payload.tabId;
  var entry = tabs.get(tabId);
  if (!entry) return { ok: false, error: 'Tab not found' };

  try { ctx.win.contentView.removeChildView(entry.view); } catch (e) {}
  try { entry.view.webContents.close(); } catch (e) {}
  tabs.delete(tabId);

  if (activeTabId === tabId) activeTabId = null;
  return { ok: true };
}

async function activate(ctx, _evt, payload) {
  var tabId = payload && payload.tabId;
  var entry = tabs.get(tabId);
  if (!entry) return { ok: false, error: 'Tab not found' };

  activeTabId = tabId;

  // Hide all other tabs, show requested one
  tabs.forEach(function (e) {
    if (e.id === tabId) {
      e.view.setBounds(activeBounds);
      e.bounds = activeBounds;
    } else {
      e.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      e.bounds = { x: 0, y: 0, width: 0, height: 0 };
    }
  });

  return { ok: true };
}

async function navigate(ctx, _evt, payload) {
  var tabId = payload && payload.tabId;
  var action = payload && payload.action;
  var url = payload && payload.url;

  var entry = tabs.get(tabId);
  if (!entry) return { ok: false, error: 'Tab not found' };

  var wc = entry.view.webContents;
  try {
    if (action === 'back') wc.goBack();
    else if (action === 'forward') wc.goForward();
    else if (action === 'reload') wc.reload();
    else if (action === 'stop') wc.stop();
    else if (action === 'loadUrl' && url) wc.loadURL(String(url));
    else return { ok: false, error: 'Unknown action: ' + action };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }

  return { ok: true };
}

async function setBounds(ctx, _evt, payload) {
  var tabId = payload && payload.tabId;
  var bounds = payload && payload.bounds;
  if (!bounds) return { ok: false, error: 'No bounds' };

  // Store as the active bounds for future tab switches
  activeBounds = {
    x: Math.round(bounds.x || 0),
    y: Math.round(bounds.y || 0),
    width: Math.round(bounds.width || 0),
    height: Math.round(bounds.height || 0)
  };

  var entry = tabs.get(tabId);
  if (!entry) return { ok: false, error: 'Tab not found' };

  entry.view.setBounds(activeBounds);
  entry.bounds = activeBounds;
  return { ok: true };
}

async function hideAll(ctx) {
  var zero = { x: 0, y: 0, width: 0, height: 0 };
  tabs.forEach(function (entry) {
    try { entry.view.setBounds(zero); } catch (e) {}
    entry.bounds = zero;
  });
  activeTabId = null;
  return { ok: true };
}

async function query(ctx, _evt, payload) {
  var tabId = payload && payload.tabId;
  var entry = tabs.get(tabId);
  if (!entry) return { ok: false, error: 'Tab not found' };

  var wc = entry.view.webContents;
  return {
    ok: true,
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading()
  };
}

async function splitBounds(ctx, _evt, payload) {
  var left = payload && payload.left;
  var right = payload && payload.right;
  if (!left || !right) return { ok: false, error: 'Missing left/right' };

  var leftEntry = tabs.get(left.tabId);
  var rightEntry = tabs.get(right.tabId);

  // Hide all tabs first
  var zero = { x: 0, y: 0, width: 0, height: 0 };
  tabs.forEach(function (entry) {
    if (entry.id !== (left && left.tabId) && entry.id !== (right && right.tabId)) {
      try { entry.view.setBounds(zero); } catch (e) {}
      entry.bounds = zero;
    }
  });

  // Position the two split views
  if (leftEntry && left.bounds) {
    var lb = {
      x: Math.round(left.bounds.x || 0),
      y: Math.round(left.bounds.y || 0),
      width: Math.round(left.bounds.width || 0),
      height: Math.round(left.bounds.height || 0)
    };
    leftEntry.view.setBounds(lb);
    leftEntry.bounds = lb;
  }

  if (rightEntry && right.bounds) {
    var rb = {
      x: Math.round(right.bounds.x || 0),
      y: Math.round(right.bounds.y || 0),
      width: Math.round(right.bounds.width || 0),
      height: Math.round(right.bounds.height || 0)
    };
    rightEntry.view.setBounds(rb);
    rightEntry.bounds = rb;
  }

  return { ok: true };
}

async function closeAll(ctx) {
  tabs.forEach(function (entry) {
    try { ctx.win.contentView.removeChildView(entry.view); } catch (e) {}
    try { entry.view.webContents.close(); } catch (e) {}
  });
  tabs.clear();
  activeTabId = null;
  return { ok: true };
}

module.exports = { create, close, activate, navigate, setBounds, hideAll, query, splitBounds, closeAll };
