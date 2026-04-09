import {
  buildKioskStateJsonLine,
  createKioskPushDedupeState,
} from "../kiosk-runtime-push";
import { createVisitorFlowSession } from "../visitor-flow-machine";

describe("buildKioskStateJsonLine", () => {
  test("CAPTURE_PHOTO includes phase photo, next_required_tool, photo_voice_line_exact", () => {
    const dedupe = createKioskPushDedupeState();
    const flow = {
      ...createVisitorFlowSession(),
      mode: "new_visitor" as const,
      state: "CAPTURE_PHOTO" as const,
      visitorName: "Ada",
    };
    const { payload } = buildKioskStateJsonLine(flow, "meet_person", 3, { visit_company: "Acme" }, dedupe);
    expect(payload.phase).toBe("photo");
    expect(payload.next_required_tool).toBe("capture_photo");
    expect(payload.photo_voice_line_exact).toContain("capture your photo");
    expect(payload.next_prompt_exact).toBe("");
    expect(String(payload.model_behavior || "")).toContain("capture_photo");
  });

  test("UPLOAD_PHOTO points next_required_tool at save_visitor_info", () => {
    const dedupe = createKioskPushDedupeState();
    const flow = {
      ...createVisitorFlowSession(),
      mode: "new_visitor" as const,
      state: "UPLOAD_PHOTO" as const,
      visitorName: "Ada",
    };
    const { payload } = buildKioskStateJsonLine(flow, "meet_person", 1, {}, dedupe);
    expect(payload.phase).toBe("photo");
    expect(payload.next_required_tool).toBe("save_visitor_info");
  });
});
