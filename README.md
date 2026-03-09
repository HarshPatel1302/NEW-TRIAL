# Greenscape Virtual Receptionist 🤖✨

[![Gemini](https://img.shields.io/badge/Gemini-2.1%20Flash-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r182-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-D22128?style=for-the-badge)](LICENSE)

> **Next-generation virtual concierge powered by Gemini Multimodal Live API.**  
> Delivering a lifelike, audio-driven 3D experience with real-time lip-sync and intelligent visitor orchestrations.

---

## 🌟 The Vision

Greenscape Virtual Receptionist isn't just a chatbot; it's a **digital presence**. By combining Google's most advanced multi-modal models with a sophisticated 3D animation engine, we've created a kiosk experience that feels human, responsive, and professional.

### Engineered for Realism
- **Audio-Driven Lip Sync**: Custom `AudioWorklet` implementation using the Goertzel algorithm for real-time frequency analysis.
- **Gesture Orchestration**: A robust state-machine that synchronizes physical movement with speech intent and tool calls.
- **Multimodal Intelligence**: Driven by the Gemini Live API for sub-second latency and high-context interactions.

---

## 🛠 Tech Stack

- **Intelligence**: [Gemini 2.1 Flash Audio Preview](https://ai.google.dev/api/multimodal-live)
- **3D Engine**: [Three.js](https://threejs.org/) & [React Three Fiber](https://r3f.docs.pmnd.rs/)
- **Animations**: [React Three Drei](https://github.com/pmndrs/drei) + Custom GLB Morph Targets
- **Audio Pipeline**: Web Audio API (AudioWorklets)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Styling**: Modern CSS / SCSS

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- [Google AI Studio API Key](https://aistudio.google.com/apikey)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/HarshPatel1302/Greenscape-VR.git
   cd Greenscape-VR/greenscape_repo/receptionist-react
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env.local` file in the `receptionist-react` directory:
   ```env
   REACT_APP_GEMINI_API_KEY=your_api_key_here
   ```

4. **Launch Development Server**
   ```bash
   npm start
   ```
   *Available at [http://localhost:3000](http://localhost:3000)*

## 🚀 Quick Reset & Start

If you encounter a port conflict or need a fresh restart, run this one-liner from the root:

```bash
# Kill any process on port 3000 and start the app
lsof -ti:3000 | xargs kill -9 && cd receptionist-react && npm start
```

---

## 🗄 PostgreSQL Visitor Storage + Excel Export

The project now includes a backend service in `backend/` for production visitor logs and export.

### Start backend database + API

```bash
cd backend
docker compose up -d
npm install
cp .env.example .env
npm run db:init
npm run dev
```

### Configure frontend to use backend

In `receptionist-react/.env.local`:

```env
REACT_APP_RECEPTIONIST_API_URL=http://localhost:5000/api
REACT_APP_RECEPTIONIST_API_KEY=change_this_key
REACT_APP_KIOSK_ID=greenscape-lobby-kiosk-1
```

Recommended backend rate-limit defaults for kiosk + live admin:
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX=600`

Then run frontend:

```bash
cd receptionist-react
npm start
```

### Export links

- Visitors CSV: `http://localhost:5000/api/exports/visitors.csv`
- Visitors Excel: `http://localhost:5000/api/exports/visitors.xlsx`
- Sessions CSV: `http://localhost:5000/api/exports/sessions.csv`

### Admin dashboard

Open:

- `http://localhost:3000/admin`

The admin view includes KPI cards, daily analytics, recent sessions, per-session event drill-down, visitors list, and audit logs.

### Maintenance scripts

```bash
cd backend
npm run retention:run
npm run backup:run
```

### Production deployment (Docker Compose + edge proxy)

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

Production entrypoint:

- `http://localhost:8080`

Notes:
- Backend container auto-runs `node src/init-db.js` at startup before serving traffic.
- Set `BACKEND_API_KEY` in `.env.production`; frontend admin/receptionist requests include this key.

---

## 🎭 Avatar Phase 1 (Self-Hosted TTS + Lip Sync)

Phase 1 is implemented as a feature-flagged pipeline and does not replace the current working flow by default.

### 1) Start Python avatar backend

```bash
cd avatar-backend-python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 2) Enable local avatar pipeline in frontend

In `receptionist-react/.env.local`:

```env
REACT_APP_AVATAR_PIPELINE_MODE=local
REACT_APP_AVATAR_BACKEND_URL=http://localhost:8001
REACT_APP_AVATAR_RENDER_ADAPTER=three_d
```

Then restart frontend:

```bash
cd receptionist-react
npm start
```

### 3) Keep current behavior (safe default)

```env
REACT_APP_AVATAR_PIPELINE_MODE=legacy
```

This keeps the existing Gemini streamed-audio avatar pipeline unchanged.

### Troubleshooting

- If local synthesis fails with Piper errors: configure `AVATAR_BACKEND_PIPER_MODEL` and `AVATAR_BACKEND_PIPER_BINARY`.
- If lip cues fail: configure `AVATAR_BACKEND_RHUBARB_BINARY`.
- For dry-run/local wiring only, set:
  - `AVATAR_BACKEND_TTS_PROVIDER=dummy`
  - `AVATAR_BACKEND_LIPSYNC_PROVIDER=none`
- If the browser blocks audio autoplay, start interaction from a user click (`Connect`).

---

## 🏗 Repository Structure

- `receptionist-react/`: The main React application powered by Gemini Multimodal Live API.
- `avatar-pipeline/`: Tools and scripts for processing the 3D avatar (Blender/Python).
- `backend/`: Express + PostgreSQL API for visitors, sessions, and exports.
- `.agent/`: Agent-specific workflows and configurations.

---

## 📦 Core Architecture

### 👄 Lip Sync Pipeline
The avatar's mouth movement is driven by a custom processing chain within the React app:
1. **Source**: Gemini Live API streams PCM audio chunks.
2. **Worklet**: A `LipSyncAnalyser` (AudioWorklet) extracts energy levels.
3. **Mapping**: Frequency data is mapped to core visemes.
4. **Smoothing**: Exponential attack/decay interpolation ensures fluid motion.

### 🎭 Gesture Engine (GestureController)
Managed by a specialized state machine that handles:
- **Automatic Transitions**: Idle ↔ Talking.
- **One-Shot Events**: Waving, Pointing, Bowing.
- **Crossfading**: Smooth transitions between animation clips.

### 🛠 Avatar Pipeline
Located in `avatar-pipeline/`, this contains scripts to prepare the GLB model:
- `setup_pratik_avatar.sh`: The master setup script.
- `blender_auto_morph_targets.py`: Generates visemes and expressions.
- `blender_merge_animations.py`: Merges Mixamo animations into the model.

---

## 🚀 Getting Started

1. **Navigate to the app**:
   ```bash
   cd receptionist-react
   ```

2. **Install & Run**:
   ```bash
   npm install
   npm start
   ```

---

## 📜 License

Distributed under the Apache 2.0 License. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ by the FutureScape Team
</p>
