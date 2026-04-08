/**
 * QA scenario coverage for product flows (new visitor + delivery only).
 * Complements browser/mic testing: validates deterministic rules and state order.
 */
import {
  getMissingFieldsBeforePhoto,
  hasVisitorPersonOrUnitSlot,
} from "../flow-helpers";
import {
  createVisitorFlowSession,
  expectedSlotForState,
  transitionVisitorFlow,
} from "../visitor-flow-machine";

describe("QA Scenario A — new visitor slot order (state machine)", () => {
  test("name → phone → coming from → company → person → photo", () => {
    let s = createVisitorFlowSession();
    s = { ...s, mode: "new_visitor" };
    s = transitionVisitorFlow(s, "ASK_NAME");
    expect(expectedSlotForState("ASK_NAME")).toBe("visitor_name");
    s = transitionVisitorFlow(s, "ASK_PHONE");
    expect(expectedSlotForState("ASK_PHONE")).toBe("phone");
    s = transitionVisitorFlow(s, "ASK_COMING_FROM");
    expect(expectedSlotForState("ASK_COMING_FROM")).toBe("came_from");
    s = transitionVisitorFlow(s, "ASK_COMPANY");
    expect(expectedSlotForState("ASK_COMPANY")).toBe("visit_company");
    s = transitionVisitorFlow(s, "ASK_PERSON");
    expect(expectedSlotForState("ASK_PERSON")).toBe("meeting_with");
    s = transitionVisitorFlow(s, "CAPTURE_PHOTO");
    expect(s.state).toBe("CAPTURE_PHOTO");
  });
});

describe("QA Scenario B — optional person does not block photo gate", () => {
  test("empty meeting_with still allows photo readiness when core fields are complete", () => {
    const r = getMissingFieldsBeforePhoto("meet_person", {
      visitor_name: "A",
      phone: "9876543210",
      came_from: "Mumbai",
      visit_company: "Acme",
      meeting_with: "",
    });
    expect(r.flow).toBe("visitor");
    expect(r.missing).not.toContain("meeting_with");
    expect(r.missing.length).toBe(0);
    expect(hasVisitorPersonOrUnitSlot("not sure")).toBe(true);
  });
});

describe("QA Scenario C — delivery order", () => {
  test("delivery slot sequence through photo state", () => {
    let s = createVisitorFlowSession();
    s = { ...s, mode: "delivery" };
    s = transitionVisitorFlow(s, "DELIVERY_ASK_NAME");
    expect(expectedSlotForState("DELIVERY_ASK_NAME")).toBe("visitor_name");
    s = transitionVisitorFlow(s, "DELIVERY_ASK_COMPANY");
    expect(expectedSlotForState("DELIVERY_ASK_COMPANY")).toBe("delivery_company");
    s = transitionVisitorFlow(s, "DELIVERY_ASK_RECIPIENT_COMPANY");
    expect(expectedSlotForState("DELIVERY_ASK_RECIPIENT_COMPANY")).toBe("recipient_company");
    s = transitionVisitorFlow(s, "DELIVERY_ASK_RECIPIENT_PERSON");
    expect(expectedSlotForState("DELIVERY_ASK_RECIPIENT_PERSON")).toBe("recipient_name");
    s = transitionVisitorFlow(s, "DELIVERY_CAPTURE_PHOTO");
    expect(s.state).toBe("DELIVERY_CAPTURE_PHOTO");
  });
});

describe("QA Scenario D — invalid / missing input (photo gate)", () => {
  test("short phone is flagged", () => {
    const r = getMissingFieldsBeforePhoto("meet_person", {
      visitor_name: "A",
      phone: "12",
      came_from: "X",
      visit_company: "Y",
      meeting_with: "Z",
    });
    expect(r.missing).toContain("phone");
  });

  test("blank name is flagged", () => {
    const r = getMissingFieldsBeforePhoto("meet_person", {
      phone: "9876543210",
      came_from: "X",
      visit_company: "Y",
      meeting_with: "Z",
    });
    expect(r.missing).toContain("name");
  });

  test("missing company is flagged", () => {
    const r = getMissingFieldsBeforePhoto("meet_person", {
      visitor_name: "A",
      phone: "9876543210",
      came_from: "X",
      meeting_with: "Z",
    });
    expect(r.missing).toContain("visit_company");
  });

  test("core complete without meeting_with does not add meeting_with to missing", () => {
    const r = getMissingFieldsBeforePhoto("meet_person", {
      visitor_name: "A",
      phone: "9876543210",
      came_from: "X",
      visit_company: "Y",
      meeting_with: "",
    });
    expect(r.missing).not.toContain("meeting_with");
  });
});

describe("QA Scenario E — delivery completeness", () => {
  test("partial delivery lists missing recipient", () => {
    const r = getMissingFieldsBeforePhoto("delivery", {
      visitor_name: "D",
      delivery_company: "FedEx",
      recipient_company: "Acme",
    });
    expect(r.missing).toContain("recipient_name");
  });
});
