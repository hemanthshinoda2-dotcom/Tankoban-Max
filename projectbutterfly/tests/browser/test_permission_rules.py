import json
import sys
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[2]
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

import bridge as bridge_module


def test_permission_rule_round_trip(tmp_path, monkeypatch):
    def _data_path(name):
        return str(tmp_path / name)

    def _read_json(path, default=None):
        p = Path(path)
        if not p.exists():
            return default
        return json.loads(p.read_text(encoding="utf-8"))

    def _write_json_sync(path, data):
        Path(path).write_text(json.dumps(data), encoding="utf-8")

    monkeypatch.setattr(bridge_module.storage, "data_path", _data_path)
    monkeypatch.setattr(bridge_module.storage, "read_json", _read_json)
    monkeypatch.setattr(bridge_module.storage, "write_json_sync", _write_json_sync)

    perms = bridge_module.WebPermissionsBridge()

    query = json.dumps({"origin": "https://example.com/path", "permission": "geolocation"})
    initial = json.loads(perms.getDecision(query))
    assert initial["ok"] is True
    assert initial["decision"] == "ask"

    set_out = json.loads(perms.set(json.dumps({
        "origin": "https://example.com/path",
        "permission": "geolocation",
        "decision": "allow",
    })))
    assert set_out["ok"] is True

    decided = json.loads(perms.getDecision(query))
    assert decided["ok"] is True
    assert decided["decision"] == "allow"


def test_permission_invalid_origin_defaults_to_ask(tmp_path, monkeypatch):
    monkeypatch.setattr(bridge_module.storage, "data_path", lambda name: str(tmp_path / name))
    monkeypatch.setattr(bridge_module.storage, "read_json", lambda path, default=None: default)
    monkeypatch.setattr(bridge_module.storage, "write_json_sync", lambda path, data: None)

    perms = bridge_module.WebPermissionsBridge()
    out = json.loads(perms.getDecision(json.dumps({"origin": "file:///tmp/a", "permission": "media"})))

    assert out["ok"] is True
    assert out["decision"] == "ask"
