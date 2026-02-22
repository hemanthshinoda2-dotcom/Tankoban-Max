(function () {
  'use strict';

  function createDrawer(opts) {
    var o = opts || {};
    var host = o.hostEl || document.body;
    var panel = document.createElement('div');
    panel.className = 'hgDrawer hidden';
    panel.id = o.id ? String(o.id) : '';
    panel.style.width = String(Number(o.widthPx) || 360) + 'px';

    var head = document.createElement('div');
    head.className = 'hgDrawerHead';

    var title = document.createElement('div');
    title.className = 'hgDrawerTitle';
    title.textContent = String(o.title || '');

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'hgDrawerClose';
    close.textContent = 'x';

    var body = document.createElement('div');
    body.className = 'hgDrawerBody';

    head.appendChild(title);
    head.appendChild(close);
    panel.appendChild(head);
    panel.appendChild(body);
    host.appendChild(panel);

    var open = false;

    function setOpen(next) {
      open = !!next;
      panel.classList.toggle('hidden', !open);
      if (open && typeof o.onOpen === 'function') o.onOpen();
      if (!open && typeof o.onClose === 'function') o.onClose();
    }

    close.addEventListener('click', function () { setOpen(false); });

    return {
      el: panel,
      bodyEl: body,
      setTitle: function (text) { title.textContent = String(text || ''); },
      open: function () { setOpen(true); },
      close: function () { setOpen(false); },
      toggle: function () { setOpen(!open); },
      isOpen: function () { return open; },
      destroy: function () {
        setOpen(false);
        if (panel.parentNode) panel.parentNode.removeChild(panel);
      },
    };
  }

  window.TankoHgUi = window.TankoHgUi || {};
  window.TankoHgUi.createDrawer = createDrawer;
})();
