import { Tool } from "@google/genai";

export const TOOLS: Tool[] = [
    {
        functionDeclarations: [
            {
                name: "classify_intent",
                description: "Classify the visitor's intent based on what they said. Use this when you first understand what the visitor needs.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        visitor_statement: { type: "STRING", description: "What the visitor said about their purpose" },
                        detected_intent: {
                            type: "STRING",
                            description: "The intent you detected: first_time_visit, returning_visit, sales_inquiry, admin_support, delivery, appointment, site_walkthrough, meet_person, approval_required, or interview"
                        }
                    },
                    required: ["visitor_statement", "detected_intent"]
                } as any
            },
            {
                name: "collect_slot_value",
                description: "Record a slot value that was collected from the visitor during the conversation, such as visitor_name, where_to_go, person_to_meet, came_from, purpose, or department.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        slot_name: { type: "STRING", description: "The name of the slot (e.g., visitor_name, purpose, department)" },
                        value: { type: "STRING", description: "The value provided by the visitor" }
                    },
                    required: ["slot_name", "value"]
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
                        where_to_go: { type: "STRING", description: "Where in Greenscape the visitor wants to go (tower/office/unit/company)" },
                        meeting_with: { type: "STRING", description: "Name of the person they want to meet" },
                        came_from: { type: "STRING", description: "Where the visitor came from (area/company/source)" },
                        intent: { type: "STRING", description: "The classified intent" },
                        department: { type: "STRING", description: "Sales or Administration" },
                        purpose: { type: "STRING", description: "Purpose of visit" },
                        company: { type: "STRING", description: "Company/source details if visitor shares where they came from" },
                        appointment_time: { type: "STRING", description: "Appointment time (optional)" },
                        reference_id: { type: "STRING", description: "Reference/booking/tracking number (optional)" },
                        notes: { type: "STRING", description: "Additional notes (optional)" }
                    },
                    required: ["name", "phone", "came_from", "intent", "department"]
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
                name: "check_returning_visitor",
                description: "Check if a visitor has visited before by their phone number.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        phone: { type: "STRING", description: "Visitor's phone number" }
                    },
                    required: ["phone"]
                } as any
            },
            {
                name: "route_to_department",
                description: "Route the visitor to the specified department (Sales or Administration).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        department: { type: "STRING", description: "Sales or Administrator" },
                        intent: { type: "STRING", description: "The visitor's intent" },
                        visitor_name: { type: "STRING", description: "Visitor's name" }
                    },
                    required: ["department", "intent", "visitor_name"]
                } as any
            },
            {
                name: "request_approval",
                description: "Request approval from Admin/Security for non-delivery visitor entry. Waits for yes/no response.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        visitor_name: { type: "STRING", description: "Visitor's name" },
                        purpose: { type: "STRING", description: "Purpose of visit" },
                        department: { type: "STRING", description: "Requested department" }
                    },
                    required: ["visitor_name", "purpose", "department"]
                } as any
            },
            {
                name: "request_delivery_approval",
                description: "Request delivery approval decision for a delivery partner after photo capture. Decision is one of: allow, decline, lobby_drop.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        delivery_company: { type: "STRING", description: "Delivery platform/company (e.g., Flipkart, Amazon)" },
                        recipient_company: { type: "STRING", description: "Which company/office in the building the parcel is for" },
                        recipient_name: { type: "STRING", description: "Person in the company who should receive the parcel" },
                        tracking_number: { type: "STRING", description: "Tracking/parcel number (optional)" },
                        parcel_description: { type: "STRING", description: "Short description of parcel (optional)" },
                        delivery_person_name: { type: "STRING", description: "Delivery person's name (optional)" }
                    },
                    required: ["delivery_company", "recipient_company", "recipient_name"]
                } as any
            },
            {
                name: "check_staff_availability",
                description: "Check if a specific staff member is available.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        staff_name: { type: "STRING", description: "Name of the staff member" }
                    },
                    required: ["staff_name"]
                } as any
            },
            {
                name: "notify_staff",
                description: "Notify a staff member that a visitor has arrived.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        staff_name: { type: "STRING", description: "Name of the staff member (Archana or Ravindra)" },
                        visitor_name: { type: "STRING", description: "Name of the visitor" }
                    },
                    required: ["staff_name", "visitor_name"]
                } as any
            },
            {
                name: "log_delivery",
                description: "Log a courier or vendor delivery.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        company: { type: "STRING", description: "Courier or vendor company name" },
                        department: { type: "STRING", description: "Sales or Administration" },
                        tracking_number: { type: "STRING", description: "Tracking or parcel number (optional)" },
                        description: { type: "STRING", description: "What is being delivered (optional)" },
                        recipient_company: { type: "STRING", description: "Which company/office in the building the parcel is for (optional)" },
                        recipient: { type: "STRING", description: "Name of the recipient (optional)" },
                        approval_decision: { type: "STRING", description: "allow, decline, or lobby_drop (optional)" }
                    },
                    required: ["company", "department"]
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
