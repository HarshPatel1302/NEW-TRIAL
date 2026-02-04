import { Tool } from "@google/genai";

export const TOOLS: Tool[] = [
    {
        functionDeclarations: [
            {
                name: "save_visitor_info",
                description: "Save the current visitor's information to the database.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING", description: "Visitor's full name" },
                        phone: { type: "STRING", description: "Visitor's phone number" },
                        meeting_with: { type: "STRING", description: "Name of the person they want to meet" }
                    },
                    required: ["name", "phone", "meeting_with"]
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
                name: "notify_staff",
                description: "Notify a staff member that a visitor has arrived.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        staff_name: { type: "STRING", description: "Name of the staff member (Archana or Rabindra)" },
                        visitor_name: { type: "STRING", description: "Name of the visitor" }
                    },
                    required: ["staff_name", "visitor_name"]
                } as any
            }
        ]
    }
];
