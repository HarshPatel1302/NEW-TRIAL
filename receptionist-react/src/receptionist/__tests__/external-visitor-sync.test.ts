import { isValidIndianMobile, normalizeIndianMobile } from "../external-visitor-sync";

describe("external-visitor-sync mobile normalization", () => {
  test("normalizes +91 prefixed number", () => {
    expect(normalizeIndianMobile("+91 9137390259")).toBe("9137390259");
  });

  test("normalizes leading 0 number", () => {
    expect(normalizeIndianMobile("09137390259")).toBe("9137390259");
  });

  test("validates Indian mobile format", () => {
    expect(isValidIndianMobile("9137390259")).toBe(true);
    expect(isValidIndianMobile("3137390259")).toBe(false);
    expect(isValidIndianMobile("12345")).toBe(false);
  });
});
