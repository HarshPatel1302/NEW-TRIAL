# Cyber One — receptionist frontend

React + TypeScript kiosk: Gemini **Multimodal Live API**, orb UI, QR/passcode paths, visitor & delivery tool flows.

## Run

```bash
npm install
# .env.local → REACT_APP_GEMINI_API_KEY=...
npm start
```

See the **parent `../README.md`** for backend, exports, and Docker.

## Key paths

- `src/App.tsx` — routes + tool handlers
- `src/kiosk/` — Cyber One home, QR, passcode, dummy visitors
- `src/receptionist/` — config, tools, database client, slot logic
- `src/components/Orb/` — ElevenLabs-style orb (shader + R3F)
