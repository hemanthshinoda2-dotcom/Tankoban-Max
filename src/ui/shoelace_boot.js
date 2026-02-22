// Shoelace autoloader bootstrap — registers <sl-*> components on demand.
(async function shoelaceBoot() {
  'use strict';

  try {
    var { setBasePath } = await import('../../node_modules/@shoelace-style/shoelace/dist/utilities/base-path.js');
    setBasePath('../../node_modules/@shoelace-style/shoelace/dist');

    await import('../../node_modules/@shoelace-style/shoelace/dist/shoelace-autoloader.js');
  } catch (err) {
    console.warn('[ui] Shoelace autoloader failed; continuing with native controls.', err);
  }
})();
