/**
 * Deterministic helpers for receptionist slot completeness (visitor vs delivery).
 * Used by App.tsx for photo/save gates — keep in sync with tools + config instructions.
 */

const UNKNOWN_PERSON_PHRASES = [
  "unknown",
  "not sure",
  "don't know",
  "dont know",
  "no idea",
  "not provided",
  "n/a",
  "na",
  "unsure",
  "cannot say",
  "can't say",
  "no name",
  "not known",
  "skip",
  "anyone",
  "someone",
];

export function isExplicitUnknownPerson(value: unknown): boolean {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  return UNKNOWN_PERSON_PHRASES.some((p) => raw === p || raw.includes(p));
}

export function hasMeaningfulValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return !["n/a", "na", "none", "unknown", "-", "not available", "not sure"].includes(normalized);
}

/** True if we have a destination: real name/unit OR explicit unknown. */
export function hasVisitorPersonOrUnitSlot(value: unknown): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (isExplicitUnknownPerson(raw)) return true;
  return hasMeaningfulValue(raw);
}

export type VisitorMissingField =
  | "name"
  | "phone"
  | "came_from"
  | "meeting_with";

export function getVisitorFlowMissingSlots(collectedSlots: Record<string, string>): VisitorMissingField[] {
  const missing: VisitorMissingField[] = [];
  if (!hasMeaningfulValue(collectedSlots.visitor_name) && !hasMeaningfulValue(collectedSlots.name)) {
    missing.push("name");
  }
  const phone = String(collectedSlots.phone || collectedSlots.visitor_phone || "").replace(/\D/g, "");
  if (phone.length < 10) {
    missing.push("phone");
  }
  if (!hasMeaningfulValue(collectedSlots.came_from)) {
    missing.push("came_from");
  }
  const personLine = collectedSlots.meeting_with || collectedSlots.person_to_meet || "";
  if (!hasVisitorPersonOrUnitSlot(personLine)) {
    missing.push("meeting_with");
  }
  return missing;
}
