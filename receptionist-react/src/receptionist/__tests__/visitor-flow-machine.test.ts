import {
  canCapturePhoto,
  canCreateVisitor,
  createVisitorFlowSession,
  expectedSlotForState,
  promptForState,
  transitionVisitorFlow,
  type VisitorFlowSession,
} from "../visitor-flow-machine";

describe("visitor flow machine (new visitor + delivery)", () => {
  test("ASK_PHONE → ASK_NAME; phone first then name slot", () => {
    let session = createVisitorFlowSession();
    session = { ...session, mode: "new_visitor" };
    session = transitionVisitorFlow(session, "ASK_PHONE");
    expect(session.state).toBe("ASK_PHONE");
    expect(expectedSlotForState("ASK_PHONE")).toBe("phone");
    session = transitionVisitorFlow(session, "ASK_NAME");
    expect(session.state).toBe("ASK_NAME");
    expect(expectedSlotForState("ASK_NAME")).toBe("visitor_name");
    expect(promptForState("ASK_PHONE")).toMatch(/phone/i);
    expect(promptForState("ASK_NAME")).toMatch(/name/i);
  });

  test("new visitor happy path through optional person to photo", () => {
    let session: VisitorFlowSession = { ...createVisitorFlowSession(), mode: "new_visitor" };
    session = transitionVisitorFlow(session, "ASK_PHONE");
    session = transitionVisitorFlow(session, "ASK_NAME");
    session = transitionVisitorFlow(session, "ASK_COMING_FROM");
    session = transitionVisitorFlow(session, "ASK_COMPANY");
    session = transitionVisitorFlow(session, "ASK_PERSON");
    session = transitionVisitorFlow(session, "CAPTURE_PHOTO");
    expect(session.state).toBe("CAPTURE_PHOTO");
    expect(expectedSlotForState("ASK_PERSON")).toBe("meeting_with");
    expect(canCapturePhoto(session)).toBe(true);
  });

  test("new visitor may jump ASK_COMPANY → CAPTURE_PHOTO when skipping optional person at tool layer", () => {
    let session: VisitorFlowSession = { ...createVisitorFlowSession(), mode: "new_visitor" };
    session = transitionVisitorFlow(session, "ASK_PHONE");
    session = transitionVisitorFlow(session, "ASK_NAME");
    session = transitionVisitorFlow(session, "ASK_COMING_FROM");
    session = transitionVisitorFlow(session, "ASK_COMPANY");
    session = transitionVisitorFlow(session, "CAPTURE_PHOTO");
    expect(session.state).toBe("CAPTURE_PHOTO");
    expect(canCapturePhoto(session)).toBe(true);
  });

  test("delivery happy path through photo", () => {
    let session: VisitorFlowSession = { ...createVisitorFlowSession(), mode: "delivery" };
    session = transitionVisitorFlow(session, "DELIVERY_ASK_NAME");
    session = transitionVisitorFlow(session, "DELIVERY_ASK_COMPANY");
    session = transitionVisitorFlow(session, "DELIVERY_ASK_RECIPIENT_COMPANY");
    session = transitionVisitorFlow(session, "DELIVERY_ASK_RECIPIENT_PERSON");
    session = transitionVisitorFlow(session, "DELIVERY_CAPTURE_PHOTO");
    expect(session.state).toBe("DELIVERY_CAPTURE_PHOTO");
    expect(canCapturePhoto(session)).toBe(true);
  });

  test("delivery may jump RECIPIENT_COMPANY → DELIVERY_CAPTURE_PHOTO when tool layer has all slots", () => {
    let session: VisitorFlowSession = { ...createVisitorFlowSession(), mode: "delivery" };
    session = transitionVisitorFlow(session, "DELIVERY_ASK_NAME");
    session = transitionVisitorFlow(session, "DELIVERY_ASK_COMPANY");
    session = transitionVisitorFlow(session, "DELIVERY_CAPTURE_PHOTO");
    expect(session.state).toBe("DELIVERY_CAPTURE_PHOTO");
    expect(canCapturePhoto(session)).toBe(true);
  });

  test("canCreateVisitor requires new_visitor mode and photo uploaded", () => {
    const base: VisitorFlowSession = {
      ...createVisitorFlowSession(),
      mode: "new_visitor",
      state: "CAPTURE_PHOTO",
    };
    expect(canCreateVisitor({ ...base, photoUploaded: false })).toBe(false);
    expect(canCreateVisitor({ ...base, photoUploaded: true })).toBe(true);
    expect(canCreateVisitor({ ...base, mode: "delivery", photoUploaded: true })).toBe(false);
  });

  test("deterministic visitor prompts contain no returning / welcome-back wording", () => {
    const states = [
      "ASK_PHONE",
      "ASK_NAME",
      "ASK_COMING_FROM",
      "ASK_COMPANY",
      "ASK_PERSON",
      "CAPTURE_PHOTO",
    ] as const;
    for (const st of states) {
      const p = (promptForState(st, "Alex") || "").toLowerCase();
      expect(p).not.toContain("welcome again");
      expect(p).not.toContain("welcome back");
      expect(p).not.toContain("existing visitor");
      expect(p).not.toContain("previous");
    }
  });

  test("no obsolete returning-visitor state names in active union", () => {
    const s = createVisitorFlowSession();
    expect(s.state).toBe("IDLE");
    const forbidden = [
      "SEARCHING_VISITOR",
      "EXISTING_VISITOR_FOUND",
      "RETURNING",
    ];
    for (const bad of forbidden) {
      expect(JSON.stringify(s)).not.toContain(bad);
    }
  });
});
