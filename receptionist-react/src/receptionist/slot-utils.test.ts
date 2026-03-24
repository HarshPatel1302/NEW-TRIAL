import {
  getMissingFieldsBeforePhoto,
  getNextSlotToAsk,
  hasMeaningfulValue,
  isValidVisitorPhone,
  inferActiveFlow,
  normalizeIndianMobile10,
} from "./slot-utils";

describe("slot-utils", () => {
  describe("getMissingFieldsBeforePhoto", () => {
    it("visitor: requires phone, came_from, company_to_visit, person_in_company", () => {
      const r = getMissingFieldsBeforePhoto("meet_person", {});
      expect(r.flow).toBe("visitor");
      expect(r.missing).toContain("phone");
      expect(r.missing).toContain("came_from");
      expect(r.missing).toContain("company_to_visit");
      expect(r.missing).toContain("person_in_company");
    });

    it("visitor: all required present yields no missing", () => {
      const slots = {
        visitor_name: "Harsh Patel",
        phone: "9876543210",
        came_from: "Walk-in",
        company_to_visit: "Futurescape",
        person_in_company: "Mihir Jadhav",
      };
      const r = getMissingFieldsBeforePhoto("meet_person", slots);
      expect(r.missing).toHaveLength(0);
    });

    it("visitor: accepts meeting_with as company_to_visit fallback", () => {
      const slots = {
        visitor_name: "Harsh",
        phone: "9876543210",
        came_from: "Walk-in",
        meeting_with: "Futurescape",
        person_in_company: "Someone",
      };
      const r = getMissingFieldsBeforePhoto("meet_person", slots);
      expect(r.missing).toHaveLength(0);
    });

    it("delivery: requires all 4 fields", () => {
      const r = getMissingFieldsBeforePhoto("delivery", {});
      expect(r.flow).toBe("delivery");
      expect(r.missing).toContain("delivery_person_name");
      expect(r.missing).toContain("delivery_company");
      expect(r.missing).toContain("recipient_company");
      expect(r.missing).toContain("recipient_name");
    });

    it("delivery: all 4 present yields no missing", () => {
      const slots = {
        visitor_name: "Courier",
        delivery_company: "Blue Dart",
        recipient_company: "Futurescape",
        recipient_name: "Mihir",
      };
      const r = getMissingFieldsBeforePhoto("delivery", slots);
      expect(r.missing).toHaveLength(0);
    });
  });

  describe("getNextSlotToAsk", () => {
    it("visitor: asks person_in_company after company when person missing", () => {
      const slots = {
        visitor_name: "Harsh",
        phone: "9876543210",
        came_from: "Walk-in",
        company_to_visit: "Futurescape",
      };
      expect(getNextSlotToAsk("meet_person", slots)).toBe("person_in_company");
    });

    it("visitor: returns null when all required provided", () => {
      const slots = {
        visitor_name: "Harsh",
        phone: "9876543210",
        came_from: "Walk-in",
        company_to_visit: "Futurescape",
        person_in_company: "Mihir",
      };
      expect(getNextSlotToAsk("meet_person", slots)).toBeNull();
    });
  });

  describe("hasMeaningfulValue", () => {
    it("rejects n/a, none, unknown", () => {
      expect(hasMeaningfulValue("n/a")).toBe(false);
      expect(hasMeaningfulValue("none")).toBe(false);
      expect(hasMeaningfulValue("unknown")).toBe(false);
    });
    it("accepts real values", () => {
      expect(hasMeaningfulValue("Harsh Patel")).toBe(true);
      expect(hasMeaningfulValue("Futurescape")).toBe(true);
    });
  });

  describe("isValidVisitorPhone / normalizeIndianMobile10", () => {
    it("requires exactly 10 digits", () => {
      expect(isValidVisitorPhone("9876543210")).toBe(true);
      expect(isValidVisitorPhone("987654321")).toBe(false);
      expect(isValidVisitorPhone("98765432101")).toBe(false);
    });
    it("normalizes +91 prefix", () => {
      expect(normalizeIndianMobile10("+91 98765 43210")).toBe("9876543210");
      expect(isValidVisitorPhone("+919876543210")).toBe(true);
    });
  });

  describe("inferActiveFlow", () => {
    it("delivery slots imply delivery flow", () => {
      expect(inferActiveFlow("meet_person", { delivery_company: "Blue Dart" })).toBe("delivery");
    });
  });
});
