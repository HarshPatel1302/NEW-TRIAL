/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../lib/genai-live-client";
import { LiveClientOptions } from "../types";
import { AudioStreamer, LipSyncData } from "../lib/audio-streamer";
import { cancelKioskLocalSpeech } from "../receptionist/local-cue-speech";
import {
  acceptAssistantPcmChunk,
  bumpPlaybackEpoch,
  invalidateAssistantUtteranceAnchor,
  releaseAssistantOutputGate,
} from "../receptionist/kiosk-playback-epoch";
import { audioContext } from "../lib/utils";
import VolMeterWorket from "../lib/worklets/vol-meter";
import LipSyncAnalyserWorklet from "../lib/worklets/lip-sync-analyser";
import { LiveConnectConfig } from "@google/genai";
import { recordBargeInCompleted, recordBargeWhenAssistantSilent } from "../receptionist/kiosk-barge-metrics";

export type UseLiveAPIResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  model: string;
  setModel: (model: string) => void;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
  assistantAudioPlaying: boolean;
  /** Ref to real-time lip sync frequency data (read in useFrame, no re-renders) */
  lipSyncRef: React.MutableRefObject<LipSyncData>;
  /** Immediate cut of assistant audio + epoch bump when user talks over the model */
  bargeInAssistant: () => void;
  /** Ref mirrors playback start/stop without waiting for React render (barge-in / VAD). */
  assistantAudioPlayingRef: MutableRefObject<boolean>;
  /** Mic activity hook (reserved; browser TTS fallback removed so only Gemini Live speaks). */
  notifyUserMicActivity: () => void;
  /** Client-side barge-in with optional perf timing (volume edge → interrupt complete). */
  bargeInAssistantFromUser: (ctx?: { in_volume: number; prev_volume: number; t0: number }) => void;
};

const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_BASE_DELAY_MS = 1500;

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  const client = useMemo(() => new GenAILiveClient(options), [options]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [model, setModel] = useState<string>("models/gemini-2.0-flash-exp");
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);
  const [assistantAudioPlaying, setAssistantAudioPlaying] = useState(false);
  const assistantAudioPlayingRef = useRef(false);

  const lastBargeInAtRef = useRef(0);
  const intentionalDisconnectRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasEverConnectedRef = useRef(false);
  const modelRef = useRef(model);
  const configRef = useRef(config);
  modelRef.current = model;
  configRef.current = config;

  const lipSyncRef = useRef<LipSyncData>({
    volume: 0,
    lowBand: 0,
    midBand: 0,
    highBand: 0,
    voiced: 0,
    plosive: 0,
    sibilance: 0,
    envelope: 0,
    timestamp: 0,
  });

  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "audio-out" }).then(async (audioCtx: AudioContext) => {
        const streamer = new AudioStreamer(audioCtx);
        audioStreamerRef.current = streamer;
        streamer.onPlaybackStart = () => {
          assistantAudioPlayingRef.current = true;
          setAssistantAudioPlaying(true);
        };
        streamer.onPlaybackStop = () => {
          assistantAudioPlayingRef.current = false;
          setAssistantAudioPlaying(false);
        };
        streamer.onComplete = () => {
          assistantAudioPlayingRef.current = false;
          setAssistantAudioPlaying(false);
        };

        await streamer.addWorklet<any>("vumeter-out", VolMeterWorket, (ev: any) => {
          setVolume(ev.data.volume);
        });

        await streamer.addWorklet<any>("lip-sync-analyser", LipSyncAnalyserWorklet, (ev: any) => {
          const data = ev.data;
          lipSyncRef.current.volume = data.volume;
          lipSyncRef.current.lowBand = data.lowBand;
          lipSyncRef.current.midBand = data.midBand;
          lipSyncRef.current.highBand = data.highBand;
          lipSyncRef.current.voiced = data.voiced ?? 0;
          lipSyncRef.current.plosive = data.plosive ?? 0;
          lipSyncRef.current.sibilance = data.sibilance ?? 0;
          lipSyncRef.current.envelope = data.envelope ?? data.volume;
          lipSyncRef.current.timestamp = performance.now();
          streamer.lipSyncData = lipSyncRef.current;
        });
      });
    }
  }, [audioStreamerRef]);

  const attemptReconnect = useCallback(async () => {
    const attempt = reconnectAttemptsRef.current;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(`[useLiveAPI] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
      reconnectAttemptsRef.current = 0;
      return;
    }

    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt);
    console.log(`[useLiveAPI] Reconnecting in ${delay}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      reconnectAttemptsRef.current = attempt + 1;

      const currentConfig = configRef.current;
      const currentModel = modelRef.current;
      if (!currentConfig) return;

      try {
        await audioStreamerRef.current?.resume();
        console.log("[useLiveAPI] Reconnecting...");
        await client.connect(currentModel, currentConfig);
        console.log("[useLiveAPI] Reconnected successfully");
        reconnectAttemptsRef.current = 0;
      } catch (e) {
        console.error("[useLiveAPI] Reconnect failed:", e);
        attemptReconnect();
      }
    }, delay);
  }, [client]);

  useEffect(() => {
    const onOpen = () => {
      console.log("Connection opened (waiting for setupComplete)");
    };

    const onSetupComplete = () => {
      console.log("Setup complete — connection ready");
      hasEverConnectedRef.current = true;
      setConnected(true);
    };

    const onClose = (event: CloseEvent) => {
      console.log("Connection closed", { code: event?.code, reason: event?.reason });
      setConnected(false);
      setAssistantAudioPlaying(false);
      assistantAudioPlayingRef.current = false;

      if (!intentionalDisconnectRef.current && hasEverConnectedRef.current) {
        attemptReconnect();
      }
    };

    const onError = (error: ErrorEvent) => {
      console.error("Connection error", error);
    };

    const onInterruptedPlayback = () => {
      releaseAssistantOutputGate();
      invalidateAssistantUtteranceAnchor("client_interrupted");
      audioStreamerRef.current?.interruptPlaybackNow();
    };
    const completeAudioStreamer = () => {
      releaseAssistantOutputGate();
      invalidateAssistantUtteranceAnchor("client_turncomplete");
      audioStreamerRef.current?.complete();
    };

    const onAudio = (data: ArrayBuffer) => {
      cancelKioskLocalSpeech();
      if (!acceptAssistantPcmChunk()) {
        return;
      }
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));
    };

    client
      .on("error", onError)
      .on("open", onOpen)
      .on("setupcomplete", onSetupComplete)
      .on("close", onClose)
      .on("interrupted", onInterruptedPlayback)
      .on("turncomplete", completeAudioStreamer)
      .on("audio", onAudio);

    return () => {
      client
        .off("error", onError)
        .off("open", onOpen)
        .off("setupcomplete", onSetupComplete)
        .off("close", onClose)
        .off("interrupted", onInterruptedPlayback)
        .off("turncomplete", completeAudioStreamer)
        .off("audio", onAudio);
      // Do NOT call disconnect() here: this effect re-runs when `attemptReconnect`
      // changes and on React Strict Mode / Fast Refresh remounts. Disconnecting
      // in cleanup was closing the Gemini Live socket mid-conversation (code 1000).
    };
  }, [client, attemptReconnect]);

  const connect = useCallback(async () => {
    console.log("Connect callback initiated", { model, config });
    if (!config) {
      console.error("Config not set!");
      throw new Error("config has not been set");
    }
    intentionalDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    client.disconnect();
    try {
      await audioStreamerRef.current?.resume();
      console.log("Calling client.connect...");
      await client.connect(model, config);
      console.log("client.connect returned");
    } catch (e) {
      console.error("Error during client.connect:", e);
    }
  }, [client, config, model]);

  const disconnect = useCallback(async () => {
    intentionalDisconnectRef.current = true;
    hasEverConnectedRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    client.disconnect();
    setConnected(false);
    setAssistantAudioPlaying(false);
    assistantAudioPlayingRef.current = false;
  }, [setConnected, client]);

  const runBargeInCore = useCallback(() => {
    const now = Date.now();
    if (now - lastBargeInAtRef.current < 260) {
      return;
    }
    lastBargeInAtRef.current = now;
    bumpPlaybackEpoch("user_barge_in");
    cancelKioskLocalSpeech();
    invalidateAssistantUtteranceAnchor("user_barge_in");
    audioStreamerRef.current?.interruptPlaybackNow();
  }, []);

  const bargeInAssistant = useCallback(() => {
    const wasPlaying = assistantAudioPlayingRef.current;
    recordBargeWhenAssistantSilent(wasPlaying);
    runBargeInCore();
  }, [runBargeInCore]);

  const bargeInAssistantFromUser = useCallback(
    (ctx?: { in_volume: number; prev_volume: number; t0: number }) => {
      const wasPlaying = assistantAudioPlayingRef.current;
      recordBargeWhenAssistantSilent(wasPlaying);
      const tStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      runBargeInCore();
      const tEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (ctx && wasPlaying) {
        recordBargeInCompleted(tEnd - tStart, {
          in_volume: ctx.in_volume,
          prev_volume: ctx.prev_volume,
        });
      }
    },
    [runBargeInCore]
  );

  const notifyUserMicActivity = useCallback(() => {
    // Intentionally no-op: deterministic browser speechSynthesis duplicated the receptionist (Gemini Live) voice.
  }, []);

  return {
    client,
    config,
    setConfig,
    model,
    setModel,
    connected,
    connect,
    disconnect,
    volume,
    assistantAudioPlaying,
    lipSyncRef,
    bargeInAssistant,
    assistantAudioPlayingRef,
    notifyUserMicActivity,
    bargeInAssistantFromUser,
  };
}
