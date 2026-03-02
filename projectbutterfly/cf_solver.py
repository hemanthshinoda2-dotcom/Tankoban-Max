"""
Cloudflare Challenge Solver for Tankoban Butterfly.

Uses a hidden QWebEngineView to navigate to CF-protected pages and let
the Chromium engine solve the JS challenge automatically.  Because the
hidden view shares the same QWebEngineProfile (and cookie store) as the
main browser tabs, the resulting cf_clearance cookie is immediately
available to all subsequent requests through that profile.

Usage (from TankoWebWidget):

    solver = CfSolver(self._profile, parent=self)
    solver.solved.connect(on_solved)
    solver.failed.connect(on_failed)
    solver.solve("https://some-cf-protected-site.com")

The solver emits `solved(url)` when cf_clearance appears, or
`failed(url, reason)` on timeout / error.
"""

from PySide6.QtCore import Qt, QTimer, Signal, QObject
from PySide6.QtWebEngineCore import (
    QWebEnginePage, QWebEngineProfile, QWebEngineSettings,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtGui import QColor

# How long to wait for CF challenge to resolve (ms)
_DEFAULT_TIMEOUT_MS = 35000
# How often to check for the clearance cookie (ms)
_POLL_INTERVAL_MS = 500


class _SolverPage(QWebEnginePage):
    """Minimal page that suppresses dialogs and new-window requests."""

    def __init__(self, profile, parent=None):
        super().__init__(profile, parent)

    def javaScriptAlert(self, origin, msg):
        pass  # suppress

    def javaScriptConfirm(self, origin, msg):
        return False

    def javaScriptPrompt(self, origin, msg, default):
        return False, ""

    def createWindow(self, wtype):
        return None  # block popups


class CfSolver(QObject):
    """
    Hidden-browser Cloudflare challenge solver.

    Shares the given QWebEngineProfile so that cookies gained here
    are immediately available to all other views using the same profile.
    """

    # Emitted when cf_clearance cookie is detected for the target domain
    solved = Signal(str)        # url
    # Emitted on timeout or error
    failed = Signal(str, str)   # url, reason

    def __init__(self, profile: QWebEngineProfile, parent=None):
        super().__init__(parent)
        self._profile = profile
        self._view = None
        self._page = None
        self._target_url = ""
        self._target_domain = ""
        self._timer = None
        self._deadline_timer = None
        self._active = False

    def solve(self, url: str, timeout_ms: int = _DEFAULT_TIMEOUT_MS):
        """
        Navigate a hidden view to *url* and wait for cf_clearance cookie.

        Emits solved(url) or failed(url, reason).
        Can be called multiple times (cancels any previous solve).
        """
        self._cleanup()
        self._target_url = url
        self._active = True

        # Extract domain for cookie matching
        from urllib.parse import urlparse
        parsed = urlparse(url)
        self._target_domain = parsed.hostname or ""

        print(f"[cf-solver] Solving CF challenge for {self._target_domain}...")

        # Create a tiny hidden view
        self._view = QWebEngineView()
        self._view.setFixedSize(1, 1)
        self._view.hide()

        self._page = _SolverPage(self._profile, self._view)
        self._page.setBackgroundColor(QColor(0, 0, 0))

        # Enable JS (required for CF challenge)
        s = self._page.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)

        self._view.setPage(self._page)

        # Monitor cookies via the profile's cookie store
        cookie_store = self._profile.cookieStore()
        cookie_store.cookieAdded.connect(self._on_cookie_added)

        # Poll timer as backup (cookieAdded doesn't always fire for all cookies)
        self._timer = QTimer(self)
        self._timer.setInterval(_POLL_INTERVAL_MS)
        self._timer.timeout.connect(self._check_page_title)
        self._timer.start()

        # Deadline timer
        self._deadline_timer = QTimer(self)
        self._deadline_timer.setSingleShot(True)
        self._deadline_timer.setInterval(timeout_ms)
        self._deadline_timer.timeout.connect(self._on_timeout)
        self._deadline_timer.start()

        # Navigate
        from PySide6.QtCore import QUrl
        self._page.load(QUrl(url))

    def cancel(self):
        """Cancel any in-progress solve."""
        if self._active:
            self._cleanup()

    def _on_cookie_added(self, cookie):
        """Called when any cookie is added to the shared store."""
        if not self._active:
            return

        name = bytes(cookie.name()).decode("utf-8", errors="replace")
        domain = bytes(cookie.domain()).decode("utf-8", errors="replace")

        if name == "cf_clearance" and self._target_domain in domain:
            print(f"[cf-solver] Got cf_clearance for {domain}")
            self._finish_solved()

    def _check_page_title(self):
        """
        Backup check: CF challenge pages have specific titles.
        Once the title changes away from the challenge, we're likely solved.
        """
        if not self._active or not self._page:
            return

        title = self._page.title().lower()
        # CF challenge pages typically have these titles:
        # "Just a moment..." / "Attention Required!" / "Checking your browser"
        # Once the title changes to something else, the challenge is likely done.
        cf_titles = ["just a moment", "attention required", "checking your browser"]
        if title and not any(ct in title for ct in cf_titles):
            # Title changed - the challenge might be solved
            # Give it a moment for cookies to propagate, then check
            QTimer.singleShot(1500, self._verify_solved)

    def _verify_solved(self):
        """Final check after title changes."""
        if not self._active:
            return
        # If we got here, the page loaded past the challenge
        print(f"[cf-solver] Page loaded past challenge for {self._target_domain}")
        self._finish_solved()

    def _finish_solved(self):
        if not self._active:
            return
        url = self._target_url
        self._cleanup()
        self.solved.emit(url)

    def _on_timeout(self):
        if not self._active:
            return
        url = self._target_url
        print(f"[cf-solver] Timeout waiting for CF clearance on {self._target_domain}")
        self._cleanup()
        self.failed.emit(url, "timeout")

    def _cleanup(self):
        """Stop timers, disconnect signals, destroy the hidden view."""
        self._active = False

        if self._timer:
            self._timer.stop()
            self._timer.deleteLater()
            self._timer = None

        if self._deadline_timer:
            self._deadline_timer.stop()
            self._deadline_timer.deleteLater()
            self._deadline_timer = None

        if self._page:
            try:
                cookie_store = self._profile.cookieStore()
                cookie_store.cookieAdded.disconnect(self._on_cookie_added)
            except (RuntimeError, TypeError):
                pass  # already disconnected or destroyed

        if self._view:
            self._view.hide()
            self._view.deleteLater()
            self._view = None
            self._page = None

        self._target_url = ""
        self._target_domain = ""
