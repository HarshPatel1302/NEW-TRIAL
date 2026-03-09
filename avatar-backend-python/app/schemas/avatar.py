from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


ExpressionName = Literal[
    "neutral",
    "friendly",
    "attentive",
    "greeting",
    "error",
]


AnimationName = Literal[
    "idle",
    "listening",
    "thinking",
    "speaking",
    "error",
]


class MouthCue(BaseModel):
    start: float = Field(..., ge=0)
    end: float = Field(..., ge=0)
    value: str = Field(..., min_length=1)


class SynthesisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    voice: Optional[str] = Field(default=None)
    expression: Optional[ExpressionName] = None
    animation: Optional[AnimationName] = None
    cache: bool = True
    metadata: Dict[str, str] = Field(default_factory=dict)


class SynthesisResponse(BaseModel):
    text: str
    audioUrl: str
    mouthCues: List[MouthCue]
    expression: ExpressionName
    animation: AnimationName
    provider: str
    durationMs: int
    cacheHit: bool
    diagnostics: Dict[str, str] = Field(default_factory=dict)


class ProvidersResponse(BaseModel):
    ttsProvider: str
    lipSyncProvider: str
    renderAdapter: str
