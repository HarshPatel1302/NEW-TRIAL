from __future__ import annotations

import math
import wave
from pathlib import Path

from .base import TTSAdapter


class DummyTTSAdapter(TTSAdapter):
    """
    Fallback adapter for local development when Piper is unavailable.
    Generates a short synthetic tone so the full avatar pipeline can be tested.
    """

    @property
    def name(self) -> str:
        return "dummy"

    def synthesize(self, text: str, output_wav: Path, voice: str | None = None) -> None:
        sample_rate = 22050
        duration_s = max(0.8, min(8.0, len(text) * 0.05))
        total_samples = int(sample_rate * duration_s)

        output_wav.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output_wav), "w") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)

            for index in range(total_samples):
                t = index / sample_rate
                frequency = 180 + 40 * math.sin(t * 2.0)
                amplitude = 12000
                sample = int(amplitude * math.sin(2 * math.pi * frequency * t))
                wav_file.writeframesraw(sample.to_bytes(2, byteorder="little", signed=True))
