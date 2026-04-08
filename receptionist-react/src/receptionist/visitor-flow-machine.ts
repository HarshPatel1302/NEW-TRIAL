import { deterministicPromptForVisitorState } from "./deterministic-prompts";

/** Product scope: new visitor check-in or delivery only. */
export type ReceptionMode = "new_visitor" | "delivery" | null;

export type VisitorFlowState =
  | "IDLE"
  | "MODE_SELECTED"
  | "ASK_PHONE"
  | "ASK_NAME"
  | "ASK_COMING_FROM"
  | "ASK_COMPANY"
  | "ASK_PERSON"
  | "CAPTURE_PHOTO"
  | "UPLOAD_PHOTO"
  | "SAVE_VISITOR"
  | "DELIVERY_ASK_NAME"
  | "DELIVERY_ASK_COMPANY"
  | "DELIVERY_ASK_RECIPIENT_COMPANY"
  | "DELIVERY_ASK_RECIPIENT_PERSON"
  | "DELIVERY_CAPTURE_PHOTO"
  | "DELIVERY_UPLOAD_PHOTO"
  | "FETCH_MEMBER_LIST"
  | "RESOLVE_DESTINATION"
  | "CREATE_VISITOR_LOG"
  | "SEND_NOTIFICATION"
  | "COMPLETED"
  | "ERROR";

export type VisitorFlowSession = {
  mode: ReceptionMode;
  state: VisitorFlowState;
  phoneNumber?: string;
  normalizedPhoneNumber?: string;
  visitorId: number | null;
  visitorName: string;
  comingFrom?: string;
  companyToVisit?: string;
  personToMeet?: string | null;
  deliveryPersonName?: string;
  deliveryCompanyName?: string;
  parcelForCompany?: string;
  parcelForPerson?: string;
  visitorCreated: boolean;
  photoCaptured: boolean;
  photoUploaded: boolean;
  destinationResolved: boolean;
  selectedMember: boolean;
  visitorLogCreated: boolean;
  visitorLogId: number | null;
  fcmSent: boolean;
  error?: string | null;
};

const ALLOWED: Record<VisitorFlowState, VisitorFlowState[]> = {
  IDLE: ["MODE_SELECTED", "ASK_PHONE", "DELIVERY_ASK_NAME", "ERROR"],
  MODE_SELECTED: ["ASK_PHONE", "DELIVERY_ASK_NAME", "ERROR"],
  // CAPTURE_PHOTO: allow jump when mandatory slots are already complete (tool gates via getMissingFieldsBeforePhoto).
  // Visitor check-in order: phone → name → coming from → company → optional person → photo.
  ASK_PHONE: ["ASK_NAME", "CAPTURE_PHOTO", "ERROR"],
  ASK_NAME: ["ASK_COMING_FROM", "CAPTURE_PHOTO", "ERROR"],
  ASK_COMING_FROM: ["ASK_COMPANY", "CAPTURE_PHOTO", "ERROR"],
  ASK_COMPANY: ["ASK_PERSON", "CAPTURE_PHOTO", "ERROR"],
  ASK_PERSON: ["CAPTURE_PHOTO", "ERROR"],
  CAPTURE_PHOTO: ["UPLOAD_PHOTO", "ERROR"],
  UPLOAD_PHOTO: ["SAVE_VISITOR", "ERROR"],
  SAVE_VISITOR: ["FETCH_MEMBER_LIST", "ERROR"],
  DELIVERY_ASK_NAME: ["DELIVERY_ASK_COMPANY", "DELIVERY_CAPTURE_PHOTO", "ERROR"],
  DELIVERY_ASK_COMPANY: ["DELIVERY_ASK_RECIPIENT_COMPANY", "DELIVERY_CAPTURE_PHOTO", "ERROR"],
  DELIVERY_ASK_RECIPIENT_COMPANY: ["DELIVERY_ASK_RECIPIENT_PERSON", "DELIVERY_CAPTURE_PHOTO", "ERROR"],
  DELIVERY_ASK_RECIPIENT_PERSON: ["DELIVERY_CAPTURE_PHOTO", "ERROR"],
  DELIVERY_CAPTURE_PHOTO: ["DELIVERY_UPLOAD_PHOTO", "ERROR"],
  DELIVERY_UPLOAD_PHOTO: ["FETCH_MEMBER_LIST", "ERROR"],
  FETCH_MEMBER_LIST: ["RESOLVE_DESTINATION", "ERROR"],
  RESOLVE_DESTINATION: ["CREATE_VISITOR_LOG", "ERROR"],
  CREATE_VISITOR_LOG: ["SEND_NOTIFICATION", "ERROR"],
  SEND_NOTIFICATION: ["COMPLETED", "ERROR"],
  COMPLETED: [],
  ERROR: ["ASK_PHONE", "DELIVERY_ASK_NAME"],
};

export function createVisitorFlowSession(): VisitorFlowSession {
  return {
    mode: null,
    state: "IDLE",
    visitorId: null,
    visitorName: "",
    visitorCreated: false,
    photoCaptured: false,
    photoUploaded: false,
    destinationResolved: false,
    selectedMember: false,
    visitorLogCreated: false,
    visitorLogId: null,
    fcmSent: false,
    error: null,
  };
}

export function transitionVisitorFlow(current: VisitorFlowSession, next: VisitorFlowState) {
  const allowed = ALLOWED[current.state] || [];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid visitor flow transition: ${current.state} -> ${next}`);
  }
  return { ...current, state: next, error: null };
}

export function expectedSlotForState(state: VisitorFlowState): string | null {
  if (state === "ASK_NAME") return "visitor_name";
  if (state === "ASK_PHONE") return "phone";
  if (state === "ASK_COMING_FROM") return "came_from";
  if (state === "ASK_COMPANY") return "visit_company";
  if (state === "ASK_PERSON") return "meeting_with";
  if (state === "DELIVERY_ASK_NAME") return "visitor_name";
  if (state === "DELIVERY_ASK_COMPANY") return "delivery_company";
  if (state === "DELIVERY_ASK_RECIPIENT_COMPANY") return "recipient_company";
  if (state === "DELIVERY_ASK_RECIPIENT_PERSON") return "recipient_name";
  return null;
}

export function promptForState(state: VisitorFlowState, visitorName?: string) {
  return deterministicPromptForVisitorState(state, visitorName) || "";
}

export function canCapturePhoto(session: VisitorFlowSession) {
  return session.state === "CAPTURE_PHOTO" || session.state === "DELIVERY_CAPTURE_PHOTO";
}

export function canCreateVisitor(session: VisitorFlowSession) {
  return session.mode === "new_visitor" && session.photoUploaded;
}

export function canEmitFinalSuccess(session: VisitorFlowSession) {
  return session.visitorLogCreated && !!session.visitorLogId && session.fcmSent;
}
