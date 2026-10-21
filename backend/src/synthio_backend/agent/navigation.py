"""Handler for the ``slides.navigate`` RPC sent by the frontend."""

import json
import logging
from typing import Protocol

from livekit import rtc

logger = logging.getLogger(__name__)


class SlideNavigator(Protocol):
    async def navigate(self, index: int) -> None: ...


def parse_navigate_payload(payload: str) -> int:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError("Payload must be valid JSON") from exc
    index = data.get("index") if isinstance(data, dict) else None
    if not isinstance(index, int) or isinstance(index, bool):
        raise ValueError('Payload must be an object with an integer "index"')
    return index


async def handle_navigate(navigator: SlideNavigator, data: rtc.RpcInvocationData) -> str:
    try:
        index = parse_navigate_payload(data.payload)
        await navigator.navigate(index)
    # RuntimeError: the session is not running yet, or is shutting down.
    except (ValueError, RuntimeError) as exc:
        logger.warning("slides.navigate rejected: %s", exc)
        return json.dumps({"ok": False, "error": str(exc)})
    return json.dumps({"ok": True, "index": index})
