from __future__ import annotations

from pathlib import Path

from .base import BaseAvatarRenderAdapter


class TalkingHeadVideoAdapter(BaseAvatarRenderAdapter):
    """
    Phase-2 placeholder adapter.
    Intended future targets: SadTalker, Wav2Lip, EchoMimic/Duix-like pipelines.
    """

    @property
    def name(self) -> str:
        return "talking_head_video"

    def supports_real_time(self) -> bool:
        return False

    def render_from_audio(self, audio_wav: Path) -> None:
        raise NotImplementedError(
            "Talking-head render adapter is a foundation hook only. Integrate a concrete provider for phase-2."
        )
