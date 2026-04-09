import { KIOSK_PHOTO_VOICE_LINE } from "./photo-kiosk-config";
import type { VisitorFlowState } from "./visitor-flow-machine";

export type KioskSessionPhase = "collect" | "photo" | "save" | "complete" | "error";

/**
 * High-level phase for KIOSK_STATE_JSON so the model does not confuse slot collection with photo/save steps.
 */
export function deriveKioskSessionPhase(state: VisitorFlowState): KioskSessionPhase {
  switch (state) {
    case "ERROR":
      return "error";
    case "COMPLETED":
      return "complete";
    case "CAPTURE_PHOTO":
    case "DELIVERY_CAPTURE_PHOTO":
    case "UPLOAD_PHOTO":
    case "DELIVERY_UPLOAD_PHOTO":
      return "photo";
    case "SAVE_VISITOR":
    case "FETCH_MEMBER_LIST":
    case "RESOLVE_DESTINATION":
    case "CREATE_VISITOR_LOG":
    case "SEND_NOTIFICATION":
      return "save";
    default:
      return "collect";
  }
}

/**
 * Hint for the next tool the client expects (orthogonal to slot collection).
 */
export function deriveNextRequiredTool(state: VisitorFlowState): string | null {
  if (state === "CAPTURE_PHOTO" || state === "DELIVERY_CAPTURE_PHOTO") {
    return "capture_photo";
  }
  if (state === "UPLOAD_PHOTO" || state === "DELIVERY_UPLOAD_PHOTO") {
    return "save_visitor_info";
  }
  if (state === "SAVE_VISITOR") {
    return "save_visitor_info";
  }
  return null;
}

/** Exact line the receptionist must say when invoking capture_photo (for JSON authority). */
export function kioskPhotoVoiceLineExact(): string {
  return KIOSK_PHOTO_VOICE_LINE;
}
