# Sources First-Class Mode Manual Checklist

## Environment
- OS: Windows 10/11
- Build: current branch
- Data dir: existing profile and clean profile

## Mode Parity
- [ ] Sources button appears in the top mode switch with Comics/Books/Videos.
- [ ] `Comics -> Sources -> Books -> Videos -> Sources` keeps one shell and correct section visibility.
- [ ] Body mode classes switch correctly (`inSourcesMode`, others off).

## Entry Points
- [ ] Clicking main Sources mode button opens in-app Sources.
- [ ] Clicking shell web utility button opens in-app Sources.
- [ ] `?appSection=web` opens in-app Sources.
- [ ] `?appSection=browser` opens in-app Sources.
- [ ] `?appSection=sources` opens in-app Sources.
- [ ] `?appSection=torrent` opens in-app Sources.

## No Fake Overlay / No Detached Window
- [ ] Normal Sources usage does not launch external Aspect browser.
- [ ] Switching modes never creates detached fullscreen browser windows.
- [ ] Browser view remains clipped inside Sources viewport region.

## Embedded Browser Behavior
- [ ] Create/close/switch tab works in Sources browser strip.
- [ ] Back/forward/reload/stop works for active Sources tab.
- [ ] URL input navigation updates active tab state.
- [ ] Browser viewport hides when Sources home panel is active and returns when browsing.

## Unified Sources Workflow
- [ ] Start a direct download from browser tab; Sources downloads panel updates in same mode.
- [ ] Start a magnet from browser tab; Sources torrents/search flow updates in same mode.
- [ ] Downloads/torrents/search panels stay functional after repeated mode switches.

## Routing and Open Behavior
- [ ] `.cbz/.cbr/.cb7/.cbt` route to comics roots.
- [ ] Ebook formats including `.pdf` route to books roots.
- [ ] Video formats route to videos roots.
- [ ] Completed comic/book/video open action uses in-app flow.
- [ ] Reveal/show-folder remains explicit secondary action.

## Persistence and Host Policy
- [ ] `web_browser_settings.json` contains `browserHost.mode`.
- [ ] `web_browser_settings.json` contains `browserHost.externalFallbackEnabled`.
- [ ] Default host policy is `in_app` with external fallback disabled.
- [ ] Restart preserves Sources state without spawning external browser.

## Stability
- [ ] Reopen Sources mode 30+ times without blank/failed view.
- [ ] No P0/P1 crashes while toggling between Sources and other library modes.
