import {
  defaultDeterministicLocalPromptsEnabled,
  defaultLocalSpeechEnabled,
  parseEnvBoolTruthy,
} from "../kiosk-runtime-defaults";

describe("kiosk-runtime-defaults (single voice defaults)", () => {
  const origSpeech = process.env.REACT_APP_KIOSK_LOCAL_SPEECH;
  const origDet = process.env.REACT_APP_DETERMINISTIC_LOCAL_PROMPTS;

  afterEach(() => {
    process.env.REACT_APP_KIOSK_LOCAL_SPEECH = origSpeech;
    process.env.REACT_APP_DETERMINISTIC_LOCAL_PROMPTS = origDet;
  });

  test("parseEnvBoolTruthy is strict", () => {
    expect(parseEnvBoolTruthy(undefined)).toBe(false);
    expect(parseEnvBoolTruthy("")).toBe(false);
    expect(parseEnvBoolTruthy("1")).toBe(true);
    expect(parseEnvBoolTruthy("true")).toBe(true);
  });

  test("local speech and deterministic prompts are off when env unset", () => {
    delete process.env.REACT_APP_KIOSK_LOCAL_SPEECH;
    delete process.env.REACT_APP_DETERMINISTIC_LOCAL_PROMPTS;
    expect(defaultLocalSpeechEnabled()).toBe(false);
    expect(defaultDeterministicLocalPromptsEnabled()).toBe(false);
  });

  test("explicit 1 enables flags", () => {
    process.env.REACT_APP_KIOSK_LOCAL_SPEECH = "1";
    process.env.REACT_APP_DETERMINISTIC_LOCAL_PROMPTS = "1";
    expect(defaultLocalSpeechEnabled()).toBe(true);
    expect(defaultDeterministicLocalPromptsEnabled()).toBe(true);
  });
});
