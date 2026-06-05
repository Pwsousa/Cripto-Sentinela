from fastapi import APIRouter, HTTPException
from .. import store

router = APIRouter()


@router.get("")
async def list_trusted():
    return store.load_trusted()


@router.delete("/{unit_id}")
async def forget_unit(unit_id: str):
    if unit_id.lower() == "oraculo":
        raise HTTPException(400, "Oráculo é permanente")
    store.remove_trusted(unit_id)
    return {"ok": True, "removed": unit_id.lower()}
