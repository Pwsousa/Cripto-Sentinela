import logging
import random
from typing import Callable

import paho.mqtt.client as mqtt

BROKER_HOST = "broker.hivemq.com"
BROKER_PORT = 1883

logger = logging.getLogger(__name__)


class MqttClient:
    def __init__(self, unit_id: str, on_message: Callable[[str, str], None]):
        self.unit_id = unit_id.lower()
        self._on_message_cb = on_message
        self._client: mqtt.Client | None = None
        self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    def connect(self):
        cid = f"sisdef-{self.unit_id}-{random.randint(1000, 9999)}"
        self._client = mqtt.Client(client_id=cid, protocol=mqtt.MQTTv311)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message
        self._client.reconnect_delay_set(min_delay=2, max_delay=10)
        self._client.connect_async(BROKER_HOST, BROKER_PORT, keepalive=60)
        self._client.loop_start()

    def disconnect(self):
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            self._connected = False

    def publish(self, topic: str, payload: str, retain: bool = False):
        if self._client and self._connected:
            self._client.publish(topic, payload, qos=0, retain=retain)
        else:
            logger.warning(f"Publish skipped — not connected (topic={topic})")

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            logger.info(f"MQTT connected as {self.unit_id}")
            topics = [
                (f"sisdef/broadcast/chaves/+", 0),
                (f"sisdef/direto/{self.unit_id}", 0),
                ("sisdef/broadcast/revogacao", 0),
            ]
            client.subscribe(topics)
            logger.info("Subscribed: IFF broadcast, direct, revocation")
        else:
            logger.error(f"MQTT connect failed rc={rc}")

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        logger.warning(f"MQTT disconnected rc={rc}")

    def _on_message(self, client, userdata, msg):
        try:
            self._on_message_cb(msg.topic, msg.payload.decode())
        except Exception as e:
            logger.error(f"Message handler error: {e}")
