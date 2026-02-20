// Compatibility bridge: keep legacy library handlers working with Shoelace controls.
(function controlAdaptersBootstrap() {
  'use strict';

  const CONTROL_IDS = new Set([
    'globalSearch',
  ]);

  function isTarget(el) {
    if (!el || !el.id) return false;
    return CONTROL_IDS.has(String(el.id));
  }

  function forwardNativeEvent(el, type) {
    try {
      const ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
      el.dispatchEvent(ev);
    } catch {}
  }

  function patchSelectOptions(el) {
    if (!el || el.tagName !== 'SL-SELECT') return;
    try {
      if (!Object.prototype.hasOwnProperty.call(el, 'options')) {
        Object.defineProperty(el, 'options', {
          configurable: true,
          enumerable: false,
          get() { return this.querySelectorAll('sl-option'); },
        });
      }
    } catch {}
  }

  function bindElement(el) {
    if (!isTarget(el)) return;

    if (el.tagName === 'SL-SELECT') patchSelectOptions(el);

    if (el.__tankoCompatBound) return;
    el.__tankoCompatBound = true;

    if (el.tagName === 'SL-INPUT') {
      el.addEventListener('sl-input', () => forwardNativeEvent(el, 'input'));
      el.addEventListener('sl-change', () => forwardNativeEvent(el, 'change'));
      return;
    }

    if (el.tagName === 'SL-SELECT' || el.tagName === 'SL-SWITCH') {
      el.addEventListener('sl-change', () => forwardNativeEvent(el, 'change'));
    }
  }

  function bindAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    for (const id of CONTROL_IDS) {
      const el = scope.getElementById ? scope.getElementById(id) : document.getElementById(id);
      bindElement(el);
    }
  }

  function observeForDeferredMounts() {
    const obs = new MutationObserver((list) => {
      for (const rec of list) {
        if (!rec.addedNodes || rec.addedNodes.length === 0) continue;
        for (const node of rec.addedNodes) {
          if (!node || node.nodeType !== 1) continue;
          bindElement(node);
          if (node.querySelectorAll) {
            for (const id of CONTROL_IDS) {
              bindElement(node.querySelector(`#${id}`));
            }
          }
        }
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindAll(document);
      observeForDeferredMounts();
    }, { once: true });
  } else {
    bindAll(document);
    observeForDeferredMounts();
  }
})();
