import type { VisitorFlowState } from "./visitor-flow-machine";
import { KIOSK_PHOTO_VOICE_LINE } from "./photo-kiosk-config";

/** Exact kiosk copy for known steps (Gemini Live voice; no browser TTS). */
export const DETERMINISTIC_PROMPTS = {
  askPhone: "Please tell me your phone number.",
  askVisitorName: "What is your name?",
  askComingFrom: "Where are you coming from?",
  askVisitCompany:
    "Which company or unit number in Cyber One are you here to visit?",
  /** Optional person — ask once, plainly; do not add “if you don’t know that’s fine” or yes/no prompts. */
  askPersonOptional: "What is the name of the person from that company?",
  askDeliveryPersonName: "What is your name?",
  askDeliveryCompany: "Which delivery company are you from?",
  askRecipientCompany: "Which company in Cyber One is this parcel for?",
  askRecipientPerson: "What is the name of the person at that company the parcel is for?",
  /** Spoken by receptionist (Gemini) right before kiosk opens camera + 5s wait. */
  photoPose: KIOSK_PHOTO_VOICE_LINE,
  lobbyWait:
    "Please have a seat in the lobby while your approval request is being sent.",
} as const;

/**
 * Next slot question for visitor/delivery flows. Empty when no fixed script (e.g. IDLE, internal states).
 */
export function deterministicPromptForVisitorState(
  state: VisitorFlowState,
  visitorName?: string
): string | null {
  void visitorName;
  switch (state) {
    case "ASK_NAME":
      return DETERMINISTIC_PROMPTS.askVisitorName;
    case "ASK_PHONE":
      return DETERMINISTIC_PROMPTS.askPhone;
    case "ASK_COMING_FROM":
      return DETERMINISTIC_PROMPTS.askComingFrom;
    case "ASK_COMPANY":
      return DETERMINISTIC_PROMPTS.askVisitCompany;
    case "ASK_PERSON":
      return DETERMINISTIC_PROMPTS.askPersonOptional;
    case "DELIVERY_ASK_NAME":
      return DETERMINISTIC_PROMPTS.askDeliveryPersonName;
    case "DELIVERY_ASK_COMPANY":
      return DETERMINISTIC_PROMPTS.askDeliveryCompany;
    case "DELIVERY_ASK_RECIPIENT_COMPANY":
      return DETERMINISTIC_PROMPTS.askRecipientCompany;
    case "DELIVERY_ASK_RECIPIENT_PERSON":
      return DETERMINISTIC_PROMPTS.askRecipientPerson;
    case "CAPTURE_PHOTO":
    case "DELIVERY_CAPTURE_PHOTO":
      return DETERMINISTIC_PROMPTS.photoPose;
    default:
      return null;
  }
}
