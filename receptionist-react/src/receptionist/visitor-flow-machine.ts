export type ReceptionMode = "new_visitor" | "existing_visitor" | "delivery" | null;

export type VisitorFlowState =
  | "IDLE"
  | "MODE_SELECTED"
  | "ASK_PHONE"
  | "SEARCHING_VISITOR"
  | "EXISTING_VISITOR_FOUND"
  | "NEW_VISITOR_ASK_NAME"
  | "NEW_VISITOR_ASK_COMING_FROM"
  | "NEW_VISITOR_ASK_COMPANY"
  | "NEW_VISITOR_CAPTURE_PHOTO"
  | "NEW_VISITOR_UPLOAD_PHOTO"
  | "NEW_VISITOR_CREATE_RECORD"
  | "EXISTING_VISITOR_ASK_COMPANY"
  | "DELIVERY_ASK_NAME"
  | "DELIVERY_ASK_DELIVERY_COMPANY"
  | "DELIVERY_ASK_TARGET_COMPANY"
  | "DELIVERY_ASK_TARGET_PERSON"
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
  isExistingVisitor: boolean;
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
  ASK_PHONE: ["SEARCHING_VISITOR", "ERROR"],
  SEARCHING_VISITOR: ["EXISTING_VISITOR_FOUND", "NEW_VISITOR_ASK_NAME", "ERROR"],
  EXISTING_VISITOR_FOUND: ["EXISTING_VISITOR_ASK_COMPANY", "ERROR"],
  NEW_VISITOR_ASK_NAME: ["NEW_VISITOR_ASK_COMING_FROM", "ERROR"],
  NEW_VISITOR_ASK_COMING_FROM: ["NEW_VISITOR_ASK_COMPANY", "ERROR"],
  NEW_VISITOR_ASK_COMPANY: ["NEW_VISITOR_CAPTURE_PHOTO", "ERROR"],
  NEW_VISITOR_CAPTURE_PHOTO: ["NEW_VISITOR_UPLOAD_PHOTO", "ERROR"],
  NEW_VISITOR_UPLOAD_PHOTO: ["NEW_VISITOR_CREATE_RECORD", "ERROR"],
  NEW_VISITOR_CREATE_RECORD: ["FETCH_MEMBER_LIST", "ERROR"],
  EXISTING_VISITOR_ASK_COMPANY: ["FETCH_MEMBER_LIST", "ERROR"],
  DELIVERY_ASK_NAME: ["DELIVERY_ASK_DELIVERY_COMPANY", "ERROR"],
  DELIVERY_ASK_DELIVERY_COMPANY: ["DELIVERY_ASK_TARGET_COMPANY", "ERROR"],
  DELIVERY_ASK_TARGET_COMPANY: ["DELIVERY_ASK_TARGET_PERSON", "ERROR"],
  DELIVERY_ASK_TARGET_PERSON: ["DELIVERY_CAPTURE_PHOTO", "ERROR"],
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
    isExistingVisitor: false,
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
  if (state === "ASK_PHONE") return "phone";
  if (state === "NEW_VISITOR_ASK_NAME") return "visitor_name";
  if (state === "NEW_VISITOR_ASK_COMING_FROM") return "came_from";
  if (state === "NEW_VISITOR_ASK_COMPANY") return "visit_company";
  if (state === "EXISTING_VISITOR_ASK_COMPANY") return "visit_company";
  if (state === "DELIVERY_ASK_NAME") return "visitor_name";
  if (state === "DELIVERY_ASK_DELIVERY_COMPANY") return "delivery_company";
  if (state === "DELIVERY_ASK_TARGET_COMPANY") return "recipient_company";
  if (state === "DELIVERY_ASK_TARGET_PERSON") return "recipient_name";
  return null;
}

export function promptForState(state: VisitorFlowState, visitorName?: string) {
  if (state === "ASK_PHONE") return "Please tell me your phone number.";
  if (state === "NEW_VISITOR_ASK_NAME") return "What is your name?";
  if (state === "NEW_VISITOR_ASK_COMING_FROM") return "Where are you coming from?";
  if (state === "NEW_VISITOR_ASK_COMPANY")
    return "Which company or unit number in Cyber One are you here to visit?";
  if (state === "EXISTING_VISITOR_ASK_COMPANY") {
    return `Hello ${visitorName || "there"}, welcome again. Which company or unit number in Cyber One are you visiting today?`;
  }
  if (state === "DELIVERY_ASK_NAME") return "What is your name?";
  if (state === "DELIVERY_ASK_DELIVERY_COMPANY") return "Which delivery company are you from?";
  if (state === "DELIVERY_ASK_TARGET_COMPANY")
    return "Which company in Cyber One is this parcel for?";
  if (state === "DELIVERY_ASK_TARGET_PERSON") return "Who is the parcel for?";
  return "";
}

export function canCapturePhoto(session: VisitorFlowSession) {
  if (session.mode === "existing_visitor" || session.isExistingVisitor) return false;
  return (
    session.state === "NEW_VISITOR_CAPTURE_PHOTO" || session.state === "DELIVERY_CAPTURE_PHOTO"
  );
}

export function canCreateVisitor(session: VisitorFlowSession) {
  return session.mode === "new_visitor" && !session.isExistingVisitor && session.photoUploaded;
}

export function canEmitFinalSuccess(session: VisitorFlowSession) {
  return session.visitorLogCreated && !!session.visitorLogId && session.fcmSent;
}
