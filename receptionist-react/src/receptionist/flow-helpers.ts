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

export type VisitorMissingField = "name" | "phone" | "came_from";

/** Core mandatory visitor slots (person to meet is optional and not included here). */
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
  return missing;
}

export type ActiveReceptionFlow = "visitor" | "delivery";

export function normalizeIntentName(value: unknown): string {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (!raw) return "meet_person";
  if (raw.includes("delivery") || raw.includes("parcel") || raw.includes("courier")) {
    return "delivery";
  }
  if (raw.includes("appointment") || raw.includes("meet") || raw.includes("visit")) {
    return "meet_person";
  }
  if (raw.includes("info") || raw.includes("inquiry") || raw.includes("about")) {
    return "info";
  }
  return raw;
}

export function inferActiveFlow(
  intent: unknown,
  collectedSlots: Record<string, string>
): ActiveReceptionFlow {
  const normalizedIntent = normalizeIntentName(intent);
  if (normalizedIntent === "delivery") {
    return "delivery";
  }

  if (
    hasMeaningfulValue(collectedSlots.delivery_company) ||
    hasMeaningfulValue(collectedSlots.recipient_company) ||
    hasMeaningfulValue(collectedSlots.recipient_name) ||
    hasMeaningfulValue(collectedSlots.delivery_partner)
  ) {
    return "delivery";
  }

  return "visitor";
}

/** Slots still required before capture_photo (visitor vs delivery). */
export function getMissingFieldsBeforePhoto(
  intent: unknown,
  collectedSlots: Record<string, string>
): { flow: ActiveReceptionFlow; missing: string[] } {
  const flow = inferActiveFlow(intent, collectedSlots);
  const missing: string[] = [];

  if (flow === "delivery") {
    if (!hasMeaningfulValue(collectedSlots.visitor_name) && !hasMeaningfulValue(collectedSlots.name)) {
      missing.push("delivery_person_name");
    }
    if (
      !hasMeaningfulValue(collectedSlots.delivery_company) &&
      !hasMeaningfulValue(collectedSlots.delivery_partner) &&
      !hasMeaningfulValue(collectedSlots.company)
    ) {
      missing.push("delivery_company");
    }
    if (
      !hasMeaningfulValue(collectedSlots.recipient_company) &&
      !hasMeaningfulValue(collectedSlots.target_company) &&
      !hasMeaningfulValue(collectedSlots.department)
    ) {
      missing.push("recipient_company");
    }
    if (
      !hasMeaningfulValue(collectedSlots.recipient_name) &&
      !hasMeaningfulValue(collectedSlots.person_to_meet) &&
      !hasMeaningfulValue(collectedSlots.meeting_with)
    ) {
      missing.push("recipient_name");
    }
  } else {
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
    if (!hasMeaningfulValue(collectedSlots.visit_company) && !hasMeaningfulValue(collectedSlots.company)) {
      missing.push("visit_company");
    }
    // Person to meet is optional for new visitors; flow state still asks once, but photo/save gates do not block on it.
  }

  return { flow, missing };
}
