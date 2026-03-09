from __future__ import annotations

import logging
import wave
from pathlib import Path
from typing import Dict

from app.core.config import settings
from app.schemas.avatar import AnimationName, ExpressionName, MouthCue, SynthesisRequest, SynthesisResponse

from .cache import audio_path, cache_key, load_metadata, metadata_path, save_metadata
from .factory import create_lipsync_adapter, create_render_adapter, create_tts_adapter

logger = logging.getLogger(__name__)


class AvatarOrchestrator:
    def __init__(self) -> None:
        self.tts = create_tts_adapter()
        self.lipsync = create_lipsync_adapter()
        self.render_adapter = create_render_adapter()

    def get_providers(self) -> Dict[str, str]:
        return {
            "ttsProvider": self.tts.name,
            "lipSyncProvider": self.lipsync.name,
            "renderAdapter": self.render_adapter.name,
        }

    def synthesize(self, payload: SynthesisRequest) -> SynthesisResponse:
        normalized_text = payload.text.strip()
        if not normalized_text:
            raise ValueError("Text must not be empty.")

        expression: ExpressionName = payload.expression or settings.default_expression  # type: ignore[assignment]
        animation: AnimationName = payload.animation or settings.default_animation  # type: ignore[assignment]

        request_fingerprint = {
            "text": normalized_text,
            "voice": payload.voice or settings.default_voice,
            "expression": expression,
            "animation": animation,
            "ttsProvider": self.tts.name,
            "lipSyncProvider": self.lipsync.name,
        }
        key = cache_key(request_fingerprint)

        output_audio = audio_path(settings.media_dir, key)
        output_meta = metadata_path(settings.media_dir, key)

        use_cache = settings.cache_enabled and payload.cache
        if use_cache:
            cached = load_metadata(output_meta)
            if cached and output_audio.exists():
                return self._to_response(
                    text=normalized_text,
                    expression=expression,
                    animation=animation,
                    cache_hit=True,
                    cached=cached,
                    audio_file=output_audio,
                )

        output_audio.parent.mkdir(parents=True, exist_ok=True)
        self.tts.synthesize(normalized_text, output_audio, payload.voice)
        mouth_cues = self.lipsync.generate(output_audio)

        serializable = {
            "mouthCues": [cue.model_dump() for cue in mouth_cues],
            "expression": expression,
            "animation": animation,
            "ttsProvider": self.tts.name,
            "lipSyncProvider": self.lipsync.name,
        }

        if use_cache:
            save_metadata(output_meta, serializable)

        return self._to_response(
            text=normalized_text,
            expression=expression,
            animation=animation,
            cache_hit=False,
            cached=serializable,
            audio_file=output_audio,
        )

    def _to_response(
        self,
        *,
        text: str,
        expression: ExpressionName,
        animation: AnimationName,
        cache_hit: bool,
        cached: Dict[str, object],
        audio_file: Path,
    ) -> SynthesisResponse:
        cues_raw = cached.get("mouthCues") or []
        cues = [MouthCue(**cue) for cue in cues_raw] if isinstance(cues_raw, list) else []

        audio_url = f"/media/{audio_file.name}"
        duration_ms = self._wav_duration_ms(audio_file)

        return SynthesisResponse(
            text=text,
            audioUrl=audio_url,
            mouthCues=cues,
            expression=expression,
            animation=animation,
            provider=f"{self.tts.name}+{self.lipsync.name}",
            durationMs=duration_ms,
            cacheHit=cache_hit,
            diagnostics={
                "renderAdapter": self.render_adapter.name,
                "supportsRealtime": str(self.render_adapter.supports_real_time()).lower(),
            },
        )

    @staticmethod
    def _wav_duration_ms(path: Path) -> int:
        try:
            with wave.open(str(path), "rb") as wav_file:
                frames = wav_file.getnframes()
                rate = wav_file.getframerate() or 1
                return int((frames / rate) * 1000)
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to calculate WAV duration for %s: %s", path, exc)
            return 0
