from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_protocol
from ..protocol import Protocol
from .. import store

router = APIRouter()


class RevokeRequest(BaseModel):
    unit_id: str


@router.post("")
async def revoke_unit(body: RevokeRequest, protocol: Protocol = Depends(get_protocol)):
    try:
        pkt = protocol.emit_revocation(body.unit_id)
        return {"ok": True, "packet": pkt}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.get("")
async def list_revoked():
    return store.load_revoked()
