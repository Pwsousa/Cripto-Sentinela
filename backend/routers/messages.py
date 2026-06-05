from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_protocol
from ..protocol import Protocol

router = APIRouter()


class SendRequest(BaseModel):
    dest: str
    plaintext: str


@router.post("/send")
async def send_message(body: SendRequest, protocol: Protocol = Depends(get_protocol)):
    try:
        envelope = protocol.send_message(body.dest, body.plaintext)
        return {"ok": True, "dest": body.dest, "envelope": envelope}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))
