# TANKOWEB\_PLAN.md

## Revert to Fullscreen Qt Overlay Browser

We are reverting the website back to a fullscreen Qt overlay.

Since our attempt to integrate Qt directly into the Tankoban skin did not succeed, we will return to the overlay browser approach and make it work properly.

For the overlay to make thematic sense, it cannot function as a standalone "mode" of the app. Instead, it must become a complementary feature. Initially, it serves as the central aggregation hub for all media (comics, books, videos). Over time, it will evolve into a fully capable browser.

For now, this is the intended structure and functionality.

---

## 1. Navigation Changes

* Remove the **Web Mode** button.
* Add a **Tankoweb** button to the right of the Refresh button on the top bar.
* Clicking the Tankoweb button opens the fullscreen overlay browser directly into its Home screen.

---

## 2. The Home Screen (Core of the App)

The Tankoweb Home screen is the single most important section of the entire application. It is the foundation upon which Tankoban Max is built.

The Home screen is **not** a traditional browser tab.
It does not show:

* URL bar
* New tab button

It exists for one purpose only: **media aggregation**.

### Layout Structure

---

### A) Search Engine (Top Section)

At the very top:

* A Qt widget search bar.
* Yandex is set as the default search engine.
* Users will primarily use this for acquiring media through direct download links (DDL).

---

### B) Sources Tiles (Below Search Bar)

Directly beneath the search bar:

* Opera GX-style speed-dial tiles for configured Sources.
* Sources are custom-picked by the user.
* Clicking a tile opens the source in a browser tab.

---

### C) Torrent Search Engine (Below Sources)

Directly beneath the sources tiles:

* Recreate the torrent search engine from the Electron app using Qt.
* The layout mirrors a traditional search field:

  * **Right side:** Magnifying glass icon (search button).
  * **Left side:** Tools icon.

The Tools icon opens torrent index configuration settings for:

* Prowlarr
* Jackett

Users will:

* Enter URL and API key.
* Access a small Web UI button for each (to open their respective web interfaces in-browser).

---

### D) Torrent Downloader + Manager (Below Torrent Search)

For MVP, we will reuse the design from the old Electron app instead of replicating qBittorrent.

Table columns:

```
Index | Filename | Size | Seeders | Download Speed | Download Status (%) | Destination Mode
```

Destination Mode indicates which Tankoban mode the torrent path was assigned to.

---

### E) DDL Download Manager (Below Torrent Manager)

Another similar table, specifically for DDL downloads.

Columns:

```
Index | Filename | Size | Download Speed | Download Status (%) | File Type | Destination Mode
```

---

## 3. When Does It Become a Browser?

The Home screen itself is not a browser.

It becomes a browser only when explicitly triggered.

---

### Browser Trigger System

#### A) Browser Button

At the top-left of the Home screen:

* A **Browser →** button.
* Clicking it opens the first browser tab.
* The Home screen becomes accessible via a Home icon in the browser's top-left corner (next to tabs).
* The browser opens with the user's preferred search engine.
* From that point onward, it behaves like Google Chrome.

On the Home screen:

* A Library icon will exist in the top-left corner opposite the Browser button.

---

#### B) Search Bar Trigger

If the user searches using:

* Yandex (or chosen search engine),

It automatically:

* Opens the first browser tab
* Loads search results

---

#### C) Web UI Trigger

Clicking the Web UI button for:

* Jackett
* Prowlarr

Will:

* Open their respective UI pages inside the browser.

---

## 4. Context Menu Priority

Most of these features were already implemented in the previous Electron browser, including significant Chrome parity progress.

The most essential feature: **context menus everywhere**.

This will not be completed in one iteration. Development will be incremental.

However:

* Context menus must always remain high priority.
* If necessary, we can reference the old Electron implementation.

---

# Development Phases

## Phase 1 – Core Browser Controls

* Implement search engine bar.
* Implement Browser button.
* Implement Back to Library button.
* For now, browser UI will resemble Chrome.

---

## Phase 2 – Torrent Search Engine

* Integrate Prowlarr and Jackett APIs.
* Test APIs thoroughly.
* Ensure all Electron features are re-implemented.
* Remove 40-result cap from torrent search results.

---

## Phase 3 – Torrent Downloader

* Implement custom Tankoban path picker.
* Allow selection of:

  * Any mode
  * Any folder or subfolder within a mode

Critical feature:

* Torrent folders containing videos can be added as **streamable folders** to the Video library.
* They must behave exactly like local folders.
* The only difference: streaming badges appear on thumbnails (already implemented behavior).

---

## Phase 4 – DDL Download Manager

* Fully implement and test DDL downloads.
* Test by searching on Yandex and downloading a file.
* Ensure downloads integrate properly into destination modes.

---

## Long-Term Vision

This plan defines the foundation of the Tankoban Web experience.

Once stabilized, Tankoweb will evolve into:

* The second half of the Tankoban experience.
* A fully integrated media + internet platform.

Tankoban is a one-stop media consumption system.
The internet itself is media — and must be treated as such.
