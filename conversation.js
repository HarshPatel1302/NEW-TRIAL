// Conversation Manager - Handles AI conversation using Gemini API

class ConversationManager {
    constructor() {
        this.conversationHistory = [];
        this.currentState = 'idle'; // idle, greeting, collecting_info, processing
        this.visitorInfo = {
            name: null,
            phone: null,
            meetingWith: null,
            photo: null
        };
    }

    /**
     * Initialize conversation
     */
    async init() {
        this.conversationHistory = [];
        this.currentState = 'greeting';
        this.visitorInfo = {
            name: null,
            phone: null,
            meetingWith: null,
            photo: null
        };
    }

    /**
     * Send message to Gemini and get response
     */
    async chat(userMessage) {
        const apiKey = CONFIG.GEMINI_API_KEY;

        if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
            Utils.log('Gemini API key not configured', 'error');
            return this.fallbackResponse(userMessage);
        }

        try {
            Utils.log(`Sending to Gemini: "${userMessage}"`);

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI.model}:generateContent?key=${apiKey}`;

            const requestBody = {
                contents: [
                    {
                        parts: [{ text: this.buildPrompt(userMessage) }]
                    }
                ],
                generationConfig: {
                    temperature: CONFIG.GEMINI.temperature,
                    maxOutputTokens: CONFIG.GEMINI.maxOutputTokens
                },
                systemInstruction: {
                    parts: [{ text: RECEPTIONIST_PERSONA.systemInstruction }]
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            const aiResponse = data.candidates[0].content.parts[0].text.trim();

            // Update conversation history
            this.conversationHistory.push({
                role: 'user',
                content: userMessage
            });
            this.conversationHistory.push({
                role: 'assistant',
                content: aiResponse
            });

            Utils.log(`Gemini response: "${aiResponse}"`, 'success');

            // Extract information from conversation
            this.extractInformation(userMessage, aiResponse);

            return aiResponse;
        } catch (error) {
            Utils.log('Gemini API error: ' + error.message, 'error');
            return this.fallbackResponse(userMessage);
        }
    }

    /**
     * Build prompt with context
     */
    buildPrompt(userMessage) {
        let prompt = '';

        // Add conversation context
        if (this.conversationHistory.length > 0) {
            prompt += 'Previous conversation:\n';
            this.conversationHistory.slice(-6).forEach(msg => {
                prompt += `${msg.role === 'user' ? 'Visitor' : 'John'}: ${msg.content}\n`;
            });
            prompt += '\n';
        }

        // Add current visitor info
        if (this.visitorInfo.name || this.visitorInfo.phone || this.visitorInfo.meetingWith) {
            prompt += 'Current visitor information:\n';
            if (this.visitorInfo.name) prompt += `Name: ${this.visitorInfo.name}\n`;
            if (this.visitorInfo.phone) prompt += `Phone: ${this.visitorInfo.phone}\n`;
            if (this.visitorInfo.meetingWith) prompt += `Meeting with: ${this.visitorInfo.meetingWith}\n`;
            prompt += '\n';
        }

        // Add current message
        prompt += `Visitor: ${userMessage}\n\nJohn:`;

        return prompt;
    }

    /**
     * Extract information from conversation
     */
    extractInformation(userMessage, aiResponse) {
        const lowerMessage = userMessage.toLowerCase();

        // Extract name if not already collected
        if (!this.visitorInfo.name) {
            // Check for name patterns
            if (lowerMessage.includes('my name is') || lowerMessage.includes('i am') ||
                lowerMessage.includes('this is') || lowerMessage.includes("i'm")) {
                const name = Utils.extractName(userMessage);
                if (name && name.length > 2 && name.length < 50) {
                    this.visitorInfo.name = name;
                    Utils.log(`Name extracted: ${name}`, 'success');
                }
            }
        }

        // Extract meeting person
        if (!this.visitorInfo.meetingWith) {
            const meetRegex = /(?:meet|see|visit|appointment with)\s+([a-z\s]+)/i;
            const match = userMessage.match(meetRegex);

            if (match) {
                const personName = Utils.extractName(match[1]);
                this.visitorInfo.meetingWith = personName;
                Utils.log(`Meeting with extracted: ${personName}`, 'success');
            } else {
                // Check if message contains staff names
                for (const staff of CONFIG.OFFICE_STAFF) {
                    if (Utils.normalizeName(userMessage).includes(Utils.normalizeName(staff))) {
                        this.visitorInfo.meetingWith = staff;
                        Utils.log(`Meeting with extracted: ${staff}`, 'success');
                        break;
                    }
                }
            }
        }
    }

    /**
     * Fallback response when API is not available
     */
    fallbackResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();

        // Greeting responses
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
            return RECEPTIONIST_PERSONA.greeting;
        }

        // Company info
        if (lowerMessage.includes('greenscape') || lowerMessage.includes('company') ||
            lowerMessage.includes('what do you do')) {
            return `${CONFIG.COMPANY_INFO.description} We specialize in premium apartments, luxury villas, and commercial IT/ITES parks. How may I assist you today?`;
        }

        // Meeting request
        if (lowerMessage.includes('meet') || lowerMessage.includes('appointment')) {
            if (!this.visitorInfo.name) {
                return "I'd be happy to help you with that. May I have your name, please?";
            } else if (!this.visitorInfo.meetingWith) {
                return "Who would you like to meet today?";
            }
        }

        // Default
        return "I understand. Could you please tell me who you'd like to meet today?";
    }

    /**
     * Get visitor information
     */
    getVisitorInfo() {
        return { ...this.visitorInfo };
    }

    /**
     * Set visitor information
     */
    setVisitorInfo(key, value) {
        if (this.visitorInfo.hasOwnProperty(key)) {
            this.visitorInfo[key] = value;
            Utils.log(`Visitor info updated: ${key} = ${value}`);
        }
    }

    /**
     * Check if all required info is collected
     */
    isInfoComplete() {
        return !!(this.visitorInfo.name &&
            this.visitorInfo.phone &&
            this.visitorInfo.meetingWith);
    }

    /**
     * Reset conversation
     */
    reset() {
        this.conversationHistory = [];
        this.currentState = 'idle';
        this.visitorInfo = {
            name: null,
            phone: null,
            meetingWith: null,
            photo: null
        };
        Utils.log('Conversation reset');
    }

    /**
     * Get conversation summary
     */
    getSummary() {
        return {
            messageCount: this.conversationHistory.length,
            state: this.currentState,
            visitorInfo: this.getVisitorInfo(),
            isComplete: this.isInfoComplete()
        };
    }
}

// Create global conversation instance
const Conversation = new ConversationManager();
