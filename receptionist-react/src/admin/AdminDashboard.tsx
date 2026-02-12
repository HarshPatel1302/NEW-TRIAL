import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./admin-dashboard.css";

type SummaryResponse = {
  rangeDays: number;
  totalVisitors: number;
  totalSessions: number;
  completedSessions: number;
  recentSessions: number;
  averageSessionSeconds: number;
  topIntents: Array<{ intent: string; count: number }>;
  sessionsByStatus: Array<{ status: string; count: number }>;
};

type DailyResponse = {
  rangeDays: number;
  sessionsDaily: Array<{ day: string; sessions: number }>;
  visitorsDaily: Array<{ day: string; visitors: number }>;
};

type VisitorRow = {
  id: string;
  name: string;
  phone: string;
  meetingWith: string;
  intent: string;
  department: string;
  purpose: string;
  company: string;
  updatedAt?: string;
  timestamp?: number;
};

type SessionRow = {
  id: string;
  kiosk_id: string;
  status: string;
  intent: string;
  summary: string;
  started_at: string;
  ended_at: string | null;
  visitor_id: string | null;
  visitor_name: string | null;
  visitor_phone: string | null;
};

type EventRow = {
  id: string;
  session_id: string;
  role: string;
  event_type: string;
  content: string;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  method: string;
  route: string;
  status_code: number;
  duration_ms: number;
  request_id: string;
  created_at: string;
  kiosk_id: string;
};

const API_BASE = process.env.REACT_APP_RECEPTIONIST_API_URL || "http://localhost:5000/api";
const API_KEY = process.env.REACT_APP_RECEPTIONIST_API_KEY || "";
const KIOSK_ID = process.env.REACT_APP_KIOSK_ID || "greenscape-lobby-kiosk-1";
const AUTO_REFRESH_MS = 5000;

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
  ...(API_KEY ? { "x-api-key": API_KEY } : {}),
  ...(KIOSK_ID ? { "x-kiosk-id": KIOSK_ID } : {}),
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: jsonHeaders,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

async function downloadFile(path: string, filenamePrefix: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(API_KEY ? { "x-api-key": API_KEY } : {}),
      ...(KIOSK_ID ? { "x-kiosk-id": KIOSK_ID } : {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const ext = path.endsWith(".xlsx") ? "xlsx" : "csv";
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fmtDate(value?: string | number | null) {
  if (!value) return "-";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function pct(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

export default function AdminDashboard() {
  const [days, setDays] = useState<number>(30);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [intentFilter, setIntentFilter] = useState<string>("");

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [events, setEvents] = useState<EventRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [downloading, setDownloading] = useState<string>("");

  const loadSessionEvents = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setEvents([]);
      return;
    }

    try {
      const res = await fetchJson<{ events: EventRow[] }>(
        `/sessions/${sessionId}/events?limit=500`
      );
      setEvents(res.events || []);
    } catch {
      setEvents([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const statusQuery = statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : "";
      const intentQuery = intentFilter ? `&intent=${encodeURIComponent(intentFilter)}` : "";
      const [summaryRes, dailyRes, visitorsRes, sessionsRes, auditRes] = await Promise.all([
        fetchJson<SummaryResponse>(`/analytics/summary?days=${days}`),
        fetchJson<DailyResponse>(`/analytics/daily?days=${days}`),
        fetchJson<{ visitors: VisitorRow[] }>(`/visitors?limit=250`),
        fetchJson<{ sessions: SessionRow[] }>(
          `/sessions?limit=250${statusQuery}${intentQuery}`
        ),
        fetchJson<{ logs: AuditLogRow[] }>(`/audit-logs?limit=100`),
      ]);

      setSummary(summaryRes);
      setDaily(dailyRes);
      setVisitors(visitorsRes.visitors || []);
      setSessions(sessionsRes.sessions || []);
      setAuditLogs(auditRes.logs || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [days, intentFilter, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedSessionId) {
      setEvents([]);
      return;
    }

    void loadSessionEvents(selectedSessionId);
  }, [selectedSessionId, loadSessionEvents]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      void refresh();
      if (selectedSessionId) {
        void loadSessionEvents(selectedSessionId);
      }
    }, AUTO_REFRESH_MS);

    return () => {
      clearInterval(interval);
    };
  }, [refresh, selectedSessionId, loadSessionEvents]);

  const completionRate = useMemo(() => {
    if (!summary || summary.totalSessions === 0) return 0;
    return (summary.completedSessions / summary.totalSessions) * 100;
  }, [summary]);

  const handleDownload = useCallback(async (path: string, prefix: string) => {
    try {
      setDownloading(prefix);
      await downloadFile(path, prefix);
    } catch (err: any) {
      setError(err?.message || "Download failed");
    } finally {
      setDownloading("");
    }
  }, []);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>Greenscape Receptionist Admin</h1>
          <p>Visitor logs, session analytics, and audit stream</p>
        </div>
        <div className="admin-header-actions">
          <button onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={() => void handleDownload("/exports/visitors.xlsx", "visitors")}
            disabled={!!downloading}
          >
            {downloading === "visitors" ? "Downloading..." : "Export Visitors XLSX"}
          </button>
          <button
            onClick={() => void handleDownload("/exports/sessions.csv", "sessions")}
            disabled={!!downloading}
          >
            {downloading === "sessions" ? "Downloading..." : "Export Sessions CSV"}
          </button>
        </div>
      </header>

      <section className="admin-controls">
        <label>
          Range (days)
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
            <option value={180}>180</option>
          </select>
        </label>
        <label>
          Session status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="active">active</option>
            <option value="completed">completed</option>
            <option value="disconnected">disconnected</option>
          </select>
        </label>
        <label>
          Intent
          <input
            value={intentFilter}
            onChange={(e) => setIntentFilter(e.target.value)}
            placeholder="sales_inquiry"
          />
        </label>
      </section>

      {error ? <div className="admin-error">{error}</div> : null}

      <section className="admin-kpis">
        <article>
          <h3>Total Visitors</h3>
          <strong>{summary?.totalVisitors ?? "-"}</strong>
        </article>
        <article>
          <h3>Total Sessions</h3>
          <strong>{summary?.totalSessions ?? "-"}</strong>
        </article>
        <article>
          <h3>Completion Rate</h3>
          <strong>{summary ? pct(completionRate) : "-"}</strong>
        </article>
        <article>
          <h3>Avg Session</h3>
          <strong>
            {summary ? `${Math.round(summary.averageSessionSeconds)} sec` : "-"}
          </strong>
        </article>
      </section>

      <section className="admin-grid">
        <article className="admin-card">
          <h2>Intent Distribution</h2>
          <ul className="stat-list">
            {(summary?.topIntents || []).map((item) => (
              <li key={item.intent}>
                <span>{item.intent}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-card">
          <h2>Daily Sessions</h2>
          <div className="bars">
            {(daily?.sessionsDaily || []).map((item) => (
              <div className="bar-row" key={item.day}>
                <span>{item.day.slice(5)}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(item.sessions * 14, 100)}%` }} />
                </div>
                <strong>{item.sessions}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-card wide">
          <h2>Recent Sessions</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Visitor</th>
                  <th>Intent</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Ended</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    key={session.id}
                    className={selectedSessionId === String(session.id) ? "active" : ""}
                    onClick={() => setSelectedSessionId(String(session.id))}
                  >
                    <td>{session.id}</td>
                    <td>{session.visitor_name || "-"}</td>
                    <td>{session.intent || "-"}</td>
                    <td>{session.status}</td>
                    <td>{fmtDate(session.started_at)}</td>
                    <td>{fmtDate(session.ended_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card wide">
          <h2>Selected Session Events</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Role</th>
                  <th>Event</th>
                  <th>Content</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{fmtDate(event.created_at)}</td>
                    <td>{event.role}</td>
                    <td>{event.event_type}</td>
                    <td>{event.content || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card wide">
          <h2>Visitors</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Meeting With</th>
                  <th>Intent</th>
                  <th>Department</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((visitor) => (
                  <tr key={visitor.id}>
                    <td>{visitor.name}</td>
                    <td>{visitor.phone}</td>
                    <td>{visitor.meetingWith}</td>
                    <td>{visitor.intent}</td>
                    <td>{visitor.department}</td>
                    <td>{fmtDate(visitor.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-card wide">
          <h2>Recent API Audit Logs</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Method</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Request ID</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{fmtDate(log.created_at)}</td>
                    <td>{log.method}</td>
                    <td>{log.route}</td>
                    <td>{log.status_code}</td>
                    <td>{log.duration_ms} ms</td>
                    <td>{log.request_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
