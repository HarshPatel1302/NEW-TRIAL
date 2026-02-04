# 🚀 QUICK START GUIDE

## Get Your Virtual Receptionist Running in 5 Minutes!

### Step 1: Add API Keys (REQUIRED) ⚠️

1. Open `config.js` in this folder
2. Find these two lines (near the top):
   ```javascript
   ELEVENLABS_API_KEY: 'YOUR_ELEVENLABS_API_KEY_HERE',
   GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',
   ```

3. Replace with your actual API keys:
   ```javascript
   ELEVENLABS_API_KEY: 'sk_abc123...',  // Your ElevenLabs key
   GEMINI_API_KEY: 'AIzaXYZ789...',     // Your Gemini key
   ```

**Don't have API keys yet?** See `API_SETUP.md` for detailed instructions.

---

### Step 2: Open the Application 🌐

Your server is already running! Just open Chrome and visit:

**👉 http://localhost:8000 👈**

---

### Step 3: Test the Flow 🎤

1. **Click anywhere** on the screen to start
2. **Listen** to John's greeting
3. **Speak your name** when asked
4. **Say who you want to meet** (try "Archana" or "Rabindra")
5. **Enter phone number** on the dialpad
6. **Choose photo** (capture or skip)
7. **Wait** for confirmation

---

## ⚡ Testing Scenarios

### Scenario 1: New Visitor Meeting Archana
```
You: "My name is Mihir"
John: "Nice to meet you, Mihir. Who would you like to meet today?"
You: "I want to meet Archana"
John: "Perfect! Now please enter your phone number..."
[Enter: 9876543210]
[Skip or capture photo]
John: "Thank you Mihir. I'm notifying Archana..."
```

### Scenario 2: Returning Visitor
```
[Enter same phone number as before]
John: "Hello Mihir! Welcome back. You previously met with Archana. Would you like to meet them again?"
You: "Yes"
John: "Great! I'm notifying Archana..."
```

### Scenario 3: Company Information
```
You: "Tell me about Greenscape"
John: "Greenscape Group is a premium real-estate development company..."
```

---

## 🎯 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| No voice output | Check API keys in `config.js` |
| Can't hear me | Use Chrome browser, allow microphone |
| API errors | Verify API keys are correct |
| Camera not working | Allow camera permissions |

---

## 🔧 Browser Console (Press F12)

You'll see colored logs showing everything:
- 🔵 Blue = Information
- 💚 Cyan = Success  
- 💗 Pink = Warnings/Errors

---

## 🎨 Company Info

The receptionist knows about:
- Greenscape Group overview
- Projects: Cyber Square, Meraki Life, Eternia, etc.
- Services: Premium apartments, luxury villas, IT parks
- Location: Vashi, Navi Mumbai

**Only provides this info when asked!**

---

## 👥 Office Staff

Currently configured staff:
- **Archana**
- **Rabindra**

To add more, edit `config.js` → `OFFICE_STAFF` array.

---

## 📱 Kiosk Mode (Fullscreen)

For lobby display:

1. Open in Chrome
2. Press `F11` for fullscreen
3. (Optional) Disable browser UI:
   - Chrome Settings → Appearance → Hide toolbar in full screen

---

## 🐛 Debug Commands

Open browser console (F12) and try:

```javascript
// View all visitors
window.dbDebug.getAll()

// Get statistics
window.dbDebug.stats()

// Find visitor by phone
window.dbDebug.find('9876543210')

// Clear database
window.dbDebug.clear()
```

---

## ⏱️ Important Timings

- **Greeting delay**: 1 second
- **Listening timeout**: 8 seconds (speak within this time)
- **Approval wait**: 15 seconds (prototype simulates staff response)
- **Session timeout**: 5 minutes (auto-reset if idle)

Edit these in `config.js` → `TIMINGS`

---

## 🎭 Voice Selection

Current voice: **Adam** (professional, calm)

To change, edit `config.js`:
```javascript
ELEVENLABS: {
    voiceId: 'pNInz6obpgDQGcFmaJgB',  // Change this ID
}
```

Good alternatives:
- Charlie: `IKne3meq5aSn9XLyUdCD` (friendly)
- Antoni: `ErXwobaYiN019PkySvjV` (warm)
- Josh: `TxGEqnHWrfWFTfGW9XjX` (energetic)

Browse all: https://elevenlabs.io/voice-library

---

## 📊 What Gets Stored?

Each visitor record includes:
- Name
- Phone number
- Who they're meeting
- Photo (if captured)
- Timestamp
- Visit count

**All stored locally in your browser** (localStorage)

---

## ✅ Success Checklist

- [ ] API keys added to `config.js`
- [ ] Chrome browser opened
- [ ] http://localhost:8000 loaded
- [ ] Microphone permission granted
- [ ] Speaker volume is on
- [ ] Tested voice interaction
- [ ] Tested phone dialpad
- [ ] Tested photo capture

---

## 🎓 Need More Help?

1. **Full Documentation**: See `README.md`
2. **API Setup**: See `API_SETUP.md`
3. **Browser Console**: Press F12 for detailed logs
4. **Test Mode**: Works with just Gemini API key (browser TTS fallback)

---

## 🚀 Ready for Production?

Current setup is a **working prototype**. For production deployment:

1. Add real SMS/Email notifications (Twilio, SendGrid)
2. Integrate actual face recognition (AWS Rekognition)
3. Set up cloud database (Firebase, Supabase)
4. Add admin dashboard
5. Implement visitor badges
6. Add calendar integration

See `README.md` → "Future Enhancements" for details.

---

**🎉 You're all set! Click to start and say hello to John!**

For questions, check the console logs (F12) - everything is logged there!
