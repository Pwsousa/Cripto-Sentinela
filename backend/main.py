import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import deps, store
from .mqtt_client import MqttClient
from .protocol import Protocol
from .ws_manager import WsManager
from .routers import identity, messages, trust, revocation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Singletons
ws_manager = WsManager()
_mqtt_client: MqttClient | None = None
_loop: asyncio.AbstractEventLoop | None = None


def _on_mqtt_message(topic: str, payload: str):
    protocol = deps._protocol
    if protocol and _loop:
        asyncio.run_coroutine_threadsafe(protocol.handle_incoming(topic, payload), _loop)


def _init_mqtt(unit_id: str) -> tuple[MqttClient, Protocol]:
    global _mqtt_client
    if _mqtt_client:
        _mqtt_client.disconnect()

    client = MqttClient(unit_id, _on_mqtt_message)
    protocol = Protocol(client, ws_manager)
    _mqtt_client = client
    deps.set_protocol(protocol)
    return client, protocol


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_event_loop()

    stored = store.load_identity()
    if stored:
        client, protocol = _init_mqtt(stored["id_unidade"])
        protocol.load_identity()
        client.connect()
        # Give broker time to connect then publish IFF
        await asyncio.sleep(2)
        protocol.publish_iff()
        logger.info(f"SISDEF backend ready — unit: {stored['id_unidade']}")
    else:
        logger.info("No identity found — create one via POST /identity")

    yield

    if _mqtt_client:
        _mqtt_client.disconnect()


app = FastAPI(title="SISDEF Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(identity.router, prefix="/identity", tags=["identity"])
app.include_router(messages.router, prefix="/messages", tags=["messages"])
app.include_router(trust.router, prefix="/trusted", tags=["trust"])
app.include_router(revocation.router, prefix="/revocation", tags=["revocation"])


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    # Send current state on connect
    stored = store.load_identity()
    if stored:
        await ws.send_json({
            "type": "init",
            "identity": {
                "id_unidade": stored["id_unidade"],
                "rsa_public_b64": stored["rsa_public_b64"],
                "ecdsa_public_b64": stored["ecdsa_public_b64"],
            },
            "trusted": store.load_trusted(),
            "revoked": store.load_revoked(),
            "mqtt": "online" if (_mqtt_client and _mqtt_client.connected) else "offline",
        })
    try:
        while True:
            await ws.receive_text()  # keep-alive, client can send pings
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


@app.get("/status")
async def status():
    stored = store.load_identity()
    return {
        "mqtt": "online" if (_mqtt_client and _mqtt_client.connected) else "offline",
        "identity": stored["id_unidade"] if stored else None,
    }


# Hook called from identity router after creating new identity
# so MQTT reconnects with the new unit_id
app.state.init_mqtt = _init_mqtt
app.state.loop = None  # set at startup via lifespan
