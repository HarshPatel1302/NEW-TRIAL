import { DETERMINISTIC_PROMPTS, deterministicPromptForVisitorState } from "./deterministic-prompts";
import { KIOSK_PHOTO_VOICE_LINE } from "./photo-kiosk-config";
import type { ReceptionMode, VisitorFlowState } from "./visitor-flow-machine";

export type CollectSlotPromptHints = {
  next_prompt: string;
  next_required_tool: string | null;
  /** Extra guidance for the model when next_prompt is intentionally not the photo line yet. */
  model_behavior?: string;
};

/**
 * After a successful collect_slot_value commit, what the tool response should tell the model to say/do next.
 * Visitor visit_company and delivery recipient_name transition into photo states; we must not stuff the photo
 * voice line into the same turn as slot commit (reduces triple repetition and stacked speech).
 */
export function buildCollectSlotPromptHints(params: {
  slotName: string;
  flowState: VisitorFlowState;
  mode: ReceptionMode;
  visitorName?: string;
}): CollectSlotPromptHints {
  const { slotName, flowState, mode, visitorName } = params;

  const defaultPrompt = deterministicPromptForVisitorState(flowState, visitorName) || "";

  if (
    mode === "new_visitor" &&
    flowState === "CAPTURE_PHOTO" &&
    slotName === "visit_company"
  ) {
    return {
      next_prompt: DETERMINISTIC_PROMPTS.postSlotBeforePhotoAck,
      next_required_tool: "capture_photo",
      model_behavior:
        "Do not repeat the company name for emphasis. Say next_prompt once at most, then call capture_photo. Speak the exact photo line only in the same turn as capture_photo: " +
        JSON.stringify(KIOSK_PHOTO_VOICE_LINE),
    };
  }

  if (
    mode === "delivery" &&
    flowState === "DELIVERY_CAPTURE_PHOTO" &&
    slotName === "recipient_name"
  ) {
    return {
      next_prompt: DETERMINISTIC_PROMPTS.postSlotBeforePhotoAck,
      next_required_tool: "capture_photo",
      model_behavior:
        "Say next_prompt once at most, then call capture_photo. Speak the exact photo line only in the same turn as capture_photo: " +
        JSON.stringify(KIOSK_PHOTO_VOICE_LINE),
    };
  }

  return {
    next_prompt: defaultPrompt,
    next_required_tool: null,
  };
}
