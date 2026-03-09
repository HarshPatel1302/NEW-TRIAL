import { Tool } from "@google/genai";

export const TOOLS: Tool[] = [
    {
        functionDeclarations: [
            {
                name: "classify_intent",
                description: "Classify the visitor into one of these intents: meet_person, delivery, or info.",
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
                description: "Record one collected field. For visitor flow use visitor_name, phone, came_from, meeting_with. For delivery flow use visitor_name, delivery_company, recipient_company, recipient_name.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        slot_name: {
                            type: "STRING",
                            description:
                                "Use one of: visitor_name, phone, came_from, meeting_with, delivery_company, recipient_company, recipient_name."
                        },
                        value: { type: "STRING", description: "The value provided by the visitor" }
                    },
                    required: ["slot_name", "value"]
                } as any
            },
            {
                name: "check_returning_visitor",
                description:
                    "Check visitor by phone to enrich/verify records. If found and visitor_name is missing, reuse returned name.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        phone: {
                            type: "STRING",
                            description: "Visitor phone number (10+ digits preferred)."
                        }
                    },
                    required: ["phone"]
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
                            description: "Name of the person they want to meet, or a floor/flat/office number like 1904"
                        },
                        came_from: { type: "STRING", description: "Optional source/company if available" },
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
                    required: ["name", "phone", "meeting_with"]
                } as any
            },
            {
                name: "capture_photo",
                description: "After collecting required details for the active flow, ask the visitor to stand still for 5 seconds and then capture a JPG photo.",
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
