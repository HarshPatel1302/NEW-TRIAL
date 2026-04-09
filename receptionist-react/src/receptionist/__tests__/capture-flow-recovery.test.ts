import { captureStateCoercionTarget } from "../capture-flow-recovery";

describe("captureStateCoercionTarget", () => {
  test("visitor ASK_COMPANY → CAPTURE_PHOTO when slots will be complete", () => {
    expect(captureStateCoercionTarget("ASK_COMPANY", "visitor")).toBe("CAPTURE_PHOTO");
  });

  test("visitor already CAPTURE_PHOTO → null", () => {
    expect(captureStateCoercionTarget("CAPTURE_PHOTO", "visitor")).toBeNull();
  });

  test("visitor ERROR → null (fail closed)", () => {
    expect(captureStateCoercionTarget("ERROR", "visitor")).toBeNull();
  });

  test("delivery recipient person step → DELIVERY_CAPTURE_PHOTO", () => {
    expect(captureStateCoercionTarget("DELIVERY_ASK_RECIPIENT_PERSON", "delivery")).toBe(
      "DELIVERY_CAPTURE_PHOTO"
    );
  });
});
