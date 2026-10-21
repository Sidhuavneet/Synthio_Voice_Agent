import json
from typing import Any

import pytest
from fastapi.testclient import TestClient
from livekit.api import TokenVerifier

from synthio_backend.core.config import Settings


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_decks(client: TestClient) -> None:
    response = client.get("/api/decks")
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "sample-deck",
            "title": "Sample Deck",
            "subtitle": "A fixture for tests",
            "category": "testing",
            "slideCount": 5,
        }
    ]


def test_get_deck_uses_camel_case(client: TestClient) -> None:
    response = client.get("/api/decks/sample-deck")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "sample-deck"
    assert body["slides"][0]["intro"]
    assert set(body["slides"][0]["points"][0]) == {"text", "detail", "narration"}
    assert body["slides"][1]["stat"] is None


def test_get_unknown_deck_is_404(client: TestClient) -> None:
    response = client.get("/api/decks/missing")
    assert response.status_code == 404
    assert "missing" in response.json()["detail"]


def test_create_session(client: TestClient, settings: Settings) -> None:
    response = client.post("/api/session", json={"deckId": "sample-deck"})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"serverUrl", "roomName", "participantName", "participantToken"}
    assert body["serverUrl"] == settings.livekit_url
    assert body["roomName"].startswith("synthio-sample-deck-")

    assert settings.livekit_api_secret is not None
    claims = TokenVerifier(
        settings.livekit_api_key, settings.livekit_api_secret.get_secret_value()
    ).verify(body["participantToken"])
    assert claims.identity.startswith("user-")
    assert claims.name == body["participantName"]
    assert claims.video is not None
    assert claims.video.room == body["roomName"]
    assert claims.video.room_join
    assert claims.video.can_publish
    assert claims.video.can_subscribe
    assert claims.video.can_publish_data

    assert claims.room_config is not None
    (dispatch,) = claims.room_config.agents
    assert dispatch.agent_name == settings.agent_name
    assert json.loads(dispatch.metadata) == {"deckId": "sample-deck", "resume": None}


def _dispatch_metadata(body: dict[str, Any], settings: Settings) -> Any:
    assert settings.livekit_api_secret is not None
    claims = TokenVerifier(
        settings.livekit_api_key, settings.livekit_api_secret.get_secret_value()
    ).verify(body["participantToken"])
    assert claims.room_config is not None
    return json.loads(claims.room_config.agents[0].metadata)


def test_create_session_passes_resume_through(client: TestClient, settings: Settings) -> None:
    resume = {"slideIndex": 3, "presented": [0, 1, 2]}
    response = client.post("/api/session", json={"deckId": "sample-deck", "resume": resume})
    assert response.status_code == 200
    assert _dispatch_metadata(response.json(), settings) == {
        "deckId": "sample-deck",
        "resume": resume,
    }


@pytest.mark.parametrize(
    "resume",
    [
        {"slideIndex": 5, "presented": []},
        {"slideIndex": 1, "presented": [0, 9]},
        {"slideIndex": -1, "presented": []},
        {"slideIndex": 1, "presented": "0,1"},
    ],
)
def test_create_session_rejects_invalid_resume(client: TestClient, resume: object) -> None:
    response = client.post("/api/session", json={"deckId": "sample-deck", "resume": resume})
    assert response.status_code == 422


def test_create_session_unknown_deck_is_404(client: TestClient) -> None:
    response = client.post("/api/session", json={"deckId": "missing"})
    assert response.status_code == 404


def test_create_session_invalid_body_is_422(client: TestClient) -> None:
    response = client.post("/api/session", json={})
    assert response.status_code == 422


def test_create_session_rejects_snake_case_body(client: TestClient) -> None:
    response = client.post("/api/session", json={"deck_id": "sample-deck"})
    assert response.status_code == 422


def test_create_session_without_livekit_is_503(unconfigured_client: TestClient) -> None:
    response = unconfigured_client.post("/api/session", json={"deckId": "sample-deck"})
    assert response.status_code == 503
    assert response.json() == {"detail": "LiveKit is not configured"}


def test_cors_allows_frontend_origin(client: TestClient) -> None:
    response = client.options(
        "/api/decks",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
