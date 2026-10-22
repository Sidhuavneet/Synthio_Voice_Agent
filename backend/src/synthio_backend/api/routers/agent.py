from fastapi import APIRouter

from synthio_backend.api.dependencies import AppSettings
from synthio_backend.session.warmup import dispatch_warmup

router = APIRouter(tags=["agent"])


@router.post("/agent/warmup")
async def warm_up_agent(settings: AppSettings) -> dict[str, str]:
    """Keeps the hosted agent awake; called by the keep-alive workflow."""
    sent = await dispatch_warmup(settings)
    return {"status": "dispatched" if sent else "skipped"}
