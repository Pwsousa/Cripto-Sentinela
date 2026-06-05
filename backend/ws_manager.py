import json
from typing import Set

from fastapi import WebSocket


class WsManager:
    def __init__(self):
        self._connections: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.add(ws)

    def disconnect(self, ws: WebSocket):
        self._connections.discard(ws)

    async def broadcast(self, event: dict):
        payload = json.dumps(event)
        dead: Set[WebSocket] = set()
        for ws in self._connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self._connections -= dead
