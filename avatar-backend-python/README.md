# Avatar Backend (Python)

FastAPI service for the self-hosted avatar speech package pipeline:
- local TTS adapter (default: Piper)
- local lip-sync adapter (default: Rhubarb)
- pluggable render adapter foundation (phase-2)

## 1) Setup

```bash
cd avatar-backend-python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## 2) Configure providers

Required for production-like local pipeline:

```env
AVATAR_BACKEND_TTS_PROVIDER=piper
AVATAR_BACKEND_PIPER_BINARY=piper
AVATAR_BACKEND_PIPER_MODEL=/absolute/path/to/en_US-lessac-medium.onnx

AVATAR_BACKEND_LIPSYNC_PROVIDER=rhubarb
AVATAR_BACKEND_RHUBARB_BINARY=/absolute/path/to/rhubarb
```

Development fallback (no Piper/Rhubarb):

```env
AVATAR_BACKEND_TTS_PROVIDER=dummy
AVATAR_BACKEND_LIPSYNC_PROVIDER=none
```

## 3) Run

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## 4) API

### Health

```bash
curl http://localhost:8001/health
```

### Providers

```bash
curl http://localhost:8001/api/avatar/providers
```

### Synthesize

```bash
curl --location 'http://localhost:8001/api/avatar/synthesize' \
  --header 'Content-Type: application/json' \
  --data '{
    "text": "Hello, welcome to Greenscape. How can I help you today?",
    "expression": "friendly",
    "animation": "speaking",
    "cache": true
  }'
```

Response shape:

```json
{
  "text": "...",
  "audioUrl": "/media/<hash>.wav",
  "mouthCues": [{ "start": 0.0, "end": 0.1, "value": "A" }],
  "expression": "friendly",
  "animation": "speaking",
  "provider": "piper+rhubarb",
  "durationMs": 1234,
  "cacheHit": true,
  "diagnostics": {
    "renderAdapter": "three_d",
    "supportsRealtime": "true"
  }
}
```

## 5) Phase-2 foundation

Render adapter foundation is already in place under:

- `app/services/avatar/adapters/render/base.py`
- `app/services/avatar/adapters/render/three_d_adapter.py`
- `app/services/avatar/adapters/render/talking_head_video_adapter.py`

Use `AVATAR_BACKEND_RENDER_ADAPTER=talking_head_video` to switch to the placeholder adapter until a concrete provider is integrated.
