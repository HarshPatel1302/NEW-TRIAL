# Virtual Receptionist — Agent Instructions

## Project Purpose

Production virtual receptionist kiosk for building lobbies. Visitors interact with a 3D avatar via voice. The system supports **new visitor check-in** and **delivery / parcel** only: intent classification, required slots, photo when required, save/log/notify, and lobby instructions.

## Tech Stack

| Layer | Technology |
|-------|------------|
| AI | Google Gemini 2.5 Flash, Gemini Live API (`@google/genai`) |
| Frontend | React 18, TypeScript, Three.js, React Three Fiber, Zustand, SCSS |
| Backend | Node.js, Express, PostgreSQL |
| Audio | Web Audio API, AudioWorklets, lip-sync analyser |
| Deployment | Docker, nginx |

## Major Flows

### 1. Visitor Check-in (new visitor only)
Greeting → intent classification → phone → name → coming from → company to visit → optional person to meet → capture photo → save visitor → log / notify → lobby wait → farewell.

### 2. Delivery / Parcel
Greeting → intent classification → delivery person name, delivery company, recipient company, recipient person → capture photo if required → request delivery approval → instruction → farewell.

## Key Directories

```
receptionist-react/src/          — React frontend
  receptionist/                  — config, tools, intents, database, delivery logic
  components/                    — Avatar3D, ControlTray, Logger, SidePanel, settings
  hooks/                         — use-live-api, use-webcam, use-screen-capture
  lib/                           — genai-live-client, audio-recorder, audio-streamer
backend/src/                     — Express API, schema, middleware
```

## Coding Expectations

- TypeScript strict. Minimal use of `any`.
- Functional components with hooks.
- Small, scoped changes. No large refactors without approval.
- Fix root causes, not symptoms.
- Preserve existing folder structure and naming conventions.

## Testing Expectations

- After any change, logically verify the affected flow end-to-end.
- Check that both visitor and delivery flows still work.
- Verify camera opens and closes cleanly.
- Verify no duplicate assistant questions in conversation.
- Verify session auto-closes after 5 seconds of inactivity post-farewell.

## Safety Rules for Edits

1. Never break working flows while fixing another.
2. Never delete code without verifying it is unused.
3. Never commit debug-only hacks to production code.
4. Always read relevant files before editing.
5. Always report: root cause, files changed, behavior fixed, remaining risks.
