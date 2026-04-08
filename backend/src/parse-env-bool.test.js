const { parseEnvBoolTruthy } = require("./parse-env-bool");

describe("parseEnvBoolTruthy", () => {
  test("accepts 1, true, yes, on (case-insensitive)", () => {
    expect(parseEnvBoolTruthy("1")).toBe(true);
    expect(parseEnvBoolTruthy("TRUE")).toBe(true);
    expect(parseEnvBoolTruthy(" true ")).toBe(true);
    expect(parseEnvBoolTruthy("yes")).toBe(true);
    expect(parseEnvBoolTruthy("On")).toBe(true);
  });

  test("rejects empty and non-truthy tokens", () => {
    expect(parseEnvBoolTruthy("")).toBe(false);
    expect(parseEnvBoolTruthy(undefined)).toBe(false);
    expect(parseEnvBoolTruthy(null)).toBe(false);
    expect(parseEnvBoolTruthy("0")).toBe(false);
    expect(parseEnvBoolTruthy("false")).toBe(false);
    expect(parseEnvBoolTruthy("no")).toBe(false);
    expect(parseEnvBoolTruthy("2")).toBe(false);
  });
});
