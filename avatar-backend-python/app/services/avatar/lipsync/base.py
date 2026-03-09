from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import List

from app.schemas.avatar import MouthCue


class LipSyncAdapter(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate(self, input_wav: Path) -> List[MouthCue]:
        raise NotImplementedError
