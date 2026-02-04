// Speech Manager - Handles Speech Recognition and Text-to-Speech

class SpeechManager {
    constructor() {
        this.recognition = null;
        this.isSpeaking = false;
        this.isListening = false;
        this.audioQueue = [];
        this.currentAudio = null;
        this.onResultCallback = null;
        this.onEndCallback = null;

        this.initRecognition();
    }

    /**
     * Initialize Speech Recognition
     */
    initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            Utils.log('Speech recognition not supported', 'error');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = CONFIG.SPEECH.continuous;
        this.recognition.interimResults = CONFIG.SPEECH.interimResults;
        this.recognition.maxAlternatives = CONFIG.SPEECH.maxAlternatives;
        this.recognition.lang = CONFIG.SPEECH.language;

        this.recognition.onstart = () => {
            this.isListening = true;
            Utils.toggleVoiceIndicator(true);
            Utils.log('Listening started...');
        };

        this.recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const transcript = result[0].transcript.trim();
            const confidence = result[0].confidence;

            Utils.log(`Recognized: "${transcript}" (confidence: ${(confidence * 100).toFixed(1)}%)`, 'success');

            if (this.onResultCallback) {
                this.onResultCallback(transcript, confidence);
            }
        };

        this.recognition.onerror = (event) => {
            Utils.log('Speech recognition error: ' + event.error, 'error');
            this.isListening = false;
            Utils.toggleVoiceIndicator(false);

            if (event.error === 'no-speech') {
                Utils.log('No speech detected, please try again', 'warning');
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            Utils.toggleVoiceIndicator(false);
            Utils.log('Listening stopped');

            if (this.onEndCallback) {
                this.onEndCallback();
            }
        };

        Utils.log('Speech recognition initialized', 'success');
    }

    /**
     * Start listening
     */
    startListening(onResult, onEnd) {
        if (!this.recognition) {
            Utils.log('Speech recognition not available', 'error');
            return false;
        }

        if (this.isListening) {
            Utils.log('Already listening', 'warning');
            return false;
        }

        this.onResultCallback = onResult;
        this.onEndCallback = onEnd;

        try {
            this.recognition.start();
            return true;
        } catch (error) {
            Utils.log('Error starting recognition: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * Stop listening
     */
    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    }

    /**
     * Text-to-Speech using ElevenLabs API
     */
    async speak(text, options = {}) {
        if (this.isSpeaking) {
            Utils.log('Already speaking, queueing...', 'warning');
            this.audioQueue.push({ text, options });
            return;
        }

        const cleanText = Utils.sanitizeForSpeech(text);

        if (!cleanText) {
            Utils.log('No text to speak', 'warning');
            return;
        }

        Utils.log(`Speaking: "${cleanText}"`);
        this.isSpeaking = true;
        Utils.toggleVoiceIndicator(true);

        try {
            const audioData = await this.generateSpeech(cleanText);
            await this.playAudio(audioData);
        } catch (error) {
            Utils.log('TTS error: ' + error.message, 'error');
        } finally {
            this.isSpeaking = false;
            Utils.toggleVoiceIndicator(false);

            // Process queue
            if (this.audioQueue.length > 0) {
                const next = this.audioQueue.shift();
                await this.speak(next.text, next.options);
            }
        }
    }

    /**
     * Generate speech using ElevenLabs API
     */
    async generateSpeech(text) {
        const apiKey = CONFIG.ELEVENLABS_API_KEY;

        if (!apiKey || apiKey === 'YOUR_ELEVENLABS_API_KEY_HERE') {
            Utils.log('ElevenLabs API key not configured, using fallback', 'warning');
            return this.fallbackTTS(text);
        }

        const url = `https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.ELEVENLABS.voiceId}/stream`;

        const requestBody = {
            text: text,
            model_id: CONFIG.ELEVENLABS.modelId,
            voice_settings: {
                stability: CONFIG.ELEVENLABS.stability,
                similarity_boost: CONFIG.ELEVENLABS.similarityBoost
            }
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`ElevenLabs API error: ${response.status}`);
            }

            const audioBlob = await response.blob();
            return URL.createObjectURL(audioBlob);
        } catch (error) {
            Utils.log('ElevenLabs API failed, using fallback: ' + error.message, 'warning');
            return this.fallbackTTS(text);
        }
    }

    /**
     * Fallback TTS using Web Speech API
     */
    fallbackTTS(text) {
        return new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-IN';
            utterance.rate = 0.9;
            utterance.pitch = 1;

            utterance.onend = () => resolve(null);
            utterance.onerror = () => resolve(null);

            speechSynthesis.speak(utterance);
        });
    }

    /**
     * Play audio
     */
    async playAudio(audioUrl) {
        if (!audioUrl) return; // Fallback TTS already played

        return new Promise((resolve, reject) => {
            const audio = new Audio(audioUrl);
            this.currentAudio = audio;

            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                resolve();
            };

            audio.onerror = (error) => {
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                reject(error);
            };

            audio.play().catch(reject);
        });
    }

    /**
     * Stop speaking
     */
    stopSpeaking() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        speechSynthesis.cancel();
        this.isSpeaking = false;
        this.audioQueue = [];
        Utils.toggleVoiceIndicator(false);
    }

    /**
     * Check if currently speaking
     */
    getIsSpeaking() {
        return this.isSpeaking;
    }

    /**
     * Check if currently listening
     */
    getIsListening() {
        return this.isListening;
    }
}

// Create global speech instance
const Speech = new SpeechManager();
