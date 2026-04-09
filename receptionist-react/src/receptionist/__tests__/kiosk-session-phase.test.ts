import {
  deriveKioskSessionPhase,
  deriveNextRequiredTool,
  kioskPhotoVoiceLineExact,
} from "../kiosk-session-phase";

describe("kiosk-session-phase", () => {
  test("deriveKioskSessionPhase maps capture and upload states to photo", () => {
    expect(deriveKioskSessionPhase("ASK_COMPANY")).toBe("collect");
    expect(deriveKioskSessionPhase("CAPTURE_PHOTO")).toBe("photo");
    expect(deriveKioskSessionPhase("UPLOAD_PHOTO")).toBe("photo");
    expect(deriveKioskSessionPhase("DELIVERY_CAPTURE_PHOTO")).toBe("photo");
    expect(deriveKioskSessionPhase("SAVE_VISITOR")).toBe("save");
    expect(deriveKioskSessionPhase("COMPLETED")).toBe("complete");
    expect(deriveKioskSessionPhase("ERROR")).toBe("error");
  });

  test("deriveNextRequiredTool for photo pipeline", () => {
    expect(deriveNextRequiredTool("CAPTURE_PHOTO")).toBe("capture_photo");
    expect(deriveNextRequiredTool("DELIVERY_CAPTURE_PHOTO")).toBe("capture_photo");
    expect(deriveNextRequiredTool("UPLOAD_PHOTO")).toBe("save_visitor_info");
    expect(deriveNextRequiredTool("SAVE_VISITOR")).toBe("save_visitor_info");
    expect(deriveNextRequiredTool("ASK_NAME")).toBeNull();
  });

  test("kioskPhotoVoiceLineExact matches product constant", () => {
    expect(kioskPhotoVoiceLineExact()).toContain("5 seconds");
  });
});
