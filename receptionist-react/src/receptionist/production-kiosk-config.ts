/**
 * Locked production recommendations for Greenscape kiosk (env flags + Live VAD).
 * Set these in `.env` / deployment — this module documents the intended combination only.
 */
export const PRODUCTION_KIOSK_ENV_RECOMMENDED = {
  /** Use backend `/api/kiosk/*` for visitor + member search (shared token + server index). */
  REACT_APP_KIOSK_GATE_PROXY: "1",
  /** Shorter system prompt + less model work parsing instructions. */
  REACT_APP_COMPACT_SYSTEM: "1",
  /** Browser TTS for deterministic slot / cue lines when enabled. */
  REACT_APP_KIOSK_LOCAL_SPEECH: "0",
  /** Speak exact strings for slot steps; set Gemini to not duplicate questions. */
  REACT_APP_DETERMINISTIC_LOCAL_PROMPTS: "0",
  /** Structured perf logs + p50/p95 rollups (or enable via localStorage RECEPTIONIST_PERF=1). */
  REACT_APP_RECEPTIONIST_PERF: "1",
  /** After camera open: extra delay before shutter (0 = stable-frame only). Typical 800–1500. */
  REACT_APP_PHOTO_COUNTDOWN_MS: "1200",
  /** `stable` = wait for stable video only; `countdown` = sleep + capture; `instant` = minimal wait. */
  REACT_APP_PHOTO_CAPTURE_MODE: "stable",
  /** FaceDetector-based readiness before shutter (set 0 to disable on unsupported hardware). */
  REACT_APP_PHOTO_FACE_DETECT: "1",
  /** Legacy env: local SLA → browser TTS was removed (single Gemini Live voice). */
  REACT_APP_MODEL_SLA_MS: "5200",
  /** Noisy lobby tuning (0–0.35). Rising edge = barge when prev ≤ floor and current > rise. */
  REACT_APP_BARGE_IN_VOLUME_RISE: "0.045",
  REACT_APP_BARGE_IN_VOLUME_FLOOR: "0.028",
  /** Sustained mic level while TTS plays without a barge trigger → suspected missed interrupt. */
  REACT_APP_BARGE_IN_MISS_DETECT_VOLUME: "0.072",
  REACT_APP_BARGE_IN_MISS_SUSTAINED_MS: "420",
  /** Backend: enable proxy routes + gate credentials. */
  KIOSK_GATE_PROXY_ENABLED: "1",
  /** Optional: Admin dashboard kiosk proxy diagnostics panel. */
  REACT_APP_KIOSK_PROXY_DEBUG: "0",
} as const;

/** Documented Live API VAD targets (see App.tsx setConfig); keep aligned with perfSetAssumedSilenceMs. */
export const PRODUCTION_VAD_RECOMMENDED = {
  silenceDurationMs: 280,
  prefixPaddingMs: 100,
} as const;
