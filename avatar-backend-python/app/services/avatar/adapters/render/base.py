from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class BaseAvatarRenderAdapter(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def supports_real_time(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    def render_from_audio(self, audio_wav: Path) -> None:
        """Phase-2 extension point for talking-head/video avatar rendering pipelines."""
        raise NotImplementedError
