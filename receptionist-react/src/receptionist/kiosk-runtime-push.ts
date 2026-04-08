import type { GenAILiveClient } from "../lib/genai-live-client";
import {
  expectedSlotForState,
  promptForState,
  type VisitorFlowSession,
} from "./visitor-flow-machine";

/**
 * Pushes authoritative kiosk state so the model does not guess the next slot.
 * turnComplete: false — accumulates as context without ending the user turn.
 */
export function pushKioskRuntimeStateJson(
  client: GenAILiveClient | null,
  flow: VisitorFlowSession,
  intent: string | undefined,
  epoch: number,
  lastLineRef: { current: string }
): void {
  if (!client || client.status !== "connected") return;
  const nextSlot = expectedSlotForState(flow.state);
  const payload = {
    flow_state: flow.state,
    mode: flow.mode,
    next_required_slot: nextSlot,
    next_prompt_exact: promptForState(flow.state, flow.visitorName),
    intent: intent || null,
    epoch,
  };
  const line = "KIOSK_STATE_JSON: " + JSON.stringify(payload);
  if (lastLineRef.current === line) return;
  lastLineRef.current = line;
  try {
    client.send([{ text: line }], false);
  } catch (e) {
    console.warn("[KioskRuntime] push failed", e);
  }
}
