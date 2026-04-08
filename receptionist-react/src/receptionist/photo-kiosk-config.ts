/**
 * Kiosk photo step: fixed 5s wait (configurable) + exact line the receptionist (Gemini Live) should say.
 * Browser speechSynthesis must not speak this — only the Live API voice.
 */

export const KIOSK_PHOTO_VOICE_LINE =
  "Please wait 5 seconds while I capture your photo.";

/** Countdown after camera is open, before JPEG shutter (ms). Default 5000 per product spec. */
export function getKioskToolPhotoCountdownMs(): number {
  const raw = Number(
    typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>).REACT_APP_PHOTO_COUNTDOWN_MS
      : NaN
  );
  if (Number.isFinite(raw) && raw >= 0) {
    return Math.min(15000, Math.max(2500, raw));
  }
  return 5000;
}

/** Cap face-detector wait so total capture latency stays reasonable when countdown is long. */
export function getPhotoFaceMaxWaitMs(countdownMs: number): number {
  if (countdownMs >= 4000) {
    return Math.min(2400, Math.floor(countdownMs * 0.48));
  }
  return Math.min(5200, countdownMs + 3800);
}
