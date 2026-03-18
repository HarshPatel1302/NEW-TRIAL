/**
 * Latency instrumentation for receptionist pipeline.
 * Logs timing at key stages for p50/p95 analysis.
 */

type LatencyStage =
  | "tool_call_received"
  | "tool_dispatch_start"
  | "tool_response_sent"
  | "save_visitor_start"
  | "save_visitor_done"
  | "session_end";

const timings: Map<string, number> = new Map();
const sessionTimings: Map<string, Record<LatencyStage, number[]>> = new Map();

export function markLatency(stage: LatencyStage, sessionId?: string | null): void {
  const now = Date.now();
  timings.set(stage, now);
  if (sessionId && process.env.NODE_ENV === "development") {
    let arr = sessionTimings.get(sessionId);
    if (!arr) {
      arr = {} as Record<LatencyStage, number[]>;
      (["tool_call_received", "tool_dispatch_start", "tool_response_sent", "save_visitor_start", "save_visitor_done", "session_end"] as LatencyStage[]).forEach(
        (s) => { arr![s] = []; }
      );
      sessionTimings.set(sessionId, arr);
    }
    if (!arr[stage]) arr[stage] = [];
    arr[stage].push(now);
  }
}

export function measureSince(stage: LatencyStage): number | null {
  const t = timings.get(stage);
  if (!t) return null;
  return Date.now() - t;
}

export function logLatency(label: string, sinceStage: LatencyStage): void {
  const ms = measureSince(sinceStage);
  if (ms != null && process.env.NODE_ENV === "development") {
    console.log(`[Latency] ${label}: ${ms}ms since ${sinceStage}`);
  }
}
