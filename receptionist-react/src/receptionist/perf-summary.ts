/**
 * Rolling p50/p95 summaries (complements per-turn line logs in perf-latency).
 * Intentionally does not import perf-latency (avoid cycles); uses same enable rules.
 */

const STORAGE_KEY = "RECEPTIONIST_PERF";
const ENV_FLAG = process.env.REACT_APP_RECEPTIONIST_PERF === "1";

function isSummaryEnabled(): boolean {
  if (typeof window === "undefined") return ENV_FLAG;
  try {
    return ENV_FLAG || window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return ENV_FLAG;
  }
}

const MAX_SAMPLES = 200;
const buckets = new Map<string, number[]>();
let summaryTick = 0;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function perfRecordSummary(metric: string, ms: number): void {
  if (!isSummaryEnabled() || !Number.isFinite(ms)) return;
  let arr = buckets.get(metric);
  if (!arr) {
    arr = [];
    buckets.set(metric, arr);
  }
  arr.push(ms);
  if (arr.length > MAX_SAMPLES) {
    arr.splice(0, arr.length - MAX_SAMPLES);
  }
  summaryTick += 1;
  if (summaryTick % 20 === 0) {
    logAllPerfSummaries();
  }
}

export function logAllPerfSummaries(): void {
  if (!isSummaryEnabled()) return;
  for (const [name, arr] of buckets.entries()) {
    if (arr.length < 5) continue;
    const sorted = [...arr].sort((a, b) => a - b);
    console.info(`[ReceptionistPerfSummary] ${name}`, {
      n: arr.length,
      p50_ms: Math.round(percentile(sorted, 50)),
      p95_ms: Math.round(percentile(sorted, 95)),
    });
  }
}

/** Scenario-tagged metrics: keys like `estimated_user_eos_to_first_model_audio_ms::new_visitor`. */
export type KioskPerfScenario =
  | "new_visitor"
  | "delivery"
  | "photo"
  | "barge_recovery"
  | "general";

export function perfRecordScenario(
  metric: string,
  scenario: KioskPerfScenario,
  ms: number
): void {
  perfRecordSummary(`${metric}::${scenario}`, ms);
}
