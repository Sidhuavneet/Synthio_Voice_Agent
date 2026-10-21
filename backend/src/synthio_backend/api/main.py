"""FastAPI application factory and ``synthio-api`` entry point."""

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from synthio_backend.api.routers import decks, health, session
from synthio_backend.core.config import Settings, get_settings
from synthio_backend.decks.repository import DeckNotFoundError, DeckRepository
from synthio_backend.session.tokens import LiveKitNotConfiguredError

API_PREFIX = "/api"


async def _deck_not_found(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})


async def _livekit_not_configured(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={"detail": str(exc)}
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Synthio Presenter API", version="0.1.0")
    app.state.settings = settings
    # Loading here validates every deck file, so a broken deck fails at startup.
    app.state.deck_repository = DeckRepository.from_directory(settings.decks_dir)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.add_exception_handler(DeckNotFoundError, _deck_not_found)
    app.add_exception_handler(LiveKitNotConfiguredError, _livekit_not_configured)
    for router in (health.router, decks.router, session.router):
        app.include_router(router, prefix=API_PREFIX)
    return app


def run() -> None:
    settings = get_settings()
    uvicorn.run(
        "synthio_backend.api.main:create_app",
        factory=True,
        host=settings.api_host,
        port=settings.api_port,
    )
