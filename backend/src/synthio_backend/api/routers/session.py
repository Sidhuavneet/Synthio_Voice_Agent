from fastapi import APIRouter

from synthio_backend.api.dependencies import AppSettings, Repository
from synthio_backend.api.schemas import SessionRequest, SessionResponse
from synthio_backend.session.tokens import create_session_credentials

router = APIRouter(tags=["session"])


@router.post("/session")
def create_session(
    body: SessionRequest, settings: AppSettings, repository: Repository
) -> SessionResponse:
    deck = repository.get(body.deck_id)
    credentials = create_session_credentials(settings, deck.id)
    return SessionResponse(
        server_url=credentials.server_url,
        room_name=credentials.room_name,
        participant_name=credentials.participant_name,
        participant_token=credentials.participant_token,
    )
