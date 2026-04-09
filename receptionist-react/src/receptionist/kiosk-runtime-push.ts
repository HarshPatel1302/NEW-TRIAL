import type { GenAILiveClient } from "../lib/genai-live-client";
import { getMissingFieldsBeforePhoto } from "./flow-helpers";
import {
  deriveKioskSessionPhase,
  deriveNextRequiredTool,
  kioskPhotoVoiceLineExact,
} from "./kiosk-session-phase";
import {
  expectedSlotForState,
  promptForState,
  type VisitorFlowSession,
} from "./visitor-flow-machine";

/**
 * Dedupe + validation gate for KIOSK_STATE_JSON pushes.
 * `validationGate` = true after need_more_info (invalid phone, etc.) so we do not suppress re-asking.
 */
export type KioskPushDedupeState = {
  lastPromptKey: string;
  lastSlotsDigest: string;
  validationGate: boolean;
};

export function createKioskPushDedupeState(): KioskPushDedupeState {
  return { lastPromptKey: "", lastSlotsDigest: "", validationGate: false };
}

export function buildKioskPromptKey(
  mode: VisitorFlowSession["mode"],
  state: VisitorFlowSession["state"],
  nextSlot: string | null
): string {
  return `${mode ?? "none"}|${state}|${nextSlot ?? "_"}`;
}

/**
 * Stable fingerprint of slots that matter for the kiosk flow (visitor vs delivery).
 */
export function buildKioskSlotsDigest(
  mode: VisitorFlowSession["mode"],
  intent: string | undefined,
  slots: Record<string, string>
): string {
  const intentLower = String(intent || "").toLowerCase();
  const inferDelivery = mode === "delivery" || intentLower === "delivery";
  const keys = inferDelivery
    ? [
        "visitor_name",
        "name",
        "delivery_company",
        "delivery_partner",
        "company",
        "recipient_company",
        "target_company",
        "department",
        "recipient_name",
        "person_to_meet",
        "meeting_with",
      ]
    : [
        "visitor_name",
        "name",
        "phone",
        "visitor_phone",
        "came_from",
        "visit_company",
        "company",
        "company_resolution_query",
        "company_resolution_candidates_uri",
      ];
  const parts = keys.map((k) => `${k}:${String(slots[k] ?? "").slice(0, 160)}`);
  return parts.join("|");
}

/** Test helper: whether we would set repeat_suppressed given prior dedupe snapshot. */
export function wouldSuppressRepeatedKioskPrompt(params: {
  priorKey: string;
  priorDigest: string;
  validationGate: boolean;
  promptKey: string;
  digest: string;
}): boolean {
  if (params.validationGate) return false;
  if (!params.priorKey) return false;
  return params.promptKey === params.priorKey && params.digest === params.priorDigest;
}

export type KioskStatePayloadResult = {
  line: string;
  payload: Record<string, unknown>;
  promptExact: string;
  repeatSuppressed: boolean;
};

/**
 * Builds the KIOSK_STATE_JSON line and updates dedupe snapshot (same semantics as push).
 * Exported for unit tests and debugging.
 */
export function buildKioskStateJsonLine(
  flow: VisitorFlowSession,
  intent: string | undefined,
  epoch: number,
  collectedSlots: Record<string, string>,
  dedupe: KioskPushDedupeState
): KioskStatePayloadResult {
  const nextSlot = expectedSlotForState(flow.state);
  const promptExact = promptForState(flow.state, flow.visitorName) || "";
  const phase = deriveKioskSessionPhase(flow.state);
  const nextRequiredTool = deriveNextRequiredTool(flow.state);
  const promptKey = buildKioskPromptKey(flow.mode, flow.state, nextSlot);
  const digest = buildKioskSlotsDigest(flow.mode, intent, collectedSlots);
  const missing = getMissingFieldsBeforePhoto(intent ?? "meet_person", collectedSlots);

  const prevKey = dedupe.lastPromptKey;
  const prevDigest = dedupe.lastSlotsDigest;
  const repeatSuppressed = wouldSuppressRepeatedKioskPrompt({
    priorKey: prevKey,
    priorDigest: prevDigest,
    validationGate: dedupe.validationGate,
    promptKey,
    digest,
  });

  dedupe.lastPromptKey = promptKey;
  dedupe.lastSlotsDigest = digest;

  const payload: Record<string, unknown> = {
    flow_state: flow.state,
    mode: flow.mode,
    phase,
    next_required_slot: nextSlot,
    next_required_tool: nextRequiredTool,
    next_prompt_exact: promptExact,
    intent: intent || null,
    epoch,
    prompt_key: promptKey,
    slots_digest: digest,
    missing_fields: missing.missing,
    active_flow: missing.flow,
    repeat_suppressed: repeatSuppressed,
  };

  if (
    phase === "photo" &&
    (flow.state === "CAPTURE_PHOTO" || flow.state === "DELIVERY_CAPTURE_PHOTO")
  ) {
    payload.photo_voice_line_exact = kioskPhotoVoiceLineExact();
  }

  if (repeatSuppressed) {
    payload.model_behavior =
      "Do not verbally repeat next_prompt_exact or re-ask that slot; committed slots are unchanged. If the user just provided new info, call collect_slot_value for it. Otherwise wait silently or at most a 3-word acknowledgment.";
  } else if (
    phase === "photo" &&
    nextRequiredTool === "capture_photo" &&
    !promptExact.trim()
  ) {
    payload.model_behavior =
      "Required next step: call capture_photo. Speak exactly photo_voice_line_exact once in the same turn as that tool call. Do not describe the scene or repeat slot values.";
  }

  const line = "KIOSK_STATE_JSON: " + JSON.stringify(payload);
  return { line, payload, promptExact, repeatSuppressed };
}

/**
 * Pushes authoritative kiosk state so the model does not guess the next slot.
 * Pass **synchronous** `collectedSlots` from the tool batch (not React state ref) so pushes
 * never lag behind collect_slot_value commits.
 */
export function pushKioskRuntimeStateJson(
  client: GenAILiveClient | null,
  flow: VisitorFlowSession,
  intent: string | undefined,
  epoch: number,
  lastLineRef: { current: string },
  deps: {
    collectedSlots: Record<string, string>;
    dedupe: KioskPushDedupeState;
    /** Updated when a non-suppressed prompt is pushed — used to dedupe model speech bubble vs scripted line. */
    lastVerbalPromptMirror?: { current: string };
  }
): void {
  if (!client || client.status !== "connected") return;
  const { line, promptExact, repeatSuppressed } = buildKioskStateJsonLine(
    flow,
    intent,
    epoch,
    deps.collectedSlots,
    deps.dedupe
  );
  if (lastLineRef.current === line) return;
  lastLineRef.current = line;

  if (deps.lastVerbalPromptMirror && !repeatSuppressed && promptExact) {
    deps.lastVerbalPromptMirror.current = promptExact;
  }

  try {
    client.send([{ text: line }], false);
  } catch (e) {
    console.warn("[KioskRuntime] push failed", e);
  }
}
