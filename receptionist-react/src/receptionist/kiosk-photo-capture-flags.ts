/**
 * Kiosk photo capture: updated by App during openTemporaryCameraStream / capture.
 * use-live-api logs correlation when the Live socket closes (mic/camera races).
 */
export const kioskPhotoCaptureFlagsRef = {
  current: false,
};
