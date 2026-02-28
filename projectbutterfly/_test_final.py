"""Interactive app launch with console capture — no auto-quit."""
import faulthandler; faulthandler.enable()
import sys, os, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PySide6.QtWidgets import QApplication

app = QApplication(sys.argv)
app.setApplicationName("Tankoban")
app.setOrganizationName("Tankoban")

import storage
from app import pick_user_data_dir, TankobanWindow, TankobanWebPage

user_data = pick_user_data_dir()
storage.init_data_dir(user_data)
print(f"[test] userData: {user_data}")

# Monkey-patch console logger for visibility
_orig = TankobanWebPage.javaScriptConsoleMessage
def _console(self, level, message, line, source):
    print(f"  [JS] {message[:200]}")
TankobanWebPage.javaScriptConsoleMessage = _console

# Catch unhandled exceptions in slots
def _excepthook(exc_type, exc_value, exc_tb):
    traceback.print_exception(exc_type, exc_value, exc_tb)
    print(f"\n[CRASH] {exc_type.__name__}: {exc_value}", flush=True)
sys.excepthook = _excepthook

win = TankobanWindow(app_section="", dev_tools=True)
print("[test] Window created!")

def on_loaded(ok):
    print(f"[test] Page loaded: ok={ok}")
    win.show()
    win.showMaximized()

win._web_view.loadFinished.connect(on_loaded)
print("[test] Use the app normally. Close window or Ctrl+C to quit.")
sys.exit(app.exec())
