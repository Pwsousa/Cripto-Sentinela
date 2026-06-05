import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..deps import get_protocol, set_protocol
from ..protocol import Protocol
from .. import store

router = APIRouter()


class CreateIdentityRequest(BaseModel):
    id_unidade: str


@router.post("")
async def create_identity(request: Request, body: CreateIdentityRequest):
    clean = body.id_unidade.lower().strip()
    if not clean or not all(c.isalnum() or c == "-" for c in clean):
        raise HTTPException(400, "ID inválido — use letras minúsculas, números e hífens")

    # (Re)init MQTT + protocol for new identity
    init_mqtt = request.app.state.init_mqtt
    client, protocol = init_mqtt(clean)
    stored = protocol.create_identity(clean)
    client.connect()

    loop = asyncio.get_event_loop()
    loop.call_later(2, protocol.publish_iff)

    return {
        "id_unidade": stored["id_unidade"],
        "rsa_public_b64": stored["rsa_public_b64"],
        "ecdsa_public_b64": stored["ecdsa_public_b64"],
        "created_at": stored["created_at"],
    }


@router.get("")
async def get_identity():
    stored = store.load_identity()
    if not stored:
        raise HTTPException(404, "Identidade não criada")
    return {
        "id_unidade": stored["id_unidade"],
        "rsa_public_b64": stored["rsa_public_b64"],
        "ecdsa_public_b64": stored["ecdsa_public_b64"],
        "created_at": stored.get("created_at"),
    }


@router.post("/publish-iff")
async def publish_iff(protocol: Protocol = Depends(get_protocol)):
    protocol.publish_iff()
    return {"ok": True}


@router.delete("")
async def delete_identity():
    store.delete_identity()
    return {"ok": True}
