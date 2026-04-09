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

import cn from "classnames";

import { memo, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import { useWebcam } from "../../hooks/use-webcam";
import { AudioRecorder } from "../../lib/audio-recorder";
import { recordSuspectedMissedBarge } from "../../receptionist/kiosk-barge-metrics";
import { perfMarkUserAudioSent } from "../../receptionist/perf-latency";
import AudioPulse from "../audio-pulse/AudioPulse";
import "./control-tray.scss";
import SettingsDialog from "../settings-dialog/SettingsDialog";

function kioskEnvFloat01(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.min(0.35, Math.max(0.004, v)) : fallback;
}

function kioskEnvIntMs(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 80 ? Math.min(8000, Math.round(v)) : fallback;
}

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  enableEditingSettings?: boolean;
  /**
   * Kiosk: release the mic pipeline before opening a second getUserMedia(camera) stream.
   * Many devices mute or kill the mic (and sometimes destabilize Live) if both run at once.
   */
  kioskSuspendLiveMic?: boolean;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: string;
  offIcon: string;
  start: () => Promise<any>;
  stop: () => any;
};

/**
 * button used for triggering webcam or screen-capture
 */
const MediaStreamButton = memo(
  ({ isStreaming, onIcon, offIcon, start, stop }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className="action-button" onClick={stop}>
        <span className="material-symbols-outlined">{onIcon}</span>
      </button>
    ) : (
      <button className="action-button" onClick={start}>
        <span className="material-symbols-outlined">{offIcon}</span>
      </button>
    )
);

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => {},
  supportsVideo,
  enableEditingSettings,
  kioskSuspendLiveMic = false,
}: ControlTrayProps) {
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const autoStartInFlightRef = useRef(false);
  const wasConnectedRef = useRef(false);

  const {
    client,
    connected,
    connect,
    disconnect,
    volume,
    bargeInAssistantFromUser,
    assistantAudioPlayingRef,
    notifyUserMicActivity,
  } = useLiveAPIContext();
  const prevInVolumeRef = useRef(0);
  const bargeLoudSinceRef = useRef<number | null>(null);
  const bargeMissReportedRef = useRef(false);

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--volume",
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
  }, [inVolume]);

  /** Barge-in: user speech rising edge while assistant audio is playing; metrics for noisy lobbies. */
  useEffect(() => {
    if (!connected || muted) {
      prevInVolumeRef.current = inVolume;
      bargeLoudSinceRef.current = null;
      bargeMissReportedRef.current = false;
      return;
    }
    const rise = kioskEnvFloat01("REACT_APP_BARGE_IN_VOLUME_RISE", 0.045);
    const floorPrev = kioskEnvFloat01("REACT_APP_BARGE_IN_VOLUME_FLOOR", 0.028);
    const missVol = kioskEnvFloat01("REACT_APP_BARGE_IN_MISS_DETECT_VOLUME", 0.072);
    const sustainedMs = kioskEnvIntMs("REACT_APP_BARGE_IN_MISS_SUSTAINED_MS", 420);
    const prev = prevInVolumeRef.current;
    prevInVolumeRef.current = inVolume;
    const playing = assistantAudioPlayingRef.current;
    if (playing && inVolume > rise && prev <= floorPrev) {
      bargeLoudSinceRef.current = null;
      bargeMissReportedRef.current = false;
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      bargeInAssistantFromUser({ in_volume: inVolume, prev_volume: prev, t0 });
    } else if (playing && inVolume >= missVol) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (bargeLoudSinceRef.current === null) {
        bargeLoudSinceRef.current = now;
      } else if (!bargeMissReportedRef.current && now - bargeLoudSinceRef.current >= sustainedMs) {
        bargeMissReportedRef.current = true;
        recordSuspectedMissedBarge({ inVolume, sustainedMs });
      }
    } else {
      bargeLoudSinceRef.current = null;
      bargeMissReportedRef.current = false;
    }
  }, [inVolume, connected, muted, bargeInAssistantFromUser, assistantAudioPlayingRef]);

  useEffect(() => {
    const onData = (base64: string) => {
      if (!connected || client.status !== "connected") {
        return;
      }
      perfMarkUserAudioSent();
      notifyUserMicActivity();
      client.sendRealtimeInput([
        {
          mimeType: "audio/pcm;rate=16000",
          data: base64,
        },
      ]);
    };
    const shouldCaptureMic =
      connected && !muted && audioRecorder && !kioskSuspendLiveMic;
    if (shouldCaptureMic) {
      audioRecorder.on("data", onData).on("volume", setInVolume).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off("data", onData).off("volume", setInVolume);
    };
  }, [connected, client, muted, audioRecorder, notifyUserMicActivity, kioskSuspendLiveMic]);

  useEffect(() => {
    // Kiosk (`supportsVideo={false}`) uses the same `videoRef` for temporary photo capture.
    // Never bind or clear `srcObject` here — otherwise any effect re-run (e.g. `connected`
    // toggling during reconnect) wipes the capture stream right as the camera opens.
    if (supportsVideo && videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }

    let timeoutId = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        return;
      }

      const ctx = canvas.getContext("2d")!;
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        if (client.status !== "connected") {
          return;
        }
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
      }
    }
    if (connected && activeVideoStream !== null) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client, videoRef, supportsVideo]);

  useEffect(() => {
    if (!activeVideoStream) {
      return;
    }

    const handleTrackEnded = () => {
      const hasLiveTrack = activeVideoStream
        .getTracks()
        .some((track) => track.readyState === "live");
      if (!hasLiveTrack) {
        setActiveVideoStream(null);
        onVideoStreamChange(null);
      }
    };

    activeVideoStream
      .getTracks()
      .forEach((track) => track.addEventListener("ended", handleTrackEnded));

    return () => {
      activeVideoStream
        .getTracks()
        .forEach((track) => track.removeEventListener("ended", handleTrackEnded));
    };
  }, [activeVideoStream, onVideoStreamChange]);

  //handler for swapping from one video-stream to the next
  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }

    videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
  };

  useEffect(() => {
    if (connected) {
      wasConnectedRef.current = true;
      return;
    }
    if (!wasConnectedRef.current) {
      return;
    }
    wasConnectedRef.current = false;
    autoStartInFlightRef.current = false;

    setActiveVideoStream((current) => {
      if (current) {
        current.getTracks().forEach((track) => track.stop());
      }
      return null;
    });
    // Kiosk uses App-owned temporary camera streams; do not clear parent video state here.
    // A brief Live disconnect would call setVideoStream(null) while capture is still running.
    if (supportsVideo) {
      onVideoStreamChange(null);
    }
    webcam.stop();
    screenCapture.stop();
  }, [connected, onVideoStreamChange, webcam, screenCapture, supportsVideo]);

  useEffect(() => {
    let cancelled = false;
    if (
      !connected ||
      !supportsVideo ||
      activeVideoStream ||
      webcam.isStreaming ||
      autoStartInFlightRef.current
    ) {
      return;
    }

    autoStartInFlightRef.current = true;
    webcam
      .start()
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        setActiveVideoStream(mediaStream);
        onVideoStreamChange(mediaStream);
      })
      .catch((error) => {
        console.warn("Auto webcam start failed:", error);
      })
      .finally(() => {
        autoStartInFlightRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [
    connected,
    supportsVideo,
    activeVideoStream,
    webcam,
    onVideoStreamChange,
  ]);

  return (
    <section className="control-tray">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />
      <nav className={cn("actions-nav", { disabled: !connected })}>
        <button
          className={cn("action-button mic-button")}
          onClick={() => setMuted(!muted)}
        >
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>

        <div className="action-button no-action outlined">
          <AudioPulse volume={volume} active={connected} hover={false} />
        </div>

        {supportsVideo && (
          <>
            <MediaStreamButton
              isStreaming={screenCapture.isStreaming}
              start={changeStreams(screenCapture)}
              stop={changeStreams()}
              onIcon="cancel_presentation"
              offIcon="present_to_all"
            />
            <MediaStreamButton
              isStreaming={webcam.isStreaming}
              start={changeStreams(webcam)}
              stop={changeStreams()}
              onIcon="videocam_off"
              offIcon="videocam"
            />
          </>
        )}
        {children}
      </nav>

      <div className={cn("connection-container", { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn("action-button connect-toggle", { connected })}
            onClick={connected ? disconnect : connect}
          >
            <span className="material-symbols-outlined filled">
              {connected ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>
        <span className="text-indicator">Streaming</span>
      </div>
      {enableEditingSettings ? <SettingsDialog /> : ""}
    </section>
  );
}

export default memo(ControlTray);
