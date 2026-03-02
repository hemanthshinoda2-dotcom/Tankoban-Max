"""
ChromePage — QWebEnginePage subclass for browser tabs.

Handles:
  - createWindow() → new tab instead of popup
  - Anti-bot fingerprint injection
  - Internal URL scheme interception (tanko-browser://)
  - Console message logging
"""

from __future__ import annotations

from PySide6.QtCore import QUrl, Signal
from PySide6.QtWebEngineCore import (
    QWebEnginePage,
    QWebEngineProfile,
    QWebEngineScript,
)


# ---------------------------------------------------------------------------
# Anti-bot script (injected before page JS runs)
# ---------------------------------------------------------------------------

_ANTIBOT_JS = """
// Hide webdriver flag
Object.defineProperty(navigator, 'webdriver', { get: () => false });

// Stub navigator.plugins (empty in headless = bot flag)
Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5]
});

// Stub navigator.languages
Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en']
});

// Stub window.chrome
if (!window.chrome) {
    window.chrome = { runtime: {} };
}

// Fix notification permission query (bot detection vector)
if (navigator.permissions && navigator.permissions.query) {
    const _origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) => {
        if (params.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
        }
        return _origQuery(params);
    };
}

// --- Yandex-specific anti-captcha ---
// Yandex SmartCaptcha checks these; making them look normal avoids triggers
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
Object.defineProperty(screen, 'colorDepth', { get: () => 24 });

// Canvas fingerprint randomization (tiny noise to avoid consistent hash)
(function() {
    const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
        const ctx = this.getContext('2d');
        if (ctx) {
            const style = ctx.fillStyle;
            ctx.fillStyle = 'rgba(0,0,1,0.003)';
            ctx.fillRect(0, 0, 1, 1);
            ctx.fillStyle = style;
        }
        return _toDataURL.apply(this, arguments);
    };
})();

// WebGL renderer spoofing
(function() {
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Google Inc. (NVIDIA)';
        if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060, OpenGL 4.5)';
        return getParam.apply(this, arguments);
    };
})();
"""


# ---------------------------------------------------------------------------
# Ad blocker script (cosmetic + network-level blocking via JS)
# ---------------------------------------------------------------------------

_ADBLOCKER_JS = r"""
(function() {
    'use strict';

    // ======================================================================
    // 1. AD DOMAIN BLOCKLIST — blocks fetch/XHR/image/script to ad domains
    // ======================================================================

    const AD_DOMAINS = new Set([
        'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
        'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
        'adservice.google.com', 'pagead2.googlesyndication.com',
        'facebook.com/tr', 'connect.facebook.net/en_US/fbevents.js',
        'ads.yahoo.com', 'analytics.yahoo.com',
        'ad.doubleclick.net', 'static.doubleclick.net',
        'adnxs.com', 'adsrvr.org', 'adtechus.com', 'advertising.com',
        'amazon-adsystem.com', 'adbrite.com', 'adroll.com',
        'outbrain.com', 'taboola.com', 'mgid.com', 'revcontent.com',
        'criteo.com', 'criteo.net', 'moatads.com', 'serving-sys.com',
        'smartadserver.com', 'rubiconproject.com', 'pubmatic.com',
        'openx.net', 'casalemedia.com', 'lijit.com', 'sharethrough.com',
        'bidswitch.net', 'mathtag.com', 'contextweb.com',
        'turn.com', 'spotxchange.com', 'yieldmo.com',
        'popads.net', 'popcash.net', 'propellerads.com', 'admob.com',
        'scorecardresearch.com', 'quantserve.com', 'hotjar.com',
        'mixpanel.com', 'segment.com', 'optimizely.com',
        'tpc.googlesyndication.com', 'pagead2.googlesyndication.com',
        'securepubads.g.doubleclick.net',
        'mc.yandex.ru', 'an.yandex.ru', 'yandexadexchange.net',
        'adfox.yandex.ru',
        // Tracker domains
        'pixel.facebook.com', 'pixel.quantcount.com',
        'sb.scorecardresearch.com', 'b.scorecardresearch.com',
    ]);

    function isAdDomain(hostname) {
        if (!hostname) return false;
        hostname = hostname.toLowerCase();
        for (const ad of AD_DOMAINS) {
            if (hostname === ad || hostname.endsWith('.' + ad)) return true;
        }
        return false;
    }

    function isAdUrl(urlStr) {
        try {
            const u = new URL(urlStr, location.href);
            if (isAdDomain(u.hostname)) return true;
            const path = u.pathname + u.search;
            if (/\/ads[\/\?]|\/ad[\/\?]|\/adserv|\/advert|\/banner[s]?[\/\?]|\/popup[s]?[\/\?]/i.test(path)) return true;
            if (/\.doubleclick\.|adsense|pagead|adclick|click\.ad/i.test(urlStr)) return true;
            return false;
        } catch(e) { return false; }
    }

    // --- Block fetch to ad domains ---
    const _origFetch = window.fetch;
    window.fetch = function(input, init) {
        const url = (typeof input === 'string') ? input : (input && input.url) || '';
        if (isAdUrl(url)) {
            return Promise.reject(new TypeError('Network request blocked by ad blocker'));
        }
        return _origFetch.apply(this, arguments);
    };

    // --- Block XMLHttpRequest to ad domains ---
    const _origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (isAdUrl(url)) {
            this._blocked = true;
        }
        return _origXHROpen.apply(this, arguments);
    };
    const _origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        if (this._blocked) return;
        return _origXHRSend.apply(this, arguments);
    };

    // --- Block ad images/scripts/iframes from loading via MutationObserver ---
    const AD_ELEMENT_SELECTORS = [
        'ins.adsbygoogle', 'ins[data-ad-client]',
        'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
        'iframe[src*="ads"]', 'iframe[src*="adserv"]',
        'div[id*="google_ads"]', 'div[id*="ad-container"]',
        'div[class*="ad-banner"]', 'div[class*="ad-wrapper"]',
        'div[class*="adsbygoogle"]',
        'a[href*="doubleclick.net"]',
        'div[data-ad]', 'div[data-adunit]',
        // Common ad containers
        '[id^="div-gpt-ad"]', '[id^="google_ads"]',
        '.ad-slot', '.ad-unit', '.advertisement',
        // Yandex ad elements
        'div[class*="yandex_rtb"]', 'div[class*="ya-partner"]',
        'div[id*="yandex_rtb"]',
    ];

    function removeAdElements(root) {
        const sel = AD_ELEMENT_SELECTORS.join(',');
        try {
            const els = (root || document).querySelectorAll(sel);
            els.forEach(el => {
                el.remove();
            });
        } catch(e) {}
    }

    // Inject CSS to hide common ad elements immediately
    const adCss = document.createElement('style');
    adCss.textContent = `
        ins.adsbygoogle, ins[data-ad-client],
        div[id*="google_ads"], div[id^="div-gpt-ad"],
        div[class*="adsbygoogle"], .ad-slot, .ad-unit,
        .advertisement, div[class*="yandex_rtb"],
        div[class*="ya-partner"], div[id*="yandex_rtb"],
        iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
        iframe[src*="adserv"], iframe[src*="ads."],
        [data-ad], [data-adunit],
        div[class*="ad-banner"], div[class*="ad-wrapper"] {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            overflow: hidden !important;
        }
    `;
    (document.head || document.documentElement).appendChild(adCss);

    // ======================================================================
    // 2. MUTATION OBSERVER — catches dynamically injected ads
    // ======================================================================

    const observer = new MutationObserver(function(mutations) {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;

                // Check if the added node itself is an ad element
                if (node.matches && AD_ELEMENT_SELECTORS.some(sel => {
                    try { return node.matches(sel); } catch(e) { return false; }
                })) {
                    node.remove();
                    continue;
                }

                // Check children
                removeAdElements(node);

                // Block ad scripts/images/iframes by src
                if (node.tagName === 'SCRIPT' || node.tagName === 'IMG' || node.tagName === 'IFRAME') {
                    const src = node.src || node.getAttribute('src') || '';
                    if (isAdUrl(src)) {
                        node.remove();
                        continue;
                    }
                }
            }
        }
    });

    if (document.documentElement) {
        observer.observe(document.documentElement, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.documentElement, { childList: true, subtree: true });
        });
    }

    // Initial sweep after DOM ready
    document.addEventListener('DOMContentLoaded', () => removeAdElements());
    // And again after full load (catches lazy ads)
    window.addEventListener('load', () => setTimeout(removeAdElements, 1000));

    // ======================================================================
    // 3. POPUP / NEW-TAB AD BLOCKING
    // ======================================================================
    // Distinguish user-initiated new tabs from ad popups.
    // Strategy: only allow window.open() during trusted user events
    // (click, keydown, submit). Block all other window.open() calls.

    let _userAction = false;
    let _userActionTimer = null;

    function markUserAction() {
        _userAction = true;
        clearTimeout(_userActionTimer);
        _userActionTimer = setTimeout(() => { _userAction = false; }, 1000);
    }

    // Track user interactions
    document.addEventListener('click', markUserAction, true);
    document.addEventListener('mousedown', markUserAction, true);
    document.addEventListener('keydown', markUserAction, true);
    document.addEventListener('submit', markUserAction, true);

    const _origOpen = window.open;
    window.open = function(url, target, features) {
        // Allow if triggered by a real user action
        if (_userAction) {
            return _origOpen.apply(this, arguments);
        }

        // Block: this is likely a popup ad (no user action triggered it)
        console.log('[TankoAdBlock] Blocked popup:', url);
        return null;
    };

    // Also block auto-assign of window.location in setTimeout/setInterval
    // without user action (common popup ad pattern)
    // This is hard to fully intercept without breaking sites, so we only
    // block the window.open path above.

})();
"""


def inject_antibot_script(profile: QWebEngineProfile):
    """Register the anti-bot script on the profile (runs once per profile)."""
    scripts = profile.scripts()
    # Don't double-inject
    for s in scripts.toList():
        if s.name() == "_tanko_antibot":
            return

    script = QWebEngineScript()
    script.setName("_tanko_antibot")
    script.setSourceCode(_ANTIBOT_JS)
    script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
    script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
    script.setRunsOnSubFrames(True)
    scripts.insert(script)


def inject_adblocker_script(profile: QWebEngineProfile):
    """Register the ad blocker script on the profile (runs once per profile)."""
    scripts = profile.scripts()
    for s in scripts.toList():
        if s.name() == "_tanko_adblocker":
            return

    script = QWebEngineScript()
    script.setName("_tanko_adblocker")
    script.setSourceCode(_ADBLOCKER_JS)
    script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
    script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
    script.setRunsOnSubFrames(True)
    scripts.insert(script)


# ---------------------------------------------------------------------------
# ChromePage
# ---------------------------------------------------------------------------

class ChromePage(QWebEnginePage):
    """
    QWebEnginePage subclass used by each browser tab.

    Attributes:
        tab_id (str): The UUID of the tab this page belongs to.

    Signals:
        new_tab_requested(QUrl): Emitted when a popup/new-window is requested.
        permission_requested(QUrl, Feature): Emitted when a page requests a permission.
    """

    new_tab_requested = Signal(QUrl)
    internal_command = Signal(str, str)  # (command, params)
    permission_prompt = Signal(object, object)  # (origin, feature)
    magnet_requested = Signal(str)  # magnet URI intercepted

    # Permissions auto-granted (safe defaults)
    _AUTO_GRANT = {
        QWebEnginePage.Feature.Notifications,
    }
    # Permissions that need user prompt
    _PROMPTABLE = {
        QWebEnginePage.Feature.Geolocation,
        QWebEnginePage.Feature.MediaAudioCapture,
        QWebEnginePage.Feature.MediaVideoCapture,
        QWebEnginePage.Feature.MediaAudioVideoCapture,
        QWebEnginePage.Feature.DesktopVideoCapture,
        QWebEnginePage.Feature.DesktopAudioVideoCapture,
    }

    def __init__(self, profile: QWebEngineProfile, tab_id: str, parent=None):
        super().__init__(profile, parent)
        self.tab_id = tab_id
        self._create_window_callback = None  # set by ChromeBrowser

        # Wire permission requests
        self.featurePermissionRequested.connect(self._on_permission_requested)

    def _on_permission_requested(self, origin: QUrl, feature):
        """Handle permission requests from web pages."""
        if feature in self._AUTO_GRANT:
            self.setFeaturePermission(
                origin, feature,
                QWebEnginePage.PermissionPolicy.PermissionGrantedByUser,
            )
        elif feature in self._PROMPTABLE:
            # Show permission bar to let user decide
            self.permission_prompt.emit(origin, feature)
        else:
            self.setFeaturePermission(
                origin, feature,
                QWebEnginePage.PermissionPolicy.PermissionDeniedByUser,
            )

    # Known ad popup domains — if the current page is on one of these and opens
    # a popup, block it. This is a server-side complement to the JS ad blocker.
    _AD_POPUP_DOMAINS = {
        "doubleclick.net", "googlesyndication.com", "adnxs.com",
        "popads.net", "popcash.net", "propellerads.com",
        "adservice.google.com", "serving-sys.com", "adroll.com",
        "outbrain.com", "taboola.com", "mgid.com",
    }

    def createWindow(self, window_type):
        """
        Called by Chromium when JS opens a new window (target=_blank, window.open).

        Must return a QWebEnginePage for Chromium to load the target URL into.
        Returning None discards the navigation entirely.

        Smart popup blocking:
        - WebBrowserTab / WebBrowserBackgroundTab → likely user-triggered (link click),
          always allowed.
        - WebDialog → sometimes legitimate (auth flows, popups), allow but flag.
        - If the requesting page's domain is a known ad network, block it.
        """
        # For dialogs/popups, check if the source page is an ad domain
        if window_type not in (
            QWebEnginePage.WebWindowType.WebBrowserTab,
            QWebEnginePage.WebWindowType.WebBrowserBackgroundTab,
        ):
            current_host = self.url().host().lower() if self.url() else ""
            for ad_domain in self._AD_POPUP_DOMAINS:
                if current_host == ad_domain or current_host.endswith("." + ad_domain):
                    return None  # Block ad popup

        # Create a new tab and return its page so Chromium loads the URL into it
        if self._create_window_callback:
            return self._create_window_callback()

        # Fallback — signal-based (URL won't be captured)
        self.new_tab_requested.emit(QUrl())
        return None

    def acceptNavigationRequest(self, url: QUrl, nav_type, is_main_frame: bool) -> bool:
        """Intercept internal URL schemes and magnet links."""
        scheme = url.scheme()

        if scheme == "tanko-browser":
            # Internal commands — emit signal for browser to handle
            host = url.host()
            query = url.query() or ""
            self.internal_command.emit(host, query)
            return False

        if scheme == "magnet":
            # Magnet link clicked — intercept and show add-torrent dialog
            self.magnet_requested.emit(url.toString())
            return False

        return super().acceptNavigationRequest(url, nav_type, is_main_frame)

    def certificateError(self, error):
        """Accept certificate errors for local development, reject for production."""
        # Accept only for localhost / local files
        url = error.url()
        if url.host() in ("localhost", "127.0.0.1", ""):
            error.acceptCertificate()
            return True
        return False

    def javaScriptConsoleMessage(self, level, message, line, source):
        """Optionally log JS console messages for debugging."""
        pass  # Silent by default; enable for debugging
