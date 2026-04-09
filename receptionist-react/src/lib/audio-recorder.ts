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

import { audioContext } from "./utils";
import AudioRecordingWorklet from "./worklets/audio-processing";
import VolMeterWorket from "./worklets/vol-meter";

import { createWorketFromSrc } from "./audioworklet-registry";
import { isAudioWorkletAvailable } from "./utils";
import EventEmitter from "eventemitter3";

/** User-visible explanation for mic / AudioWorklet failures (also used in tests). */
export function formatMicrophoneStartError(err: unknown): string {
  if (err instanceof Error && err.message.includes("AudioWorklet")) {
    return err.message;
  }
  const dom = err as { name?: string; message?: string };
  const name = String(dom?.name || "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone access was blocked. Allow microphone for this site (lock icon in the address bar), then disconnect and connect again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Plug in or enable a microphone in system settings.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "The microphone could not be opened. It may be in use by another application—close other apps using the mic and try again.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "Your microphone does not support the requested settings. Try another input device.";
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "Could not start the microphone. Check permissions and try connecting again.";
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;

  private starting: Promise<void> | null = null;

  constructor(public sampleRate = 16000) {
    super();
  }

  /**
   * Acquires the mic and starts the worklet pipeline. Must be awaited or `.catch()`'d —
   * failures include permission denied, no device, and non-secure contexts without AudioWorklet.
   */
  start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      return Promise.reject(new Error("This browser does not support microphone capture."));
    }

    if (this.starting) {
      return this.starting;
    }

    this.starting = this.runStartPipeline();
    return this.starting;
  }

  private async runStartPipeline(): Promise<void> {
    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
        });
      } catch (first) {
        console.warn("[AudioRecorder] getUserMedia with constraints failed, retrying default audio", first);
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      this.audioContext = await audioContext({ sampleRate: this.sampleRate });
      this.source = this.audioContext.createMediaStreamSource(this.stream);

      if (!isAudioWorkletAvailable(this.audioContext)) {
        this.teardownPartialMicGraph();
        throw new Error(
          "AudioWorklet is not available in this browser context. Serve the kiosk over HTTPS (or open via http://localhost). Plain HTTP on a LAN IP (e.g. http://192.168.x.x) cannot use the microphone pipeline.",
        );
      }

      const workletName = "audio-recorder-worklet";
      const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

      await this.audioContext.audioWorklet.addModule(src);
      this.recordingWorklet = new AudioWorkletNode(
        this.audioContext,
        workletName,
      );

      this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
        if (!this.recording) {
          return;
        }
        const arrayBuffer = ev.data.data.int16arrayBuffer;

        if (arrayBuffer) {
          const arrayBufferString = arrayBufferToBase64(arrayBuffer);
          this.emit("data", arrayBufferString);
        }
      };
      this.source.connect(this.recordingWorklet);

      const vuWorkletName = "vu-meter";
      await this.audioContext.audioWorklet.addModule(
        createWorketFromSrc(vuWorkletName, VolMeterWorket),
      );
      this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
      this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
        if (!this.recording) {
          return;
        }
        this.emit("volume", ev.data.volume);
      };

      this.source.connect(this.vuWorklet);
      this.recording = true;
    } catch (e) {
      this.teardownPartialMicGraph();
      throw new Error(formatMicrophoneStartError(e));
    } finally {
      this.starting = null;
    }
  }

  private teardownPartialMicGraph() {
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.audioContext = undefined;
    this.source = undefined;
    this.recordingWorklet = undefined;
    this.vuWorklet = undefined;
    this.recording = false;
  }

  stop() {
    const handleStop = () => {
      this.recording = false;
      if (this.recordingWorklet) {
        this.recordingWorklet.port.onmessage = null;
      }
      if (this.vuWorklet) {
        this.vuWorklet.port.onmessage = null;
      }
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this.source = undefined;
      this.audioContext = undefined;
    };
    if (this.starting) {
      void this.starting.then(handleStop).catch(() => {
        handleStop();
      });
      return;
    }
    handleStop();
  }
}
