/**
 * Barge-in diagnostics for noisy lobby tuning (enable with RECEPTIONIST_PERF=1 or REACT_APP_RECEPTIONIST_PERF=1).
 */

import { isPerfEnabled } from "./perf-latency";
import { perfRecordScenario, perfRecordSummary } from "./perf-summary";

let falsePositiveSignals = 0;
let missedInterruptSignals = 0;
let bargeInCount = 0;

export function getBargeInMetricsSnapshot() {
  return {
    barge_in_triggers: bargeInCount,
    suspected_false_positive: falsePositiveSignals,
    suspected_missed_barge: missedInterruptSignals,
  };
}

/** Call when barge-in runs while assistant was not marked playing (possible ambient false trigger). */
export function recordBargeWhenAssistantSilent(wasAssistantPlaying: boolean): void {
  if (!isPerfEnabled()) return;
  if (!wasAssistantPlaying) {
    falsePositiveSignals += 1;
    console.warn("[BargeInMetrics] trigger_while_assistant_silent", getBargeInMetricsSnapshot());
  }
}

/** Call periodically from UI: assistant playing + loud mic sustained without barge. */
export function recordSuspectedMissedBarge(ctx: { inVolume: number; sustainedMs: number }): void {
  if (!isPerfEnabled()) return;
  missedInterruptSignals += 1;
  console.warn("[BargeInMetrics] suspected_missed_barge", ctx, getBargeInMetricsSnapshot());
}

export function recordBargeInCompleted(latencyMs: number, ctx: { in_volume: number; prev_volume: number }): void {
  bargeInCount += 1;
  perfRecordSummary("barge_in_interrupt_latency_ms", latencyMs);
  perfRecordSummary("scenario_barge_recovery_ms", latencyMs);
  perfRecordScenario("barge_in_interrupt_latency_ms", "barge_recovery", latencyMs);
  if (isPerfEnabled()) {
    console.info("[BargeInMetrics] barge_in_complete", {
      latency_ms: Math.round(latencyMs),
      ...ctx,
      ...getBargeInMetricsSnapshot(),
    });
  }
}
