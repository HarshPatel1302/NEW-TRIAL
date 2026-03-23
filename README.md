# Cyber One — Virtual Receptionist

Kiosk app: **Gemini Live API** (voice), **orb UI** (React Three Fiber), **QR / passcode** pre-check, visitor + delivery flows, **Express + PostgreSQL** backend.

## Quick start

```bash
cd receptionist-react
cp .env.example .env.local   # if present; else create .env.local
# REACT_APP_GEMINI_API_KEY=...

npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Kiosk screens

| Screen | Purpose |
|--------|---------|
| **Home** | Welcome + tiles: QR, Passcode, Virtual Receptionist |
| **QR** | Simulated scan (codes in `src/kiosk/cyber-one-visitors.ts`) |
| **Passcode** | 6-digit demo codes (same file) |
| **Virtual Receptionist** | Auto-connects Live API; orb + voice (mic required) |

## Backend + database

```bash
cd backend
docker compose up -d
npm install && cp .env.example .env && npm run db:init && npm run dev
```

Frontend `.env.local` (example):

```env
REACT_APP_RECEPTIONIST_API_URL=http://localhost:5000/api
REACT_APP_RECEPTIONIST_API_KEY=change_this_key
REACT_APP_KIOSK_ID=cyber-one-lobby-kiosk
```

Exports: `GET /api/exports/visitors.csv`, `visitors.xlsx`, `sessions.csv`  
Admin UI: `http://localhost:3000/admin`

## Production

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

## Repo layout

- **`receptionist-react/`** — React app (`App.tsx`, `src/kiosk/`, `src/receptionist/`, `src/components/Orb/`)
- **`backend/`** — API + schema (see `backend/README.md`)
- **`deploy/`** — nginx edge config
- **`.cursor/rules/`** — agent notes for this codebase

## Agent notes

See **`AGENTS.md`** for flow details and coding expectations.

## License

Apache 2.0 (see `LICENSE` if present in upstream).
