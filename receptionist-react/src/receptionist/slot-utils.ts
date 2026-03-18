/**
 * Slot filling utilities for visitor and delivery flows.
 * Extracted for testability.
 */

export function hasMeaningfulValue(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return !["n/a", "na", "none", "unknown", "-", "not available", "not sure"].includes(normalized);
}

export function toPhoneDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidVisitorPhone(value: unknown): boolean {
  return toPhoneDigits(value).length >= 10;
}

export type ActiveReceptionFlow = "visitor" | "delivery";

export function normalizeIntentName(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return "meet_person";
  if (raw.includes("delivery") || raw.includes("parcel") || raw.includes("courier")) return "delivery";
  if (raw.includes("appointment") || raw.includes("meet") || raw.includes("visit")) return "meet_person";
  if (raw.includes("info") || raw.includes("inquiry") || raw.includes("about")) return "info";
  return raw;
}

export function inferActiveFlow(intent: unknown, collectedSlots: Record<string, string>): ActiveReceptionFlow {
  if (normalizeIntentName(intent) === "delivery") return "delivery";
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
    if (!isValidVisitorPhone(collectedSlots.phone || collectedSlots.visitor_phone || "")) {
      missing.push("phone");
    }
    if (!hasMeaningfulValue(collectedSlots.came_from) && !hasMeaningfulValue(collectedSlots.company)) {
      missing.push("came_from");
    }
    if (!hasMeaningfulValue(collectedSlots.company_to_visit) && !hasMeaningfulValue(collectedSlots.meeting_with)) {
      missing.push("company_to_visit");
    }
  }

  return { flow, missing };
}

export function getNextSlotToAsk(intent: unknown, collectedSlots: Record<string, string>): string | null {
  const { flow, missing } = getMissingFieldsBeforePhoto(intent, collectedSlots);
  const visitorOrder = ["phone", "visitor_name", "came_from", "company_to_visit", "person_in_company"];
  const deliveryOrder = ["visitor_name", "delivery_company", "recipient_company", "recipient_name"];
  const order = flow === "delivery" ? deliveryOrder : visitorOrder;

  for (const slot of order) {
    const isMissing =
      missing.includes(slot) ||
      (slot === "visitor_name" && missing.includes("name")) ||
      (slot === "visitor_name" && missing.includes("delivery_person_name"));
    if (isMissing) return slot;
  }
  if (
    flow === "visitor" &&
    missing.length === 0 &&
    !hasMeaningfulValue(collectedSlots.person_in_company) &&
    hasMeaningfulValue(collectedSlots.company_to_visit)
  ) {
    return "person_in_company";
  }
  return missing[0] || null;
}
