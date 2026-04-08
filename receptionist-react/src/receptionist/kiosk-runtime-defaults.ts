/**
 * Production kiosk defaults when REACT_APP_* is unset (opt-out with explicit "=0").
 * Align with production-kiosk-config.ts and Docker build args.
 */

function envIsExplicitOff(key: string): boolean {
  const v = String((process.env as Record<string, string | undefined>)[key] ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

/** Align with backend `parse-env-bool.js`: 1, true, yes, on (case-insensitive). */
export function parseEnvBoolTruthy(raw: string | undefined | null): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** True only when REACT_APP_KIOSK_GATE_PROXY is explicitly truthy (not merely default-on). */
export function explicitKioskProxyRequested(): boolean {
  return parseEnvBoolTruthy(process.env.REACT_APP_KIOSK_GATE_PROXY);
}

/** Dev/staging: show kiosk proxy diagnostics in Admin (see AdminDashboard). */
export function kioskProxyDebugUiEnabled(): boolean {
  return parseEnvBoolTruthy(process.env.REACT_APP_KIOSK_PROXY_DEBUG);
}

/** Backend /api/kiosk/* — default ON unless REACT_APP_KIOSK_GATE_PROXY=0 */
export function defaultKioskGateProxyEnabled(): boolean {
  return !envIsExplicitOff("REACT_APP_KIOSK_GATE_PROXY");
}

export function defaultCompactSystemEnabled(): boolean {
  return !envIsExplicitOff("REACT_APP_COMPACT_SYSTEM");
}

/** Opt-in only — browser speechSynthesis must not duplicate Gemini Live audio by default. */
export function defaultLocalSpeechEnabled(): boolean {
  return parseEnvBoolTruthy(process.env.REACT_APP_KIOSK_LOCAL_SPEECH);
}

/** Opt-in only — deterministic slot lines must not overlap the receptionist voice by default. */
export function defaultDeterministicLocalPromptsEnabled(): boolean {
  return parseEnvBoolTruthy(process.env.REACT_APP_DETERMINISTIC_LOCAL_PROMPTS);
}

export function defaultStablePhotoMode(): boolean {
  const mode = String(process.env.REACT_APP_PHOTO_CAPTURE_MODE || "stable").toLowerCase();
  return mode === "stable" || mode === "";
}
