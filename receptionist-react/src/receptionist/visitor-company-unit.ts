import { hasMeaningfulValue } from "./flow-helpers";
import type { ReceptionMode } from "./visitor-flow-machine";

/**
 * Detect values that are almost certainly office/unit numbers (e.g. 1901, 1906, "unit 1906"),
 * not person names — used to coerce mistaken slot mappings (unit_number → meeting_with).
 */
export function isLikelyOfficeUnitValue(v: string): boolean {
  const t = String(v || "").trim();
  if (!t) return false;
  if (/^\d{3,5}$/.test(t)) return true;
  if (/^(unit|suite|office|flat)\s*#?\s*[a-z0-9\-]{1,12}$/i.test(t)) return true;
  if (/^\d{1,2}(st|nd|rd|th)(\s+(fl|floor))?$/i.test(t)) return true;
  if (/^floor\s*\d{1,2}$/i.test(t)) return true;
  return false;
}

/**
 * Append a unit fragment to an existing company string (directory disambiguation).
 */
export function mergeVisitCompanyWithUnit(existingCompany: string, incoming: string): string {
  const ex = String(existingCompany || "").trim();
  const inc = String(incoming || "").trim();
  if (!ex) return inc;
  if (!inc) return ex;
  if (ex.toLowerCase().includes(inc.toLowerCase())) return ex;
  if (inc.toLowerCase().includes(ex.toLowerCase())) return inc;
  return `${ex} ${inc}`.trim();
}

/**
 * When the model sends unit/office as meeting_with (alias from unit_number) or as visitor_name,
 * coerce to visit_company for new_visitor so directory disambiguation can proceed.
 */
export function coerceVisitCompanySlotForNewVisitor(params: {
  mode: ReceptionMode;
  normalizedSlot: string;
  value: string;
  expectedSlot: string | null;
  visitCompanyExisting: string;
}): { slotName: string; coerced: boolean; reason?: string } {
  const s = params.normalizedSlot;
  if (params.expectedSlot === "visit_company" && s === "meeting_with") {
    return { slotName: "visit_company", coerced: true, reason: "expected_visit_company" };
  }
  if (params.mode !== "new_visitor") {
    return { slotName: s, coerced: false };
  }
  const v = params.value.trim();
  // CAPTURE_PHOTO / UPLOAD_PHOTO: expectedSlot is null — unit_number→meeting_with must become visit_company.
  if (
    s === "meeting_with" &&
    isLikelyOfficeUnitValue(v) &&
    params.expectedSlot !== "meeting_with"
  ) {
    return { slotName: "visit_company", coerced: true, reason: "unit_like_meeting_with" };
  }
  if (
    s === "visitor_name" &&
    isLikelyOfficeUnitValue(v) &&
    hasMeaningfulValue(params.visitCompanyExisting)
  ) {
    return { slotName: "visit_company", coerced: true, reason: "unit_like_visitor_name" };
  }
  return { slotName: s, coerced: false };
}
