// Utility Functions

class Utils {
    /**
     * Show a specific screen and hide others
     */
    static showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
    }

    /**
     * Update status message on welcome screen
     */
    static updateStatus(message, visible = true) {
        const statusElement = document.getElementById('statusMessage');
        if (statusElement) {
            statusElement.textContent = message;
            if (visible) {
                statusElement.classList.add('visible');
            } else {
                statusElement.classList.remove('visible');
            }
        }
    }

    /**
     * Show/hide voice indicator
     */
    static toggleVoiceIndicator(show) {
        const indicator = document.getElementById('voiceIndicator');
        if (indicator) {
            if (show) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        }
    }

    /**
     * Update processing screen
     */
    static updateProcessing(title, subtitle) {
        const titleEl = document.getElementById('processingTitle');
        const subtitleEl = document.getElementById('processingSubtitle');

        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle;
    }

    /**
     * Format phone number for display
     */
    static formatPhoneNumber(number) {
        if (!number) return '';
        const cleaned = number.replace(/\D/g, '');

        if (cleaned.length <= 3) return cleaned;
        if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }

    /**
     * Validate phone number (10 digits)
     */
    static isValidPhone(number) {
        const cleaned = number.replace(/\D/g, '');
        return cleaned.length === 10;
    }

    /**
     * Normalize name for comparison
     */
    static normalizeName(name) {
        return name.trim().toLowerCase().replace(/[^a-z\s]/g, '');
    }

    /**
     * Check if name matches office staff
     */
    static isOfficeStaff(name) {
        const normalized = Utils.normalizeName(name);
        return CONFIG.OFFICE_STAFF.some(staff =>
            Utils.normalizeName(staff) === normalized
        );
    }

    /**
     * Get closest staff name match
     */
    static getClosestStaffMatch(name) {
        const normalized = Utils.normalizeName(name);

        for (const staff of CONFIG.OFFICE_STAFF) {
            const staffNormalized = Utils.normalizeName(staff);
            if (staffNormalized.includes(normalized) || normalized.includes(staffNormalized)) {
                return staff;
            }
        }

        return null;
    }

    /**
     * Delay utility
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log with timestamp
     */
    static log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const styles = {
            info: 'color: #4facfe',
            success: 'color: #00f2fe',
            warning: 'color: #f5576c',
            error: 'color: #f5576c; font-weight: bold'
        };

        console.log(`%c[${timestamp}] ${message}`, styles[type] || styles.info);
    }

    /**
     * Generate unique visitor ID
     */
    static generateVisitorId() {
        return `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Extract name from text (handles various formats)
     */
    static extractName(text) {
        // Remove common phrases
        const cleaned = text
            .replace(/my name is/i, '')
            .replace(/i am/i, '')
            .replace(/this is/i, '')
            .replace(/i'm/i, '')
            .trim();

        // Capitalize first letter of each word
        return cleaned
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Play notification sound
     */
    static playNotificationSound() {
        // Create a simple beep using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    /**
     * Check if browser supports required features
     */
    static checkBrowserSupport() {
        const features = {
            speechRecognition: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            audioContext: !!(window.AudioContext || window.webkitAudioContext),
            localStorage: typeof Storage !== 'undefined'
        };

        const unsupported = Object.entries(features)
            .filter(([, supported]) => !supported)
            .map(([feature]) => feature);

        if (unsupported.length > 0) {
            console.warn('Unsupported features:', unsupported);
        }

        return features;
    }

    /**
     * Sanitize text for speech
     */
    static sanitizeForSpeech(text) {
        return text
            .replace(/[*_~`#]/g, '') // Remove markdown
            .replace(/\n+/g, '. ') // Replace newlines with periods
            .trim();
    }
}

// Initialize browser support check
document.addEventListener('DOMContentLoaded', () => {
    const support = Utils.checkBrowserSupport();
    Utils.log('Browser support check completed');

    if (!support.speechRecognition) {
        Utils.log('Speech recognition not supported. Please use Chrome.', 'warning');
    }
});
