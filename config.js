// Configuration file for Virtual Receptionist
const CONFIG = {
    // API Keys - REPLACE WITH YOUR ACTUAL KEYS
    ELEVENLABS_API_KEY: 'YOUR_ELEVENLABS_API_KEY_HERE', // Kept for fallback/legacy
    GEMINI_API_KEY: 'AIzaSyCr6b4kSBpnBkBKsLILonn1XDIVS5FPEBc', // User provided key

    // Live API Configuration
    LIVE_API: {
        url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
        // Updated model as per user request
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025'
    },

    // ElevenLabs Configuration (Fallback or specific usage)
    ELEVENLABS: {
        voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam voice (similar to Eric)
        modelId: 'eleven_turbo_v2_5',
        outputFormat: 'mp3_44100_128',
        optimizeStreamingLatency: 3,
        stability: 0.5,
        similarityBoost: 0.75
    },

    // Gemini Configuration (Legacy REST)
    GEMINI: {
        model: 'gemini-2.0-flash-exp',
        temperature: 0.7,
        maxOutputTokens: 500
    },

    // Office Staff
    OFFICE_STAFF: ['Archana', 'Rabindra'],

    // Company Information
    COMPANY_INFO: {
        name: 'Greenscape Group',
        description: 'Greenscape Group is a premium real-estate development company headquartered in Vashi, Navi Mumbai, building residential and commercial projects with a focus on sustainability, luxury, and modern design.',
        details: 'Greenscape Group is a premium real-estate developer based in Vashi, Navi Mumbai, known for an artistic approach to construction. Their portfolio includes premium apartments, luxury villas, and commercial business destinations such as IT/ITES parks.',
        projects: [
            'Premium apartments and fine residences',
            'Luxury villas',
            'Commercial business destination projects, including IT/ITES parks (e.g., Cyber One, Cyber Works, Cyber Code)',
            'Cyber Square - an ongoing commercial project in Nerul, a 26-storey commercial development near the Mumbai–Pune Expressway and Sion–Panvel Highway, with MahaRERA number P51700035100',
            'Other projects: Meraki Life, Cyber One, The Residence, Cyber Works, Cyber Code, CBD 614, Eternia'
        ]
    },

    // Timing Configuration
    TIMINGS: {
        greetingDelay: 1000,
        listeningTimeout: 8000,
        processingDelay: 2000,
        approvalWaitTime: 15000,
        sessionTimeout: 300000 // 5 minutes
    },

    // Speech Recognition
    SPEECH: {
        language: 'en-IN',
        continuous: false,
        interimResults: false,
        maxAlternatives: 3
    }
};

// Virtual Receptionist Persona
const RECEPTIONIST_PERSONA = {
    name: 'John',
    role: 'Virtual Receptionist',
    greeting: `Hello! I'm John, the virtual receptionist for Greenscape Group. Welcome to our office. How may I assist you today?`,

    // System instruction for Gemini Live
    systemInstruction: `You are John, a professional and friendly virtual receptionist for Greenscape Group, a premium real-estate development company in Vashi, Navi Mumbai.

PERSONALITY:
- Professional, warm, and welcoming
- Concise and to-the-point (keep responses under 2-3 sentences)
- Polite and respectful
- Helpful but not overly talkative

YOUR RESPONSIBILITIES:
1. Greet visitors warmly if you haven't already.
2. Collect visitor information: name, phone number, and who they want to meet.
3. Answer questions about Greenscape Group (ONLY when asked).
4. Facilitate meetings with office staff (Archana or Rabindra).

TOOLS:
You have access to tools to help you:
- save_visitor_info(name, phone, meeting_with): Call this when you have collected all three pieces of information.
- check_returning_visitor(phone): Call this when you get a phone number to check if they have visited before.
- notify_staff(staff_name, visitor_name): Call this after confirming the meeting.

CONVERSATION FLOW:
1. If visitor asks about Greenscape: Provide brief information from company knowledge base.
2. If visitor wants to meet someone: 
   - Ask for their name.
   - Ask for their phone number.
   - Ask who they want to meet.
   - Once you have the phone number, use 'check_returning_visitor' to see if they are returning.
   - If new or info updated, use 'save_visitor_info'.
   - Finally, use 'notify_staff' to announce the visitor.

IMPORTANT RULES:
- Keep responses SHORT and NATURAL.
- Do NOT repeat information unnecessarily.
- Do NOT ask questions you already have answers to.
- Do NOT talk about yourself unless asked.
- ONLY provide company information when specifically asked.
- Be conversational, not robotic.

COMPANY KNOWLEDGE BASE:
${CONFIG.COMPANY_INFO.description}

Projects:
${CONFIG.COMPANY_INFO.projects.join('\n')}

Remember: Be helpful, be brief, be professional.`
};

// Tool Definitions for Live API
const LIVE_API_TOOLS = [
    {
        function_declarations: [
            {
                name: "save_visitor_info",
                description: "Save the current visitor's information to the database.",
                parameters: {
                    type: "object",
                    properties: {
                        name: { type: "string", description: "Visitor's full name" },
                        phone: { type: "string", description: "Visitor's phone number" },
                        meeting_with: { type: "string", description: "Name of the person they want to meet" }
                    },
                    required: ["name", "phone", "meeting_with"]
                }
            },
            {
                name: "check_returning_visitor",
                description: "Check if a visitor has visited before by their phone number.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "Visitor's phone number" }
                    },
                    required: ["phone"]
                }
            },
            {
                name: "notify_staff",
                description: "Notify a staff member that a visitor has arrived.",
                parameters: {
                    type: "object",
                    properties: {
                        staff_name: { type: "string", description: "Name of the staff member (Archana or Rabindra)" },
                        visitor_name: { type: "string", description: "Name of the visitor" }
                    },
                    required: ["staff_name", "visitor_name"]
                }
            }
        ]
    }
];

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONFIG, RECEPTIONIST_PERSONA, LIVE_API_TOOLS };
}
