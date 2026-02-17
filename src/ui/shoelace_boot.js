// Shoelace bootstrap for library surfaces only.
(async function shoelaceBoot() {
  'use strict';

  try {
    const basePathMod = await import('../../node_modules/@shoelace-style/shoelace/dist/utilities/base-path.js');
    const setBasePath = basePathMod && typeof basePathMod.setBasePath === 'function'
      ? basePathMod.setBasePath
      : null;
    if (setBasePath) {
      setBasePath('../../node_modules/@shoelace-style/shoelace/dist');
    }

    await Promise.all([
      import('../../node_modules/@shoelace-style/shoelace/dist/components/button/button.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/icon-button/icon-button.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/input/input.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/select/select.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/dropdown/dropdown.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/menu/menu.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/menu-item/menu-item.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/dialog/dialog.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/tooltip/tooltip.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/switch/switch.js'),
      import('../../node_modules/@shoelace-style/shoelace/dist/components/spinner/spinner.js'),
    ]);
  } catch (err) {
    console.warn('[ui] Shoelace bootstrap failed; continuing with native controls.', err);
  }
})();
