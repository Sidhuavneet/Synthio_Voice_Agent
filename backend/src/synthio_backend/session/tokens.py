"""Mints LiveKit participant tokens that auto-dispatch the presenter agent."""

import json
import uuid
from dataclasses import dataclass
from datetime import timedelta

from livekit import api

from synthio_backend.core.config import Settings
from synthio_backend.session.resume import ResumeState

TOKEN_TTL = timedelta(minutes=15)
PARTICIPANT_NAME = "Guest"


class LiveKitNotConfiguredError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("LiveKit is not configured")


@dataclass(frozen=True, slots=True)
class SessionCredentials:
    server_url: str
    room_name: str
    participant_name: str
    participant_token: str


def _short_id() -> str:
    return uuid.uuid4().hex[:8]


def dispatch_metadata(deck_id: str, resume: ResumeState | None) -> str:
    payload = {
        "deckId": deck_id,
        "resume": None if resume is None else resume.model_dump(by_alias=True),
    }
    return json.dumps(payload, separators=(",", ":"))


def create_session_credentials(
    settings: Settings, deck_id: str, resume: ResumeState | None = None
) -> SessionCredentials:
    url, key, secret = settings.livekit_url, settings.livekit_api_key, settings.livekit_api_secret
    if not (url and key and secret and secret.get_secret_value()):
        raise LiveKitNotConfiguredError

    room_name = f"synthio-{deck_id}-{_short_id()}"
    identity = f"user-{_short_id()}"

    token = (
        api.AccessToken(key, secret.get_secret_value())
        .with_identity(identity)
        .with_name(PARTICIPANT_NAME)
        .with_ttl(TOKEN_TTL)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .with_room_config(
            api.RoomConfiguration(
                agents=[
                    api.RoomAgentDispatch(
                        agent_name=settings.agent_name,
                        metadata=dispatch_metadata(deck_id, resume),
                    )
                ]
            )
        )
        .to_jwt()
    )

    return SessionCredentials(
        server_url=url,
        room_name=room_name,
        participant_name=PARTICIPANT_NAME,
        participant_token=token,
    )
