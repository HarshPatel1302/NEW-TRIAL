/**
 * Immediate browser TTS for deterministic lines while Gemini generates.
 * Cancel when model audio arrives (see use-live-api).
 *
 * Requires REACT_APP_ENABLE_LEGACY_BROWSER_TTS=1, then:
 * REACT_APP_KIOSK_LOCAL_SPEECH=1 for cue lines;
 * REACT_APP_DETERMINISTIC_LOCAL_PROMPTS=1 for scripted slot lines.
 * Default is Gemini Live only (no browser TTS).
 */

import { deterministicPromptForVisitorState } from "./deterministic-prompts";
import {
  defaultDeterministicLocalPromptsEnabled,
  defaultLocalSpeechEnabled,
} from "./kiosk-runtime-defaults";
import type { VisitorFlowSession } from "./visitor-flow-machine";

const enabled = () => defaultLocalSpeechEnabled();

export function isLocalCueSpeechEnabled(): boolean {
  return enabled() && typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakKioskLocalCue(text: string): void {
  if (!isLocalCueSpeechEnabled()) return;
  const line = String(text || "").trim();
  if (!line || line.length > 500) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 1.05;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("[LocalSpeech] speak failed", e);
  }
}

export function cancelKioskLocalSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function isDeterministicLocalPromptsEnabled(): boolean {
  return defaultDeterministicLocalPromptsEnabled();
}

/** Exact scripted line (lobby wait, one-off cues). */
export function speakDeterministicLine(text: string): void {
  if (!isDeterministicLocalPromptsEnabled()) return;
  const line = String(text || "").trim();
  if (!line || line.length > 500) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 1.05;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("[LocalSpeech] deterministic line failed", e);
  }
}

/** Next slot question from flow state (phone, name, company, delivery steps, photo pose). */
export function speakDeterministicVisitorFlowCue(flow: VisitorFlowSession): void {
  if (!isDeterministicLocalPromptsEnabled()) return;
  const line = deterministicPromptForVisitorState(flow.state, flow.visitorName);
  if (!line) return;
  speakDeterministicLine(line);
}
