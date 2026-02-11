// Live API Client - Handles WebSocket connection and Audio logic
// Replaces Speech.js and Conversation.js

class LiveClient {
    constructor() {
        this.ws = null;
        this.audioContext = null;
        this.audioInput = null;
        this.processor = null;
        this.pcmStreamer = null;
        this.isActive = false;
        this.isConnected = false;
    }

    async init() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000 // Force 16kHz for input to match Gemini requirement
        });

        // Load the Audio Worklet
        try {
            await this.audioContext.audioWorklet.addModule('pcm-processor.js');
        } catch (e) {
            Utils.log('Error loading audio worklet: ' + e.message, 'error');
            return;
        }

        this.pcmStreamer = new PCMStreamer(this.audioContext);
    }

    async connect() {
        if (this.isConnected) return;

        Utils.log('Connecting to Gemini Live API...', 'info');

        // Build URL
        const url = `${CONFIG.LIVE_API.url}?key=${CONFIG.GEMINI_API_KEY}`;

        this.ws = new WebSocket(url);

        this.ws.onopen = this.handleOpen.bind(this);
        this.ws.onmessage = this.handleMessage.bind(this);
        this.ws.onerror = (e) => Utils.log('WebSocket Error: ' + e, 'error');
        this.ws.onclose = (e) => {
            Utils.log('WebSocket Closed: ' + e.reason, 'warning');
            this.isConnected = false;
            Utils.toggleVoiceIndicator(false);
        };
    }

    handleOpen() {
        Utils.log('Connected to Gemini Live!', 'success');
        this.isConnected = true;

        // Send Initial Setup Message with Voice Config
        const setupMessage = {
            setup: {
                model: CONFIG.LIVE_API.model,
                tools: LIVE_API_TOOLS, // Defined in config.js
                generation_config: {
                    response_modalities: ["AUDIO"],
                    speech_config: {
                        voice_config: {
                            prebuilt_voice_config: {
                                voice_name: "Algenib"
                            }
                        }
                    }
                },
                system_instruction: {
                    parts: [{ text: RECEPTIONIST_PERSONA.systemInstruction }]
                }
            }
        };

        this.ws.send(JSON.stringify(setupMessage));
        Utils.log('Sent setup config');

        // Start Audio Input
        this.startAudioInput();
    }

    async startAudioInput() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000
                }
            });

            this.audioInput = this.audioContext.createMediaStreamSource(stream);
            this.processor = new AudioWorkletNode(this.audioContext, 'pcm-recorder');

            this.processor.port.onmessage = (event) => {
                const float32Data = event.data;
                this.sendAudioChunk(float32Data);
            };

            this.audioInput.connect(this.processor);
            this.processor.connect(this.audioContext.destination); // Keep alive?

            Utils.toggleVoiceIndicator(true);

        } catch (e) {
            Utils.log('Microphone Error: ' + e.message, 'error');
        }
    }

    sendAudioChunk(float32Data) {
        if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) return;

        // Convert Float32 to Int16 for Gemini
        const int16Data = new Int16Array(float32Data.length);
        for (let i = 0; i < float32Data.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Data[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const base64Audio = this.arrayBufferToBase64(int16Data.buffer);

        const msg = {
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: "audio/pcm;rate=16000",
                        data: base64Audio
                    }
                ]
            }
        };

        this.ws.send(JSON.stringify(msg));
    }

    async handleMessage(event) {
        let data;
        if (event.data instanceof Blob) {
            data = JSON.parse(await event.data.text());
        } else {
            data = JSON.parse(event.data);
        }

        // Handle Audio Response
        if (data.serverContent && data.serverContent.modelTurn && data.serverContent.modelTurn.parts) {
            for (const part of data.serverContent.modelTurn.parts) {
                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                    // Play Audio
                    this.pcmStreamer.addPCM16(part.inlineData.data);
                }
            }
        }

        // Handle Turndown? (End of turn)
        if (data.serverContent && data.serverContent.turnComplete) {
            // Log turn complete
        }

        // Handle Tool Calls
        if (data.toolCall) {
            this.handleToolCall(data.toolCall);
        }
    }

    async handleToolCall(toolCall) {
        Utils.log('Tool Call Received: ' + JSON.stringify(toolCall), 'info');

        const functionCalls = toolCall.functionCalls;
        const toolResponses = [];

        for (const call of functionCalls) {
            const result = await this.executeTool(call.name, call.args);
            toolResponses.push({
                name: call.name,
                id: call.id,
                response: { result: result }
            });
        }

        const responseMsg = {
            tool_response: {
                function_responses: toolResponses
            }
        };

        this.ws.send(JSON.stringify(responseMsg));
    }

    async executeTool(name, args) {
        Utils.log(`Executing Tool: ${name}`, 'info');
        try {
            switch (name) {
                case 'save_visitor_info':
                    return await this.toolSaveVisitor(args);
                case 'check_returning_visitor':
                    return await this.toolCheckReturning(args);
                case 'notify_staff':
                    return await this.toolNotifyStaff(args);
                default:
                    return { error: 'Unknown tool' };
            }
        } catch (e) {
            return { error: e.message };
        }
    }

    // --- Tool Implementations ---

    toolSaveVisitor(args) {
        Utils.log('Saving Info: ' + JSON.stringify(args));
        // Update local state if needed for UI
        if (args.phone) {
            const phoneInput = document.getElementById('phoneInput');
            if (phoneInput) phoneInput.value = args.phone;
        }

        const visitor = DB.saveVisitor({
            name: args.name,
            phone: args.phone,
            meetingWith: args.meeting_with
        });

        Utils.showScreen('processingScreen');
        Utils.updateProcessing('Saving...', `Registered ${args.name}`);

        return { status: "success", visitor_id: visitor.id };
    }

    toolCheckReturning(args) {
        const visitor = DB.findByPhone(args.phone);
        if (visitor) {
            return {
                is_returning: true,
                last_visit: visitor.timestamp,
                last_meeting_with: visitor.meetingWith,
                name: visitor.name
            };
        }
        return { is_returning: false };
    }

    async toolNotifyStaff(args) {
        Utils.updateProcessing('Notifying...', `Talking to ${args.staff_name}`);
        await Utils.delay(2000);
        return { status: "notified", message: `${args.staff_name} has been notified.` };
    }

    // --- Helpers ---

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}

const Live = new LiveClient();
