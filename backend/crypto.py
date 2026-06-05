import base64
import hashlib
import os

from cryptography.hazmat.primitives.asymmetric import rsa, ec, padding
from cryptography.hazmat.primitives.asymmetric.ec import ECDSA
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# ---------- Base64 helpers ----------

def b64enc(data: bytes) -> str:
    return base64.b64encode(data).decode()


def b64dec(s: str) -> bytes:
    return base64.b64decode(s)


# ---------- Key generation ----------

def generate_rsa_keypair():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def generate_ecdsa_keypair():
    return ec.generate_private_key(ec.SECP256R1())


# ---------- Export (briefing format) ----------

def export_keys_as_string(private_key, public_key) -> dict:
    _priv_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    _pub_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return {
        "private_key": base64.b64encode(_priv_bytes).decode(),
        "public_key": base64.b64encode(_pub_bytes).decode(),
    }


# ---------- Import ----------

def load_rsa_pub_key(b64_str: str):
    return serialization.load_der_public_key(base64.b64decode(b64_str))


def load_ecdsa_pub_key(b64_str: str):
    return serialization.load_der_public_key(base64.b64decode(b64_str))


def load_rsa_priv_key(b64_str: str):
    return serialization.load_der_private_key(base64.b64decode(b64_str), password=None)


def load_ecdsa_priv_key(b64_str: str):
    return serialization.load_der_private_key(base64.b64decode(b64_str), password=None)


# ---------- Primitives ----------

def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def aes_gcm_encrypt(plaintext: bytes) -> dict:
    key = os.urandom(32)
    nonce = os.urandom(12)
    sealed = AESGCM(key).encrypt(nonce, plaintext, None)  # tag appended at end
    return {
        "ciphertext": sealed[:-16],
        "tag": sealed[-16:],
        "nonce": nonce,
        "key": key,
    }


def aes_gcm_decrypt(ciphertext: bytes, tag: bytes, nonce: bytes, key: bytes) -> bytes:
    return AESGCM(key).decrypt(nonce, ciphertext + tag, None)


def rsa_encrypt(pub_key, data: bytes) -> bytes:
    return pub_key.encrypt(
        data,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )


def rsa_decrypt(priv_key, ciphertext: bytes) -> bytes:
    return priv_key.decrypt(
        ciphertext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )


def ecdsa_sign(priv_key, data: bytes) -> bytes:
    return priv_key.sign(data, ECDSA(hashes.SHA256()))


def ecdsa_verify(pub_key, signature: bytes, data: bytes) -> bool:
    try:
        pub_key.verify(signature, data, ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False


# ---------- Envelope (seal / open) ----------

def seal_message(plaintext: str, recipient_rsa_pub, sender_ecdsa_priv, sender_id: str) -> dict:
    pt = plaintext.encode()
    enc = aes_gcm_encrypt(pt)
    wrapped_key = rsa_encrypt(recipient_rsa_pub, enc["key"])
    sig = ecdsa_sign(sender_ecdsa_priv, sha256(pt))
    return {
        "id_unidade": sender_id,
        "ciphertext_b64": b64enc(enc["ciphertext"]),
        "tag_autenticacao_b64": b64enc(enc["tag"]),
        "nonce_b64": b64enc(enc["nonce"]),
        "chave_sessao_cifrada_b64": b64enc(wrapped_key),
        "assinatura_b64": b64enc(sig),
    }


def open_message(envelope: dict, my_rsa_priv, sender_ecdsa_pub) -> dict:
    ct = b64dec(envelope["ciphertext_b64"])
    tag = b64dec(envelope["tag_autenticacao_b64"])
    nonce = b64dec(envelope["nonce_b64"])
    wrapped_key = b64dec(envelope["chave_sessao_cifrada_b64"])
    sig = b64dec(envelope["assinatura_b64"])

    session_key = rsa_decrypt(my_rsa_priv, wrapped_key)
    pt = aes_gcm_decrypt(ct, tag, nonce, session_key)
    verified = ecdsa_verify(sender_ecdsa_pub, sig, sha256(pt))

    return {
        "plaintext": pt.decode(),
        "sender_id": str(envelope.get("id_unidade", "")),
        "verified": verified,
    }
