export interface IntentSlotConfig {
    required_slots: string[];
    optional_slots: string[];
    slot_prompts: Record<string, string>;
    completion_actions: {
        route_to?: string;
        notify?: string;
        request_phone_keypad?: boolean;
        request_approval_yes_no?: boolean;
        check_availability?: string;
    };
}

export interface Intent {
    name: string;
    description: string;
    config: IntentSlotConfig;
}

export const INTENTS: Record<string, Intent> = {
    first_time_visit: {
        name: "first_time_visit",
        description: "Visitor is new to the site office; needs guided check-in and routing.",
        config: {
            required_slots: ["visitor_name", "purpose", "department"],
            optional_slots: ["person_to_meet", "appointment_time", "company", "reference_id", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your full name.",
                purpose: "What is the purpose of your visit?",
                department: "Are you here for Sales or Administration?",
                person_to_meet: "Whom would you like to meet?",
                appointment_time: "Do you have an appointment time?",
                company: "Which company are you from?",
                reference_id: "Do you have a booking or reference number?",
                notes: "Anything else I should mention to the team?"
            },
            completion_actions: {
                route_to: "{department}",
                notify: "{department}",
                request_phone_keypad: true
            }
        }
    },

    returning_visit: {
        name: "returning_visit",
        description: "Visitor has visited before; faster check-in and routing.",
        config: {
            required_slots: ["visitor_name", "department"],
            optional_slots: ["purpose", "person_to_meet", "appointment_time", "reference_id", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your name.",
                department: "Are you meeting Sales or Administration today?",
                purpose: "What is the purpose of your visit today?",
                person_to_meet: "Who are you meeting?",
                appointment_time: "Do you have an appointment time?",
                reference_id: "Do you have a booking or reference number?",
                notes: "Any message I should pass along?"
            },
            completion_actions: {
                route_to: "{department}",
                notify: "{department}",
                request_phone_keypad: true
            }
        }
    },

    sales_inquiry: {
        name: "sales_inquiry",
        description: "Visitor wants project information, pricing, availability, or sales discussion.",
        config: {
            required_slots: ["visitor_name", "purpose"],
            optional_slots: ["person_to_meet", "appointment_time", "company", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your full name.",
                purpose: "What would you like to know about the project?",
                person_to_meet: "Are you meeting a specific Sales person?",
                appointment_time: "Do you have an appointment time?",
                company: "Which company are you from?",
                notes: "Any specific requirement I should share with Sales?"
            },
            completion_actions: {
                route_to: "Sales",
                notify: "Sales",
                request_phone_keypad: true
            }
        }
    },

    admin_support: {
        name: "admin_support",
        description: "Visitor needs administrative help (documents, payments, receipts, complaints, coordination).",
        config: {
            required_slots: ["visitor_name", "purpose"],
            optional_slots: ["reference_id", "person_to_meet", "appointment_time", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your full name.",
                purpose: "What do you need help with from Administration?",
                reference_id: "Do you have a booking or reference number?",
                person_to_meet: "Are you meeting someone specific in Admin?",
                appointment_time: "Do you have an appointment time?",
                notes: "Any details I should include for Admin?"
            },
            completion_actions: {
                route_to: "Administrator",
                notify: "Administrator",
                request_phone_keypad: true
            }
        }
    },

    delivery: {
        name: "delivery",
        description: "Courier/vendor delivery; needs logging and notifying Admin/recipient.",
        config: {
            required_slots: ["company", "department"],
            optional_slots: ["visitor_name", "person_to_meet", "reference_id", "notes"],
            slot_prompts: {
                company: "Which courier or company is this from?",
                department: "Is this for Sales or Administration?",
                visitor_name: "Please tell me the delivery person's name.",
                person_to_meet: "Who is the recipient?",
                reference_id: "What is the tracking or parcel number?",
                notes: "What is being delivered?"
            },
            completion_actions: {
                route_to: "{department}",
                notify: "{department}",
                request_phone_keypad: false
            }
        }
    },

    appointment: {
        name: "appointment",
        description: "Visitor has a scheduled meeting.",
        config: {
            required_slots: ["visitor_name", "appointment_time", "department"],
            optional_slots: ["person_to_meet", "purpose", "reference_id", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your name.",
                appointment_time: "What is your appointment time?",
                department: "Is your appointment with Sales or Administration?",
                person_to_meet: "Whom are you meeting?",
                purpose: "What is the purpose of the appointment?",
                reference_id: "Do you have a booking or reference number?",
                notes: "Anything I should add for the team?"
            },
            completion_actions: {
                route_to: "{department}",
                notify: "{department}",
                request_phone_keypad: true
            }
        }
    },

    site_walkthrough: {
        name: "site_walkthrough",
        description: "Visitor wants a site visit/walkthrough guided by Sales.",
        config: {
            required_slots: ["visitor_name", "purpose"],
            optional_slots: ["appointment_time", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your full name.",
                purpose: "Is this for a project walkthrough today?",
                appointment_time: "Do you have an appointment time for the walkthrough?",
                notes: "Any specific area or unit type you want to see?"
            },
            completion_actions: {
                route_to: "Sales",
                notify: "Sales",
                request_phone_keypad: true
            }
        }
    },

    meet_person: {
        name: "meet_person",
        description: "Visitor wants to meet a specific person (Sales/Admin staff).",
        config: {
            required_slots: ["visitor_name", "person_to_meet"],
            optional_slots: ["department", "purpose", "appointment_time", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your full name.",
                person_to_meet: "Whom would you like to meet?",
                department: "Is this person from Sales or Administration?",
                purpose: "What is the purpose of your visit?",
                appointment_time: "Do you have an appointment time?",
                notes: "Any message I should pass to them?"
            },
            completion_actions: {
                check_availability: "{person_to_meet}",
                route_to: "{department}",
                notify: "{person_to_meet}",
                request_phone_keypad: true
            }
        }
    },

    approval_required: {
        name: "approval_required",
        description: "Entry requires approval (Admin/Security yes/no) before allowing access.",
        config: {
            required_slots: ["visitor_name", "purpose", "department"],
            optional_slots: ["person_to_meet", "reference_id", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your full name.",
                purpose: "What is the purpose of your visit?",
                department: "Are you here for Sales or Administration?",
                person_to_meet: "Whom are you meeting?",
                reference_id: "Do you have a booking or reference number?",
                notes: "Any details for approval?"
            },
            completion_actions: {
                request_phone_keypad: true,
                request_approval_yes_no: true,
                route_to: "{department}",
                notify: "{department}"
            }
        }
    },

    interview: {
        name: "interview",
        description: "Candidate arrives for interview or joining formalities (handled by Admin).",
        config: {
            required_slots: ["visitor_name", "purpose"],
            optional_slots: ["appointment_time", "reference_id", "notes"],
            slot_prompts: {
                visitor_name: "Please tell me your full name.",
                purpose: "Is this for an interview or joining formalities?",
                appointment_time: "What is your interview time?",
                reference_id: "Do you have an email or reference ID?",
                notes: "Which role are you interviewing for?"
            },
            completion_actions: {
                route_to: "Administrator",
                notify: "Administrator",
                request_phone_keypad: true
            }
        }
    }
};

// Helper function to get intent by name
export function getIntent(intentName: string): Intent | undefined {
    return INTENTS[intentName];
}

// Helper function to get all intent names
export function getAllIntentNames(): string[] {
    return Object.keys(INTENTS);
}
