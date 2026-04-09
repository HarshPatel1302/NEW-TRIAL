import { DatabaseManager } from "./database";

const DEBUG_INGEST =
  "http://127.0.0.1:7337/ingest/dd3638ce-a7d7-4038-afe2-98a13abb3f73";
const DEBUG_SESSION = "cb6827";

export type KioskTracePayload = {
  hypothesisId?: string;
  runId?: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
};

/** NDJSON debug ingest (Cursor debug mode) + optional PostgreSQL session event. */
export function kioskDebugTrace(payload: KioskTracePayload): void {
  fetch(DEBUG_INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION,
      timestamp: Date.now(),
      ...payload,
    }),
  }).catch(() => {});
}

export function kioskSessionTrace(
  backendSessionId: string | null | undefined,
  eventType: string,
  data: Record<string, unknown>
): void {
  const row = {
    ...data,
    eventType,
    backendSessionId: backendSessionId || null,
    ts: Date.now(),
  };
  kioskDebugTrace({
    location: "kioskSessionTrace",
    message: eventType,
    data: row,
    hypothesisId: typeof data.hypothesisId === "string" ? data.hypothesisId : undefined,
  });
  if (backendSessionId) {
    void DatabaseManager.logSessionEvent(backendSessionId, {
      role: "system",
      eventType,
      content: JSON.stringify(row),
    });
  }
}
