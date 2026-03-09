from __future__ import annotations

from pathlib import Path

from .base import BaseAvatarRenderAdapter


class ThreeDAvatarAdapter(BaseAvatarRenderAdapter):
    @property
    def name(self) -> str:
        return "three_d"

    def supports_real_time(self) -> bool:
        return True

    def render_from_audio(self, audio_wav: Path) -> None:
        # Frontend (R3F) handles rendering in phase-1; this method is intentionally a no-op.
        _ = audio_wav
