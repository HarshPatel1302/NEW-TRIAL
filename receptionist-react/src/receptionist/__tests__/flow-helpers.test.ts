import {
  getMissingFieldsBeforePhoto,
  getVisitorFlowMissingSlots,
  isExplicitUnknownPerson,
} from "../flow-helpers";

describe("flow-helpers", () => {
  test("isExplicitUnknownPerson recognizes common phrases", () => {
    expect(isExplicitUnknownPerson("I don't know")).toBe(true);
    expect(isExplicitUnknownPerson("not sure")).toBe(true);
    expect(isExplicitUnknownPerson("nobody")).toBe(true);
    expect(isExplicitUnknownPerson("no one")).toBe(true);
    expect(isExplicitUnknownPerson("Jane Doe")).toBe(false);
  });

  test("getVisitorFlowMissingSlots returns mandatory keys when empty", () => {
    const m = getVisitorFlowMissingSlots({});
    expect(m).toEqual(
      expect.arrayContaining(["name", "phone", "came_from"])
    );
    expect(m.length).toBe(3);
  });

  test("getVisitorFlowMissingSlots passes when all visitor fields present", () => {
    const m = getVisitorFlowMissingSlots({
      visitor_name: "A",
      phone: "9876543210",
      came_from: "Mumbai",
      meeting_with: "1905",
    });
    expect(m.length).toBe(0);
  });

  test("getVisitorFlowMissingSlots allows unknown person", () => {
    const m = getVisitorFlowMissingSlots({
      visitor_name: "A",
      phone: "9876543210",
      came_from: "Mumbai",
      meeting_with: "not sure",
    });
    expect(m.length).toBe(0);
  });

  test("getMissingFieldsBeforePhoto visitor: invalid / short phone", () => {
    const r = getMissingFieldsBeforePhoto("meet_person", {
      visitor_name: "A",
      phone: "123",
      came_from: "X",
      visit_company: "Y",
      meeting_with: "not sure",
    });
    expect(r.flow).toBe("visitor");
    expect(r.missing).toContain("phone");
  });

  test("getMissingFieldsBeforePhoto visitor: missing name", () => {
    const r = getMissingFieldsBeforePhoto("meet_person", {
      phone: "9876543210",
      came_from: "X",
      visit_company: "Y",
      meeting_with: "Z",
    });
    expect(r.missing).toContain("name");
  });

  test("getMissingFieldsBeforePhoto visitor: ready when core fields satisfied (person optional)", () => {
    const r = getMissingFieldsBeforePhoto("meet_person", {
      visitor_name: "A",
      phone: "9876543210",
      came_from: "Mumbai",
      visit_company: "Acme",
      meeting_with: "",
    });
    expect(r.missing.length).toBe(0);
  });

  test("getMissingFieldsBeforePhoto delivery: unchanged shape", () => {
    const r = getMissingFieldsBeforePhoto("delivery", {
      visitor_name: "Courier",
      delivery_company: "D",
      recipient_company: "R",
      recipient_name: "Bob",
    });
    expect(r.flow).toBe("delivery");
    expect(r.missing.length).toBe(0);
  });
});
