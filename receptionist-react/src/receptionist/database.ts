export interface Visitor {
    id: string;
    name: string;
    phone: string;
    meetingWith: string;
    timestamp: number;
    photo?: string;
    // Intent-based fields
    intent: string;           // e.g., "sales_inquiry", "first_time_visit"
    department: string;       // "Sales" or "Administration"
    purpose?: string;         // Purpose of visit
    company?: string;         // Company name (for deliveries and business visits)
    appointmentTime?: string; // Scheduled appointment time
    referenceId?: string;     // Booking/tracking/reference number
    notes?: string;           // Additional notes
}

export class DatabaseManager {
    private static STORAGE_KEY = 'greenscape_visitors';
    // Constructed URL from User ID
    private static SHEETS_URL = 'https://script.google.com/macros/s/AKfycby-J--AY0IvWYMo_41lep_rikwGvlWM0m5Pf9zwHVg/exec';

    static async saveVisitor(visitor: Omit<Visitor, 'id' | 'timestamp'>): Promise<Visitor> {
        const visitors = this.getAllVisitors();

        // Check if exists (update)
        const existingIndex = visitors.findIndex(v => v.phone === visitor.phone);

        const newVisitor: Visitor = {
            ...visitor,
            id: existingIndex >= 0 ? visitors[existingIndex].id : Date.now().toString(),
            timestamp: Date.now()
        };

        if (existingIndex >= 0) {
            visitors[existingIndex] = newVisitor;
        } else {
            visitors.push(newVisitor);
        }

        this.saveToStorage(visitors);

        // Send to Google Sheets (Fire and Forget or Await)
        try {
            await fetch(this.SHEETS_URL, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: newVisitor.name,
                    phone: newVisitor.phone,
                    meetingWith: newVisitor.meetingWith,
                    intent: newVisitor.intent,
                    department: newVisitor.department,
                    purpose: newVisitor.purpose || '',
                    company: newVisitor.company || '',
                    appointmentTime: newVisitor.appointmentTime || '',
                    referenceId: newVisitor.referenceId || '',
                    notes: newVisitor.notes || ''
                })
            });
            console.log("Sent visitor info with intent data to Sheets");
        } catch (e) {
            console.error("Failed to sync with Sheets", e);
        }

        return newVisitor;
    }

    static findByPhone(phone: string): Visitor | undefined {
        // Sanitize phone input
        const cleanPhone = phone.replace(/\D/g, '');
        const visitors = this.getAllVisitors();
        return visitors.find(v => v.phone.replace(/\D/g, '') === cleanPhone);
    }

    static getAllVisitors(): Visitor[] {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error reading visitor DB', e);
            return [];
        }
    }

    private static saveToStorage(visitors: Visitor[]) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(visitors));
    }
}
