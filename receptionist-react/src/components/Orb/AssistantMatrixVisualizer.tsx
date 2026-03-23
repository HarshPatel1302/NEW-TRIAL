/**
 * Dot-matrix style visualizer for visitor speech energy.
 * Inspired by ElevenLabs Matrix component behavior.
 * @see https://ui.elevenlabs.io/docs/components/matrix
 */
import { useEffect, useRef } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import "./AssistantMatrixVisualizer.scss";

const ROWS = 7;
const COLS = 18;
const CELL_COUNT = ROWS * COLS;

type AssistantMatrixVisualizerProps = {
  className?: string;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function AssistantMatrixVisualizer({
  className = "",
}: AssistantMatrixVisualizerProps) {
  const { connected, assistantAudioPlaying, userInputVolume } = useLiveAPIContext();

  const connectedRef = useRef(connected);
  const speakingRef = useRef(assistantAudioPlaying);
  const inputRef = useRef(userInputVolume);
  connectedRef.current = connected;
  speakingRef.current = assistantAudioPlaying;
  inputRef.current = userInputVolume;

  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const dots = dotRefs.current;
    const smoothed = new Float32Array(CELL_COUNT);
    smoothed.fill(0.04);

    let cancelled = false;
    const t0 = performance.now();

    const frame = () => {
      if (cancelled) return;

      const t = (performance.now() - t0) / 1000;
      const connectedNow = connectedRef.current;
      const assistantSpeaking = speakingRef.current;
      const inputLevel = clamp01(inputRef.current);

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const idx = row * COLS + col;
          const phase = t * 5.2 + col * 0.52 - row * 0.17;
          const wave = (Math.sin(phase) + 1) * 0.5;

          let target = 0.03;
          if (!connectedNow) {
            target = 0.04 + 0.08 * wave;
          } else if (assistantSpeaking) {
            // Keep matrix subdued while Pratik is speaking; bars are primary then.
            target = 0.05 + 0.12 * wave;
          } else {
            // Visitor speaking drives the matrix intensity.
            const rowWeight = 1 - row / (ROWS * 1.12);
            const colPulse = 0.65 + 0.35 * Math.sin(t * 8.0 + col * 0.75);
            const reactive = inputLevel * (0.5 + 0.5 * wave) * rowWeight * colPulse;
            target = 0.05 + reactive * 0.95;
          }

          smoothed[idx] += (target - smoothed[idx]) * 0.28;

          const dot = dots[idx];
          if (!dot) continue;
          const v = clamp01(smoothed[idx]);
          dot.style.opacity = String(0.12 + v * 0.88);
          dot.style.transform = `scale(${0.76 + v * 0.42})`;
        }
      }

      requestAnimationFrame(frame);
    };

    const id = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  return (
    <div className={`assistant-matrix ${className}`.trim()} aria-hidden>
      <div className="assistant-matrix__grid">
        {Array.from({ length: CELL_COUNT }).map((_, idx) => (
          <span
            key={idx}
            className="assistant-matrix__dot"
            ref={(el) => {
              dotRefs.current[idx] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}

