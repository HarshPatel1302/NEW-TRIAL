from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_list(value: str | None) -> List[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


@dataclass(slots=True)
class Settings:
    host: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("AVATAR_BACKEND_PORT", "8001")))
    cors_origins: List[str] = field(
        default_factory=lambda: _parse_list(os.getenv("AVATAR_BACKEND_CORS_ORIGINS", "http://localhost:3000"))
    )

    media_dir: Path = field(
        default_factory=lambda: Path(os.getenv("AVATAR_BACKEND_MEDIA_DIR", "./storage/media")).resolve()
    )
    temp_dir: Path = field(
        default_factory=lambda: Path(os.getenv("AVATAR_BACKEND_TEMP_DIR", "./storage/temp")).resolve()
    )
    cache_enabled: bool = field(
        default_factory=lambda: _parse_bool(os.getenv("AVATAR_BACKEND_CACHE_ENABLED"), True)
    )

    default_expression: str = field(
        default_factory=lambda: os.getenv("AVATAR_BACKEND_DEFAULT_EXPRESSION", "friendly").strip() or "friendly"
    )
    default_animation: str = field(
        default_factory=lambda: os.getenv("AVATAR_BACKEND_DEFAULT_ANIMATION", "speaking").strip() or "speaking"
    )

    tts_provider: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_TTS_PROVIDER", "piper").strip().lower())
    piper_binary: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_PIPER_BINARY", "piper").strip())
    piper_model: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_PIPER_MODEL", "").strip())
    piper_config: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_PIPER_CONFIG", "").strip())
    piper_speaker_id: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_PIPER_SPEAKER_ID", "").strip())
    default_voice: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_DEFAULT_VOICE", "").strip())

    lipsync_provider: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_LIPSYNC_PROVIDER", "rhubarb").strip().lower())
    rhubarb_binary: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_RHUBARB_BINARY", "rhubarb").strip())

    render_adapter: str = field(default_factory=lambda: os.getenv("AVATAR_BACKEND_RENDER_ADAPTER", "three_d").strip().lower())


settings = Settings()
settings.media_dir.mkdir(parents=True, exist_ok=True)
settings.temp_dir.mkdir(parents=True, exist_ok=True)
