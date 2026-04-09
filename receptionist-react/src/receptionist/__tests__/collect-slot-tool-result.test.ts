import { buildCollectSlotPromptHints } from "../collect-slot-tool-result";
import { KIOSK_PHOTO_VOICE_LINE } from "../photo-kiosk-config";

describe("buildCollectSlotPromptHints", () => {
  test("visit_company → CAPTURE_PHOTO uses short ack, not photo line", () => {
    const h = buildCollectSlotPromptHints({
      slotName: "visit_company",
      flowState: "CAPTURE_PHOTO",
      mode: "new_visitor",
      visitorName: "Ada",
    });
    expect(h.next_prompt).toBe("Thank you.");
    expect(h.next_prompt).not.toContain("5 seconds");
    expect(h.next_required_tool).toBe("capture_photo");
    expect(h.model_behavior).toContain(KIOSK_PHOTO_VOICE_LINE);
  });

  test("recipient_name → DELIVERY_CAPTURE_PHOTO defers photo line to capture tool", () => {
    const h = buildCollectSlotPromptHints({
      slotName: "recipient_name",
      flowState: "DELIVERY_CAPTURE_PHOTO",
      mode: "delivery",
    });
    expect(h.next_prompt).toBe("Thank you.");
    expect(h.next_required_tool).toBe("capture_photo");
  });

  test("ASK_PHONE still uses deterministic phone question", () => {
    const h = buildCollectSlotPromptHints({
      slotName: "phone",
      flowState: "ASK_COMING_FROM",
      mode: "new_visitor",
    });
    expect(h.next_prompt).toContain("coming from");
    expect(h.next_required_tool).toBeNull();
    expect(h.model_behavior).toBeUndefined();
  });
});
