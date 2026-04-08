import {
  defaultDeterministicLocalPromptsEnabled,
  defaultLocalSpeechEnabled,
} from "../kiosk-runtime-defaults";

/**
 * Product policy: only Gemini Live (native audio) should speak by default.
 * Browser speechSynthesis duplicates the receptionist when local flags are on.
 */
describe("kiosk audio policy (single receptionist voice by default)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  test("local browser TTS and deterministic local prompts default off when env unset", () => {
    delete process.env.REACT_APP_KIOSK_LOCAL_SPEECH;
    delete process.env.REACT_APP_DETERMINISTIC_LOCAL_PROMPTS;
    delete process.env.REACT_APP_ENABLE_LEGACY_BROWSER_TTS;
    expect(defaultLocalSpeechEnabled()).toBe(false);
    expect(defaultDeterministicLocalPromptsEnabled()).toBe(false);
  });
});
