from pydantic import ConfigDict

from synthio_backend.decks.models import CamelModel, DeckId


class HealthResponse(CamelModel):
    status: str = "ok"


class SessionRequest(CamelModel):
    # Request bodies follow the wire contract strictly: camelCase keys only.
    model_config = ConfigDict(validate_by_name=False)

    deck_id: DeckId


class SessionResponse(CamelModel):
    server_url: str
    room_name: str
    participant_name: str
    participant_token: str
