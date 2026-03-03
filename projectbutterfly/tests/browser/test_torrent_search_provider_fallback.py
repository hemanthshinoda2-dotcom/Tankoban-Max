import json
import sys
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[2]
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

import bridge as bridge_module


def _provider_cfg():
    return {
        "provider": "jackett",
        "jackett": {"baseUrl": "http://jackett.local", "apiKey": "jk"},
        "prowlarr": {"baseUrl": "http://prowlarr.local", "apiKey": "pw"},
        "tankorent": {"enabled": True, "sites": {"piratebay": True, "1337x": True, "nyaa": True}},
    }


def test_fallback_chain_prefers_selected_provider_order():
    assert bridge_module.TorrentSearchBridge._provider_fallback_chain("jackett") == ["jackett", "prowlarr", "tankorent"]
    assert bridge_module.TorrentSearchBridge._provider_fallback_chain("prowlarr") == ["prowlarr", "jackett", "tankorent"]
    assert bridge_module.TorrentSearchBridge._provider_fallback_chain("tankorent") == ["tankorent", "jackett", "prowlarr"]


def test_query_falls_back_when_primary_provider_fails(monkeypatch):
    bridge = bridge_module.TorrentSearchBridge()
    monkeypatch.setattr(bridge, "_get_provider_config", lambda: _provider_cfg())

    calls = []

    def _fake_query_provider(provider_key, _cfg, payload):
        calls.append(provider_key)
        if provider_key == "jackett":
            return {
                "ok": False,
                "items": [],
                "error": "Jackett down",
                "provider": provider_key,
                "page": int(payload.get("page", 0)),
                "limit": int(payload.get("limit", 40)),
                "returned": 0,
            }
        if provider_key == "prowlarr":
            return {
                "ok": True,
                "items": [{
                    "id": "pr_1",
                    "title": "One Piece",
                    "magnetUri": "magnet:?xt=urn:btih:123",
                }],
                "provider": provider_key,
                "page": int(payload.get("page", 0)),
                "limit": int(payload.get("limit", 40)),
                "returned": 1,
            }
        return {
            "ok": True,
            "items": [],
            "provider": provider_key,
            "page": int(payload.get("page", 0)),
            "limit": int(payload.get("limit", 40)),
            "returned": 0,
        }

    monkeypatch.setattr(bridge, "_query_provider", _fake_query_provider)

    out = json.loads(bridge.query(json.dumps({
        "query": "one piece",
        "provider": "jackett",
        "limit": 10,
        "page": 0,
    })))

    assert out["ok"] is True
    assert out["provider"] == "jackett"
    assert out["activeProvider"] == "prowlarr"
    assert out["fallbackUsed"] is True
    assert calls == ["jackett", "prowlarr"]
    assert out["providersTried"][0]["provider"] == "jackett"
    assert out["providersTried"][1]["provider"] == "prowlarr"


def test_query_uses_tankorent_first_chain_and_continues_on_empty(monkeypatch):
    bridge = bridge_module.TorrentSearchBridge()
    monkeypatch.setattr(bridge, "_get_provider_config", lambda: _provider_cfg())

    calls = []

    def _fake_query_provider(provider_key, _cfg, payload):
        calls.append(provider_key)
        if provider_key == "tankorent":
            return {
                "ok": True,
                "items": [],
                "provider": provider_key,
                "page": int(payload.get("page", 0)),
                "limit": int(payload.get("limit", 40)),
                "returned": 0,
            }
        if provider_key == "jackett":
            return {
                "ok": False,
                "items": [],
                "error": "Jackett timeout",
                "provider": provider_key,
                "page": int(payload.get("page", 0)),
                "limit": int(payload.get("limit", 40)),
                "returned": 0,
            }
        return {
            "ok": True,
            "items": [{
                "id": "pw_1",
                "title": "Bleach",
                "magnetUri": "magnet:?xt=urn:btih:456",
            }],
            "provider": provider_key,
            "page": int(payload.get("page", 0)),
            "limit": int(payload.get("limit", 40)),
            "returned": 1,
        }

    monkeypatch.setattr(bridge, "_query_provider", _fake_query_provider)

    out = json.loads(bridge.query(json.dumps({
        "query": "bleach",
        "provider": "tankorent",
        "limit": 10,
        "page": 0,
    })))

    assert out["ok"] is True
    assert out["provider"] == "tankorent"
    assert out["activeProvider"] == "prowlarr"
    assert out["fallbackUsed"] is True
    assert out["fallbackChain"] == ["tankorent", "jackett", "prowlarr"]
    assert calls == ["tankorent", "jackett", "prowlarr"]
