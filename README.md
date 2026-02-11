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

## 📦 Core Architecture

### 👄 Lip Sync Pipeline
The avatar's mouth movement is driven by a custom processing chain:
1. **Source**: Gemini Live API streams PCM audio chunks.
2. **Worklet**: A `LipSyncAnalyser` (AudioWorklet) extracts energy levels from Low (Vowels), Mid (Formants), and High (Sibilants) bands.
3. **Mapping**: Frequency data is mapped to 5 core visemes: `jawOpen`, `viseme_aa`, `viseme_O`, `viseme_E`, and `viseme_PP`.
4. **Smoothing**: Exponential attack/decay interpolation ensures fluid, human-like motion.

### 🎭 Gesture Engine (`GestureController`)
Managed by a specialized state machine that handles:
- **Automatic Transitions**: Idle ↔ Talking (triggered by VAD/Audio stream).
- **One-Shot Events**: Waving, Pointing, Bowing (triggered by Tool Call intent).
- **Crossfading**: Smooth 0.5s transitions between animation clips to prevent snapping.

---

## 🛠 Development Commands

| Command | Action |
| :--- | :--- |
| `npm start` | Launch dev server with hot reload |
| `npm run build` | Compile production-optimized bundle |
| `npm test` | Run test suite |
| `npx tsc --noEmit` | Type-check the entire project |

---

## 🎨 Voice Selection

We currently use the **Algenib** voice profile for its clear, professional, and welcoming tone, perfectly suited for a high-end receptionist role.

---

## 📜 License

Distributed under the Apache 2.0 License. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ by the FutureScape Team
</p>
