import {
  coerceVisitCompanySlotForNewVisitor,
  isLikelyOfficeUnitValue,
  mergeVisitCompanyWithUnit,
} from "../visitor-company-unit";

describe("isLikelyOfficeUnitValue", () => {
  test("3–5 digit office-style numbers", () => {
    expect(isLikelyOfficeUnitValue("1906")).toBe(true);
    expect(isLikelyOfficeUnitValue("1901")).toBe(true);
    expect(isLikelyOfficeUnitValue("12")).toBe(false);
  });

  test("unit / suite patterns", () => {
    expect(isLikelyOfficeUnitValue("unit 1906")).toBe(true);
    expect(isLikelyOfficeUnitValue("suite #12")).toBe(true);
  });
});

describe("mergeVisitCompanyWithUnit", () => {
  test("appends unit to company", () => {
    expect(mergeVisitCompanyWithUnit("Greenscape", "1906")).toBe("Greenscape 1906");
  });

  test("dedupes containment", () => {
    expect(mergeVisitCompanyWithUnit("Greenscape 1906", "1906")).toBe("Greenscape 1906");
  });
});

describe("coerceVisitCompanySlotForNewVisitor", () => {
  test("CAPTURE_PHOTO-style: expectedSlot null + meeting_with + unit → visit_company", () => {
    const r = coerceVisitCompanySlotForNewVisitor({
      mode: "new_visitor",
      normalizedSlot: "meeting_with",
      value: "1906",
      expectedSlot: null,
      visitCompanyExisting: "Greenscape",
    });
    expect(r).toEqual({
      slotName: "visit_company",
      coerced: true,
      reason: "unit_like_meeting_with",
    });
  });

  test("ASK_PERSON: expected meeting_with + numeric stays meeting_with", () => {
    const r = coerceVisitCompanySlotForNewVisitor({
      mode: "new_visitor",
      normalizedSlot: "meeting_with",
      value: "1906",
      expectedSlot: "meeting_with",
      visitCompanyExisting: "",
    });
    expect(r.coerced).toBe(false);
    expect(r.slotName).toBe("meeting_with");
  });

  test("expected visit_company maps meeting_with without unit check (existing behavior)", () => {
    const r = coerceVisitCompanySlotForNewVisitor({
      mode: "new_visitor",
      normalizedSlot: "meeting_with",
      value: "any",
      expectedSlot: "visit_company",
      visitCompanyExisting: "",
    });
    expect(r).toMatchObject({ slotName: "visit_company", coerced: true });
  });
});
