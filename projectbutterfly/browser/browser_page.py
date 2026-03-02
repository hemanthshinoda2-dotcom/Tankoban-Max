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
            # For now, auto-deny all sensitive permissions.
            # A proper permission bar can be added later.
            self.setFeaturePermission(
                origin, feature,
                QWebEnginePage.PermissionPolicy.PermissionDeniedByUser,
            )
        else:
            self.setFeaturePermission(
                origin, feature,
                QWebEnginePage.PermissionPolicy.PermissionDeniedByUser,
            )

    def createWindow(self, window_type):
        """
        Called by Chromium when JS opens a new window (target=_blank, window.open).
        We emit a signal so the browser can create a new tab instead.
        Returns None — the new tab's page is wired by the browser after creation.
        """
        self.new_tab_requested.emit(QUrl())
        return None

    def acceptNavigationRequest(self, url: QUrl, nav_type, is_main_frame: bool) -> bool:
        """Intercept internal URL schemes."""
        scheme = url.scheme()

        if scheme == "tanko-browser":
            # Internal commands — emit signal for browser to handle
            host = url.host()
            query = url.query() or ""
            self.internal_command.emit(host, query)
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
