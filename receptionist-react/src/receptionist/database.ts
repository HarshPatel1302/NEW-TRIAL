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

type VisitorInput = Omit<Visitor, 'id' | 'timestamp'>;

type SessionPayload = {
    kioskId?: string;
    intent?: string;
    visitorId?: string;
};

type SessionUpdatePayload = {
    visitorId?: string;
    intent?: string;
    status?: string;
    summary?: string;
};

type SessionEventPayload = {
    role: string;
    eventType: string;
    content?: string;
    rawPayload?: unknown;
};

export class DatabaseManager {
    private static STORAGE_KEY = 'greenscape_visitors';
    private static API_BASE = process.env.REACT_APP_RECEPTIONIST_API_URL || 'http://localhost:5000/api';
    private static REQUEST_TIMEOUT_MS = 7000;

    static async saveVisitor(visitor: VisitorInput, options: { sessionId?: string | null } = {}): Promise<Visitor> {
        const localRecord = this.upsertLocalVisitor(visitor);

        try {
            const response = await this.apiFetch<{ visitor?: any }>('/visitors/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...visitor,
                    sessionId: options.sessionId ?? null,
                }),
            });

            if (!response?.visitor) {
                return localRecord;
            }

            const normalized = this.normalizeVisitorRecord(response.visitor);
            this.upsertLocalVisitor(
                {
                    name: normalized.name,
                    phone: normalized.phone,
                    meetingWith: normalized.meetingWith,
                    intent: normalized.intent,
                    department: normalized.department,
                    purpose: normalized.purpose,
                    company: normalized.company,
                    appointmentTime: normalized.appointmentTime,
                    referenceId: normalized.referenceId,
                    notes: normalized.notes,
                    photo: normalized.photo,
                },
                { id: normalized.id, timestamp: normalized.timestamp }
            );
            return normalized;
        } catch (error) {
            console.warn('Backend saveVisitor failed, using local fallback.', error);
            return localRecord;
        }
    }

    static async findByPhone(phone: string): Promise<Visitor | undefined> {
        const cleanPhone = (phone || '').replace(/\D/g, '');
        if (!cleanPhone) {
            return undefined;
        }

        try {
            const response = await this.apiFetch<{ visitor: any | null }>(
                `/visitors/search?phone=${encodeURIComponent(cleanPhone)}`
            );

            if (!response?.visitor) {
                return undefined;
            }

            const normalized = this.normalizeVisitorRecord(response.visitor);
            this.upsertLocalVisitor(
                {
                    name: normalized.name,
                    phone: normalized.phone,
                    meetingWith: normalized.meetingWith,
                    intent: normalized.intent,
                    department: normalized.department,
                    purpose: normalized.purpose,
                    company: normalized.company,
                    appointmentTime: normalized.appointmentTime,
                    referenceId: normalized.referenceId,
                    notes: normalized.notes,
                    photo: normalized.photo,
                },
                { id: normalized.id, timestamp: normalized.timestamp }
            );
            return normalized;
        } catch (error) {
            console.warn('Backend findByPhone failed, reading local fallback.', error);
            const visitors = this.getAllVisitors();
            return visitors.find(v => v.phone.replace(/\D/g, '') === cleanPhone);
        }
    }

    static async startSession(payload: SessionPayload = {}): Promise<string | null> {
        try {
            const response = await this.apiFetch<{ session?: { id: number | string } }>('/sessions/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response?.session?.id) return null;
            return String(response.session.id);
        } catch (error) {
            console.warn('startSession failed', error);
            return null;
        }
    }

    static async updateSession(sessionId: string, payload: SessionUpdatePayload): Promise<void> {
        if (!sessionId) return;
        try {
            await this.apiFetch(`/sessions/${encodeURIComponent(sessionId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            console.warn('updateSession failed', error);
        }
    }

    static async endSession(
        sessionId: string,
        payload: { status?: string; summary?: string } = {}
    ): Promise<void> {
        if (!sessionId) return;
        try {
            await this.apiFetch(`/sessions/${encodeURIComponent(sessionId)}/end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            console.warn('endSession failed', error);
        }
    }

    static async logSessionEvent(sessionId: string, payload: SessionEventPayload): Promise<void> {
        if (!sessionId) return;
        try {
            await this.apiFetch(`/sessions/${encodeURIComponent(sessionId)}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            console.warn('logSessionEvent failed', error);
        }
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

    private static async apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
        const controller = new AbortController();
        const timeout: ReturnType<typeof setTimeout> = setTimeout(
            () => controller.abort(),
            this.REQUEST_TIMEOUT_MS
        );

        try {
            const response = await fetch(`${this.API_BASE}${path}`, {
                ...init,
                signal: controller.signal,
            });

            const contentType = response.headers.get('content-type') || '';
            const payload = contentType.includes('application/json')
                ? await response.json()
                : await response.text();

            if (!response.ok) {
                throw new Error(
                    typeof payload === 'string'
                        ? payload
                        : payload?.error || `HTTP ${response.status}`
                );
            }

            return payload as T;
        } finally {
            clearTimeout(timeout);
        }
    }

    private static upsertLocalVisitor(
        visitor: VisitorInput,
        options: { id?: string; timestamp?: number } = {}
    ): Visitor {
        const visitors = this.getAllVisitors();
        const cleanPhone = (visitor.phone || '').replace(/\D/g, '');

        let existingIndex = -1;
        if (cleanPhone) {
            existingIndex = visitors.findIndex(v => v.phone.replace(/\D/g, '') === cleanPhone);
        } else {
            existingIndex = visitors.findIndex(
                v => v.name === visitor.name && v.meetingWith === visitor.meetingWith
            );
        }

        const newVisitor: Visitor = {
            ...visitor,
            id: options.id || (existingIndex >= 0 ? visitors[existingIndex].id : Date.now().toString()),
            timestamp: options.timestamp || Date.now(),
        };

        if (existingIndex >= 0) {
            visitors[existingIndex] = newVisitor;
        } else {
            visitors.push(newVisitor);
        }

        this.saveToStorage(visitors);
        return newVisitor;
    }

    private static normalizeVisitorRecord(raw: any): Visitor {
        const timestampCandidate =
            raw?.timestamp ??
            raw?.updatedAt ??
            raw?.updated_at ??
            raw?.createdAt ??
            raw?.created_at;
        const parsedTimestamp =
            typeof timestampCandidate === 'number'
                ? timestampCandidate
                : timestampCandidate
                    ? new Date(timestampCandidate).getTime()
                    : Date.now();

        return {
            id: String(raw?.id ?? Date.now()),
            name: String(raw?.name ?? ''),
            phone: String(raw?.phone ?? ''),
            meetingWith: String(raw?.meetingWith ?? raw?.meeting_with ?? ''),
            timestamp: Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now(),
            photo: raw?.photo ? String(raw.photo) : undefined,
            intent: String(raw?.intent ?? 'unknown'),
            department: String(raw?.department ?? ''),
            purpose: raw?.purpose ? String(raw.purpose) : undefined,
            company: raw?.company ? String(raw.company) : undefined,
            appointmentTime: raw?.appointmentTime
                ? String(raw.appointmentTime)
                : raw?.appointment_time
                    ? String(raw.appointment_time)
                    : undefined,
            referenceId: raw?.referenceId
                ? String(raw.referenceId)
                : raw?.reference_id
                    ? String(raw.reference_id)
                    : undefined,
            notes: raw?.notes ? String(raw.notes) : undefined,
        };
    }

    private static saveToStorage(visitors: Visitor[]) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(visitors));
    }
}
