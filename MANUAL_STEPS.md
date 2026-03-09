# Manual Steps

## A) Install and configure local Phase-1 avatar backend

1. Create Python env and install deps:
```bash
cd avatar-backend-python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

2. Install Piper (TTS) and download a voice model.
- Example model file: `en_US-lessac-medium.onnx`
- Put absolute model path into `.env`:
```env
AVATAR_BACKEND_TTS_PROVIDER=piper
AVATAR_BACKEND_PIPER_BINARY=piper
AVATAR_BACKEND_PIPER_MODEL=/ABSOLUTE/PATH/en_US-lessac-medium.onnx
```

3. Install Rhubarb Lip Sync binary and configure path:
```env
AVATAR_BACKEND_LIPSYNC_PROVIDER=rhubarb
AVATAR_BACKEND_RHUBARB_BINARY=/ABSOLUTE/PATH/rhubarb
```

4. Run avatar backend:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

5. Verify backend:
```bash
curl http://localhost:8001/health
curl http://localhost:8001/api/avatar/providers
```

## B) Enable local avatar mode in frontend

1. Edit `receptionist-react/.env.local`:
```env
REACT_APP_AVATAR_PIPELINE_MODE=local
REACT_APP_AVATAR_BACKEND_URL=http://localhost:8001
REACT_APP_AVATAR_RENDER_ADAPTER=three_d
```

2. Optional model override:
```env
REACT_APP_AVATAR_MODEL_PATH=/models/receptionist/receptionist_all_6_actions_v2.glb
```

3. Restart frontend:
```bash
cd receptionist-react
npm start
```

## C) Blender/model preparation (if morph targets are missing)

1. Open your avatar in Blender.
2. Ensure face mesh has shape keys for at least:
- `jawOpen`
- `viseme_aa`
- `viseme_E`
- `viseme_O`
- `viseme_U`
- `viseme_FF`
- `viseme_TH`
- `viseme_PP`
- `viseme_sil`
- `eyeBlinkLeft`
- `eyeBlinkRight`
- `mouthSmileLeft`
- `mouthSmileRight`
3. Ensure required animation clips are named:
- `idle`, `talking`, `waving`, `pointing`, `nodYes`, `bow`
4. Export as GLB and place in `receptionist-react/public/models/receptionist/`.
5. Set `REACT_APP_AVATAR_MODEL_PATH` to the exported GLB if needed.

## D) Quick fallback mode for debugging only

If Piper/Rhubarb are not installed yet, use:
```env
AVATAR_BACKEND_TTS_PROVIDER=dummy
AVATAR_BACKEND_LIPSYNC_PROVIDER=none
```
This validates API wiring and playback state machine without realistic speech.

## E) How to test Phase-1 end-to-end

1. Start Python avatar backend.
2. Start Node backend and frontend as usual.
3. Enable `REACT_APP_AVATAR_PIPELINE_MODE=local`.
4. Connect in kiosk UI and trigger assistant responses.
5. Verify:
- subtitle appears
- audio plays once
- lips move with mouth cues
- avatar returns to listening after speech
- no duplicate playback on repeated event emissions

## F) Begin Phase-2 later (optional realism upgrade)

1. Keep Phase-1 active as default.
2. Implement concrete provider in backend:
- extend `app/services/avatar/adapters/render/talking_head_video_adapter.py`
3. Implement corresponding frontend render adapter behavior for video stream playback.
4. Flip adapter via env:
```env
REACT_APP_AVATAR_RENDER_ADAPTER=talking_head_video
AVATAR_BACKEND_RENDER_ADAPTER=talking_head_video
```
