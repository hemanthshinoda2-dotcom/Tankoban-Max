"""
Challenge Solver for Tankoban Butterfly.

Two-phase approach:
  Phase 1 (0-5s): Hidden 1x1 QWebEngineView — handles automatic JS challenges
                   (Cloudflare "Just a moment...") without user intervention.
  Phase 2 (5s+):  If the challenge isn't solved automatically, the view is
                   promoted to a visible popup window so the user can solve
                   visual CAPTCHAs (Yandex SmartCaptcha, hCaptcha, etc.).

The solver shares a QWebEngineProfile with the main browser, so any cookies
gained here (cf_clearance, yandex session, etc.) are immediately available
to all views using that profile.

Emits solved(url) or failed(url, reason).
"""

from PySide6.QtCore import Qt, QTimer, Signal, QObject, QUrl
from PySide6.QtWebEngineCore import (
    QWebEnginePage, QWebEngineProfile, QWebEngineSettings,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtGui import QColor, QIcon
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QLabel, QPushButton, QHBoxLayout,
)

# How long to wait total before giving up (ms)
_DEFAULT_TIMEOUT_MS = 90000
# How long to try hidden auto-solve before showing popup (ms)
_AUTO_SOLVE_PHASE_MS = 5000
# How often to check page state (ms)
_POLL_INTERVAL_MS = 800

# Titles that indicate an active challenge page
_CHALLENGE_TITLES = [
    "just a moment",
    "attention required",
    "checking your browser",
    "ddos-guard",
    "access denied",
    "smartcaptcha",
]


class _SolverPage(QWebEnginePage):
    """Page that suppresses JS dialogs and popups."""

    def __init__(self, profile, parent=None):
        super().__init__(profile, parent)

    def javaScriptAlert(self, origin, msg):
        pass

    def javaScriptConfirm(self, origin, msg):
        return False

    def javaScriptPrompt(self, origin, msg, default):
        return False, ""

    def createWindow(self, wtype):
        return None


class _SolverPopup(QWidget):
    """
    Visible popup window for manual CAPTCHA solving.

    Shows a QWebEngineView at a usable size with a hint label.
    """
    closed = Signal()

    def __init__(self, view: QWebEngineView, domain: str, parent=None):
        super().__init__(parent, Qt.WindowType.Window | Qt.WindowType.WindowStaysOnTopHint)
        self.setWindowTitle(f"Solve challenge — {domain}")
        self.setMinimumSize(520, 620)
        self.resize(520, 620)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Hint bar
        hint = QLabel(f"  Solve the captcha for {domain} — window closes automatically")
        hint.setStyleSheet(
            "background: #1a1a2e; color: #e0e0e0; padding: 8px 12px;"
            "font-size: 13px; border-bottom: 1px solid #333;"
        )
        hint.setFixedHeight(36)
        layout.addWidget(hint)

        # The web view fills the rest
        layout.addWidget(view, 1)

        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, False)

    def closeEvent(self, event):
        self.closed.emit()
        super().closeEvent(event)


class CfSolver(QObject):
    """
    Two-phase challenge solver.

    Phase 1: Hidden auto-solve (CF JS challenges).
    Phase 2: Visible popup for manual CAPTCHA solving.
    """

    solved = Signal(str)        # url
    failed = Signal(str, str)   # url, reason

    def __init__(self, profile: QWebEngineProfile, parent=None):
        super().__init__(parent)
        self._profile = profile
        self._view = None
        self._page = None
        self._popup = None
        self._target_url = ""
        self._target_domain = ""
        self._timer = None
        self._deadline_timer = None
        self._promote_timer = None
        self._active = False
        self._promoted = False
        self._initial_title = ""

    def solve(self, url: str, timeout_ms: int = _DEFAULT_TIMEOUT_MS):
        """
        Navigate to *url* and wait for the challenge to be solved.

        Phase 1: Hidden view for 5s (auto-solve CF JS challenges).
        Phase 2: Popup window for manual CAPTCHA solving.
        """
        self._cleanup()
        self._target_url = url
        self._active = True
        self._promoted = False

        from urllib.parse import urlparse
        parsed = urlparse(url)
        self._target_domain = parsed.hostname or ""

        print(f"[solver] Starting challenge solve for {self._target_domain}...")

        # Create hidden view
        self._view = QWebEngineView()
        self._view.setFixedSize(1, 1)
        self._view.hide()

        self._page = _SolverPage(self._profile, self._view)
        self._page.setBackgroundColor(QColor(10, 16, 24))

        s = self._page.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)

        self._view.setPage(self._page)

        # Monitor cookies
        cookie_store = self._profile.cookieStore()
        cookie_store.cookieAdded.connect(self._on_cookie_added)

        # Poll page state
        self._timer = QTimer(self)
        self._timer.setInterval(_POLL_INTERVAL_MS)
        self._timer.timeout.connect(self._check_page_state)
        self._timer.start()

        # Phase 2 promotion timer — show popup after 5s if still on challenge
        self._promote_timer = QTimer(self)
        self._promote_timer.setSingleShot(True)
        self._promote_timer.setInterval(_AUTO_SOLVE_PHASE_MS)
        self._promote_timer.timeout.connect(self._maybe_promote)
        self._promote_timer.start()

        # Overall deadline
        self._deadline_timer = QTimer(self)
        self._deadline_timer.setSingleShot(True)
        self._deadline_timer.setInterval(timeout_ms)
        self._deadline_timer.timeout.connect(self._on_timeout)
        self._deadline_timer.start()

        # Navigate
        self._page.load(QUrl(url))

    def cancel(self):
        if self._active:
            self._cleanup()

    def _on_cookie_added(self, cookie):
        if not self._active:
            return
        name = bytes(cookie.name()).decode("utf-8", errors="replace")
        domain = bytes(cookie.domain()).decode("utf-8", errors="replace")

        # cf_clearance = Cloudflare solved
        if name == "cf_clearance" and self._target_domain in domain:
            print(f"[solver] Got cf_clearance for {domain}")
            self._finish_solved()

    def _is_challenge_page(self):
        """Check if the current page title indicates a challenge."""
        if not self._page:
            return False
        title = self._page.title().lower()
        if not title:
            return True  # still loading
        return any(ct in title for ct in _CHALLENGE_TITLES)

    def _check_page_state(self):
        """Periodic check: has the page moved past the challenge?"""
        if not self._active or not self._page:
            return

        title = self._page.title().lower()
        if not title:
            return  # still loading

        # If we're past the challenge page, we're solved
        if not self._is_challenge_page():
            # Wait a moment for cookies to propagate
            QTimer.singleShot(1000, self._verify_solved)

    def _verify_solved(self):
        if not self._active:
            return
        if not self._is_challenge_page():
            print(f"[solver] Page loaded past challenge for {self._target_domain}")
            self._finish_solved()

    def _maybe_promote(self):
        """Phase 2: if still on a challenge page, show popup for manual solve."""
        if not self._active:
            return
        if not self._is_challenge_page():
            return  # already solved

        print(f"[solver] Auto-solve didn't work, showing popup for {self._target_domain}")
        self._promoted = True

        # Resize the view for human use
        self._view.setMinimumSize(500, 580)
        self._view.setMaximumSize(16777215, 16777215)
        self._view.resize(500, 580)

        # Create popup window
        self._popup = _SolverPopup(self._view, self._target_domain)
        self._popup.closed.connect(self._on_popup_closed)
        self._popup.show()
        self._popup.raise_()
        self._popup.activateWindow()

    def _on_popup_closed(self):
        """User closed the popup — treat as failure unless already solved."""
        if self._active:
            url = self._target_url
            self._cleanup()
            self.failed.emit(url, "user_cancelled")

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
        print(f"[solver] Timeout for {self._target_domain}")
        self._cleanup()
        self.failed.emit(url, "timeout")

    def _cleanup(self):
        self._active = False

        if self._timer:
            self._timer.stop()
            self._timer.deleteLater()
            self._timer = None

        if self._promote_timer:
            self._promote_timer.stop()
            self._promote_timer.deleteLater()
            self._promote_timer = None

        if self._deadline_timer:
            self._deadline_timer.stop()
            self._deadline_timer.deleteLater()
            self._deadline_timer = None

        if self._page:
            try:
                cookie_store = self._profile.cookieStore()
                cookie_store.cookieAdded.disconnect(self._on_cookie_added)
            except (RuntimeError, TypeError):
                pass

        if self._popup:
            try:
                self._popup.closed.disconnect(self._on_popup_closed)
            except (RuntimeError, TypeError):
                pass
            # Take the view back before closing popup
            if self._view:
                self._view.setParent(None)
                self._view.hide()
            self._popup.close()
            self._popup.deleteLater()
            self._popup = None

        if self._view:
            self._view.hide()
            self._view.deleteLater()
            self._view = None
            self._page = None

        self._target_url = ""
        self._target_domain = ""
        self._promoted = False
