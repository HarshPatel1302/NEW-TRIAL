# Virtual Receptionist — Project Documentation

This document explains the Virtual Receptionist project in full so that anyone can understand what it does, how it works, and how to work on it. It is written in plain language with full explanations rather than technical shorthand.

---

## 1. What Is This Project?

The Virtual Receptionist is a kiosk system designed for building lobbies. When a visitor walks up to the screen, they see a 3D avatar named **Pratik** who greets them and talks to them through voice. The visitor speaks into the microphone, and Pratik responds with voice and natural conversation.

The system can handle three main situations:

1. **New visitor check-in** — Someone visiting an office or person in the building. Pratik asks for their name, phone number, who they want to meet, captures their photo, and saves the record.

2. **Delivery / parcel** — A delivery person (e.g., from Zomato, Swiggy, Amazon). Pratik asks for their name, which company they work for, which company the parcel is for, and who the recipient is. After capturing a photo, the system can send an approval request to the recipient. Pratik then tells the delivery person whether to leave the parcel at the lobby or go up.

3. **Returning visitor** — Someone who has visited before. Pratik looks up their phone number, recognises them, and skips asking for their name again.

At the end of each interaction, Pratik gives clear instructions (e.g., “Please wait at the lobby” or “Please keep the parcel at the lobby”) and the session ends automatically after a short pause.

---

## 2. What Technologies Power This Project?

The project is built from several layers:

**The frontend (what the user sees)**  
The screen and avatar are built with **React** and **TypeScript**. The 3D avatar is rendered using **Three.js** and **React Three Fiber**, which let us show a realistic character that can move, blink, and lip-sync. Styling is done with **SCSS**.

**The AI and voice**  
All conversation and voice understanding come from **Google Gemini** (specifically the Live API). Gemini handles:
- Understanding what the visitor says (speech-to-text)
- Deciding what Pratik should say (natural language)
- Speaking Pratik’s responses (text-to-speech)
- Calling the right tools (e.g., save visitor, capture photo) at the right time

**The backend (data and APIs)**  
A **Node.js** server using **Express** stores visitor and session data in **PostgreSQL**. It also provides APIs for the frontend to save visitors, search for returning visitors, and manage sessions.

**External integrations**  
The system can talk to external building/gate management APIs to:
- Search for members (residents/employees) by name or unit number
- Log visitor entries
- Send approval requests to members (e.g., for deliveries)
- Upload visitor photos to cloud storage

**Audio and lip sync**  
The browser’s **Web Audio API** and custom **AudioWorklets** are used to play Pratik’s voice and analyse it in real time. That analysis drives the avatar’s mouth movement (lip sync) so it looks like Pratik is actually speaking.

---

## 3. How Is the Project Organised?

The project has two main parts: the **frontend** (receptionist-react) and the **backend**.

**Frontend (receptionist-react)**  
- `App.tsx` — The main screen. It holds the conversation state, handles what happens when Pratik uses tools (save visitor, capture photo, etc.), and connects everything together.
- `receptionist/` — Contains Pratik’s personality and instructions, the list of tools Gemini can use, member lookup logic, and code that syncs data to external systems.
- `components/` — Reusable pieces like the 3D avatar, the control buttons, and the admin dashboard.
- `hooks/` — Logic for connecting to Gemini, using the webcam, and capturing the screen.
- `lib/` — The Gemini Live client, audio playback, and the lip-sync analyser.
- `config/` — Facial expression presets (e.g., how Pratik looks when welcoming vs listening).
- `public/models/receptionist/` — The 3D avatar model files (GLB format).

**Backend**  
- `server.js` — Defines all the REST API endpoints (visitors, sessions, analytics, exports, etc.).
- `schema.sql` — Defines the database tables.
- `db.js` — Connects to PostgreSQL and runs queries.
- `cover-upload.js` — Handles uploading visitor photos to cloud storage.
- `middleware.js` — Handles authentication, rate limiting, and audit logging.

---

## 4. The 3D Avatar — How It Works

### What Is the Avatar?

Pratik is a 3D character shown on screen. He is built from a **GLB model** (a standard 3D file format). There are two versions of the model: `receptionist_all_6_actions.glb` (v1) and `receptionist_all_6_actions_v2.glb` (v2). You can switch between them using the environment variable `REACT_APP_AVATAR_MODEL_VERSION`.

### Body Animations (Skeletal)

The model includes several body animations. We only use two of them:

- **Idle** — Pratik stands still. This is used most of the time, including when he is speaking. We keep him in this pose so he does not make distracting hand gestures while talking.
- **Waving** — A short wave used when greeting the visitor at the start of a session.

The model also has other animations (talking, pointing, nodding, bowing), but we do not use them because they looked unnatural. Lip sync and expressions are handled separately (see below).

### Face and Lip Sync (Morph Targets)

The avatar’s face is controlled by **morph targets** (also called blend shapes). These are predefined face shapes (e.g., mouth open, smile, blink) that we blend together to create expressions and lip sync.

**Lip sync**  
When Pratik speaks, we analyse the audio in real time and drive these morph targets:
- `jawOpen` — How open the mouth is
- `viseme_aa`, `viseme_E`, `viseme_O`, `viseme_U` — Vowel shapes
- `viseme_FF`, `viseme_TH`, `viseme_PP`, `viseme_sil` — Consonant shapes and silence

This makes the mouth move in sync with the words.

**Expressions**  
We also use morph targets for expressions:
- `mouthSmileLeft`, `mouthSmileRight` — Smile
- `eyeBlinkLeft`, `eyeBlinkRight` — Blinking
- `browInnerUp`, `browDownLeft`, `browDownRight` — Eyebrows
- `cheekSquintLeft`, `cheekSquintRight` — Cheeks
- `eyeWideLeft`, `eyeWideRight` — Eye widening
- Various `eyeLook*` targets — Where the eyes are looking

**Expression presets**  
We have named presets for different moods: `neutral_professional`, `welcome_warm`, `listening_attentive`, `explaining_confident`, `confirming_yes`, `empathy_soft`, `goodbye_formal`. Each preset sets a combination of these morph values so Pratik looks appropriate for the moment (e.g., warmer when welcoming, more attentive when listening).

### How Lip Sync Is Done Step by Step

1. Gemini sends Pratik’s speech as audio to the browser.
2. The **AudioStreamer** plays that audio through the speakers.
3. A **LipSyncAnalyser** (an AudioWorklet) analyses the audio in real time. It looks at low, mid, and high frequencies and computes values like volume, voiced sound, and sibilance.
4. The **FacialController** takes those values and converts them into morph target strengths (e.g., how much to open the jaw, which viseme to show).
5. Every frame, the **AvatarModelUnified** component applies these values to the 3D model’s morph targets. The result is that Pratik’s mouth moves in sync with his speech.

### Head Tracking

The avatar’s head rotates slightly to follow the camera. This gives the impression that Pratik is making eye contact with the visitor. The head bone’s rotation is calculated from the camera position each frame.

### Rendering

The 3D scene is rendered with **Three.js** via **React Three Fiber**. We use a city-style environment for lighting. If the WebGL context is lost (e.g., due to GPU memory issues), the system detects it, pauses rendering, and logs a warning so we can handle it gracefully.

---

## 5. APIs — What the System Talks To

### Our Own Backend API

The project includes a backend server that the frontend calls. By default it runs at `http://localhost:5000`. All API calls must include an `x-api-key` header with the value from `BACKEND_API_KEY` (and the frontend uses `REACT_APP_RECEPTIONIST_API_KEY` to match).

**What the backend does:**
- **Health checks** — Tells us if the server and database are running.
- **Visitors** — Save new visitors, search for returning visitors by phone, list all visitors.
- **Sessions** — Start a conversation session, update it, log events (e.g., what was said), and end it.
- **Analytics** — Summary of visitors, sessions, intents, and session duration.
- **Audit logs** — Record of API calls for debugging and monitoring.
- **Exports** — Download visitors and sessions as CSV or Excel.
- **Photo upload** — Accept a visitor photo and send it to cloud storage.

### External APIs (Third-Party)

The system can integrate with external building management systems. These are configured via environment variables. If they are not set, the corresponding features may be skipped or use fallbacks.

**Login API** — Used to get an access token for other external APIs. The URL is typically something like `https://societybackend.cubeone.in/api/login` (configurable).

**Member lookup API** — Searches for members (residents/employees) by name or unit number. For example, when a visitor says “I want to meet someone in unit 1904,” we call this API to find the right person. The system returns only one match so the visitor is not asked to choose between multiple people. Member names are never spoken to the visitor for privacy.

**Visitor log API** — Logs the visitor’s entry into the building system. The URL is typically something like `https://stggateapi.cubeone.in/api/visitor/log`.

**FCM notification API** — Sends a push notification to the member (e.g., “A visitor wants to see you” or “A delivery is waiting”). The member can approve or decline. The URL is typically something like `https://stggateapi.cubeone.in/api/visitor/sendFcmNotification`.

**Cover upload API** — Used by the backend to upload visitor photos to cloud storage (e.g., S3). The URL is typically something like `https://meetservice.cubeone.in/api/v1/upload-cover`.

**Delivery approval API** — Optional. When configured, it is called to get a decision on whether a delivery should be allowed upstairs or left at the lobby. If not configured, the system defaults to “leave at lobby.”

### Google Gemini Live API

The AI conversation is powered by **Google Gemini Live API**. It uses a WebSocket connection for real-time, two-way communication. The frontend sends the visitor’s voice, and Gemini sends back Pratik’s speech and tool calls. The model used is `models/gemini-2.0-flash-exp`. An API key is required and is set in `REACT_APP_GEMINI_API_KEY`.

---

## 6. The Database — What We Store

We use **PostgreSQL** to store all persistent data.

**visitors** — Each row is one visitor. We store: name, phone number (and a normalised version for searching), who they want to meet, intent (visit, delivery, etc.), purpose, company, appointment time, reference ID, notes, and a link to their photo.

**sessions** — Each row is one conversation session. We store: which visitor (if any), which kiosk, intent, status (active, completed, disconnected), a short summary, start and end times.

**conversation_events** — Each row is one event in a conversation (e.g., a message sent or received). We store: which session, role (user, assistant), event type, content, and optional raw payload.

**api_audit_logs** — Each row is one API request. We store: method, route, status code, duration, IP, user agent, kiosk ID, and request ID. This helps with debugging and monitoring.

The database connection is configured with `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`. When using Docker, the default port is 55432.

---

## 7. How the Conversation Works

### The Tools Pratik Can Use

Gemini does not directly save data or take photos. Instead, it calls **tools**. Each tool is a small function that does one thing. The tools are:

- **classify_intent** — Figures out whether the visitor wants to meet someone, is a delivery, or is asking for general info.
- **collect_slot_value** — Stores one piece of information (e.g., name, phone, who they want to meet, delivery company, recipient).
- **check_returning_visitor** — Looks up the visitor by phone number. If found, we can skip asking for their name.
- **capture_photo** — Takes a photo from the webcam. The visitor is asked to stand still for a few seconds.
- **save_visitor_info** — Saves the complete visitor record to our database and syncs to external systems.
- **request_delivery_approval** — For deliveries, sends an approval request to the recipient. The result tells us whether to allow upstairs or keep at lobby.
- **end_interaction** — Ends the conversation and resets the UI so the next visitor can start fresh.

### Visitor Check-in Flow (Step by Step)

1. Pratik greets the visitor and asks how he can help.
2. The visitor says something like “I want to meet someone” or “I have a delivery.”
3. Gemini calls **classify_intent** to decide: meet_person, delivery, or info.
4. For a visit (not delivery):
   - Pratik asks for the phone number.
   - We call **collect_slot_value** for the phone, then **check_returning_visitor**.
   - If they are returning: we use their stored name and skip asking for it. If not: we ask for their name.
   - Pratik asks who they want to meet (person or unit number). We accept unit numbers like “1904” because visitors may not know employee names.
   - Pratik asks them to stand still and calls **capture_photo**.
   - After the photo is captured, we call **save_visitor_info**.
   - Pratik gives a farewell and instructions, then calls **end_interaction**.
5. About 5 seconds after the farewell, the session closes automatically.

### Delivery Flow (Step by Step)

1. Same greeting and intent classification.
2. When intent is delivery:
   - Pratik asks for the delivery person’s name.
   - Pratik asks which parcel company they are from (e.g., Zomato, Swiggy, Amazon).
   - Pratik asks which company in the building the parcel is for.
   - Pratik asks who in that company the parcel is for.
   - Pratik asks them to stand still and calls **capture_photo**.
   - We call **request_delivery_approval** to get a decision.
   - We call **save_visitor_info** with the delivery details.
   - Pratik tells them the result (e.g., “Please keep the parcel at the lobby”).
   - We call **end_interaction**.

### Returning Visitor

When we call **check_returning_visitor** with a phone number, our backend searches the database. If we find a match, we return `is_returning: true` and the stored name. Pratik then says something like “Welcome back!” and skips asking for the name. We still ask who they want to meet and capture a photo for the new visit.

---

## 8. Environment Variables — What You Need to Configure

### Frontend (receptionist-react/.env)

**Required:**
- `REACT_APP_GEMINI_API_KEY` — Your Google Gemini API key. Without this, the AI will not work.

**Our backend:**
- `REACT_APP_RECEPTIONIST_API_URL` — Default: `http://localhost:5000/api`
- `REACT_APP_RECEPTIONIST_API_KEY` — Must match the backend’s `BACKEND_API_KEY`
- `REACT_APP_KIOSK_ID` — Unique ID for this kiosk (e.g., `greenscape-lobby-kiosk-1`)

**Avatar:**
- `REACT_APP_AVATAR_MODEL_VERSION` — `v1` or `v2` to choose which avatar model to use

**External gate APIs:**

These are for integrating with building management systems. If you leave them empty, the system will still work but may not sync to external systems.

- `REACT_APP_GATE_API_BASE_URL` — Base URL for the gate system
- `REACT_APP_GATE_LOGIN_API_URL` — Login endpoint to get auth token
- `REACT_APP_GATE_LOGIN_USERNAME` and `REACT_APP_GATE_LOGIN_PASSWORD` — Credentials for login
- `REACT_APP_WALKIN_COMPANY_ID` — Company/building ID (e.g., 8196)
- `REACT_APP_MEMBER_LIST_API_URL` — API to search for members

**Visitor logging and notifications:**
- `REACT_APP_VISITOR_LOG_API_URL` — Where to log visitor entries
- `REACT_APP_VISITOR_NOTIFICATION_API_URL` — Where to send approval notifications to members
- `REACT_APP_VISITOR_LOG_COMPANY_NAME`, `REACT_APP_VISITOR_LOG_IN_GATE` — Metadata for logs
- `REACT_APP_VISITOR_PURPOSE_CATEGORY_ID`, `REACT_APP_DELIVERY_PURPOSE_CATEGORY_ID`, `REACT_APP_VISITOR_LOG_CARD_ID` — Category IDs used by the external system

**Delivery approval:**
- `REACT_APP_DELIVERY_APPROVAL_API_URL` — Optional. If set, we call it for delivery decisions.
- `REACT_APP_DELIVERY_APPROVAL_API_KEY` — Optional auth for that API
- `REACT_APP_FORCE_LOBBY_DELIVERY_RESPONSE` — If `true` (default), we always tell delivery to leave at lobby when the approval API is not configured or fails

### Backend (backend/.env)

- `PORT` — Default 5000
- `CORS_ORIGIN` — Allowed frontend origin (e.g., `http://localhost:3000`)
- `BACKEND_API_KEY` — Must match the frontend’s `REACT_APP_RECEPTIONIST_API_KEY`
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — PostgreSQL connection
- `COVER_UPLOAD_API_URL` — Where to upload visitor photos
- `COVER_UPLOAD_LOGIN_URL`, `COVER_UPLOAD_USERNAME`, `COVER_UPLOAD_PASSWORD` — Credentials for login
- `VISITOR_PHOTO_STORAGE_DIR` — Where to store photos locally before upload

---

## 9. How to Run the Project

1. **Start PostgreSQL** — If you use Docker, run `docker start greenscape-receptionist-postgres`. If the container does not exist, create it with the correct port (55432) and database name (`receptionist`).

2. **Start the backend** — Go to the `backend` folder and run `npm run dev`. The server will start on port 5000.

3. **Start the frontend** — Go to the `receptionist-react` folder and run `npm start`. The app will open in the browser, usually at `http://localhost:3000`.

4. **Admin dashboard** — Open `http://localhost:3000/admin` to see analytics, visitors, sessions, and audit logs. This requires the backend and database to be running.

---

## 10. Important Files — Quick Reference

If you need to change something, here is where to look:

- **App.tsx** — Main screen, conversation state, tool handlers, gesture controller. Most of the flow logic lives here.
- **receptionist/config.ts** — Pratik’s personality and the full system instruction that tells Gemini how to behave.
- **receptionist/tools.ts** — The list of tools Gemini can call and their parameters.
- **receptionist/member-directory.ts** — How we search for members by name or unit number.
- **receptionist/external-visitor-sync.ts** — How we sync visitor data to external gate and notification APIs.
- **receptionist/delivery-approval.ts** — How we call the delivery approval API.
- **hooks/use-live-api.ts** — Connection to Gemini Live, including reconnection logic.
- **lib/genai-live-client.ts** — The Gemini Live WebSocket client.
- **lib/audio-streamer.ts** — Plays Pratik’s audio and provides lip-sync data.
- **components/Avatar3D/AvatarModelUnified.tsx** — Loads the avatar model, plays animations, applies morph targets.
- **components/Avatar3D/facial-controller.ts** — Converts lip-sync data into morph target values.
- **components/Avatar3D/gesture-controller.ts** — Decides when to show idle vs waving.
- **config/facialPresets.ts** — Expression presets (welcome, listening, etc.).
- **backend/src/server.js** — All REST API endpoints.
- **backend/src/cover-upload.js** — Photo upload to cloud.

---

## 11. Safety and Conventions for Anyone Working on This

1. **Privacy** — Never reveal member names or unit details to the visitor. The system finds the right person internally but does not speak their name aloud.

2. **Unit numbers** — Visitors can say unit numbers (e.g., “1904”) as valid destinations. They may not know employee names.

3. **Single member match** — When searching for a member, we return only one match. The visitor is not asked to choose between multiple people.

4. **Session end** — After a farewell, the session should auto-close after about 5 seconds of no interaction.

5. **Minimal changes** — When fixing bugs or adding features, make small, targeted changes. Avoid large refactors that could break working flows.

6. **Verify before deleting** — Before removing any code, confirm it is not used elsewhere.

---

This document should give you a complete picture of the Virtual Receptionist project. If you have questions about a specific part, refer to the relevant files listed above and the code comments inside them.
