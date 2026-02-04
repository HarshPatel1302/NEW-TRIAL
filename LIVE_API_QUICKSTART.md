# ⚡ GEMINI LIVE API - QUICK START

## You are now running the advanced Gemini Live API version!

This version replaces the separate Speech-to-Text and Text-to-Speech engines with a single, real-time WebSocket connection to Google's Multimodal Live API.

### 🔑 Configuration (Automated)

The system has been pre-configured with the API Key you provided:
`AIzaSyCr6b4kSBpnBkBKsLILonn1XDIVS5FPEBc`

### 🚀 How to Test

1. **Open http://localhost:8000** in Chrome.
2. **Click anywhere** to start the session.
3. **Allow Microphone Access** when prompted.
4. **Speak Naturally!** You can interrupt John (the AI) at any time.

### 🛠️ Key Differences

- **Latency**: Much lower. Responses are near-instant.
- **Interruption**: You can talk over the AI, and it will stop speaking and listen (Voice Activity Detection).
- **Audio Quality**: High-fidelity 24kHz audio output.
- **Tools**: The AI decides when to save your info or check if you are a returning visitor.

### 🐛 Troubleshooting

- **No Sound?** Check your volume. The Live API sends audio chunks directly.
- **Connection Closed?** If the session times out (approx 15 mins max by Google), just refresh.
- **Microphone Error?** Ensure you are on `localhost` or HTTPS. Browsers block mic on HTTP except for localhost.

### 📞 Returning Visitors

Try entering your phone number on the dialpad. The AI will receive it as a text message and check the database!

---
*Powered by Google Gemini Multimodal Live API*
