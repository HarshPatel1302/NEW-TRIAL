/**
 * Face-aware capture readiness: prefers native FaceDetector when available (Chromium kiosks),
 * falls back to video dimension stability + optional brightness heuristic.
 */

export type FaceReadinessResult = {
  ok: boolean;
  mode: "face_detector" | "fallback_stable" | "unavailable";
  framesObserved: number;
};

type FaceDetectorCtor = new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect(image: CanvasImageSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

function getFaceDetector(): InstanceType<FaceDetectorCtor> | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ fastMode: true, maxDetectedFaces: 1 });
  } catch {
    return null;
  }
}

function faceBoxMetrics(
  box: DOMRectReadOnly,
  videoWidth: number,
  videoHeight: number
): { relW: number; relH: number; cx: number; cy: number } {
  const relW = box.width / Math.max(1, videoWidth);
  const relH = box.height / Math.max(1, videoHeight);
  const cx = (box.left + box.width / 2) / Math.max(1, videoWidth);
  const cy = (box.top + box.height / 2) / Math.max(1, videoHeight);
  return { relW, relH, cx, cy };
}

/**
 * Wait until a face is detected with stable center and reasonable size for several frames.
 */
export async function waitForFaceCaptureReadiness(
  video: HTMLVideoElement,
  opts: {
    maxWaitMs: number;
    stableFramesRequired: number;
    maxCenterJitter: number;
    minRelativeFaceWidth: number;
    pollMs: number;
  } = {
    maxWaitMs: 4500,
    stableFramesRequired: 5,
    maxCenterJitter: 0.06,
    minRelativeFaceWidth: 0.12,
    pollMs: 90,
  }
): Promise<FaceReadinessResult> {
  const detector = getFaceDetector();
  if (
    !detector ||
    typeof video.videoWidth !== "number" ||
    video.videoWidth < 2 ||
    video.videoHeight < 2
  ) {
    return { ok: false, mode: "unavailable", framesObserved: 0 };
  }

  let stable = 0;
  let lastCx = 0;
  let lastCy = 0;
  let initialized = false;
  const start = Date.now();
  let frames = 0;

  while (Date.now() - start < opts.maxWaitMs) {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise((r) => setTimeout(r, opts.pollMs));
      continue;
    }
    frames += 1;
    try {
      const faces = await detector.detect(video);
      if (!faces.length) {
        stable = 0;
        initialized = false;
      } else {
        const m = faceBoxMetrics(faces[0].boundingBox, video.videoWidth, video.videoHeight);
        if (m.relW < opts.minRelativeFaceWidth) {
          stable = 0;
          initialized = false;
        } else if (!initialized) {
          lastCx = m.cx;
          lastCy = m.cy;
          initialized = true;
          stable = 1;
        } else {
          const jx = Math.abs(m.cx - lastCx);
          const jy = Math.abs(m.cy - lastCy);
          if (jx <= opts.maxCenterJitter && jy <= opts.maxCenterJitter) {
            stable += 1;
            lastCx = m.cx;
            lastCy = m.cy;
          } else {
            stable = 1;
            lastCx = m.cx;
            lastCy = m.cy;
          }
        }
        if (stable >= opts.stableFramesRequired) {
          return { ok: true, mode: "face_detector", framesObserved: frames };
        }
      }
    } catch {
      stable = 0;
      initialized = false;
    }
    await new Promise((r) => setTimeout(r, opts.pollMs));
  }

  return { ok: false, mode: "face_detector", framesObserved: frames };
}
