import { hasMeaningfulValue } from "./flow-helpers";
import type { MatchedMember } from "./member-directory";

/** Directory lookup failed but the visitor already gave a company string — do not use missing visit_company. */
export const COMPANY_DIRECTORY_MATCH_FIELD = "company_directory_match" as const;

/** Multiple directory hits; ask to pick — not the same as an empty slot. */
export const VISIT_COMPANY_RESOLUTION_FIELD = "visit_company_resolution" as const;

export type CompanyDirectorySaveHint =
  | { kind: "proceed"; members: MatchedMember[] }
  | {
      kind: "need_disambiguation";
      missing_fields: [typeof VISIT_COMPANY_RESOLUTION_FIELD];
      message: string;
    }
  | {
      kind: "need_directory_match";
      missing_fields: [typeof COMPANY_DIRECTORY_MATCH_FIELD];
      message: string;
    }
  | {
      kind: "need_slot";
      missing_fields: ["visit_company"];
      message: string;
    };

/**
 * Pure classification for new-visitor save when resolving company via directory (required match).
 */
export function classifyVisitorCompanyDirectoryForSave(params: {
  resolvedVisitCompany: string;
  matchedMembers: MatchedMember[];
}): CompanyDirectorySaveHint {
  const spoken = String(params.resolvedVisitCompany || "").trim();
  if (!hasMeaningfulValue(spoken)) {
    return {
      kind: "need_slot",
      missing_fields: ["visit_company"],
      message: "Collect name, phone, where you are coming from, and company to visit before saving.",
    };
  }

  const members = params.matchedMembers || [];
  if (members.length === 0) {
    return {
      kind: "need_directory_match",
      missing_fields: [COMPANY_DIRECTORY_MATCH_FIELD],
      message:
        "The company name is not in our directory. Ask the visitor to spell it as listed in Cyber One, or provide a unit number — do not ask which company they are visiting as if they had not answered.",
    };
  }

  if (members.length > 1) {
    const options = members
      .slice(0, 2)
      .map((m) => {
        const label = String(m.company_name || m.member_name || m.unit_member_name || "").trim() || "Unknown";
        const unit = String(m.building_unit || m.unit_flat_number || "").trim();
        return unit ? `${label} (${unit})` : label;
      })
      .join(" or ");
    return {
      kind: "need_disambiguation",
      missing_fields: [VISIT_COMPANY_RESOLUTION_FIELD],
      message: `Multiple directory matches (e.g. different units). Ask which unit or office they mean: ${options}. Then call collect_slot_value with slot_name visit_company and a single value that includes both company name and unit (example: "Greenscape 1906"). Do not use unit_number or meeting_with for a unit-only reply — always visit_company.`,
    };
  }

  return { kind: "proceed", members };
}
