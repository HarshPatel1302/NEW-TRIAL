import {
  getVisitorFlowMissingSlots,
  isExplicitUnknownPerson,
} from "../flow-helpers";

describe("flow-helpers", () => {
  test("isExplicitUnknownPerson recognizes common phrases", () => {
    expect(isExplicitUnknownPerson("I don't know")).toBe(true);
    expect(isExplicitUnknownPerson("not sure")).toBe(true);
    expect(isExplicitUnknownPerson("Jane Doe")).toBe(false);
  });

  test("getVisitorFlowMissingSlots returns all keys when empty", () => {
    const m = getVisitorFlowMissingSlots({});
    expect(m).toEqual(
      expect.arrayContaining([
        "name",
        "phone",
        "came_from",
        "meeting_with",
      ])
    );
    expect(m.length).toBe(4);
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
});
