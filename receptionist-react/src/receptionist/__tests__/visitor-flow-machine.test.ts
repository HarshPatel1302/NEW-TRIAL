import {
  canCapturePhoto,
  canCreateVisitor,
  canEmitFinalSuccess,
  createVisitorFlowSession,
  expectedSlotForState,
  promptForState,
  transitionVisitorFlow,
} from "../visitor-flow-machine";

describe("visitor-flow-machine", () => {
  test("existing visitor path never allows photo/create", () => {
    let session = createVisitorFlowSession();
    session = transitionVisitorFlow(session, "ASK_PHONE");
    session = transitionVisitorFlow(session, "SEARCHING_VISITOR");
    session = transitionVisitorFlow(session, "EXISTING_VISITOR_FOUND");
    session = { ...session, isExistingVisitor: true, visitorId: 168, visitorName: "Bilal" };
    session = transitionVisitorFlow(session, "EXISTING_VISITOR_ASK_COMPANY");

    expect(canCapturePhoto(session)).toBe(false);
    expect(canCreateVisitor(session)).toBe(false);
  });

  test("new visitor path allows photo then create", () => {
    let session = createVisitorFlowSession();
    session = { ...session, mode: "new_visitor" };
    session = transitionVisitorFlow(session, "ASK_PHONE");
    session = transitionVisitorFlow(session, "SEARCHING_VISITOR");
    session = transitionVisitorFlow(session, "NEW_VISITOR_ASK_NAME");
    session = transitionVisitorFlow(session, "NEW_VISITOR_ASK_COMING_FROM");
    session = transitionVisitorFlow(session, "NEW_VISITOR_ASK_COMPANY");
    session = transitionVisitorFlow(session, "NEW_VISITOR_CAPTURE_PHOTO");
    expect(canCapturePhoto(session)).toBe(true);
    session = transitionVisitorFlow(session, "NEW_VISITOR_UPLOAD_PHOTO");
    session = { ...session, photoUploaded: true };
    session = transitionVisitorFlow(session, "NEW_VISITOR_CREATE_RECORD");
    expect(canCreateVisitor(session)).toBe(true);
  });

  test("forbidden transition existing visitor -> photo state", () => {
    let session = createVisitorFlowSession();
    session = transitionVisitorFlow(session, "ASK_PHONE");
    session = transitionVisitorFlow(session, "SEARCHING_VISITOR");
    session = transitionVisitorFlow(session, "EXISTING_VISITOR_FOUND");
    expect(() => transitionVisitorFlow(session, "NEW_VISITOR_CAPTURE_PHOTO")).toThrow();
  });

  test("final success requires visitor log + fcm", () => {
    const base = createVisitorFlowSession();
    expect(canEmitFinalSuccess(base)).toBe(false);
    expect(
      canEmitFinalSuccess({
        ...base,
        visitorLogCreated: true,
        visitorLogId: 282,
        fcmSent: false,
      })
    ).toBe(false);
    expect(
      canEmitFinalSuccess({
        ...base,
        visitorLogCreated: true,
        visitorLogId: 282,
        fcmSent: true,
      })
    ).toBe(true);
  });

  test("expected slot and prompt are deterministic", () => {
    expect(expectedSlotForState("ASK_PHONE")).toBe("phone");
    expect(expectedSlotForState("NEW_VISITOR_ASK_COMPANY")).toBe("visit_company");
    expect(promptForState("DELIVERY_ASK_TARGET_PERSON")).toContain("parcel");
  });

  test("new visitor strict path reaches completion state", () => {
    let session = { ...createVisitorFlowSession(), mode: "new_visitor" as const };
    session = transitionVisitorFlow(session, "ASK_PHONE");
    session = transitionVisitorFlow(session, "SEARCHING_VISITOR");
    session = transitionVisitorFlow(session, "NEW_VISITOR_ASK_NAME");
    session = transitionVisitorFlow(session, "NEW_VISITOR_ASK_COMING_FROM");
    session = transitionVisitorFlow(session, "NEW_VISITOR_ASK_COMPANY");
    session = transitionVisitorFlow(session, "NEW_VISITOR_CAPTURE_PHOTO");
    session = transitionVisitorFlow(session, "NEW_VISITOR_UPLOAD_PHOTO");
    session = transitionVisitorFlow(session, "NEW_VISITOR_CREATE_RECORD");
    session = transitionVisitorFlow(session, "FETCH_MEMBER_LIST");
    session = transitionVisitorFlow(session, "RESOLVE_DESTINATION");
    session = transitionVisitorFlow(session, "CREATE_VISITOR_LOG");
    session = transitionVisitorFlow(session, "SEND_NOTIFICATION");
    session = transitionVisitorFlow(session, "COMPLETED");
    expect(session.state).toBe("COMPLETED");
  });

  test("existing visitor strict path reaches completion without photo states", () => {
    let session = { ...createVisitorFlowSession(), mode: "existing_visitor" as const };
    session = transitionVisitorFlow(session, "ASK_PHONE");
    session = transitionVisitorFlow(session, "SEARCHING_VISITOR");
    session = transitionVisitorFlow(session, "EXISTING_VISITOR_FOUND");
    session = transitionVisitorFlow(session, "EXISTING_VISITOR_ASK_COMPANY");
    session = transitionVisitorFlow(session, "FETCH_MEMBER_LIST");
    session = transitionVisitorFlow(session, "RESOLVE_DESTINATION");
    session = transitionVisitorFlow(session, "CREATE_VISITOR_LOG");
    session = transitionVisitorFlow(session, "SEND_NOTIFICATION");
    session = transitionVisitorFlow(session, "COMPLETED");
    expect(session.state).toBe("COMPLETED");
    expect(canCapturePhoto({ ...session, isExistingVisitor: true })).toBe(false);
  });

  test("delivery strict path reaches completion", () => {
    let session = { ...createVisitorFlowSession(), mode: "delivery" as const };
    session = transitionVisitorFlow(session, "DELIVERY_ASK_NAME");
    session = transitionVisitorFlow(session, "DELIVERY_ASK_DELIVERY_COMPANY");
    session = transitionVisitorFlow(session, "DELIVERY_ASK_TARGET_COMPANY");
    session = transitionVisitorFlow(session, "DELIVERY_ASK_TARGET_PERSON");
    session = transitionVisitorFlow(session, "DELIVERY_CAPTURE_PHOTO");
    session = transitionVisitorFlow(session, "DELIVERY_UPLOAD_PHOTO");
    session = transitionVisitorFlow(session, "FETCH_MEMBER_LIST");
    session = transitionVisitorFlow(session, "RESOLVE_DESTINATION");
    session = transitionVisitorFlow(session, "CREATE_VISITOR_LOG");
    session = transitionVisitorFlow(session, "SEND_NOTIFICATION");
    session = transitionVisitorFlow(session, "COMPLETED");
    expect(session.state).toBe("COMPLETED");
  });
});
