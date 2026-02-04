# Greenscape Virtual Receptionist

A premium, voice-enabled virtual receptionist system for Greenscape Group's office lobby. This system greets visitors, collects their information, and facilitates meetings with office staff using AI-powered conversation.

## ✨ Features

### Core Functionality
- **🎤 Voice Interaction**: Natural conversation using speech recognition and text-to-speech
- **👤 Visitor Management**: Collects name, phone number, and meeting purpose
- **📱 Smart Dialpad**: On-screen number pad for phone input
- **📸 Photo Capture**: Optional photo capture for repeat visitor recognition
- **🔄 Returning Visitors**: Automatically recognizes returning visitors by phone number
- **💬 AI-Powered**: Uses Google Gemini AI for natural conversation
- **🎯 Staff Routing**: Intelligent routing to Archana or Rabindra

### Technical Features
- Premium dark UI with gradient accents
- Smooth animations and transitions
- Voice activity indicator
- Session timeout management
- Local database for visitor tracking
- Responsive design
- Browser-based (no installation required)

## 🚀 Quick Start

### Prerequisites
1. **Browser**: Google Chrome (required for speech recognition)
2. **API Keys**: 
   - ElevenLabs API key (for premium voice)
   - Google Gemini API key (for AI conversation)

### Setup Instructions

#### Step 1: Configure API Keys

1. Open `config.js`
2. Replace the placeholder API keys:

```javascript
const CONFIG = {
    ELEVENLABS_API_KEY: 'your_elevenlabs_api_key_here',
    GEMINI_API_KEY: 'your_gemini_api_key_here',
    // ... rest of config
};
```

#### Step 2: Get Your API Keys

**ElevenLabs API Key:**
1. Go to [ElevenLabs](https://elevenlabs.io/)
2. Sign up for a free account
3. Navigate to your profile → API Keys
4. Create a new API key
5. Copy and paste into `config.js`

**Google Gemini API Key:**
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Get API Key" or "Create API Key"
4. Copy and paste into `config.js`

#### Step 3: Run the Application

The server is already running! Just open your browser to:

```
http://localhost:8000
```

If you need to restart the server:

```bash
cd "/Users/harshui/Documents/FutureScape/New trial"
python3 -m http.server 8000
```

## 📖 User Flow

### For Visitors

1. **Touch to Start**: Tap anywhere on the welcome screen
2. **Voice Greeting**: John (virtual receptionist) greets you
3. **Conversation**: Tell John your name and who you want to meet
4. **Phone Number**: Enter your 10-digit phone number on the dialpad
5. **Photo (Optional)**: Choose to capture or skip photo
6. **Processing**: Wait while John connects you
7. **Completion**: Receive instructions and thank you message

### For Returning Visitors

1. When entering phone number, system checks database
2. If match found: "Hello [Name]! Would you like to meet [Previous Person] again?"
3. Say "Yes" to proceed or "No" to meet someone else

## 🎯 Office Staff

The system recognizes two office staff members:
- **Archana**
- **Rabindra**

When visitors request these names, the system will attempt to notify them (prototype simulates this).

## 💡 Key Conversations

### Company Information
**Visitor**: "Tell me about Greenscape"
**John**: Provides company information, projects, and services

### Meeting Request
**Visitor**: "I want to meet Archana"
**John**: Collects name, phone, processes request

### General Inquiry
**Visitor**: "What are your projects?"
**John**: Lists Cyber Square, Meraki Life, Eternia, etc.

## 🛠️ Technical Architecture

### Files Structure
```
.
├── index.html          # Main HTML structure
├── style.css           # Premium dark theme styles
├── config.js           # Configuration & API keys
├── utils.js            # Utility functions
├── database.js         # LocalStorage visitor management
├── camera.js           # Camera access & photo capture
├── speech.js           # Speech recognition & TTS
├── conversation.js     # Gemini AI integration
└── app.js             # Main application logic
```

### Technology Stack
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Speech Recognition**: Web Speech API (Chrome)
- **Text-to-Speech**: ElevenLabs API (fallback to Web Speech API)
- **AI Conversation**: Google Gemini API
- **Database**: Browser LocalStorage
- **Camera**: MediaDevices API

## 🎨 Customization

### Change Receptionist Voice

In `config.js`, modify the voice ID:

```javascript
ELEVENLABS: {
    voiceId: 'pNInz6obpgDQGcFmaJgB', // Change this
    // Other voice IDs:
    // Adam: pNInz6obpgDQGcFmaJgB
    // Antoni: ErXwobaYiN019PkySvjV
    // Josh: TxGEqnHWrfWFTfGW9XjX
    // Charlie: IKne3meq5aSn9XLyUdCD
}
```

### Add More Office Staff

In `config.js`:

```javascript
OFFICE_STAFF: ['Archana', 'Rabindra', 'NewPerson'],
```

### Adjust Timing

In `config.js`:

```javascript
TIMINGS: {
    greetingDelay: 1000,        // Delay before greeting
    listeningTimeout: 8000,     // How long to listen
    processingDelay: 2000,      // Processing delay
    approvalWaitTime: 15000,    // Wait for approval
    sessionTimeout: 300000      // 5 min session timeout
}
```

## 🔧 Troubleshooting

### Speech Recognition Not Working
- **Issue**: Voice not detected
- **Solution**: Use Google Chrome browser, ensure microphone permissions granted

### No Voice Output
- **Issue**: No audio from receptionist
- **Solution**: Check ElevenLabs API key, ensure speakers/volume on

### API Errors
- **Issue**: "API key not configured" errors
- **Solution**: Add valid API keys to `config.js`

### Camera Not Working
- **Issue**: Photo capture fails
- **Solution**: Grant camera permissions in browser settings

## 🐛 Debugging

### Browser Console Commands

```javascript
// Check visitor database
window.dbDebug.getAll()

// Get database statistics
window.dbDebug.stats()

// Find visitor by phone
window.dbDebug.find('9876543210')

// Export visitor data
window.dbDebug.export()

// Clear all data
window.dbDebug.clear()

// Access app instance
window.receptionistApp()
```

### Console Logs

The application logs all activities to the browser console with color-coded messages:
- **Blue**: Info
- **Cyan**: Success
- **Pink**: Warnings/Errors

## 🔐 Privacy & Data

- All visitor data stored locally in browser's localStorage
- Photos stored as base64 strings in localStorage
- No data sent to external servers except:
  - ElevenLabs (text for voice generation)
  - Google Gemini (conversation for AI responses)
- Data persists until manually cleared

## 📱 Mobile Support

While designed for kiosk displays, the app is responsive and works on:
- Desktop browsers (Chrome recommended)
- Tablets
- Mobile devices (Chrome recommended)

## 🚧 Future Enhancements (Production)

### Phase 2 Features
- [ ] Actual face recognition integration (AWS Rekognition, Azure Face API)
- [ ] Real SMS/Email notifications to staff
- [ ] Admin dashboard for visitor management
- [ ] QR code check-in option
- [ ] Multi-language support
- [ ] Cloud database integration
- [ ] Analytics and reporting
- [ ] Calendar integration for scheduled meetings
- [ ] Visitor badge printing

### Approval System Integration
To add real approval notifications:

1. **SMS Integration** (Twilio):
```javascript
// Add to app.js → proceedToApproval()
await fetch('https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json', {
    method: 'POST',
    headers: {
        'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
        'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
        To: staffPhone,
        From: twilioNumber,
        Body: `New visitor: ${visitorInfo.name} wants to meet you`
    })
});
```

2. **Email Integration** (SendGrid, Mailgun)
3. **Slack Integration** for office notifications

## 🎓 Learning Resources

- [Web Speech API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [ElevenLabs API Docs](https://elevenlabs.io/docs/api-reference/text-to-speech)
- [Google Gemini API Docs](https://ai.google.dev/docs)
- [MediaDevices API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices)

## 📄 License

This project is proprietary software developed for Greenscape Group.

## 👨‍💻 Developer Notes

### Code Quality
- ES6+ JavaScript
- Modular architecture
- Commented code
- Error handling throughout
- Logging for debugging

### Performance
- Lazy loading of camera
- Audio queueing system
- Efficient DOM manipulation
- Minimal external dependencies

---

**Built with ❤️ for Greenscape Group**

For issues or questions, check the browser console for detailed logs.
