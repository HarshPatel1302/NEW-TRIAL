CREATE TABLE IF NOT EXISTS visitors (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    normalized_phone TEXT,
    meeting_with TEXT NOT NULL DEFAULT '',
    intent TEXT NOT NULL DEFAULT 'unknown',
    department TEXT NOT NULL DEFAULT '',
    purpose TEXT,
    company TEXT,
    appointment_time TEXT,
    reference_id TEXT,
    notes TEXT,
    photo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS visitors_normalized_phone_unique;
CREATE UNIQUE INDEX IF NOT EXISTS visitors_normalized_phone_unique
ON visitors (normalized_phone);

CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    visitor_id BIGINT REFERENCES visitors(id) ON DELETE SET NULL,
    kiosk_id TEXT,
    intent TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    summary TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_visitor_id_idx ON sessions (visitor_id);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions (status);

CREATE TABLE IF NOT EXISTS conversation_events (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    event_type TEXT NOT NULL,
    content TEXT,
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_events_session_id_idx ON conversation_events (session_id);
CREATE INDEX IF NOT EXISTS conversation_events_created_at_idx ON conversation_events (created_at DESC);
