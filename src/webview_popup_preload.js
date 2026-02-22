(function popupBridgePreload() {
  'use strict';

  if (globalThis.__tankoWebPopupBridgeInstalled) return;
  globalThis.__tankoWebPopupBridgeInstalled = true;

  var CHANNEL = 'tanko:web-popup';
  var ALLOWED_PROTOCOLS = { 'http:': true, 'https:': true, 'magnet:': true };
  var ipcRenderer = null;

  try {
    ipcRenderer = require('electron').ipcRenderer;
  } catch (_e) {
    ipcRenderer = null;
  }

  function toUrl(raw, baseHref) {
    try {
      var text = String(raw || '').trim();
      if (!text || text === '#') return '';
      if (text.toLowerCase().indexOf('javascript:') === 0) return '';
      var resolved = new URL(text, baseHref || location.href);
      var protocol = String(resolved.protocol || '').toLowerCase();
      if (!ALLOWED_PROTOCOLS[protocol]) return '';
      return resolved.toString();
    } catch (_e) {
      return '';
    }
  }

  function routeToHost(url, reason) {
    var target = String(url || '').trim();
    if (!target) return;
    if (ipcRenderer && typeof ipcRenderer.sendToHost === 'function') {
      try {
        ipcRenderer.sendToHost(CHANNEL, { url: target, reason: String(reason || '') });
        return;
      } catch (_e) {}
    }
    try {
      location.assign(target);
    } catch (_e2) {}
  }

  function createPopupProxy(baseHref) {
    var currentHref = 'about:blank';

    function routeLocation(next, reason) {
      var resolved = toUrl(next, baseHref || location.href);
      if (!resolved) return '';
      currentHref = resolved;
      routeToHost(resolved, reason);
      return resolved;
    }

    var popupLocation = {
      assign: function assign(next) { routeLocation(next, 'window-open-location-assign'); },
      replace: function replace(next) { routeLocation(next, 'window-open-location-replace'); },
      toString: function toString() { return currentHref; }
    };

    Object.defineProperty(popupLocation, 'href', {
      configurable: true,
      enumerable: true,
      get: function getHref() { return currentHref; },
      set: function setHref(next) { routeLocation(next, 'window-open-location-href'); }
    });

    var popup = {
      closed: false,
      opener: window,
      focus: function focus() {},
      blur: function blur() {},
      close: function close() { this.closed = true; },
      postMessage: function postMessage() {},
      document: { location: popupLocation }
    };

    Object.defineProperty(popup, 'location', {
      configurable: true,
      enumerable: true,
      get: function getLocation() { return popupLocation; },
      set: function setLocation(next) { routeLocation(next, 'window-open-location-set'); }
    });

    return popup;
  }

  function findAnchor(node) {
    var cur = node;
    while (cur && cur.nodeType === 1) {
      if (String(cur.tagName || '').toUpperCase() === 'A') return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function wantsNewWindow(anchor, ev) {
    var target = String((anchor && anchor.getAttribute && anchor.getAttribute('target')) || '').toLowerCase();
    var rel = String((anchor && anchor.getAttribute && anchor.getAttribute('rel')) || '').toLowerCase();
    if (target === '_blank') return true;
    if (rel.indexOf('noopener') !== -1 || rel.indexOf('noreferrer') !== -1) return true;
    if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) return true;
    if (ev && (ev.button === 1 || ev.type === 'auxclick')) return true;
    return false;
  }

  function interceptAnchorEvent(ev) {
    var anchor = findAnchor(ev && ev.target);
    if (!anchor) return;
    if (!wantsNewWindow(anchor, ev)) return;
    var url = toUrl((anchor.getAttribute && anchor.getAttribute('href')) || anchor.href || '', location.href);
    if (!url) return;
    if (ev && ev.cancelable) ev.preventDefault();
    try { ev.stopPropagation(); } catch (_e) {}
    routeToHost(url, 'anchor');
  }

  document.addEventListener('click', interceptAnchorEvent, true);
  document.addEventListener('auxclick', interceptAnchorEvent, true);

  document.addEventListener('submit', function onSubmit(ev) {
    var form = ev && ev.target;
    if (!form || String(form.tagName || '').toUpperCase() !== 'FORM') return;
    var target = String((form.getAttribute && form.getAttribute('target')) || '').toLowerCase();
    if (target !== '_blank') return;
    var method = String((form.getAttribute && form.getAttribute('method')) || 'GET').toUpperCase();
    if (method !== 'GET') return;

    var action = toUrl((form.getAttribute && form.getAttribute('action')) || location.href, location.href);
    if (!action) return;
    var submitUrl = action;
    try {
      var u = new URL(action);
      var fd = new FormData(form);
      fd.forEach(function (value, key) {
        try { u.searchParams.append(String(key), String(value)); } catch (_e) {}
      });
      submitUrl = u.toString();
    } catch (_e2) {}

    if (ev && ev.cancelable) ev.preventDefault();
    routeToHost(submitUrl, 'form');
  }, true);

  function patchedWindowOpen(url) {
    var target = toUrl(url, location.href);
    if (target) routeToHost(target, 'window-open');
    return createPopupProxy(location.href);
  }

  try {
    window.open = patchedWindowOpen;
  } catch (_e3) {
    try {
      Object.defineProperty(window, 'open', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: patchedWindowOpen
      });
    } catch (_e4) {}
  }
})();
