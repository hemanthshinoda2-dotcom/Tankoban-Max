# Vendor Manifests

`vendor-manifest.json` describes optional runtime vendor dependencies.

Policy:
- Keep large vendor binaries out of git when possible.
- Fetch/cache artifacts into `resources/cache/` via scripts.
- Prefer dedicated scripts for complex installers (for example Tor/MPV).

Use:
```bat
npm run fetch:vendors
```
