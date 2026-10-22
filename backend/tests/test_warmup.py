import asyncio

import pytest

from synthio_backend.session import warmup
from synthio_backend.session.tokens import LiveKitNotConfiguredError
from tests.conftest import make_settings


def test_is_warmup_only_for_warmup_metadata() -> None:
    assert warmup.is_warmup(warmup.WARMUP_METADATA)
    assert not warmup.is_warmup('{"deckId":"acl-football"}')
    assert not warmup.is_warmup("")
    assert not warmup.is_warmup("not json")
    assert not warmup.is_warmup('{"warmup":"yes"}')


async def test_dispatch_warmup_is_rate_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[object] = []

    class FakeDispatch:
        async def create_dispatch(self, request: object) -> None:
            sent.append(request)

    class FakeClient:
        agent_dispatch = FakeDispatch()

        def __init__(self, *_: object) -> None: ...

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_: object) -> None: ...

    monkeypatch.setattr(warmup.api, "LiveKitAPI", FakeClient)
    monkeypatch.setattr(warmup, "_last_dispatch_at", None)
    settings = make_settings()
    assert await warmup.dispatch_warmup(settings, now=100.0)
    assert not await warmup.dispatch_warmup(settings, now=130.0)
    assert await warmup.dispatch_warmup(settings, now=100.0 + warmup.MIN_INTERVAL_S)
    assert len(sent) == 2


async def test_dispatch_warmup_requires_livekit() -> None:
    settings = make_settings(livekit_url=None, livekit_api_key=None, livekit_api_secret=None)
    with pytest.raises(LiveKitNotConfiguredError):
        await warmup.dispatch_warmup(settings)


async def test_warmup_loop_keeps_running_after_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    async def failing_dispatch(_: object) -> bool:
        nonlocal calls
        calls += 1
        if calls == 3:
            raise asyncio.CancelledError
        raise RuntimeError("network down")

    async def no_sleep(_: float) -> None:
        return None

    monkeypatch.setattr(warmup, "dispatch_warmup", failing_dispatch)
    monkeypatch.setattr(warmup.asyncio, "sleep", no_sleep)
    with pytest.raises(asyncio.CancelledError):
        await warmup.warmup_loop(make_settings(), interval_s=1.0)
    assert calls == 3
