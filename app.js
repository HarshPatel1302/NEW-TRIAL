// Main Application Logic - Live API Version

class VirtualReceptionist {
    constructor() {
        this.currentScreen = 'welcomeScreen';
        this.sessionActive = false;
        this.phoneNumber = '';
        this.sessionTimeout = null;

        this.init();
    }

    /**
     * Initialize application
     */
    async init() {
        Utils.log('Initializing Virtual Receptionist (Live API)...');

        // Setup Event Listeners
        this.setupEventListeners();

        // Initialize Live Client
        await Live.init();

        // Show welcome screen
        Utils.showScreen('welcomeScreen');

        Utils.log('Virtual Receptionist ready!', 'success');
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Welcome screen - touch to start
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.addEventListener('click', () => this.startSession());
        }

        // Phone dialpad
        this.setupDialpad();

        // Photo capture
        this.setupPhotoCapture();
    }

    /**
     * Start new session
     */
    async startSession() {
        if (this.sessionActive) return;

        Utils.log('Starting new session...');
        this.sessionActive = true;

        // Reset state
        this.phoneNumber = '';
        Camera.clearPhoto();

        // Start session timeout
        this.resetSessionTimeout();

        // Connect to Live API
        // This starts audio input/output and sends the initial setup prompt
        await Live.connect();

        // The Live API will now handle the conversation flow automatically
        // based on the system instruction. John (AI) will speak first if instructed,
        // or wait for user.
        // We might want to nudge the user visually.
        Utils.updateStatus('Listening...', true);
    }

    /**
     * Request phone number (Triggered by Tool or UI?) 
     * In Live API, if AI asks for phone, user speaks it or types.
     * To support the Dialpad hybrid mode:
     * We need to send the dialpad digits to the Live API as text input if used.
     */

    /**
     * Handle Dialpad Input
     * When user enters number and hits submit, we send it to Live API as text
     */
    async submitPhoneNumber() {
        if (!Utils.isValidPhone(this.phoneNumber)) {
            // How to make AI speak error? 
            // We can send a hidden text prompt: "User entered invalid phone number"
            // Or just use browser TTS for UI errors
            // Let's use browser TTS for simple UI feedback to avoid latency
            const utterance = new SpeechSynthesisUtterance("Please enter a valid 10-digit phone number.");
            speechSynthesis.speak(utterance);
            return;
        }

        this.resetSessionTimeout();
        Utils.log(`Phone number submitted: ${this.phoneNumber}`, 'success');

        // Send this information to the Live API as if the user spoke it
        // We need to add a method to LiveClient to send Text Input
        if (Live.isConnected) {
            const msg = {
                client_content: {
                    turns: [
                        {
                            role: "user",
                            parts: [{ text: `My phone number is ${this.phoneNumber}` }]
                        }
                    ],
                    turn_complete: true
                }
            };
            Live.ws.send(JSON.stringify(msg));
        }

        // Check locally? No, let the AI Tool handle it via 'check_returning_visitor' tool execution
        // which the AI will call after receiving the phone number text.

        // Hide phone screen and go back to welcome/avatar
        Utils.showScreen('welcomeScreen');
        this.currentScreen = 'welcomeScreen';
    }

    /**
     * Setup dialpad
     */
    setupDialpad() {
        const phoneInput = document.getElementById('phoneInput');
        const submitBtn = document.getElementById('submitPhone');
        const clearBtn = document.getElementById('clearBtn');

        // Dial buttons
        document.querySelectorAll('.dial-btn[data-digit]').forEach(btn => {
            btn.addEventListener('click', () => {
                const digit = btn.dataset.digit;
                if (this.phoneNumber.length < 10) {
                    this.phoneNumber += digit;
                    phoneInput.value = this.phoneNumber;
                    Utils.playNotificationSound();
                }
            });
        });

        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (this.phoneNumber.length > 0) {
                    this.phoneNumber = this.phoneNumber.slice(0, -1);
                    phoneInput.value = this.phoneNumber;
                    Utils.playNotificationSound();
                }
            });
        }

        // Submit button
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.submitPhoneNumber());
        }
    }

    // ... Photo capture remains similar ...
    setupPhotoCapture() {
        const captureBtn = document.getElementById('capturePhotoBtn');
        const skipBtn = document.getElementById('skipPhotoBtn');
        const retakeBtn = document.getElementById('retakeBtn');
        const confirmBtn = document.getElementById('confirmPhotoBtn');
        const cameraContainer = document.getElementById('cameraContainer');
        const capturedPhoto = document.getElementById('capturedPhoto');
        const capturedImage = document.getElementById('capturedImage');

        // Capture photo button
        if (captureBtn) {
            captureBtn.addEventListener('click', async () => {
                this.resetSessionTimeout();

                // Show camera
                cameraContainer.style.display = 'block';
                captureBtn.textContent = 'Take Photo';

                // Start camera if not started
                if (!Camera.stream) {
                    const started = await Camera.startCamera();
                    if (!started) {
                        this.skipPhoto();
                        return;
                    }
                }

                // Wait a moment for camera to initialize
                await Utils.delay(500);

                // Change button to capture
                captureBtn.onclick = () => this.capturePhoto();
                captureBtn.textContent = 'Capture';
            });
        }

        // Skip photo button
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                this.resetSessionTimeout();
                this.skipPhoto();
            });
        }

        // Retake button
        if (retakeBtn) {
            retakeBtn.addEventListener('click', () => {
                this.resetSessionTimeout();
                capturedPhoto.style.display = 'none';
                cameraContainer.style.display = 'block';
                Camera.clearPhoto();
            });
        }

        // Confirm photo button
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.resetSessionTimeout();
                this.confirmPhoto();
            });
        }
    }

    async capturePhoto() {
        const photoData = Camera.capturePhoto();

        if (photoData) {
            const capturedImage = document.getElementById('capturedImage');
            const cameraContainer = document.getElementById('cameraContainer');
            const capturedPhoto = document.getElementById('capturedPhoto');

            capturedImage.src = photoData;
            cameraContainer.style.display = 'none';
            capturedPhoto.style.display = 'block';

            // Send text to AI?
            // "I took the photo"
        }
    }

    async confirmPhoto() {
        const photoData = Camera.getPhotoData();
        // Maybe save to DB? Live Client tools handle main saving, but photo is separate here for now.
        // We'll update the last saved visitor?
        // For simplicity:
        Camera.stopCamera();
        Utils.showScreen('processingScreen');
        // Let AI know
        if (Live.isConnected) {
            Live.ws.send(JSON.stringify({
                client_content: {
                    turns: [{ role: "user", parts: [{ text: "I have taken my photo." }] }],
                    turn_complete: true
                }
            }));
        }
        Utils.showScreen('welcomeScreen');
    }

    async skipPhoto() {
        Camera.stopCamera();
        if (Live.isConnected) {
            Live.ws.send(JSON.stringify({
                client_content: {
                    turns: [{ role: "user", parts: [{ text: "I will skip the photo." }] }],
                    turn_complete: true
                }
            }));
        }
        Utils.showScreen('welcomeScreen');
    }

    /**
     * End session
     */
    async endSession() {
        // Can be called by Tool or Timeout
        this.sessionActive = false;
        this.phoneNumber = '';

        if (Live.ws) {
            Live.ws.close();
        }

        Camera.stopCamera();
        Camera.clearPhoto();

        Utils.showScreen('welcomeScreen');
        Utils.updateStatus('', false);
        Utils.log('Session ended', 'success');
    }

    /**
     * Reset session timeout
     */
    resetSessionTimeout() {
        if (this.sessionTimeout) {
            clearTimeout(this.sessionTimeout);
        }

        this.sessionTimeout = setTimeout(() => {
            Utils.log('Session timeout', 'warning');
            this.endSession();
        }, CONFIG.TIMINGS.sessionTimeout);
    }
}

// Initialize application when DOM is loaded
let app;

document.addEventListener('DOMContentLoaded', () => {
    Utils.log('DOM loaded, initializing Live app...', 'success');
    app = new VirtualReceptionist();
});

// Global app reference for debugging
window.receptionistApp = () => app;
