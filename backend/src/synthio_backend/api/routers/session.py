from fastapi import APIRouter, HTTPException, status

from synthio_backend.api.dependencies import AppSettings, Repository
from synthio_backend.api.schemas import SessionRequest, SessionResponse
from synthio_backend.session.tokens import create_session_credentials

router = APIRouter(tags=["session"])


@router.post("/session")
def create_session(
    body: SessionRequest, settings: AppSettings, repository: Repository
) -> SessionResponse:
    deck = repository.get(body.deck_id)
    if body.resume is not None:
        try:
            body.resume.check_slide_count(len(deck.slides))
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    credentials = create_session_credentials(settings, deck.id, body.resume)
    return SessionResponse(
        server_url=credentials.server_url,
        room_name=credentials.room_name,
        participant_name=credentials.participant_name,
        participant_token=credentials.participant_token,
    )
