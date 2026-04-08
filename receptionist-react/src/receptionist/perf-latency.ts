/**
 * Turn / tool / playback latency instrumentation.
 * Enable: localStorage.setItem("RECEPTIONIST_PERF", "1") or REACT_APP_RECEPTIONIST_PERF=1
 */

import { perfRecordSummary } from "./perf-summary";

const STORAGE_KEY = "RECEPTIONIST_PERF";
const ENV_FLAG = process.env.REACT_APP_RECEPTIONIST_PERF === "1";

export function isPerfEnabled(): boolean {
  if (typeof window === "undefined") return ENV_FLAG;
  try {
    return ENV_FLAG || window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return ENV_FLAG;
  }
}

export type PerfMark =
  | "turn_batch_start"
  | "live_setup_complete"
  | "first_model_audio"
  | "toolcall_received"
  | "tool_handler_start"
  | "tool_handler_end"
  | "tool_response_sent"
  | "playback_start";

type MarkRecord = { mark: PerfMark; t: number; detail?: string };

let turnSeq = 0;
let activeTurnId: string | null = null;
const marks: MarkRecord[] = [];

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function perfStartTurn(reason: string): string {
  if (!isPerfEnabled()) return "";
  turnSeq += 1;
  activeTurnId = `turn_${turnSeq}_${Date.now()}`;
  marks.length = 0;
  marks.push({ mark: "turn_batch_start", t: now(), detail: reason });
  return activeTurnId;
}

export function perfMark(mark: PerfMark, detail?: string): void {
  if (!isPerfEnabled()) return;
  // Server emits toolCall before App's handler runs; start a batch so marks aren't dropped.
  if (!activeTurnId && mark === "toolcall_received") {
    perfStartTurn(detail || "server_toolcall");
    marks.push({ mark, t: now(), detail });
    return;
  }
  if (!activeTurnId) return;
  marks.push({ mark, t: now(), detail });
}

export function perfEndTurn(label: string): void {
  if (!isPerfEnabled() || !activeTurnId) return;
  const end = now();
  const lines: string[] = [`[ReceptionistPerf] ${label} ${activeTurnId}`];
  let prev = marks[0]?.t ?? end;
  let firstAudioT: number | null = null;
  let toolHandlerEndT: number | null = null;
  let toolHandlerStartT: number | null = null;
  for (const m of marks) {
    const delta = m.t - prev;
    lines.push(`  ${m.mark}${m.detail ? ` (${m.detail})` : ""} +${delta.toFixed(1)}ms @ ${m.t.toFixed(1)}ms`);
    if (m.mark === "first_model_audio" && firstAudioT === null) firstAudioT = m.t;
    if (m.mark === "tool_handler_start") toolHandlerStartT = m.t;
    if (m.mark === "tool_handler_end") toolHandlerEndT = m.t;
    prev = m.t;
  }
  const totalSpan = end - (marks[0]?.t ?? end);
  lines.push(`  total_span_ms: ${totalSpan.toFixed(1)}`);
  console.info(lines.join("\n"));
  perfRecordSummary("turn_total_span_ms", totalSpan);
  if (firstAudioT !== null && marks[0]) {
    perfRecordSummary("turn_start_to_first_model_audio_ms", firstAudioT - marks[0].t);
  }
  if (toolHandlerStartT !== null && toolHandlerEndT !== null) {
    perfRecordSummary("tool_handler_span_ms", toolHandlerEndT - toolHandlerStartT);
  }
  activeTurnId = null;
  marks.length = 0;
}

/** Log a single structured timing line (tool handler, API, etc.) */
export function perfLog(event: string, payload: Record<string, unknown>): void {
  if (!isPerfEnabled()) return;
  console.info(`[ReceptionistPerf] ${event}`, { t: Date.now(), ...payload });
  const d = payload.duration_ms;
  if (event === "tool_handler_end" && typeof d === "number") {
    perfRecordSummary("tool_handler_wall_ms", d);
  }
}

/** Last time realtime mic PCM was sent upstream (approximates ongoing speech). */
let lastUserAudioPerfMs = 0;
/** Always updated when mic sends (SLA + perf), even when perf logging is off. */
let lastUserMicChunkWallMs = 0;
/** Tune to match Live VAD silenceDurationMs + small cushion (ms). */
let assumedSilenceAfterLastChunkMs = 320;

export function perfSetAssumedSilenceMs(ms: number): void {
  assumedSilenceAfterLastChunkMs = Math.max(200, Math.min(ms + 40, 900));
}

export function perfMarkUserAudioSent(): void {
  const t = now();
  lastUserMicChunkWallMs = t;
  if (!isPerfEnabled()) return;
  lastUserAudioPerfMs = t;
}

/** Mic activity timestamp for model-SLA fallback (independent of RECEPTIONIST_PERF). */
export function noteUserMicChunkSentForSla(): void {
  lastUserMicChunkWallMs = now();
}

export function getLastUserMicChunkWallMs(): number {
  return lastUserMicChunkWallMs;
}

/**
 * Call when first model audio chunk arrives — estimates user end-of-speech → first audible.
 * Uses: lastUserAudioPerfMs + assumedSilenceAfterLastChunkMs → first audio (approximate).
 */
export function perfNoteEstimatedEosToFirstModelAudio(): void {
  if (!isPerfEnabled() || !activeTurnId || lastUserAudioPerfMs <= 0) return;
  const firstAudioT = now();
  const estimatedEos = lastUserAudioPerfMs + assumedSilenceAfterLastChunkMs;
  const delta = firstAudioT - estimatedEos;
  console.info("[ReceptionistPerf] estimated_user_eos_to_first_model_audio_ms", {
    delta_ms: Math.round(delta),
    note: "Approximate: last mic chunk + assumed silence vs first model PCM",
  });
  perfRecordSummary("estimated_user_eos_to_first_model_audio_ms", delta);
}
