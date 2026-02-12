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

## 5) Point frontend to backend

In `receptionist-react/.env.local` add:

```env
REACT_APP_RECEPTIONIST_API_URL=http://localhost:5000/api
REACT_APP_KIOSK_ID=greenscape-lobby-kiosk-1
```

Then restart frontend (`npm start`).

## Export URLs

- Visitors CSV: `http://localhost:5000/api/exports/visitors.csv`
- Visitors XLSX: `http://localhost:5000/api/exports/visitors.xlsx`
- Sessions CSV: `http://localhost:5000/api/exports/sessions.csv`
