import type { VisitorFlowState } from "./visitor-flow-machine";

/** Exact kiosk copy for known steps (Gemini should not rephrase these when local speech is enabled). */
export const DETERMINISTIC_PROMPTS = {
  askPhone: "Please tell me your phone number.",
  askVisitorName: "What is your name?",
  askComingFrom: "Where are you coming from?",
  askVisitCompany:
    "Which company or unit number in Cyber One are you here to visit?",
  askPersonOptional: "Who are you meeting there, if you know?",
  askDeliveryPersonName: "What is your name?",
  askDeliveryCompany: "Which delivery company are you from?",
  askRecipientCompany: "Which company in Cyber One is this parcel for?",
  askRecipientPerson: "Who is the parcel for?",
  photoPose:
    "Please look at the camera and hold still for a moment while I capture your photo.",
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
