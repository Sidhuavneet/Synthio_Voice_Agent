"""Maps an unrecoverable session error to the contract's ``session_error`` event."""

from livekit.agents import APIError, APIStatusError

from synthio_backend.agent.events import SessionErrorEvent

QUOTA_EXCEEDED_MESSAGE = (
    "The AI service quota has been reached. Add your own provider keys or try again later."
)
PROVIDER_ERROR_MESSAGE = "The AI service is not responding. Please try again in a moment."
INTERNAL_ERROR_MESSAGE = "Something went wrong with this session. Please start a new one."

_QUOTA_STATUS = 429
_MAX_CHAIN = 10


def _chain(error: BaseException) -> list[BaseException]:
    """The error and its causes, stopping at cycles."""
    chain: list[BaseException] = []
    current: BaseException | None = error
    while current is not None and current not in chain and len(chain) < _MAX_CHAIN:
        chain.append(current)
        current = current.__cause__ or current.__context__
    return chain


def _is_quota(error: BaseException) -> bool:
    if isinstance(error, APIStatusError) and error.status_code == _QUOTA_STATUS:
        return True
    # aiohttp.ClientResponseError carries the HTTP status as ``status``.
    if getattr(error, "status", None) == _QUOTA_STATUS:
        return True
    body = error.body if isinstance(error, APIError) else None
    return "quota" in f"{error} {body}".lower()


def session_error_event(error: BaseException | None) -> SessionErrorEvent:
    chain = [] if error is None else _chain(error)
    if any(_is_quota(e) for e in chain):
        return SessionErrorEvent(code="quota_exceeded", message=QUOTA_EXCEEDED_MESSAGE)
    if any(isinstance(e, APIError) for e in chain):
        return SessionErrorEvent(code="provider_error", message=PROVIDER_ERROR_MESSAGE)
    return SessionErrorEvent(code="internal", message=INTERNAL_ERROR_MESSAGE)
