import pytest
from livekit.agents import APIConnectionError, APIError, APIStatusError

from synthio_backend.agent.errors import (
    INTERNAL_ERROR_MESSAGE,
    PROVIDER_ERROR_MESSAGE,
    QUOTA_EXCEEDED_MESSAGE,
    session_error_event,
)


class FakeHttpError(Exception):
    """Mimics aiohttp.ClientResponseError, which carries the status as ``status``."""

    def __init__(self, status: int) -> None:
        super().__init__(f"HTTP {status}")
        self.status = status


def _caused_by(error: Exception, cause: BaseException) -> Exception:
    error.__cause__ = cause
    return error


@pytest.mark.parametrize(
    "error",
    [
        APIStatusError("Too Many Requests", status_code=429),
        APIError(
            "LiveKit Inference STT returned an error", body={"code": "inference_quota_exceeded"}
        ),
        APIError("LiveKit Inference TTS returned error: quota exceeded for this project"),
        _caused_by(APIConnectionError(), FakeHttpError(429)),
    ],
)
def test_quota_errors(error: Exception) -> None:
    event = session_error_event(error)
    assert (event.code, event.message) == ("quota_exceeded", QUOTA_EXCEEDED_MESSAGE)


@pytest.mark.parametrize(
    "error",
    [
        APIStatusError("Service Unavailable", status_code=503),
        APIConnectionError(),
        _caused_by(RuntimeError("stream failed"), APIStatusError("bad", status_code=500)),
    ],
)
def test_provider_errors(error: Exception) -> None:
    event = session_error_event(error)
    assert (event.code, event.message) == ("provider_error", PROVIDER_ERROR_MESSAGE)


@pytest.mark.parametrize("error", [RuntimeError("boom"), None])
def test_internal_errors(error: Exception | None) -> None:
    event = session_error_event(error)
    assert (event.code, event.message) == ("internal", INTERNAL_ERROR_MESSAGE)


def test_cyclic_cause_chain_terminates() -> None:
    first, second = RuntimeError("a"), RuntimeError("b")
    first.__cause__, second.__cause__ = second, first
    assert session_error_event(first).code == "internal"


def test_event_serialises_to_contract_shape() -> None:
    event = session_error_event(APIStatusError("Too Many Requests", status_code=429))
    assert event.model_dump(by_alias=True) == {
        "type": "session_error",
        "code": "quota_exceeded",
        "message": QUOTA_EXCEEDED_MESSAGE,
    }
