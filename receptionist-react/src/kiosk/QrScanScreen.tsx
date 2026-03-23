import jsQR from "jsqr";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CYBER_ONE_PRE_REGISTERED,
  resolveVisitorByQrToken,
  type PreRegisteredVisitor,
} from "./cyber-one-visitors";

type Props = {
  onBack: () => void;
  onRecognized: (visitor: PreRegisteredVisitor) => void;
  onFallbackToPasscode: () => void;
};

const MAX_SCAN_ATTEMPTS = 3;
const ATTEMPT_WINDOW_MS = 8000;

export function QrScanScreen({ onBack, onRecognized, onFallbackToPasscode }: Props) {
  const [simulatedInput, setSimulatedInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(ATTEMPT_WINDOW_MS / 1000));
  const [qrImageMap, setQrImageMap] = useState<Record<string, string>>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const attemptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningStoppedRef = useRef(false);
  const attemptRef = useRef(1);

  const qrCodes = useMemo(() => CYBER_ONE_PRE_REGISTERED, []);

  const clearTimers = useCallback(() => {
    if (attemptTimerRef.current) {
      clearTimeout(attemptTimerRef.current);
      attemptTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const finalizeWithRecognizedToken = useCallback(
    async (token: string) => {
      const v = await resolveVisitorByQrToken(token);
      if (!v) {
        setError("Code not recognized. Try a visitor code from the list below.");
        return false;
      }
      scanningStoppedRef.current = true;
      clearTimers();
      stopCamera();
      setError(null);
      setCameraError(null);
      onRecognized(v);
      return true;
    },
    [clearTimers, onRecognized, stopCamera]
  );

  const decodeFrame = useCallback(async (): Promise<string | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return null;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const jsQrResult = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (jsQrResult?.data) {
      return jsQrResult.data;
    }

    const Detector = (window as any).BarcodeDetector;
    if (Detector) {
      try {
        const detector = new Detector({ formats: ["qr_code"] });
        const barcodes = await detector.detect(canvas);
        const value = String(barcodes?.[0]?.rawValue || "").trim();
        if (value) {
          return value;
        }
      } catch {
        return null;
      }
    }

    return null;
  }, []);

  const startAttemptCycle = useCallback(
    (attemptNo: number) => {
      attemptRef.current = attemptNo;
      setAttempt(attemptNo);
      setSecondsLeft(Math.ceil(ATTEMPT_WINDOW_MS / 1000));
      clearTimers();

      countdownTimerRef.current = setInterval(() => {
        setSecondsLeft((prev) => Math.max(0, prev - 1));
      }, 1000);

      attemptTimerRef.current = setTimeout(() => {
        const nextAttempt = attemptNo + 1;
        if (nextAttempt > MAX_SCAN_ATTEMPTS) {
          scanningStoppedRef.current = true;
          stopCamera();
          clearTimers();
          setCameraError("QR scan failed 3 times. Switching to passcode.");
          setTimeout(() => {
            onFallbackToPasscode();
          }, 600);
          return;
        }

        setCameraError(`Scan attempt ${attemptNo} failed. Retrying...`);
        startAttemptCycle(nextAttempt);
      }, ATTEMPT_WINDOW_MS);
    },
    [clearTimers, onFallbackToPasscode, stopCamera]
  );

  const startScanLoop = useCallback(() => {
    const loop = async () => {
      if (scanningStoppedRef.current) return;
      const detected = await decodeFrame();
      if (detected && (await finalizeWithRecognizedToken(detected))) {
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [decodeFrame, finalizeWithRecognizedToken]);

  const startCameraAndScanner = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera API is not available on this browser.");
      return;
    }
    scanningStoppedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraError(null);
      startAttemptCycle(1);
      startScanLoop();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to access camera.";
      setCameraError(`Camera could not start. ${message} Switching to passcode.`);
      setTimeout(() => {
        onFallbackToPasscode();
      }, 900);
    }
  }, [onFallbackToPasscode, startAttemptCycle, startScanLoop]);

  useEffect(() => {
    void startCameraAndScanner();
    return () => {
      scanningStoppedRef.current = true;
      clearTimers();
      stopCamera();
    };
  }, [clearTimers, startCameraAndScanner, stopCamera]);

  useEffect(() => {
    let mounted = true;
    void Promise.all(
      qrCodes.map(async (v) => {
        const url = await QRCode.toDataURL(v.qrToken, {
          margin: 1,
          width: 160,
          color: {
            dark: "#a8dab5",
            light: "#00110a",
          },
        });
        return [v.qrToken, url] as const;
      })
    ).then((entries) => {
      if (!mounted) return;
      setQrImageMap(Object.fromEntries(entries));
    });
    return () => {
      mounted = false;
    };
  }, [qrCodes]);

  const tryRecognize = (token: string) => {
    void finalizeWithRecognizedToken(token);
  };

  return (
    <div className="cyber-subscreen">
      <button type="button" className="cyber-back" onClick={onBack}>
        ← Back
      </button>
      <h1 className="cyber-subscreen-title">Show your code</h1>
      <p className="cyber-subscreen-hint">
        Camera opens automatically. We will try scanning 3 times ({ATTEMPT_WINDOW_MS / 1000}s each). If all fail, you will be moved to passcode.
      </p>

      <div className="cyber-camera-frame" aria-label="Camera preview for QR scanning">
        <video ref={videoRef} className="cyber-camera-video" autoPlay playsInline muted />
        <div className="cyber-camera-overlay" />
        <div className="cyber-camera-attempt-badge">
          Attempt {attempt}/{MAX_SCAN_ATTEMPTS} · {secondsLeft}s
        </div>
      </div>
      {cameraError ? <p className="cyber-error">{cameraError}</p> : null}

      <div className="cyber-simulate-panel">
        <label className="cyber-simulate-label" htmlFor="qr-sim-input">
          Manual fallback — enter visitor QR token
        </label>
        <div className="cyber-simulate-row">
          <input
            id="qr-sim-input"
            className="cyber-simulate-input"
            value={simulatedInput}
            onChange={(e) => setSimulatedInput(e.target.value)}
            placeholder="e.g. CY1-AMIT-01"
            autoComplete="off"
          />
          <button type="button" className="cyber-primary-btn" onClick={() => tryRecognize(simulatedInput)}>
            Submit
          </button>
        </div>
        {error ? <p className="cyber-error">{error}</p> : null}
        <button type="button" className="cyber-secondary-btn" onClick={onFallbackToPasscode}>
          Use passcode instead
        </button>
        <p className="cyber-simulate-hint">Generated demo QR codes (used as fallback when invite API is unavailable):</p>
        <div className="cyber-qr-gallery">
          {qrCodes.map((v) => (
            <button
              key={v.qrToken}
              type="button"
              className="cyber-qr-card"
              onClick={() => tryRecognize(v.qrToken)}
              title={`Use ${v.fullName} (${v.qrToken})`}
            >
              <div className="cyber-qr-image-wrap">
                {qrImageMap[v.qrToken] ? (
                  <img src={qrImageMap[v.qrToken]} alt={`${v.fullName} QR`} className="cyber-qr-image" />
                ) : (
                  <span className="cyber-qr-loading">Generating...</span>
                )}
              </div>
              <span className="cyber-qr-name">{v.fullName}</span>
              <span className="cyber-qr-token">{v.qrToken}</span>
              <span className="cyber-qr-passcode">Passcode: {v.passcode}</span>
            </button>
          ))}
        </div>
        <p className="cyber-simulate-hint">Quick test — tap token chips:</p>
        <div className="cyber-chip-row">
          {qrCodes.map((v) => (
            <button
              key={v.qrToken}
              type="button"
              className="cyber-chip"
              onClick={() => tryRecognize(v.qrToken)}
            >
              {v.qrToken}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
