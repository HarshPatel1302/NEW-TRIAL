# API Keys Setup Guide

## Important: Replace Your API Keys!

Before running the application, you MUST replace the placeholder API keys in `config.js` with your actual keys.

## 🔑 Getting ElevenLabs API Key (Text-to-Speech)

### Option 1: Free Tier
1. Visit [https://elevenlabs.io/](https://elevenlabs.io/)
2. Click "Sign Up" (or "Get Started Free")
3. Create an account using email or Google
4. Once logged in, click on your profile icon (top right)
5. Select "Profile" → "API Keys"
6. Click "Create API Key"
7. Copy the API key
8. Paste it in `config.js`:
   ```javascript
   ELEVENLABS_API_KEY: 'sk_your_api_key_here',
   ```

### Free Tier Limits
- 10,000 characters/month
- Perfect for testing and prototype

### Available Voices
Some good voice IDs to try:
- **Adam** (Calm, professional): `pNInz6obpgDQGcFmaJgB`
- **Charlie** (Casual, friendly): `IKne3meq5aSn9XLyUdCD`
- **Antoni** (Warm, smooth): `ErXwobaYiN019PkySvjV`
- **Josh** (Young, energetic): `TxGEqnHWrfWFTfGW9XjX`

To browse all voices: https://elevenlabs.io/voice-library

---

## 🤖 Getting Google Gemini API Key (AI Conversation)

### Step-by-Step
1. Visit [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key" button
4. Choose "Create API key in new project" or select existing project
5. Copy the generated API key (starts with `AIza...`)
6. Paste it in `config.js`:
   ```javascript
   GEMINI_API_KEY: 'AIzaYour_API_Key_Here',
   ```

### Free Tier Limits
- 60 requests per minute
- 1,500 requests per day
- Generous for development and testing

### Alternative: Use Gemini via Google Cloud
If you prefer using Google Cloud Console:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable "Generative Language API"
4. Create credentials (API Key)
5. Use the API key

---

## 🆓 FREE Alternative Voice Solutions

If you want to avoid ElevenLabs costs entirely:

### Option 1: Browser Built-in TTS (Already Supported!)
The app automatically falls back to browser TTS if ElevenLabs key is not provided.

**Pros:**
- Completely free
- No API required
- Works offline

**Cons:**
- Less natural sounding
- Limited voice options

**To use:**
Simply leave the ElevenLabs API key as placeholder, and the app will use browser TTS automatically.

### Option 2: Use OpenAI TTS (Whisper + TTS)

**OpenAI Pricing:**
- TTS: $0.015 per 1,000 characters
- Whisper STT: $0.006 per minute

**Setup:**
1. Get API key from [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Modify `speech.js` to use OpenAI instead:

```javascript
async generateSpeech(text) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${YOUR_OPENAI_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'tts-1',
            voice: 'alloy', // or: echo, fable, onyx, nova, shimmer
            input: text
        })
    });
    const audioBlob = await response.blob();
    return URL.createObjectURL(audioBlob);
}
```

### Option 3: Use Google Cloud Text-to-Speech
**Pricing:**
- Free tier: 1 million characters/month (Standard voices)
- After: $4 per 1 million characters

---

## ⚙️ Configuration Summary

Open `config.js` and update these two lines:

```javascript
const CONFIG = {
    // ⚠️ REPLACE THESE WITH YOUR ACTUAL API KEYS ⚠️
    ELEVENLABS_API_KEY: 'your_elevenlabs_api_key_here',  // Get from elevenlabs.io
    GEMINI_API_KEY: 'your_gemini_api_key_here',          // Get from ai.google.com
    
    // ... rest stays the same
};
```

---

## 🧪 Testing Without API Keys

You can test the basic functionality without API keys:

1. **Gemini (Required)**: Get a free key from Google AI Studio - it's quick and free!
2. **ElevenLabs (Optional)**: Leave as placeholder - app will use browser TTS

The app will work with just the Gemini key for AI conversations, using browser's built-in voice for speech output.

---

## 🔒 Security Best Practices

### For Development/Testing:
- It's OK to put API keys directly in `config.js`
- Don't commit `config.js` to public GitHub

### For Production:
1. Create environment variables:
   ```bash
   export ELEVENLABS_API_KEY="your_key"
   export GEMINI_API_KEY="your_key"
   ```

2. Load from environment:
   ```javascript
   ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
   GEMINI_API_KEY: process.env.GEMINI_API_KEY,
   ```

3. Or use a `.env` file with a bundler like Vite/Webpack

---

## ✅ Verification

After adding your keys, open the browser console and check for:

```
✓ Speech recognition initialized
✓ Virtual Receptionist ready!
```

If you see API errors, double-check your keys are:
1. Copied correctly (no extra spaces)
2. Valid and active
3. Have proper permissions

---

## 💰 Cost Estimation

For a typical kiosk with ~10 visitors per day:

### ElevenLabs:
- Average greeting: 50 characters
- Average conversation: 300 characters  
- Total per visitor: ~350 characters
- Monthly: 10 visitors × 30 days × 350 = 105,000 characters
- **Free tier covers this!** (10,000/month might be tight)
- Paid: $5/month for 30,000 characters (expand as needed)

### Google Gemini:
- ~5 API calls per visitor
- Daily: 50 calls
- **Free tier easily covers this!** (1,500/day limit)

**Total Monthly Cost for Prototype: $0** (using free tiers)

**Total Monthly Cost for Production: ~$5-10** (with paid ElevenLabs)

---

## 🆘 Help

### Can't find ElevenLabs API?
Screenshot of where to find it: Profile Icon → "Profile" → "API Keys" tab

### Gemini API not working?
- Make sure you clicked "Create API Key"
- API key must start with `AIza`
- Enable billing if you exceed free tier (unlikely)

### Still stuck?
Check browser console (F12) for detailed error messages.
