"""Warm-up dispatches that keep the hosted agent from scaling to zero.

LiveKit Cloud's free plan puts an idle agent deployment to sleep, and a sleeping deployment
has been observed not to wake for new sessions, and Render's free API sleeps after ~15 minutes
without requests. They keep each other awake: the API dispatches a warm-up job (which the agent
recognises and ends at once) every ``AGENT_WARMUP_INTERVAL_S``, and the agent pings the API's
health URL (``SELF_PING_URL``) every ``SELF_PING_INTERVAL_S``. The keep-alive workflow also
calls the warm-up endpoint as a backup.
"""

import asyncio
import json
import logging
import threading
import time
import urllib.request
import uuid

from livekit import api

from synthio_backend.core.config import Settings
from synthio_backend.session.tokens import LiveKitNotConfiguredError

logger = logging.getLogger(__name__)

WARMUP_METADATA = json.dumps({"warmup": True}, separators=(",", ":"))
# Ignore calls closer together than this, so the public endpoint can't flood dispatches.
MIN_INTERVAL_S = 60.0

_last_dispatch_at: float | None = None


def is_warmup(metadata: str) -> bool:
    try:
        data = json.loads(metadata) if metadata else None
    except json.JSONDecodeError:
        return False
    return isinstance(data, dict) and data.get("warmup") is True


async def dispatch_warmup(settings: Settings, now: float | None = None) -> bool:
    """Dispatches one warm-up job; False when skipped because one was sent recently."""
    global _last_dispatch_at
    url, key, secret = settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret
    if not url or not key or secret is None:
        raise LiveKitNotConfiguredError
    current = time.monotonic() if now is None else now
    if _last_dispatch_at is not None and current - _last_dispatch_at < MIN_INTERVAL_S:
        return False
    _last_dispatch_at = current
    async with api.LiveKitAPI(url, key, secret.get_secret_value()) as client:
        await client.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name=settings.agent_name,
                room=f"synthio-warmup-{uuid.uuid4().hex[:8]}",
                metadata=WARMUP_METADATA,
            )
        )
    return True


# Delay before the API's first warm-up, so a starting service (or a test client) settles first.
_FIRST_WARMUP_DELAY_S = 30.0


async def warmup_loop(settings: Settings, interval_s: float) -> None:
    """Dispatches a warm-up every ``interval_s`` until cancelled; failures are logged."""
    await asyncio.sleep(_FIRST_WARMUP_DELAY_S)
    while True:
        try:
            await dispatch_warmup(settings)
            logger.info("agent warm-up dispatched")
        except Exception:
            logger.warning("agent warm-up failed", exc_info=True)
        await asyncio.sleep(interval_s)


def ping_once(url: str, timeout_s: float = 30.0) -> None:
    with urllib.request.urlopen(url, timeout=timeout_s) as response:
        response.read()


def start_self_ping(url: str, interval_s: float) -> threading.Thread:
    """Pings ``url`` every ``interval_s`` from a daemon thread (keeps a sleeping API awake)."""

    def loop() -> None:
        while True:
            try:
                ping_once(url)
            except Exception:
                logger.warning("self-ping to %s failed", url, exc_info=True)
            time.sleep(interval_s)

    thread = threading.Thread(target=loop, name="self-ping", daemon=True)
    thread.start()
    return thread
