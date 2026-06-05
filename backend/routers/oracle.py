from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_protocol
from ..protocol import Protocol

router = APIRouter()


class AnswerRequest(BaseModel):
    answer: str


@router.post("/challenge")
async def request_challenge(protocol: Protocol = Depends(get_protocol)):
    """Passo 1 — solicita um novo desafio ao Oráculo."""
    try:
        pkt = protocol.request_challenge()
        return {"ok": True, "request": pkt}
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.post("/answer")
async def send_answer(body: AnswerRequest, protocol: Protocol = Depends(get_protocol)):
    """Passo 3 — cifra apenas a string do número e envia (cmd=resposta)."""
    answer = body.answer.strip()
    if not answer:
        raise HTTPException(400, "Resposta vazia")
    try:
        env = protocol.send_answer(answer)
        return {"ok": True, "envelope": env}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.post("/echo")
async def echo(protocol: Protocol = Depends(get_protocol)):
    """Testa conexão/decriptografia com o Oráculo (cmd=echo)."""
    try:
        env = protocol.echo_oracle()
        return {"ok": True, "envelope": env}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.post("/grades")
async def request_grades(protocol: Protocol = Depends(get_protocol)):
    """Passo 4 — solicita atualização do placar de notas."""
    try:
        pkt = protocol.request_grades()
        return {"ok": True, "request": pkt}
    except RuntimeError as e:
        raise HTTPException(503, str(e))
