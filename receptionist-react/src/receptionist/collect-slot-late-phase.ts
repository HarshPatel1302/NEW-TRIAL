import type { ReceptionMode, VisitorFlowState } from "./visitor-flow-machine";

/**
 * After mandatory slots are filled, the model sometimes calls collect_slot_value with junk
 * (e.g. "yes" as visitor_name). Restrict which slots may still be updated so confirmations
 * do not overwrite committed data.
 */
export type LatePhaseCollectGate = { allowed: true } | { allowed: false; message: string };

const DELIVERY_SLOTS = [
  "visitor_name",
  "delivery_company",
  "recipient_company",
  "recipient_name",
] as const;

const VISITOR_CORE = ["visitor_name", "phone", "came_from", "visit_company"] as const;

export function gateCollectSlotInLateFlowPhase(
  state: VisitorFlowState,
  mode: ReceptionMode,
  slotName: string
): LatePhaseCollectGate {
  const deny = (message: string): LatePhaseCollectGate => ({ allowed: false, message });

  switch (state) {
    case "CAPTURE_PHOTO":
      // Delivery flow uses DELIVERY_CAPTURE_PHOTO; CAPTURE_PHOTO is new-visitor only in practice.
      return slotName === "visit_company" || slotName === "phone"
        ? { allowed: true }
        : deny(
            "Visitor details are complete for this step. Only visit_company (directory refinement) or phone correction may be updated. Otherwise call capture_photo per next_required_tool — do not log yes/no as a slot."
          );
    case "DELIVERY_CAPTURE_PHOTO":
      return (DELIVERY_SLOTS as readonly string[]).includes(slotName)
        ? { allowed: true }
        : deny(
            "Delivery slots are complete. Call capture_photo only; do not collect unrelated slot values in this state."
          );
    case "UPLOAD_PHOTO":
      if (mode === "delivery") {
        return deny("Unexpected state: use save_visitor_info for delivery after photo.");
      }
      return (VISITOR_CORE as readonly string[]).includes(slotName)
        ? { allowed: true }
        : deny(
            "Photo captured; only refine visitor_name, phone, came_from, or visit_company if save failed, then call save_visitor_info again."
          );
    case "DELIVERY_UPLOAD_PHOTO":
      return (DELIVERY_SLOTS as readonly string[]).includes(slotName)
        ? { allowed: true }
        : deny(
            "Delivery photo captured; only refine delivery slot fields if needed, then call save_visitor_info."
          );
    default:
      return { allowed: true };
  }
}
