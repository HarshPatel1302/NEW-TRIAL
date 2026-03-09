from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import List

from app.core.config import settings
from app.schemas.avatar import MouthCue

from .base import LipSyncAdapter


class RhubarbLipSyncAdapter(LipSyncAdapter):
    @property
    def name(self) -> str:
        return "rhubarb"

    def generate(self, input_wav: Path) -> List[MouthCue]:
        output_json = input_wav.with_suffix(".rhubarb.json")
        cmd = [
            settings.rhubarb_binary,
            "-f",
            "json",
            "-o",
            str(output_json),
            str(input_wav),
        ]

        try:
            completed = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"Rhubarb binary not found at '{settings.rhubarb_binary}'. Install Rhubarb or set AVATAR_BACKEND_RHUBARB_BINARY."
            ) from exc

        if completed.returncode != 0:
            raise RuntimeError(
                "Rhubarb lip-sync generation failed: "
                + (completed.stderr.strip() or completed.stdout.strip() or "unknown error")
            )

        if not output_json.exists():
            raise RuntimeError("Rhubarb completed but output JSON was not generated.")

        with output_json.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)

        cues = payload.get("mouthCues") or []
        results: List[MouthCue] = []
        for cue in cues:
            start = float(cue.get("start", 0.0))
            end = float(cue.get("end", start))
            value = str(cue.get("value", "X") or "X")
            if end < start:
                end = start
            results.append(MouthCue(start=start, end=end, value=value))

        if not results:
            # Maintain deterministic playback behavior even if Rhubarb yields empty cues.
            results = [MouthCue(start=0.0, end=0.2, value="X")]

        return results
