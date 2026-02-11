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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../lib/genai-live-client";
import { LiveClientOptions } from "../types";
import { AudioStreamer, LipSyncData } from "../lib/audio-streamer";
import { audioContext } from "../lib/utils";
import VolMeterWorket from "../lib/worklets/vol-meter";
import LipSyncAnalyserWorklet from "../lib/worklets/lip-sync-analyser";
import { LiveConnectConfig } from "@google/genai";

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
  /** Ref to real-time lip sync frequency data (read in useFrame, no re-renders) */
  lipSyncRef: React.MutableRefObject<LipSyncData>;
};

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  const client = useMemo(() => new GenAILiveClient(options), [options]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [model, setModel] = useState<string>("models/gemini-2.0-flash-exp");
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);

  // Lip sync data ref — updated by worklet, read by avatar in useFrame (no re-renders)
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

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "audio-out" }).then(async (audioCtx: AudioContext) => {
        const streamer = new AudioStreamer(audioCtx);
        audioStreamerRef.current = streamer;

        // Volume meter worklet (existing)
        await streamer.addWorklet<any>("vumeter-out", VolMeterWorket, (ev: any) => {
          setVolume(ev.data.volume);
        });

        // Lip sync analyser worklet (new — extracts frequency bands for viseme mapping)
        await streamer.addWorklet<any>("lip-sync-analyser", LipSyncAnalyserWorklet, (ev: any) => {
          const data = ev.data;
          // Write directly to ref (no setState, no re-renders)
          lipSyncRef.current.volume = data.volume;
          lipSyncRef.current.lowBand = data.lowBand;
          lipSyncRef.current.midBand = data.midBand;
          lipSyncRef.current.highBand = data.highBand;
          lipSyncRef.current.voiced = data.voiced ?? 0;
          lipSyncRef.current.plosive = data.plosive ?? 0;
          lipSyncRef.current.sibilance = data.sibilance ?? 0;
          lipSyncRef.current.envelope = data.envelope ?? data.volume;
          lipSyncRef.current.timestamp = performance.now();

          // Also update the streamer's copy for consistency
          streamer.lipSyncData = lipSyncRef.current;
        });
      });
    }
  }, [audioStreamerRef]);

  useEffect(() => {
    const onOpen = () => {
      console.log("Connection opened");
      setConnected(true);
    };

    const onClose = () => {
      console.log("Connection closed");
      setConnected(false);
    };

    const onError = (error: ErrorEvent) => {
      console.error("Connection error", error);
    };

    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    client
      .on("error", onError)
      .on("open", onOpen)
      .on("close", onClose)
      .on("interrupted", stopAudioStreamer)
      .on("audio", onAudio);

    return () => {
      client
        .off("error", onError)
        .off("open", onOpen)
        .off("close", onClose)
        .off("interrupted", stopAudioStreamer)
        .off("audio", onAudio)
        .disconnect();
    };
  }, [client]);

  const connect = useCallback(async () => {
    console.log("Connect callback initiated", { model, config });
    if (!config) {
      console.error("Config not set!");
      throw new Error("config has not been set");
    }
    client.disconnect();
    try {
      console.log("Calling client.connect...");
      await client.connect(model, config);
      console.log("client.connect returned");
    } catch (e) {
      console.error("Error during client.connect:", e);
    }
  }, [client, config, model]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

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
    lipSyncRef,
  };
}
