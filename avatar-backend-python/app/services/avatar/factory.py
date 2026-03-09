from __future__ import annotations

from app.core.config import settings

from .adapters.render.base import BaseAvatarRenderAdapter
from .adapters.render.talking_head_video_adapter import TalkingHeadVideoAdapter
from .adapters.render.three_d_adapter import ThreeDAvatarAdapter
from .lipsync.base import LipSyncAdapter
from .lipsync.none_adapter import NoOpLipSyncAdapter
from .lipsync.rhubarb_adapter import RhubarbLipSyncAdapter
from .tts.base import TTSAdapter
from .tts.dummy_adapter import DummyTTSAdapter
from .tts.piper_adapter import PiperTTSAdapter


def create_tts_adapter() -> TTSAdapter:
    provider = settings.tts_provider
    if provider == "piper":
        return PiperTTSAdapter()
    if provider == "dummy":
        return DummyTTSAdapter()
    raise ValueError(f"Unsupported TTS provider: {provider}")


def create_lipsync_adapter() -> LipSyncAdapter:
    provider = settings.lipsync_provider
    if provider == "rhubarb":
        return RhubarbLipSyncAdapter()
    if provider == "none":
        return NoOpLipSyncAdapter()
    raise ValueError(f"Unsupported lip-sync provider: {provider}")


def create_render_adapter() -> BaseAvatarRenderAdapter:
    provider = settings.render_adapter
    if provider == "three_d":
        return ThreeDAvatarAdapter()
    if provider == "talking_head_video":
        return TalkingHeadVideoAdapter()
    raise ValueError(f"Unsupported render adapter: {provider}")
