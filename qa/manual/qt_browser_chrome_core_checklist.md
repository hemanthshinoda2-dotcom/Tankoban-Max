# Qt Browser Chrome Core Manual Checklist

## Environment
- OS: Windows 10/11
- Build: current branch
- Data dir: clean and migrated profiles

## Tabs
- [ ] New tab from active tab inserts opener-relative
- [ ] Pinned tab cannot be dropped into unpinned zone and vice-versa
- [ ] Unpinning repopulates unpinned zone order correctly
- [ ] `Close other tabs` keeps pinned tabs + selected tab
- [ ] `Close tabs to the right` keeps pinned tabs
- [ ] `Reopen closed tab` restores URL/pin/mute/zoom

## Navigation
- [ ] Reload button toggles to Stop while loading
- [ ] Back right-click menu shows navigable history entries
- [ ] Back long-press menu shows navigable history entries
- [ ] Forward right-click menu shows navigable history entries
- [ ] Selecting history dropdown item jumps to exact index

## Omnibox
- [ ] Plain domain input resolves to URL
- [ ] Query input resolves to search URL
- [ ] Unsafe scheme input is not executed directly
- [ ] Ghost completion appears and accepts with Tab/Right
- [ ] Draft text is preserved per tab

## Permissions
- [ ] Unknown permission request prompts inline bar
- [ ] Allow with remember persists and auto-applies on next request
- [ ] Deny with remember persists and auto-applies on next request
- [ ] Ask path still prompts when no rule exists

## Error + Crash
- [ ] Failed load shows explicit retry page (not blank viewport)
- [ ] Retry action attempts original failed URL
- [ ] Render-process crash shows recover action
- [ ] Recover action returns tab to healthy browsing state

## Managers
- [ ] `Ctrl+H` opens internal history page with populated data
- [ ] `Ctrl+J` opens internal downloads page with populated data
- [ ] Downloads page supports open/reveal/remove/clear actions
- [ ] Bookmarks manager supports edit/remove with persistence

## Session + Settings
- [ ] Restart restores previous tab set and active tab
- [ ] Closed-tab stack survives restart
- [ ] Search engine setting persists and updates omnibox placeholder
- [ ] Bookmarks bar visibility setting persists

## Placeholders
- [ ] Torrents/books/comics entry points remain visible
- [ ] Books/comics continue to present explicit non-parity placeholder copy
