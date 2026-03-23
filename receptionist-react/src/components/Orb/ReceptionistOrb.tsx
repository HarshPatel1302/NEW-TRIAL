import { useCallback, useMemo, useRef } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { Orb, type AgentState } from "./Orb";

const DEFAULT_COLORS: [string, string] = ["#a8dab5", "#448dff"];

/**
 * ElevenLabs-style orb wired to the live session: agent state + lip-sync-driven volumes.
 * @see https://ui.elevenlabs.io/docs/components/orb
 */
export function ReceptionistOrb() {
  const { connected, assistantAudioPlaying, lipSyncRef } = useLiveAPIContext();

  const connectedRef = useRef(connected);
  const playingRef = useRef(assistantAudioPlaying);
  connectedRef.current = connected;
  playingRef.current = assistantAudioPlaying;

  const agentState = useMemo<AgentState>(() => {
    if (!connected) return null;
    if (assistantAudioPlaying) return "talking";
    return "listening";
  }, [connected, assistantAudioPlaying]);

  const getOutputVolume = useCallback(() => {
    if (!playingRef.current) return 0.22;
    const d = lipSyncRef.current;
    const v = d.envelope ?? d.volume ?? 0;
    return Math.min(1, Math.max(0.12, v * 2.2));
  }, [lipSyncRef]);

  const getInputVolume = useCallback(() => {
    if (!connectedRef.current) return 0;
    return playingRef.current ? 0.18 : 0.48;
  }, []);

  return (
    <Orb
      className="kiosk-orb-canvas"
      colors={DEFAULT_COLORS}
      seed={42}
      agentState={agentState}
      volumeMode="manual"
      getInputVolume={getInputVolume}
      getOutputVolume={getOutputVolume}
      uiInverted
    />
  );
}
