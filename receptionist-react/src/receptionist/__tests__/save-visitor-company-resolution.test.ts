import {
  classifyVisitorCompanyDirectoryForSave,
  COMPANY_DIRECTORY_MATCH_FIELD,
  VISIT_COMPANY_RESOLUTION_FIELD,
} from "../save-visitor-company-resolution";

describe("classifyVisitorCompanyDirectoryForSave", () => {
  test("empty spoken company → visit_company slot missing", () => {
    const r = classifyVisitorCompanyDirectoryForSave({
      resolvedVisitCompany: "  ",
      matchedMembers: [],
    });
    expect(r.kind).toBe("need_slot");
    if (r.kind === "need_slot") {
      expect(r.missing_fields).toEqual(["visit_company"]);
    }
  });

  test("spoken company but no directory hits → company_directory_match", () => {
    const r = classifyVisitorCompanyDirectoryForSave({
      resolvedVisitCompany: "Greenscape",
      matchedMembers: [],
    });
    expect(r.kind).toBe("need_directory_match");
    if (r.kind === "need_directory_match") {
      expect(r.missing_fields).toEqual([COMPANY_DIRECTORY_MATCH_FIELD]);
      expect(r.message).toContain("directory");
    }
  });

  test("multiple matches → visit_company_resolution", () => {
    const r = classifyVisitorCompanyDirectoryForSave({
      resolvedVisitCompany: "Acme",
      matchedMembers: [
        {
          member_id: 1,
          member_name: "A",
          member_type_name: "",
          member_mobile_number: "",
          member_email_id: "",
          user_id: "",
          unit_id: null,
          building_unit: "Tower A",
          unit_flat_number: "101",
          soc_building_name: "",
          unit_member_name: "",
          company_name: "Acme Corp",
        },
        {
          member_id: 2,
          member_name: "B",
          member_type_name: "",
          member_mobile_number: "",
          member_email_id: "",
          user_id: "",
          unit_id: null,
          building_unit: "Tower B",
          unit_flat_number: "202",
          soc_building_name: "",
          unit_member_name: "",
          company_name: "Acme Ltd",
        },
      ],
    });
    expect(r.kind).toBe("need_disambiguation");
    if (r.kind === "need_disambiguation") {
      expect(r.missing_fields).toEqual([VISIT_COMPANY_RESOLUTION_FIELD]);
      expect(r.message).toContain("Acme");
    }
  });

  test("single match → proceed", () => {
    const m = {
      member_id: 9,
      member_name: "Host",
      member_type_name: "",
      member_mobile_number: "",
      member_email_id: "",
      user_id: "",
      unit_id: null,
      building_unit: "",
      unit_flat_number: "",
      soc_building_name: "",
      unit_member_name: "",
      company_name: "Solo Co",
    };
    const r = classifyVisitorCompanyDirectoryForSave({
      resolvedVisitCompany: "Solo",
      matchedMembers: [m],
    });
    expect(r.kind).toBe("proceed");
    if (r.kind === "proceed") {
      expect(r.members).toEqual([m]);
    }
  });
});
