import type { ActiveReceptionFlow } from "./flow-helpers";
import type { VisitorFlowState } from "./visitor-flow-machine";

/**
 * When slot preconditions for photo are satisfied but FSM lagged behind, return the capture state to coerce to.
 * Returns null if coercion is unsafe (e.g. ERROR, COMPLETED) or already on capture.
 */
export function captureStateCoercionTarget(
  flowState: VisitorFlowState,
  activeFlow: ActiveReceptionFlow
): VisitorFlowState | null {
  if (activeFlow === "delivery") {
    if (flowState === "DELIVERY_CAPTURE_PHOTO") return null;
    if (
      flowState === "DELIVERY_ASK_NAME" ||
      flowState === "DELIVERY_ASK_COMPANY" ||
      flowState === "DELIVERY_ASK_RECIPIENT_COMPANY" ||
      flowState === "DELIVERY_ASK_RECIPIENT_PERSON"
    ) {
      return "DELIVERY_CAPTURE_PHOTO";
    }
    return null;
  }

  if (flowState === "CAPTURE_PHOTO") return null;
  if (
    flowState === "ASK_NAME" ||
    flowState === "ASK_PHONE" ||
    flowState === "ASK_COMING_FROM" ||
    flowState === "ASK_COMPANY"
  ) {
    return "CAPTURE_PHOTO";
  }
  return null;
}
