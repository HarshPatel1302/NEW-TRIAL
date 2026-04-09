import {
  getKioskToolPhotoCountdownMs,
  getPhotoFaceMaxWaitMs,
  KIOSK_PHOTO_VOICE_LINE,
} from "../photo-kiosk-config";

describe("photo-kiosk-config", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  test("default tool countdown is 5000ms", () => {
    delete process.env.REACT_APP_PHOTO_COUNTDOWN_MS;
    expect(getKioskToolPhotoCountdownMs()).toBe(5000);
  });

  test("REACT_APP_PHOTO_COUNTDOWN_MS overrides within bounds", () => {
    process.env.REACT_APP_PHOTO_COUNTDOWN_MS = "4200";
    expect(getKioskToolPhotoCountdownMs()).toBe(4200);
    process.env.REACT_APP_PHOTO_COUNTDOWN_MS = "99999";
    expect(getKioskToolPhotoCountdownMs()).toBe(15000);
    process.env.REACT_APP_PHOTO_COUNTDOWN_MS = "100";
    expect(getKioskToolPhotoCountdownMs()).toBe(2500);
  });

  test("face wait is capped when countdown is long", () => {
    expect(getPhotoFaceMaxWaitMs(5000)).toBeLessThanOrEqual(2400);
    expect(getPhotoFaceMaxWaitMs(1200)).toBeLessThanOrEqual(5200);
  });

  test("voice line is exact required wording", () => {
    expect(KIOSK_PHOTO_VOICE_LINE).toBe(
      "Please wait 5 seconds while I capture your photo."
    );
  });
});
