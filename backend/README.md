# Greenscape Receptionist Backend

PostgreSQL-backed API for visitor storage, interaction sessions, and CSV/XLSX exports.

## 1) Start PostgreSQL

```bash
cd backend
docker compose up -d
```

## 2) Install and configure backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` if your Postgres credentials differ.
Default Docker mapping uses port `55432` to avoid conflicts with existing local Postgres on `5432`.

## 3) Initialize database schema

```bash
npm run db:init
```

## 4) Start backend API

```bash
npm run dev
```

Server runs on `http://localhost:5000` by default.
All `/api/*` routes (except `/api/health*`) require `x-api-key` when `BACKEND_API_KEY` is configured.

## 5) Point frontend to backend

In `receptionist-react/.env.local` add:

```env
REACT_APP_RECEPTIONIST_API_URL=http://localhost:5000/api
REACT_APP_RECEPTIONIST_API_KEY=change_this_key
REACT_APP_KIOSK_ID=greenscape-lobby-kiosk-1
```

Then restart frontend (`npm start`).

## Security and reliability settings

Set these in `backend/.env`:

```env
BACKEND_API_KEY=change_this_key
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=600
RETENTION_DAYS=180
BACKUP_DIR=./backups
TRUST_PROXY=false
```

`BACKEND_API_KEY` enables API-key auth for all `/api/*` routes except health checks.

## Export URLs

- Visitors CSV: `http://localhost:5000/api/exports/visitors.csv`
- Visitors XLSX: `http://localhost:5000/api/exports/visitors.xlsx`
- Sessions CSV: `http://localhost:5000/api/exports/sessions.csv`

## Maintenance jobs

Run retention cleanup manually:

```bash
npm run retention:run
```

Run backup snapshot manually:

```bash
npm run backup:run
```

Cron examples (daily 2 AM retention, hourly backup):

```bash
0 2 * * * cd /path/to/greenscape_repo/backend && npm run retention:run >> retention.log 2>&1
0 * * * * cd /path/to/greenscape_repo/backend && npm run backup:run >> backup.log 2>&1
```
