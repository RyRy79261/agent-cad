"""Tests for chat persistence + per-chat artifacts + slice wiring (API-1/3/4/6/7)."""

from __future__ import annotations

from api.chats import append_message, create_chat, delete_chat, get_chat, list_chats
from api.main import app
from api.store import Store
from fastapi.testclient import TestClient

# --- store-level CRUD (clean, tmp_path) ----------------------------------- #


def test_create_get_list_delete(tmp_path):
    s = Store(tmp_path)
    c = create_chat(s, "Desk stand")
    assert get_chat(s, c.id).title == "Desk stand"
    assert s.artifacts_dir(c.id).is_dir()
    create_chat(s, "Cable clip")
    assert len(list_chats(s)) == 2
    delete_chat(s, c.id)
    assert get_chat(s, c.id) is None
    assert not s.chat_dir(c.id).exists()


def test_append_message(tmp_path):
    s = Store(tmp_path)
    c = create_chat(s)
    append_message(s, c.id, "user", "make a coaster")
    append_message(s, c.id, "assistant", "on it")
    chat = get_chat(s, c.id)
    assert [m.role for m in chat.messages] == ["user", "assistant"]
    assert chat.messages[0].content == "make a coaster"
    assert chat.messages[0].ts > 0


def test_append_to_missing_chat_returns_none(tmp_path):
    assert append_message(Store(tmp_path), "nope", "user", "x") is None


# --- HTTP layer (single session controls shared module-store state) ------- #


def test_chat_http_flow():
    with TestClient(app) as c:
        # create with a first prompt -> title derived, one user message
        chat = c.post("/chats", json={"prompt": "a 90mm coaster with a rim"}).json()
        cid = chat["id"]
        assert chat["title"].startswith("a 90mm coaster")
        assert chat["messages"][0]["role"] == "user"

        # appears in the list and is fetchable
        assert cid in [x["id"] for x in c.get("/chats").json()]
        assert c.get(f"/chats/{cid}").status_code == 200

        # append a message
        c.post(f"/chats/{cid}/messages", json={"content": "make it taller"})
        assert len(c.get(f"/chats/{cid}").json()["messages"]) == 2

        # slice with no model yet -> 409
        assert c.post(f"/chats/{cid}/slice").status_code == 409

        # a slice with a fake STL present submits a job (real slice needs OrcaSlicer)
        store = __import__("api.main", fromlist=["store"]).store
        (store.artifacts_dir(cid) / "model.stl").write_bytes(b"solid x\nendsolid x\n")
        ch = get_chat(store, cid)
        ch.current_stl = "model.stl"
        from api.chats import save_chat
        save_chat(store, ch)
        r = c.post(f"/chats/{cid}/slice", json={"filament_id": "pla"})
        assert r.status_code == 200 and r.json()["kind"] == "slice.ender5s1"

        # artifact route serves the stl + guards traversal + 404s
        assert c.get(f"/chats/{cid}/artifacts/model.stl").status_code == 200
        assert c.get(f"/chats/{cid}/artifacts/nope.stl").status_code == 404
        assert c.get(f"/chats/{cid}/artifacts/..%2f..%2fsettings.json").status_code == 404

        # generate submits a job (real generation needs the claude CLI on PATH)
        assert c.post(f"/chats/{cid}/generate", json={"prompt": "a small hook"}).status_code == 200

        # delete
        assert c.delete(f"/chats/{cid}").status_code == 200
        assert c.get(f"/chats/{cid}").status_code == 404
