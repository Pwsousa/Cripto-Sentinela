import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

IDENTITY_FILE = DATA_DIR / "identity.json"
TRUSTED_FILE = DATA_DIR / "chaves_confiadas.json"
REVOKED_FILE = DATA_DIR / "revogados.json"

ORACLE_RSA_PUB = (
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0JYEsxupPYOio+u8xHdzSNLQgQoPwFx/"
    "qceHQJPy2KzNSCXz3FFyKkXaso4UTorzy8XXDv5WkRC1AlDDVu28ANXlrZqLyjLZ8DdplHig2KSx"
    "YV5MXA5TyqMDeCAW5CWi+na5Xwr9IbtuTfCv65YeB3QRgZWjZ4oVxpGVek+4dec0qChNl6pL9Km"
    "gI4u5CHHC8d7z6MovK0+eN0aMIT2bWgri29tT9sDCoHEGaab1576+SXK3iDXlLkeehJ/h72lqu3"
    "HmSL/B5ZE+pKLVLJogSwwMCTejrfTXf5acj9EOq83wGNLTjHIKr2iMz+SZzFS4vxk6qMgltCXjB"
    "ZfXalzLnwIDAQAB"
)
ORACLE_ECDSA_PUB = (
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEfmgdDET1IKOR2OxLI9KBBzFB97GyrJKipAuwSrMh"
    "Dn1w93ieoCb7etbYX5/wrUic9xX5LQbUdgyKSRuCnTPAeQ=="
)


def _read(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ---------- Identity ----------

def load_identity() -> Optional[dict]:
    if not IDENTITY_FILE.exists():
        return None
    with open(IDENTITY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_identity(identity: dict):
    _write(IDENTITY_FILE, identity)


def delete_identity():
    for f in [IDENTITY_FILE, TRUSTED_FILE, REVOKED_FILE]:
        f.unlink(missing_ok=True)


# ---------- Trusted keys ----------

def load_trusted() -> dict:
    data = _read(TRUSTED_FILE)
    data["oraculo"] = {
        "id_unidade": "oraculo",
        "chave_publica_rsa": ORACLE_RSA_PUB,
        "chave_publica_ecdsa": ORACLE_ECDSA_PUB,
        "ultima_atualizacao": "briefing",
    }
    return data


def get_trusted(unit_id: str) -> Optional[dict]:
    return load_trusted().get(unit_id.lower())


def add_trusted(unit_id: str, rsa_pub: str, ecdsa_pub: str):
    data = _read(TRUSTED_FILE)
    data[unit_id.lower()] = {
        "id_unidade": unit_id.lower(),
        "chave_publica_rsa": rsa_pub,
        "chave_publica_ecdsa": ecdsa_pub,
        "ultima_atualizacao": datetime.now(timezone.utc).isoformat(),
    }
    _write(TRUSTED_FILE, data)


def remove_trusted(unit_id: str):
    data = _read(TRUSTED_FILE)
    data.pop(unit_id.lower(), None)
    _write(TRUSTED_FILE, data)


# ---------- Revocation ----------

def load_revoked() -> dict:
    return _read(REVOKED_FILE)


def is_revoked(unit_id: str) -> bool:
    return unit_id.lower() in load_revoked()


def add_revoked(unit_id: str, by: str, timestamp: str):
    data = load_revoked()
    data[unit_id.lower()] = {"by": by, "timestamp": timestamp}
    _write(REVOKED_FILE, data)
    remove_trusted(unit_id)
