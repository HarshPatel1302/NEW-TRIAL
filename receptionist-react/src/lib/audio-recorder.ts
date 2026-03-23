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
import EventEmitter from "eventemitter3";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/** User-facing message for getUserMedia / mic failures (avoids raw "Requested device not found"). */
export function getUserMediaErrorMessage(error: unknown): string {
  const dom = error as DOMException;
  const name = String(dom?.name || "").trim();
  const raw = String((error as Error)?.message || dom?.message || error || "").trim();

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Plug in a microphone or headset, check system sound settings, then try again.";
  }
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "Microphone access was blocked. Allow microphone permission for this site in your browser settings.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is in use by another application. Close other apps using the mic and try again.";
  }
  if (name === "OverconstrainedError") {
    return "No microphone matched the requested settings. Try a different audio device.";
  }
  if (raw.toLowerCase().includes("requested device not found")) {
    return "No microphone was found. Connect a mic or enable one in system settings, then reload the page.";
  }
  return raw || "Could not open the microphone.";
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

  private teardownPartialSetup(): void {
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.source = undefined;
    this.recordingWorklet = undefined;
    this.vuWorklet = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.recording = false;
  }

  /**
   * Start capturing mic audio. Rejects with a clear Error if getUserMedia fails (always handle with .catch).
   */
  async start(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("This browser does not support microphone capture (getUserMedia).");
    }

    if (this.recording && this.stream) {
      return;
    }
    if (this.starting) {
      return this.starting;
    }

    this.starting = (async () => {
      try {
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          throw new Error(getUserMediaErrorMessage(e));
        }

        this.stream = mediaStream;
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const workletName = "audio-recorder-worklet";
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

        await this.audioContext.audioWorklet.addModule(src);
        this.recordingWorklet = new AudioWorkletNode(this.audioContext, workletName);

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
      } catch (err) {
        this.teardownPartialSetup();
        throw err instanceof Error ? err : new Error(getUserMediaErrorMessage(err));
      } finally {
        this.starting = null;
      }
    })();

    return this.starting;
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
    };
    if (this.starting) {
      this.starting.then(handleStop).catch(() => {
        handleStop();
      });
      return;
    }
    handleStop();
  }
}
