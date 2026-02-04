export interface Visitor {
    id: string;
    name: string;
    phone: string;
    meetingWith: string;
    timestamp: number;
    photo?: string;
}

export class DatabaseManager {
    private static STORAGE_KEY = 'greenscape_visitors';

    static saveVisitor(visitor: Omit<Visitor, 'id' | 'timestamp'>): Visitor {
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
