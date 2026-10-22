"""Warm-up dispatches that keep the hosted agent from scaling to zero.

LiveKit Cloud's free plan puts an idle agent deployment to sleep, and a sleeping deployment
has been observed not to wake for new sessions. The keep-alive workflow calls the warm-up
endpoint every few minutes; it dispatches a job the agent recognises and ends at once, which
counts as activity without opening a presentation.
"""

import json
import time
import uuid

from livekit import api

from synthio_backend.core.config import Settings
from synthio_backend.session.tokens import LiveKitNotConfiguredError

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
