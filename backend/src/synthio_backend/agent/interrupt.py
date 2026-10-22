"""Handler for the ``agent.interrupt`` RPC sent by the frontend (tap to speak)."""

import json
import logging
from typing import Protocol

from livekit import rtc

logger = logging.getLogger(__name__)


class UserInterrupter(Protocol):
    async def interrupt_for_user(self) -> None: ...


async def handle_interrupt(target: UserInterrupter, data: rtc.RpcInvocationData) -> str:
    """Stops the agent so the user can speak; the payload (``{}``) is ignored."""
    try:
        await target.interrupt_for_user()
    # RuntimeError: the session is not running yet, or is shutting down.
    except RuntimeError as exc:
        logger.warning("agent.interrupt rejected: %s", exc)
        return json.dumps({"ok": False, "error": str(exc)})
    return json.dumps({"ok": True})
