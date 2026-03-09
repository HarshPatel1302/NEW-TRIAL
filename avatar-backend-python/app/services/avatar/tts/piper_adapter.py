from __future__ import annotations

import subprocess
from pathlib import Path

from app.core.config import settings

from .base import TTSAdapter


class PiperTTSAdapter(TTSAdapter):
    @property
    def name(self) -> str:
        return "piper"

    def synthesize(self, text: str, output_wav: Path, voice: str | None = None) -> None:
        model_path = voice or settings.default_voice or settings.piper_model
        if not model_path:
            raise RuntimeError(
                "Piper voice model is not configured. Set AVATAR_BACKEND_PIPER_MODEL or send voice in request."
            )

        cmd = [
            settings.piper_binary,
            "--model",
            model_path,
            "--output_file",
            str(output_wav),
        ]

        if settings.piper_config:
            cmd.extend(["--config", settings.piper_config])

        if settings.piper_speaker_id:
            cmd.extend(["--speaker", settings.piper_speaker_id])

        try:
            completed = subprocess.run(
                cmd,
                input=text,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"Piper binary not found at '{settings.piper_binary}'. Install Piper or set AVATAR_BACKEND_PIPER_BINARY."
            ) from exc

        if completed.returncode != 0:
            raise RuntimeError(
                "Piper synthesis failed: " + (completed.stderr.strip() or completed.stdout.strip() or "unknown error")
            )

        if not output_wav.exists() or output_wav.stat().st_size == 0:
            raise RuntimeError("Piper completed but output WAV is missing or empty.")
