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
                description: "Record ONE field the visitor JUST provided. Call ONLY when the visitor has just answered. Never call before asking. Never ask again after status:success for that slot. Use the next_slot in the response to know what to ask next.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        slot_name: {
                            type: "STRING",
                            description:
                                "Use one of: visitor_name, phone, came_from, company_to_visit, person_in_company, meeting_with, delivery_company, recipient_company, recipient_name."
                        },
                        value: { type: "STRING", description: "The value provided by the visitor" }
                    },
                    required: ["slot_name", "value"]
                } as any
            },
            {
                name: "collect_slots_batch",
                description: "When the visitor provides MULTIPLE fields in one sentence (e.g. 'My name is Harsh Patel and I want to meet Futurescape and Mihir Jadhav'), extract ALL at once. Pass slots as JSON object: { visitor_name: 'Harsh Patel', company_to_visit: 'Futurescape', person_in_company: 'Mihir Jadhav' }. Only include slots the visitor clearly provided. Accept any person name as free text; never reject.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        slots: {
                            type: "OBJECT",
                            description: "Object of slot_name -> value. Keys: visitor_name, phone, came_from, company_to_visit, person_in_company, delivery_company, recipient_company, recipient_name."
                        }
                    },
                    required: ["slots"]
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
                        meeting_with: { type: "STRING", description: "Company - Person or unit number. Derived from company_to_visit and person_in_company." },
                        came_from: { type: "STRING", description: "Where visitor came from (e.g. Walk-in, Shadowfax)" },
                        company_to_visit: { type: "STRING", description: "Which company in the building they want to visit" },
                        person_in_company: { type: "STRING", description: "Optional: which person in that company they want to meet" },
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
                name: "check_returning_visitor",
                description: "Search for an existing visitor by phone. Call in the SAME turn as collect_slot_value(phone, value) right after the visitor gives their phone. If is_returning=true, use the returned name and skip asking for name. If is_returning=false, ask for name next. Never ask for phone again.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        phone: { type: "STRING", description: "The visitor's phone number (digits only)" }
                    },
                    required: ["phone"]
                } as any
            },
            {
                name: "capture_photo",
                description: "After all required details collected, say 'Stand still 5 seconds' then call this. Photo captures in background. Immediately call save_visitor_info next - it will wait for the photo.",
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
