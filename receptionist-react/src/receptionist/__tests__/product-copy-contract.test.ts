/**
 * Locked product copy + single-voice defaults (complements browser/mic QA).
 */
import { DETERMINISTIC_PROMPTS } from "../deterministic-prompts";
import { KIOSK_PHOTO_VOICE_LINE } from "../photo-kiosk-config";
import {
  defaultDeterministicLocalPromptsEnabled,
  defaultLocalSpeechEnabled,
  legacyBrowserTtsExplicitlyEnabled,
} from "../kiosk-runtime-defaults";
import { isLocalCueSpeechEnabled } from "../local-cue-speech";

const REQUIRED_PHOTO_LINE = "Please wait 5 seconds while I capture your photo.";

describe("product copy contract (photo line)", () => {
  test("KIOSK_PHOTO_VOICE_LINE is exact required wording", () => {
    expect(KIOSK_PHOTO_VOICE_LINE).toBe(REQUIRED_PHOTO_LINE);
  });

  test("deterministic photoPose matches kiosk config (one source of truth)", () => {
    expect(DETERMINISTIC_PROMPTS.photoPose).toBe(KIOSK_PHOTO_VOICE_LINE);
    expect(DETERMINISTIC_PROMPTS.photoPose).toBe(REQUIRED_PHOTO_LINE);
  });
});

describe("single-voice default (no browser TTS unless legacy env)", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  test("without REACT_APP_ENABLE_LEGACY_BROWSER_TTS, local TTS flags are off", () => {
    delete process.env.REACT_APP_ENABLE_LEGACY_BROWSER_TTS;
    delete process.env.REACT_APP_KIOSK_LOCAL_SPEECH;
    delete process.env.REACT_APP_DETERMINISTIC_LOCAL_PROMPTS;
    expect(legacyBrowserTtsExplicitlyEnabled()).toBe(false);
    expect(defaultLocalSpeechEnabled()).toBe(false);
    expect(defaultDeterministicLocalPromptsEnabled()).toBe(false);
    expect(isLocalCueSpeechEnabled()).toBe(false);
  });
});
