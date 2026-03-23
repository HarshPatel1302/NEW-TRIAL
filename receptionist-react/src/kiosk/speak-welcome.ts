/**
 * Browser TTS for pre-registered QR / passcode success (no Live API required).
 */
export function speakPreRegisteredWelcome(fullName: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }
  const text = `Welcome, ${fullName}. You may enter the building. Please collect your visitor card from the reception desk.`;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}
