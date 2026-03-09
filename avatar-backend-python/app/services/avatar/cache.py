from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict


def cache_key(payload: Dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:32]


def metadata_path(media_dir: Path, key: str) -> Path:
    return media_dir / f"{key}.meta.json"


def audio_path(media_dir: Path, key: str) -> Path:
    return media_dir / f"{key}.wav"


def load_metadata(path: Path) -> Dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_metadata(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
