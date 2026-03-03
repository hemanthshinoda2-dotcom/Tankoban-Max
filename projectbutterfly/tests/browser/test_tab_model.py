import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from projectbutterfly.browser.tab_state import TabData, TabManager


def test_opener_relative_insertion_order():
    mgr = TabManager()
    a = TabData(title="A")
    b = TabData(title="B")
    c = TabData(title="C")

    mgr.add(a, activate=True)
    mgr.add(b, activate=False, opener_id=a.id)
    mgr.add(c, activate=False, opener_id=a.id)

    order = [t.id for t in mgr.tabs]
    assert order == [a.id, b.id, c.id]


def test_pinned_boundary_blocks_cross_zone_reorder():
    mgr = TabManager()
    p = TabData(title="Pinned", pinned=True)
    u = TabData(title="Unpinned", pinned=False)

    mgr.add(p, activate=True)
    mgr.add(u, activate=False)

    assert mgr.can_reorder(p.id, u.id) is False
    assert mgr.reorder(p.id, u.id) is False


def test_close_other_and_close_right_ignore_pinned_tabs():
    mgr = TabManager()
    p = TabData(title="Pinned", pinned=True)
    a = TabData(title="A")
    b = TabData(title="B")
    c = TabData(title="C")

    mgr.add(p, activate=False)
    mgr.add(a, activate=False)
    mgr.add(b, activate=True)
    mgr.add(c, activate=False)

    other_ids = mgr.close_other_ids(b.id)
    right_ids = mgr.close_right_ids(a.id)

    assert p.id not in other_ids
    assert p.id not in right_ids
    assert set(other_ids) == {a.id, c.id}
    assert right_ids == [b.id, c.id]


def test_set_pinned_repositions_into_pinned_zone():
    mgr = TabManager()
    a = TabData(title="A")
    b = TabData(title="B")

    mgr.add(a, activate=False)
    mgr.add(b, activate=False)
    mgr.set_pinned(b.id, True)

    tabs = mgr.tabs
    assert tabs[0].id == b.id
    assert tabs[0].pinned is True
