/**
 * Spectrum-style bar visualizer driven by the assistant output analyser
 * (same idea as ElevenLabs Bar Visualizer: FFT bands + state-based motion).
 * @see https://ui.elevenlabs.io/docs/components/bar-visualizer
 */
import { useEffect, useRef } from "react";
import "./AssistantBarVisualizer.scss";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";

const BAR_COUNT = 22;
const FFT_BINS = 128; // matches AudioStreamer analyser fftSize 256 → 128 bins

type AssistantBarVisualizerProps = {
  /** Bar count; default matches ElevenLabs-style density */
  barCount?: number;
  className?: string;
};

function downsampleSpectrum(
  data: Uint8Array,
  bars: number,
  out: Float32Array
): void {
  const total = data.length;
  const start = 2;
  const end = Math.floor(total * 0.58);
  const span = Math.max(1, end - start);

  for (let b = 0; b < bars; b++) {
    const lo = start + (b / bars) * span;
    const hi = start + ((b + 1) / bars) * span;
    const i0 = Math.floor(lo);
    const i1 = Math.ceil(hi);
    let sum = 0;
    let count = 0;
    for (let i = i0; i < i1 && i < total; i++) {
      sum += data[i] ?? 0;
      count++;
    }
    const avg = count > 0 ? sum / count : 0;
    out[b] = Math.min(1, (avg / 255) * 1.35);
  }
}

export function AssistantBarVisualizer({
  barCount = BAR_COUNT,
  className = "",
}: AssistantBarVisualizerProps) {
  const { connected, assistantAudioPlaying, assistantOutputAnalyserRef } =
    useLiveAPIContext();

  const playingRef = useRef(assistantAudioPlaying);
  const connectedRef = useRef(connected);
  playingRef.current = assistantAudioPlaying;
  connectedRef.current = connected;

  const barFillsRef = useRef<(HTMLDivElement | null)[]>([]);
  const prefersReducedMotionRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = !!mq?.matches;
    const onChange = () => {
      prefersReducedMotionRef.current = !!mq.matches;
    };
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const fills = barFillsRef.current;
    const smoothed = new Float32Array(barCount);
    smoothed.fill(0.08);

    const raw = new Float32Array(barCount);
    const freq = new Uint8Array(FFT_BINS);
    let t0 = performance.now();
    let cancelled = false;

    const loop = () => {
      if (cancelled) return;

      const now = performance.now();
      const t = (now - t0) / 1000;
      const analyser = assistantOutputAnalyserRef.current;
      const speaking = playingRef.current;
      const isConnected = connectedRef.current;
      const reduced = prefersReducedMotionRef.current;

      if (reduced) {
        for (let i = 0; i < barCount; i++) {
          const el = fills[i];
          if (el) el.style.transform = "scaleY(0.18)";
        }
        requestAnimationFrame(loop);
        return;
      }

      if (speaking && isConnected && analyser) {
        analyser.getByteFrequencyData(freq);
        downsampleSpectrum(freq, barCount, raw);
        for (let i = 0; i < barCount; i++) {
          const emphasis = 0.55 + 0.45 * Math.sin((i / barCount) * Math.PI);
          const target = 0.06 + raw[i]! * 0.94 * emphasis;
          smoothed[i]! += (target - smoothed[i]!) * 0.42;
        }
      } else if (isConnected) {
        for (let i = 0; i < barCount; i++) {
          const idle =
            0.1 +
            0.1 *
              Math.sin(t * 2.1 + i * 0.38) *
              Math.sin(t * 0.7 + i * 0.12);
          smoothed[i]! += (idle - smoothed[i]!) * 0.08;
        }
      } else {
        for (let i = 0; i < barCount; i++) {
          const pulse = 0.07 + 0.05 * Math.sin(t * 1.5 + i * 0.5);
          smoothed[i]! += (pulse - smoothed[i]!) * 0.12;
        }
      }

      for (let i = 0; i < barCount; i++) {
        const el = fills[i];
        if (!el) continue;
        const h = Math.min(1, Math.max(0.05, smoothed[i]!));
        el.style.transform = `scaleY(${h})`;
        const glow = speaking && isConnected ? Math.min(1, h * 1.15) : h * 0.55;
        el.style.opacity = String(0.55 + glow * 0.45);
      }

      requestAnimationFrame(loop);
    };

    const id = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [assistantOutputAnalyserRef, barCount]);

  return (
    <div
      className={`assistant-bar-visualizer ${className}`.trim()}
      aria-hidden
    >
      <div className="assistant-bar-visualizer__track">
        {Array.from({ length: barCount }, (_, i) => (
          <div key={i} className="assistant-bar-visualizer__col">
            <div
              className="assistant-bar-visualizer__fill"
              ref={(el) => {
                barFillsRef.current[i] = el;
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
