from typing import Optional
from .protocol import Protocol

_protocol: Optional[Protocol] = None


def set_protocol(p: Protocol):
    global _protocol
    _protocol = p


def get_protocol() -> Protocol:
    if _protocol is None:
        raise RuntimeError("Protocol not initialized — create identity first")
    return _protocol
