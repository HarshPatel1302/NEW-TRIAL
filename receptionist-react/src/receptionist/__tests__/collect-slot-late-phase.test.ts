import { gateCollectSlotInLateFlowPhase } from "../collect-slot-late-phase";

describe("gateCollectSlotInLateFlowPhase", () => {
  test("CAPTURE_PHOTO new_visitor rejects visitor_name yes-style junk", () => {
    const g = gateCollectSlotInLateFlowPhase("CAPTURE_PHOTO", "new_visitor", "visitor_name");
    expect(g.allowed).toBe(false);
    if (!g.allowed) {
      expect(g.message).toContain("capture_photo");
    }
  });

  test("CAPTURE_PHOTO new_visitor allows visit_company refinement", () => {
    expect(gateCollectSlotInLateFlowPhase("CAPTURE_PHOTO", "new_visitor", "visit_company")).toEqual({
      allowed: true,
    });
  });

  test("DELIVERY_CAPTURE_PHOTO allows delivery slots", () => {
    expect(
      gateCollectSlotInLateFlowPhase("DELIVERY_CAPTURE_PHOTO", "delivery", "recipient_name").allowed
    ).toBe(true);
  });

  test("UPLOAD_PHOTO allows core visitor slots for save retry", () => {
    expect(gateCollectSlotInLateFlowPhase("UPLOAD_PHOTO", "new_visitor", "phone").allowed).toBe(true);
  });

  test("ASK_NAME always allowed", () => {
    expect(gateCollectSlotInLateFlowPhase("ASK_NAME", "new_visitor", "visitor_name").allowed).toBe(true);
  });
});
