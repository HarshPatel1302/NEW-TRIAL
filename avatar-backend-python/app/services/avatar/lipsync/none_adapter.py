from __future__ import annotations

import wave
from pathlib import Path
from typing import List

from app.schemas.avatar import MouthCue

from .base import LipSyncAdapter


class NoOpLipSyncAdapter(LipSyncAdapter):
    @property
    def name(self) -> str:
        return "none"

    def generate(self, input_wav: Path) -> List[MouthCue]:
        duration = 0.0
        with wave.open(str(input_wav), "rb") as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            duration = frames / float(rate) if rate else 0.0
        return [MouthCue(start=0.0, end=max(0.05, duration), value="X")]
