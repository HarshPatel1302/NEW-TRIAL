import {
  buildKioskPromptKey,
  buildKioskSlotsDigest,
  wouldSuppressRepeatedKioskPrompt,
} from "../kiosk-runtime-push";

describe("kiosk-runtime-push dedupe", () => {
  test("buildKioskSlotsDigest changes when visitor name is committed", () => {
    const a = buildKioskSlotsDigest("new_visitor", "meet_person", {});
    const b = buildKioskSlotsDigest("new_visitor", "meet_person", { visitor_name: "Ada" });
    expect(a).not.toBe(b);
  });

  test("buildKioskSlotsDigest reflects multi-slot commit in one batch", () => {
    const one = buildKioskSlotsDigest("new_visitor", "meet_person", { visitor_name: "Ada" });
    const two = buildKioskSlotsDigest("new_visitor", "meet_person", {
      visitor_name: "Ada",
      phone: "9876543210",
    });
    expect(one).not.toBe(two);
  });

  test("buildKioskPromptKey encodes mode state and slot", () => {
    expect(buildKioskPromptKey("new_visitor", "ASK_PHONE", "phone")).toBe(
      "new_visitor|ASK_PHONE|phone"
    );
  });

  test("wouldSuppressRepeatedKioskPrompt when key+digest match and no validation gate", () => {
    expect(
      wouldSuppressRepeatedKioskPrompt({
        priorKey: "new_visitor|ASK_NAME|visitor_name",
        priorDigest: "x",
        validationGate: false,
        promptKey: "new_visitor|ASK_NAME|visitor_name",
        digest: "x",
      })
    ).toBe(true);
  });

  test("no suppression when validation gate is active (invalid answer path)", () => {
    expect(
      wouldSuppressRepeatedKioskPrompt({
        priorKey: "new_visitor|ASK_PHONE|phone",
        priorDigest: "same",
        validationGate: true,
        promptKey: "new_visitor|ASK_PHONE|phone",
        digest: "same",
      })
    ).toBe(false);
  });

  test("no suppression on first push (empty prior key)", () => {
    expect(
      wouldSuppressRepeatedKioskPrompt({
        priorKey: "",
        priorDigest: "",
        validationGate: false,
        promptKey: "new_visitor|ASK_NAME|visitor_name",
        digest: "a",
      })
    ).toBe(false);
  });
});
