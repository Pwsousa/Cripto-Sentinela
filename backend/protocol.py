import json
import logging
from datetime import datetime, timezone
from typing import Optional

from . import crypto, store
from .mqtt_client import MqttClient
from .ws_manager import WsManager

logger = logging.getLogger(__name__)


class Protocol:
    def __init__(self, mqtt: MqttClient, ws: WsManager):
        self.mqtt = mqtt
        self.ws = ws
        self._identity: Optional[dict] = None
        self._rsa_priv = None
        self._ecdsa_priv = None

    # ---------- Identity ----------

    def load_identity(self) -> bool:
        stored = store.load_identity()
        if not stored:
            return False
        self._identity = stored
        self._rsa_priv = crypto.load_rsa_priv_key(stored["rsa_private_b64"])
        self._ecdsa_priv = crypto.load_ecdsa_priv_key(stored["ecdsa_private_b64"])
        logger.info(f"Identity loaded: {stored['id_unidade']}")
        return True

    def create_identity(self, unit_id: str) -> dict:
        rsa_priv = crypto.generate_rsa_keypair()
        ecdsa_priv = crypto.generate_ecdsa_keypair()

        rsa_k = crypto.export_keys_as_string(rsa_priv, rsa_priv.public_key())
        ecdsa_k = crypto.export_keys_as_string(ecdsa_priv, ecdsa_priv.public_key())

        stored = {
            "id_unidade": unit_id.lower(),
            "rsa_private_b64": rsa_k["private_key"],
            "rsa_public_b64": rsa_k["public_key"],
            "ecdsa_private_b64": ecdsa_k["private_key"],
            "ecdsa_public_b64": ecdsa_k["public_key"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        store.save_identity(stored)
        self._identity = stored
        self._rsa_priv = rsa_priv
        self._ecdsa_priv = ecdsa_priv
        logger.info(f"Identity created: {unit_id}")
        return stored

    def get_identity_public(self) -> Optional[dict]:
        if not self._identity:
            return None
        return {
            "id_unidade": self._identity["id_unidade"],
            "rsa_public_b64": self._identity["rsa_public_b64"],
            "ecdsa_public_b64": self._identity["ecdsa_public_b64"],
            "created_at": self._identity.get("created_at"),
        }

    # ---------- IFF ----------

    def publish_iff(self):
        if not self._identity:
            return
        payload = json.dumps({
            "id_unidade": self._identity["id_unidade"],
            "chave_publica_rsa": self._identity["rsa_public_b64"],
            "chave_publica_eddsa": self._identity["ecdsa_public_b64"],
        })
        self.mqtt.publish(
            f"sisdef/broadcast/chaves/{self._identity['id_unidade']}",
            payload,
            retain=True,
        )
        logger.info(f"IFF published for {self._identity['id_unidade']}")

    # ---------- Send message ----------

    def send_message(self, dest: str, plaintext: str) -> dict:
        if not self._identity or not self._ecdsa_priv:
            raise RuntimeError("Identidade não carregada")

        dest = dest.lower()

        if store.is_revoked(dest):
            raise ValueError(f"{dest} está revogado")

        trusted = store.get_trusted(dest)
        if not trusted:
            raise ValueError(f"Sem chave pública de {dest} — aguarde IFF")

        recipient_rsa_pub = crypto.load_rsa_pub_key(trusted["chave_publica_rsa"])
        envelope = crypto.seal_message(
            plaintext=plaintext,
            recipient_rsa_pub=recipient_rsa_pub,
            sender_ecdsa_priv=self._ecdsa_priv,
            sender_id=self._identity["id_unidade"],
        )
        self.mqtt.publish(f"sisdef/direto/{dest}", json.dumps(envelope))
        logger.info(f"Message sent → {dest}")
        return envelope

    # ---------- Revocation ----------

    def emit_revocation(self, unit_id: str) -> dict:
        if not self._identity or not self._ecdsa_priv:
            raise RuntimeError("Identidade não carregada")

        unit_id = unit_id.lower()
        if unit_id == self._identity["id_unidade"]:
            raise ValueError("Não é possível revogar a própria unidade")

        revogacao = {
            "unidade_revogada": unit_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        rev_bytes = json.dumps(revogacao, separators=(",", ":"), sort_keys=True).encode()
        sig = crypto.ecdsa_sign(self._ecdsa_priv, crypto.sha256(rev_bytes))

        pkt = {
            "remetente": self._identity["id_unidade"],
            "revogacao": revogacao,
            "assinatura_b64": crypto.b64enc(sig),
        }
        self.mqtt.publish("sisdef/broadcast/revogacao", json.dumps(pkt))
        store.add_revoked(unit_id, self._identity["id_unidade"], revogacao["timestamp"])
        logger.info(f"Revocation emitted for {unit_id}")
        return pkt

    # ---------- Incoming handlers ----------

    async def handle_incoming(self, topic: str, payload: str):
        if not self._identity:
            return
        my_id = self._identity["id_unidade"]

        if topic.startswith("sisdef/broadcast/chaves/"):
            await self._handle_iff(payload)
        elif topic == "sisdef/broadcast/revogacao":
            await self._handle_revocation(payload)
        elif topic == f"sisdef/direto/{my_id}":
            await self._handle_direct(payload)

    async def _handle_iff(self, payload: str):
        try:
            obj = json.loads(payload)
            unit_id = str(obj.get("id_unidade", "")).lower()
            if not unit_id or unit_id == self._identity["id_unidade"]:
                return
            if store.is_revoked(unit_id):
                logger.warning(f"IFF ignored from revoked unit: {unit_id}")
                return
            rsa_pub = str(obj.get("chave_publica_rsa", ""))
            # accept both field names (eddsa / ecdsa) for cross-compatibility
            ecdsa_pub = str(obj.get("chave_publica_eddsa") or obj.get("chave_publica_ecdsa", ""))
            if not rsa_pub or not ecdsa_pub:
                logger.warning(f"Malformed IFF from {unit_id}")
                return
            store.add_trusted(unit_id, rsa_pub, ecdsa_pub)
            await self.ws.broadcast({
                "type": "iff_received",
                "unit": unit_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"IFF stored: {unit_id}")
        except Exception as e:
            logger.error(f"IFF parse error: {e}")

    async def _handle_revocation(self, payload: str):
        try:
            pkt = json.loads(payload)
            remetente = str(pkt.get("remetente", "")).lower()
            rev = pkt.get("revogacao", {})
            sig_b64 = str(pkt.get("assinatura_b64", ""))

            if not remetente or not rev or not sig_b64:
                logger.warning("Malformed revocation packet")
                return
            if store.is_revoked(remetente):
                logger.warning(f"Revocation from revoked sender {remetente} — ignored")
                return

            sender_keys = store.get_trusted(remetente)
            if not sender_keys:
                logger.warning(f"Revocation from unknown sender: {remetente}")
                return

            pub = crypto.load_ecdsa_pub_key(sender_keys["chave_publica_ecdsa"])
            rev_bytes = json.dumps(rev, separators=(",", ":"), sort_keys=True).encode()
            valid = crypto.ecdsa_verify(pub, crypto.b64dec(sig_b64), crypto.sha256(rev_bytes))

            if not valid:
                await self.ws.broadcast({
                    "type": "log",
                    "level": "err",
                    "text": f"Revocation with INVALID signature from {remetente} — possible SOMBRA",
                })
                return

            target = str(rev.get("unidade_revogada", "")).lower()
            ts = str(rev.get("timestamp", datetime.now(timezone.utc).isoformat()))
            store.add_revoked(target, remetente, ts)

            await self.ws.broadcast({
                "type": "revocation_applied",
                "unit": target,
                "by": remetente,
                "timestamp": ts,
            })
            logger.info(f"Revocation applied: {target} by {remetente}")
        except Exception as e:
            logger.error(f"Revocation handler error: {e}")

    async def _handle_direct(self, payload: str):
        if not self._identity or not self._rsa_priv:
            return
        try:
            envelope = json.loads(payload)
        except Exception:
            return

        sender_id = str(envelope.get("id_unidade", "")).lower()

        if sender_id == self._identity["id_unidade"]:
            return  # own echo

        if store.is_revoked(sender_id):
            await self.ws.broadcast({
                "type": "message_received",
                "from": sender_id,
                "status": "revoked",
                "detail": "Remetente na lista de revogação",
            })
            return

        sender_keys = store.get_trusted(sender_id)
        if not sender_keys:
            await self.ws.broadcast({
                "type": "message_received",
                "from": sender_id,
                "status": "unknown-sender",
                "detail": "IFF ausente — chave pública desconhecida",
            })
            return

        try:
            sender_pub = crypto.load_ecdsa_pub_key(sender_keys["chave_publica_ecdsa"])
            result = crypto.open_message(envelope, self._rsa_priv, sender_pub)

            if not result["verified"]:
                await self.ws.broadcast({
                    "type": "message_received",
                    "from": sender_id,
                    "status": "tampered",
                    "detail": "Assinatura ECDSA inválida — possível adulteração pela SOMBRA",
                })
                await self._report_incident(f"assinatura inválida de {sender_id}")
            else:
                await self.ws.broadcast({
                    "type": "message_received",
                    "from": sender_id,
                    "status": "ok",
                    "plaintext": result["plaintext"],
                })
        except Exception as e:
            await self.ws.broadcast({
                "type": "message_received",
                "from": sender_id,
                "status": "tampered",
                "detail": f"Falha de decifragem/AEAD: {e}",
            })
            await self._report_incident(f"falha ao decifrar mensagem de {sender_id}")

    async def _report_incident(self, reason: str):
        if not self._identity or not self._ecdsa_priv:
            return
        oracle = store.get_trusted("oraculo")
        if not oracle:
            return
        try:
            oracle_rsa_pub = crypto.load_rsa_pub_key(oracle["chave_publica_rsa"])
            body = json.dumps({
                "cmd": "incident",
                "unidade": self._identity["id_unidade"],
                "motivo": reason,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
            env = crypto.seal_message(body, oracle_rsa_pub, self._ecdsa_priv, self._identity["id_unidade"])
            self.mqtt.publish("sisdef/direto/oraculo", json.dumps(env))
            logger.info(f"Incident reported to oracle: {reason}")
        except Exception as e:
            logger.error(f"Failed to report incident: {e}")
