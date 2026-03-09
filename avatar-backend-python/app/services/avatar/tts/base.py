from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class TTSAdapter(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def synthesize(self, text: str, output_wav: Path, voice: str | None = None) -> None:
        raise NotImplementedError
