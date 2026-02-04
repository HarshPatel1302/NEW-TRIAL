# ✅ Setup Checklist for Greenscape Virtual Receptionist

## Before You Start

### 1. Get Your API Keys
- [ ] **ElevenLabs API Key** - Get from https://elevenlabs.io/
  - Sign up for free account
  - Go to Profile → API Keys
  - Create new key
  - Copy the key (starts with `sk_`)

- [ ] **Google Gemini API Key** - Get from https://aistudio.google.com/app/apikey
  - Sign in with Google
  - Click "Create API Key"
  - Copy the key (starts with `AIza`)

### 2. Configure the Application
- [ ] Open `config.js` file
- [ ] Replace `YOUR_ELEVENLABS_API_KEY_HERE` with your actual ElevenLabs key
- [ ] Replace `YOUR_GEMINI_API_KEY_HERE` with your actual Gemini key
- [ ] Save the file

### 3. Browser Setup
- [ ] Use **Google Chrome** browser (required for speech recognition)
- [ ] Navigate to http://localhost:8000
- [ ] Allow microphone permissions when prompted
- [ ] Allow camera permissions (for photo feature)
- [ ] Ensure speakers/volume are on

## Testing Flow

### Test 1: Basic Conversation
- [ ] Click anywhere on the welcome screen
- [ ] Hear John's greeting
- [ ] When prompted, say your name clearly
- [ ] Say who you want to meet (try "Archana" or "Rabindra")
- [ ] Verify AI responds appropriately

### Test 2: Phone Number Entry
- [ ] Enter 10-digit phone number using dialpad
- [ ] Verify number appears in display
- [ ] Try backspace button to delete digits
- [ ] Submit the number
- [ ] Verify acceptance message

### Test 3: Photo Capture
- [ ] Choose to capture photo
- [ ] Camera should activate
- [ ] Capture photo
- [ ] Review captured image
- [ ] Confirm or retake

### Test 4: Returning Visitor
- [ ] Complete a full session
- [ ] Wait for thank you message
- [ ] Start new session
- [ ] Enter same phone number
- [ ] Verify "Welcome back" message with previous visit info

### Test 5: Company Information
- [ ] Start session
- [ ] Ask "Tell me about Greenscape"
- [ ] Verify response includes company information
- [ ] Ask about projects
- [ ] Verify appropriate responses

## Customization Checklist

### Branding (Optional)
- [ ] Replace company name in `config.js` if needed
- [ ] Update receptionist name from "John" if desired
- [ ] Modify welcome greeting message
- [ ] Adjust color scheme in `style.css`

### Office Staff
- [ ] Verify "Archana" and "Rabindra" are correct staff names
- [ ] Add additional staff to `OFFICE_STAFF` array if needed
- [ ] Test name recognition for all staff

### Voice Selection
- [ ] Test current voice (Adam)
- [ ] If changing, update `voiceId` in config
- [ ] Test new voice selection
- [ ] Adjust voice settings (stability, similarity) as needed

### Timing Adjustments
- [ ] Test greeting delay (currently 1 second)
- [ ] Test listening timeout (currently 8 seconds)
- [ ] Adjust approval wait time (currently 15 seconds)
- [ ] Verify session timeout (currently 5 minutes)

## Production Readiness

### Security
- [ ] Remove API keys from code for production
- [ ] Set up environment variables
- [ ] Configure HTTPS if deploying to server
- [ ] Review CORS settings
- [ ] Implement rate limiting

### Performance
- [ ] Test with multiple sessions
- [ ] Verify database persistence
- [ ] Check memory usage over time
- [ ] Test camera cleanup after sessions
- [ ] Verify audio queue handling

### Accessibility
- [ ] Test in fullscreen mode (F11)
- [ ] Verify touch interactions on touchscreen
- [ ] Test with different screen sizes
- [ ] Verify voice volume levels
- [ ] Test in different lighting (for camera)

### Data Management
- [ ] Review visitor data storage
- [ ] Test data export functionality
- [ ] Verify data clearing works
- [ ] Plan for data backup strategy
- [ ] Review privacy compliance

## Deployment Checklist

### Kiosk Setup
- [ ] Install on dedicated kiosk device
- [ ] Configure auto-start on boot
- [ ] Set fullscreen mode as default
- [ ] Disable screen sleep/screensaver
- [ ] Lock down browser to application only
- [ ] Test physical touchscreen accuracy
- [ ] Position at appropriate height
- [ ] Ensure good microphone placement
- [ ] Test in actual lobby noise levels

### Monitoring
- [ ] Set up error logging
- [ ] Configure analytics (optional)
- [ ] Plan for regular data backups
- [ ] Create admin access method
- [ ] Document troubleshooting procedures

### Training
- [ ] Create user guide for office staff
- [ ] Document common visitor questions
- [ ] Train staff on override procedures
- [ ] Create quick reference card
- [ ] Plan for visitor signage

## Known Limitations (Prototype)

- [ ] Face recognition is simulated (use phone number only)
- [ ] Approval system is simulated (15-second delay)
- [ ] No actual SMS/email notifications
- [ ] Database is local only (browser storage)
- [ ] No admin dashboard
- [ ] No integration with calendar systems

## Future Enhancements to Consider

### Phase 2 (After 24 hours)
- [ ] Integrate real face recognition API
- [ ] Add SMS notifications via Twilio
- [ ] Add email notifications
- [ ] Create admin dashboard
- [ ] Add visitor analytics

### Phase 3
- [ ] Multi-language support
- [ ] QR code check-in
- [ ] Visitor badge printing
- [ ] Calendar integration
- [ ] Cloud database
- [ ] Mobile app for staff
- [ ] Slack/Teams integration

## Troubleshooting Verification

### If Voice Not Working
- [ ] Verified using Chrome browser
- [ ] Checked microphone permissions
- [ ] Tested microphone in other apps
- [ ] Checked browser console for errors
- [ ] Verified API keys are correct

### If TTS Not Working
- [ ] Verified ElevenLabs API key
- [ ] Checked speaker/volume
- [ ] Tested browser TTS fallback
- [ ] Checked network connectivity
- [ ] Reviewed API quota/limits

### If Camera Not Working
- [ ] Verified camera permissions
- [ ] Tested camera in other apps
- [ ] Checked browser compatibility
- [ ] Reviewed error messages
- [ ] Tested with different camera

### If AI Not Responding
- [ ] Verified Gemini API key
- [ ] Checked network connectivity
- [ ] Reviewed API quota
- [ ] Checked browser console
- [ ] Tested fallback responses

## Launch Day Checklist

### Morning Setup
- [ ] Boot up kiosk
- [ ] Open application
- [ ] Verify network connectivity
- [ ] Test microphone and speaker
- [ ] Test camera
- [ ] Clear yesterday's visitor data (optional)
- [ ] Run through test conversation

### During Day
- [ ] Monitor for errors
- [ ] Check visitor feedback
- [ ] Track session completions
- [ ] Note any issues

### Evening Review
- [ ] Export visitor data if needed
- [ ] Review any errors/issues
- [ ] Plan improvements
- [ ] Update documentation

## Success Metrics

Track these to measure success:
- [ ] Number of visitors per day
- [ ] Successful session completion rate
- [ ] Returning visitor recognition rate
- [ ] Average session duration
- [ ] Photo capture opt-in rate
- [ ] Staff satisfaction
- [ ] Visitor satisfaction

## Support Resources

- [ ] Bookmark browser console (F12)
- [ ] Save API documentation links
- [ ] Document contact for tech support
- [ ] Keep backup API keys secure
- [ ] Maintain version control of code

---

## Final Pre-Launch Check

**Everything ready?**
- [ ] ✅ API keys configured and tested
- [ ] ✅ All hardware working (screen, camera, mic, speakers)
- [ ] ✅ Application loads without errors
- [ ] ✅ Full visitor flow tested end-to-end
- [ ] ✅ Staff trained on system
- [ ] ✅ Signage/instructions for visitors posted
- [ ] ✅ Emergency fallback plan in place

**🚀 READY TO LAUNCH!**

---

*Last updated: 2026-02-04*
*Version: 1.0 (Prototype)*
