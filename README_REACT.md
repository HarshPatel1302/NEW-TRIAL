# Greenscape Virtual Receptionist (React Upgrade)

## 🚀 Live API Reference version

This project has been upgraded to use the official **Google Gemini Live API Reference Implementation** (React + WebSocket).

### 📂 Architecture
- **Tech Stack**: React, TypeScript, SCSS, Google GenAI SDK.
- **Location**: `/receptionist-react` folder.
- **Connection**: Native WebSocket integration via `@google/genai` SDK.
- **State**: Zustand + React Context.
- **Tools**: Integrated Receptionist Tools (Database, Staff Notification).

### 🛠️ Setup & Run

The application is already running!

1. **Access**: Open **http://localhost:3000**
2. **Usage**:
   - Click the "Start" (Play) button in the control tray.
   - Speak naturally to "John".
   - Watch the 'Altair' visualization react to your voice.

### 🔑 Configuration
- API Key: `receptionist-react/.env`
- Tools: `src/receptionist/tools.ts`
- Persona: `src/receptionist/config.ts`

### 🔧 Troubleshooting
- If the page doesn't load, run:
  ```bash
  cd receptionist-react
  npm start
  ```
- Ensure port 3000 is free.

---
*Based on [google-gemini/live-api-web-console](https://github.com/google-gemini/live-api-web-console)*
