/**
 * Single session/playback epoch for stale-output protection.
 * Bump on flow transitions and user barge-in so late model PCM/text can be dropped.
 */

import { isPerfEnabled } from "./perf-latency";

let playbackEpoch = 0;
/** First PCM/text chunk of the current assistant burst anchors to this epoch; must match playbackEpoch to play. */
let utteranceAnchorEpoch: number | null = null;
/** After barge-in / flow bump, drop assistant output until this time (performance.now) to avoid re-anchoring stale PCM. */
let outputGateUntilPerfMs = 0;

export function getPlaybackEpoch(): number {
  return playbackEpoch;
}

/** Alias for tool payloads / KIOSK_STATE_JSON */
export function getSessionEpoch(): number {
  return playbackEpoch;
}

export function resetSessionPlaybackEpoch(): void {
  playbackEpoch = 0;
  utteranceAnchorEpoch = null;
  outputGateUntilPerfMs = 0;
}

export function releaseAssistantOutputGate(): void {
  outputGateUntilPerfMs = 0;
}

export function invalidateAssistantUtteranceAnchor(_reason?: string): void {
  utteranceAnchorEpoch = null;
}

/**
 * Flow transition or user barge-in: advance epoch and drop in-flight assistant utterance binding.
 */
export function bumpPlaybackEpoch(reason: string): number {
  playbackEpoch += 1;
  utteranceAnchorEpoch = null;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (reason === "user_barge_in") {
    outputGateUntilPerfMs = now + 280;
  } else if (reason.startsWith("flow:")) {
    outputGateUntilPerfMs = now + 90;
  } else {
    outputGateUntilPerfMs = now;
  }
  if (isPerfEnabled()) {
    console.info("[KioskEpoch] bump", {
      reason,
      playbackEpoch,
      gate_ms: Math.max(0, outputGateUntilPerfMs - now),
    });
  }
  return playbackEpoch;
}

function nowPerf(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Returns true if this assistant PCM chunk should be decoded and queued.
 */
export function acceptAssistantPcmChunk(): boolean {
  const now = nowPerf();
  if (now < outputGateUntilPerfMs) {
    return false;
  }
  if (utteranceAnchorEpoch === null) {
    utteranceAnchorEpoch = playbackEpoch;
  }
  return utteranceAnchorEpoch === playbackEpoch;
}

/**
 * Model text for the speech bubble — same anchor/gate as PCM so stale captions are ignored.
 */
export function acceptAssistantModelText(): boolean {
  return acceptAssistantPcmChunk();
}
