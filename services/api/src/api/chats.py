"""Chat persistence under ``~/.agent-cad/chats/<id>/``.

Each chat is a folder: ``chat.json`` (the thread + state) next to an ``artifacts/``
dir holding its model.py / STL / g-code. Store-backed, atomic writes. The HTTP
endpoints + the chat-namespaced generate/slice live in ``main.py``.
"""

from __future__ import annotations

import shutil
import time
import uuid
from typing import Any

from api.schemas import Chat, Message
from api.store import Store


def create_chat(store: Store, title: str | None = None) -> Chat:
    chat_id = uuid.uuid4().hex[:12]
    now = time.time()
    chat = Chat(id=chat_id, title=title or "New chat", created_at=now, updated_at=now)
    store.artifacts_dir(chat_id).mkdir(parents=True, exist_ok=True)
    return save_chat(store, chat)


def save_chat(store: Store, chat: Chat) -> Chat:
    chat.updated_at = time.time()
    store.atomic_write_json(store.chat_path(chat.id), chat.model_dump())
    return chat


def get_chat(store: Store, chat_id: str) -> Chat | None:
    data = store.read_json(store.chat_path(chat_id))
    return Chat.model_validate(data) if data is not None else None


def list_chats(store: Store) -> list[Chat]:
    if not store.chats_dir.exists():
        return []
    chats: list[Chat] = []
    for d in store.chats_dir.iterdir():
        data = store.read_json(d / "chat.json")
        if data is not None:
            chats.append(Chat.model_validate(data))
    return sorted(chats, key=lambda c: c.updated_at, reverse=True)


def delete_chat(store: Store, chat_id: str) -> None:
    d = store.chat_dir(chat_id)
    if d.exists():
        shutil.rmtree(d)


def append_message(
    store: Store,
    chat_id: str,
    role: str,
    content: str,
    **fields: Any,
) -> Chat | None:
    chat = get_chat(store, chat_id)
    if chat is None:
        return None
    chat.messages.append(Message(role=role, content=content, ts=time.time(), **fields))
    return save_chat(store, chat)
