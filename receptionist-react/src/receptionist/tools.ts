import { Tool } from "@google/genai";

export const TOOLS: Tool[] = [
    {
        functionDeclarations: [
            {
                name: "classify_intent",
                description:
                    "REQUIRED when purpose is ambiguous. Classify the visitor into: meet_person, delivery, or info. Call before branch-specific questions if you are not certain.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        visitor_statement: { type: "STRING", description: "What the visitor said about their purpose" },
                        detected_intent: {
                            type: "STRING",
                            description: "Detected intent: meet_person, delivery, or info"
                        }
                    },
                    required: ["visitor_statement", "detected_intent"]
                } as any
            },
            {
                name: "collect_slot_value",
                description:
                    "Call every time the user provides a slot value. Record one field per call. Visitor flow order: phone, then visitor_name, then came_from, then visit_company, then optional meeting_with (if unknown, call meeting_with with a short phrase like \"don't know\" — do not ask yes/no). Delivery: visitor_name, delivery_company, recipient_company, recipient_name. Obey KIOSK_STATE_JSON next_required_slot when it disagrees with your guess. If the user gave multiple values in one utterance, call this tool once per slot (same turn when possible).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        slot_name: {
                            type: "STRING",
                            description:
                                "visitor_name | phone | came_from | visit_company | delivery_company | recipient_company | recipient_name"
                        },
                        value: {
                            type: "STRING",
                            description:
                                "Use the visitor's exact words for names, company, and place (no paraphrasing). For phone, use the digits as spoken or written.",
                        }
                    },
                    required: ["slot_name", "value"]
                } as any
            },
            {
                name: "request_delivery_approval",
                description:
                    "Request delivery decision after collecting delivery details and capturing photo. Current test response should guide to keep parcel at lobby.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        delivery_company: {
                            type: "STRING",
                            description: "Delivery partner company (e.g., Amazon, Blue Dart)."
                        },
                        recipient_company: {
                            type: "STRING",
                            description: "Company the parcel is intended for."
                        },
                        recipient_name: {
                            type: "STRING",
                            description: "Person in the recipient company who should receive the parcel."
                        },
                        delivery_person_name: {
                            type: "STRING",
                            description: "Name of the delivery person."
                        },
                        tracking_number: { type: "STRING", description: "Optional parcel tracking id." },
                        parcel_description: { type: "STRING", description: "Optional parcel details." }
                    },
                    required: ["delivery_company", "recipient_company", "recipient_name", "delivery_person_name"]
                } as any
            },
            {
                name: "save_visitor_info",
                description: "Save the complete visitor's information to the database after all required slots are collected and a visitor photo has been captured.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING", description: "Visitor's full name" },
                        phone: { type: "STRING", description: "Visitor's phone number" },
                        meeting_with: {
                            type: "STRING",
                            description:
                                "Optional person name to meet, if provided by the visitor",
                        },
                        came_from: { type: "STRING", description: "Where the visitor is coming from (employer, city, etc.)" },
                        visit_company: {
                            type: "STRING",
                            description: "Company or office in this building they want to meet (e.g. Futurescape)",
                        },
                        intent: { type: "STRING", description: "Optional classified intent" },
                        department: { type: "STRING", description: "Optional internal field" },
                        purpose: { type: "STRING", description: "Optional purpose field" },
                        company: { type: "STRING", description: "Optional company/source if shared" },
                        delivery_company: { type: "STRING", description: "Optional delivery partner company" },
                        recipient_company: { type: "STRING", description: "Optional recipient company for delivery" },
                        recipient_name: { type: "STRING", description: "Optional recipient person for delivery" },
                        appointment_time: { type: "STRING", description: "Appointment time (optional)" },
                        reference_id: { type: "STRING", description: "Reference/booking/tracking number (optional)" },
                        notes: { type: "STRING", description: "Additional notes (optional)" },
                        approval_decision: { type: "STRING", description: "Optional approval decision" },
                        approval_status: { type: "STRING", description: "Optional approval status" }
                    },
                    required: ["name", "phone"]
                } as any
            },
            {
                name: "capture_photo",
                description:
                    "After all required details for the flow are collected, say in your receptionist voice exactly: \"Please wait 5 seconds while I capture your photo.\" Then call this tool immediately (same turn when possible). The kiosk opens the camera, waits, and saves a JPEG. Only if this tool returns status success may you say the photo was taken. If status is error, ask the visitor to allow camera permission and call capture_photo again. Do not use browser text-to-speech.",
                parameters: {
                    type: "OBJECT",
                    properties: {},
                } as any
            },
            {
                name: "end_interaction",
                description: "Call this tool to end the conversation and reset the kiosk interface.",
                parameters: {
                    type: "OBJECT",
                    properties: {},
                } as any
            }
        ]
    }
];
