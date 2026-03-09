from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.avatar import ProvidersResponse, SynthesisRequest, SynthesisResponse
from app.services.avatar.orchestrator import AvatarOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/avatar", tags=["avatar"])
orchestrator = AvatarOrchestrator()


@router.get("/providers", response_model=ProvidersResponse)
def get_providers() -> ProvidersResponse:
    providers = orchestrator.get_providers()
    return ProvidersResponse(**providers)


@router.post("/synthesize", response_model=SynthesisResponse)
def synthesize(request: SynthesisRequest) -> SynthesisResponse:
    try:
        return orchestrator.synthesize(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Avatar synthesis runtime error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        logger.exception("Unexpected avatar synthesis failure")
        raise HTTPException(status_code=500, detail="Internal avatar synthesis error") from exc
