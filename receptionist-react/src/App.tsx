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

import { useRef, useState, useEffect, useCallback } from "react";
import "./App.scss";
import { LiveAPIProvider, useLiveAPIContext } from "./contexts/LiveAPIContext";
import Avatar3D, { Avatar3DRef } from "./components/Avatar3D/Avatar3D";
import ControlTray from "./components/control-tray/ControlTray";
import { LiveClientOptions } from "./types";
import { RECEPTIONIST_PERSONA } from "./receptionist/config";
import { TOOLS } from "./receptionist/tools";
import { DatabaseManager } from "./receptionist/database";
import {
  isValidIndianMobile,
  lookupVisitorByMobile,
  normalizeIndianMobile,
  syncWalkInDetailsToExternalApis,
  warmupVisitorAuth,
} from "./receptionist/external-visitor-sync";
import { requestDeliveryApproval } from "./receptionist/delivery-approval";
import {
  decodeMembersFromNotes,
  encodeMembersForNotes,
  resolveMembersForDestination,
} from "./receptionist/member-directory";
import purposeCatalog from "./receptionist/purpose.json";
import { GestureController, GestureState } from "./components/Avatar3D/gesture-controller";
import { ExpressionCue } from "./components/Avatar3D/facial-types";
import AdminDashboard from "./admin/AdminDashboard";
import {
  isExplicitUnknownPerson,
} from "./receptionist/flow-helpers";
import {
  canCapturePhoto,
  canCreateVisitor,
  canEmitFinalSuccess,
  createVisitorFlowSession,
  expectedSlotForState,
  promptForState,
  transitionVisitorFlow,
  type VisitorFlowState,
} from "./receptionist/visitor-flow-machine";

const API_KEY = (process.env.REACT_APP_GEMINI_API_KEY || "").trim();

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

type QueuedGesture = {
  gesture: GestureState;
  duration?: number;
  priority: number;
  createdAt: number;
};

type PurposeCategory = {
  category_id: number;
  category_name: string;
  sub_categories?: Array<{
    sub_category_id: number | null;
    sub_category_name: string | null;
    sub_category_purpose_img?: string | null;
  }>;
};

type PurposeCatalog = {
  success: boolean;
  data: PurposeCategory[];
  message: string;
  status_code: number;
};

const FALLBACK_GESTURE_DURATIONS: Record<GestureState, number> = {
  idle: 2,
  talking: 2,
  waving: 4.7,
  pointing: 2.75,
  nodYes: 2.6,
  bow: 2.73,
};

const GESTURE_COOLDOWN_MS: Record<GestureState, number> = {
  idle: 0,
  talking: 0,
  waving: 1800,
  pointing: 1600,
  nodYes: 1100,
  bow: 3000,
};

const PURPOSE_CATALOG = purposeCatalog as PurposeCatalog;

function hasMeaningfulValue(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return !["n/a", "na", "none", "unknown", "-", "not available", "not sure"].includes(normalized);
}

function toPhoneDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

type ActiveReceptionFlow = "visitor" | "delivery";

function normalizeIntentName(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (!raw) return "meet_person";
  if (raw.includes("delivery") || raw.includes("parcel") || raw.includes("courier")) {
    return "delivery";
  }
  if (raw.includes("appointment") || raw.includes("meet") || raw.includes("visit")) {
    return "meet_person";
  }
  if (raw.includes("info") || raw.includes("inquiry") || raw.includes("about")) {
    return "info";
  }
  return raw;
}

function inferActiveFlow(intent: unknown, collectedSlots: Record<string, string>): ActiveReceptionFlow {
  const normalizedIntent = normalizeIntentName(intent);
  if (normalizedIntent === "delivery") {
    return "delivery";
  }

  if (
    hasMeaningfulValue(collectedSlots.delivery_company) ||
    hasMeaningfulValue(collectedSlots.recipient_company) ||
    hasMeaningfulValue(collectedSlots.recipient_name) ||
    hasMeaningfulValue(collectedSlots.delivery_partner)
  ) {
    return "delivery";
  }

  return "visitor";
}

function getMissingFieldsBeforePhoto(intent: unknown, collectedSlots: Record<string, string>) {
  const flow = inferActiveFlow(intent, collectedSlots);
  const missing: string[] = [];

  if (flow === "delivery") {
    if (!hasMeaningfulValue(collectedSlots.visitor_name) && !hasMeaningfulValue(collectedSlots.name)) {
      missing.push("delivery_person_name");
    }
    if (
      !hasMeaningfulValue(collectedSlots.delivery_company) &&
      !hasMeaningfulValue(collectedSlots.delivery_partner) &&
      !hasMeaningfulValue(collectedSlots.company)
    ) {
      missing.push("delivery_company");
    }
    if (
      !hasMeaningfulValue(collectedSlots.recipient_company) &&
      !hasMeaningfulValue(collectedSlots.target_company) &&
      !hasMeaningfulValue(collectedSlots.department)
    ) {
      missing.push("recipient_company");
    }
    if (
      !hasMeaningfulValue(collectedSlots.recipient_name) &&
      !hasMeaningfulValue(collectedSlots.person_to_meet) &&
      !hasMeaningfulValue(collectedSlots.meeting_with)
    ) {
      missing.push("recipient_name");
    }
  } else {
    if (!hasMeaningfulValue(collectedSlots.visitor_name) && !hasMeaningfulValue(collectedSlots.name)) {
      missing.push("name");
    }
    const phone = String(collectedSlots.phone || collectedSlots.visitor_phone || "").replace(/\D/g, "");
    if (phone.length < 10) {
      missing.push("phone");
    }
    if (!hasMeaningfulValue(collectedSlots.came_from)) {
      missing.push("came_from");
    }
    if (!hasMeaningfulValue(collectedSlots.visit_company) && !hasMeaningfulValue(collectedSlots.company)) {
      missing.push("visit_company");
    }
  }

  return { flow, missing };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until video dimensions are stable (reduces blank-frame capture after countdown). */
async function waitForStableVideoFrames(
  video: HTMLVideoElement,
  opts: { maxMs: number; intervalMs: number; stableReads: number } = {
    maxMs: 4500,
    intervalMs: 120,
    stableReads: 2,
  }
) {
  const start = Date.now();
  let lastW = 0;
  let stableHits = 0;
  while (Date.now() - start < opts.maxMs) {
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      if (video.videoWidth === lastW && lastW > 0) {
        stableHits += 1;
        if (stableHits >= opts.stableReads) {
          return true;
        }
      } else {
        stableHits = 0;
        lastW = video.videoWidth;
      }
    }
    await sleep(opts.intervalMs);
  }
  return video.videoWidth > 0 && video.videoHeight > 0;
}

function normalizeSlotName(input: unknown) {
  const raw = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const aliases: Record<string, string> = {
    name: "visitor_name",
    full_name: "visitor_name",
    visitorname: "visitor_name",
    delivery_person_name: "visitor_name",
    phone_number: "phone",
    mobile: "phone",
    mobile_number: "phone",
    visitor_phone: "phone",
    person_to_meet: "meeting_with",
    whom_to_meet: "meeting_with",
    meetingwith: "meeting_with",
    where_to_go: "meeting_with",
    unit: "meeting_with",
    unit_number: "meeting_with",
    flat: "meeting_with",
    flat_number: "meeting_with",
    recipient_person: "recipient_name",
    parcel_for_person: "recipient_name",
    parcel_recipient_name: "recipient_name",
    person_in_company: "recipient_name",
    recipient_company_name: "recipient_company",
    target_company: "recipient_company",
    parcel_for_company: "recipient_company",
    parcel_company: "recipient_company",
    delivery_company_name: "delivery_company",
    courier_company: "delivery_company",
    origin: "came_from",
    where_from: "came_from",
    from_where: "came_from",
    delivery_partner: "delivery_company",
    visit_company: "visit_company",
    company_to_meet: "visit_company",
    office_to_visit: "visit_company",
    meeting_company: "visit_company",
    greenscape_company: "visit_company",
  };

  return aliases[raw] || raw;
}

function mergeCollectedSlotValue(slotName: string, incomingValue: unknown, existingValue: unknown) {
  const incomingRaw = String(incomingValue || "").trim();
  const existingRaw = String(existingValue || "").trim();

  if (!existingRaw) {
    return incomingRaw;
  }
  if (!hasMeaningfulValue(incomingRaw)) {
    return existingRaw;
  }

  if (slotName === "phone") {
    const existingDigits = toPhoneDigits(existingRaw);
    const incomingDigits = toPhoneDigits(incomingRaw);
    if (!incomingDigits) {
      return existingDigits || existingRaw;
    }
    if (!existingDigits) {
      return incomingDigits;
    }
    if (incomingDigits.length >= 10) {
      return incomingDigits;
    }
    if (existingDigits.length >= 10) {
      return existingDigits;
    }
    if (incomingDigits.includes(existingDigits)) {
      return incomingDigits;
    }
    if (existingDigits.includes(incomingDigits)) {
      return existingDigits;
    }
    return `${existingDigits}${incomingDigits}`.slice(0, 10);
  }

  return incomingRaw;
}

function normalizePurposeText(input: unknown) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ");
}

function stripTrailingPlural(input: string) {
  return input.endsWith("s") ? input.slice(0, -1) : input;
}

function findPurposeCategoryMatch(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) {
    const byId = PURPOSE_CATALOG.data.find((category) => category.category_id === asNumber);
    if (byId) {
      return {
        category: byId,
        subCategory: null,
      };
    }
    for (const category of PURPOSE_CATALOG.data) {
      const subCategory = (category.sub_categories || []).find(
        (sub) => sub?.sub_category_id !== null && sub?.sub_category_id === asNumber
      );
      if (subCategory) {
        return {
          category,
          subCategory,
        };
      }
    }
  }

  const normalized = normalizePurposeText(raw);
  if (!normalized) return null;

  const normalizedSingular = stripTrailingPlural(normalized);
  const categoryMatch = PURPOSE_CATALOG.data.find((category) => {
    const categoryNormalized = normalizePurposeText(category.category_name);
    const categorySingular = stripTrailingPlural(categoryNormalized);
    return (
      categoryNormalized === normalized ||
      categorySingular === normalizedSingular ||
      categoryNormalized.includes(normalized) ||
      normalized.includes(categoryNormalized)
    );
  });
  if (categoryMatch) {
    return {
      category: categoryMatch,
      subCategory: null,
    };
  }

  for (const category of PURPOSE_CATALOG.data) {
    for (const subCategory of category.sub_categories || []) {
      if (!subCategory?.sub_category_name) continue;
      const subNormalized = normalizePurposeText(subCategory.sub_category_name);
      const subSingular = stripTrailingPlural(subNormalized);
      if (
        subNormalized === normalized ||
        subSingular === normalizedSingular ||
        subNormalized.includes(normalized) ||
        normalized.includes(subNormalized)
      ) {
        return {
          category,
          subCategory,
        };
      }
    }
  }

  return null;
}

function ReceptionistApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<Avatar3DRef>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [lastAudioText, setLastAudioText] = useState<string>("");
  const [expressionCue, setExpressionCue] = useState<ExpressionCue>("neutral_professional");
  const prevAssistantAudioPlayingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const lastLoggedAssistantTextRef = useRef<string>("");
  const assistantPauseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSentAutoGreetingRef = useRef(false);
  const sessionPhotoRef = useRef<string | null>(null);
  const visitorCheckInPhotoRef = useRef<string | null>(null);
  const hasSavedVisitorRef = useRef(false);
  const hasPersistedSecuritySnapshotRef = useRef(false);
  const captureInFlightRef = useRef(false);
  const lastCaptureErrorRef = useRef<string>("");
  /** Clears prior reset timers so end_interaction cannot stack multiple disconnects. */
  const endSessionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transientDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAwaitingReconnectRef = useRef(false);
  /** Dedupes identical assistant text bursts from the model (reduces repeated bubble / perceived duplicate TTS). */
  const lastAssistantTextDedupeRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const visitorFlowRef = useRef(createVisitorFlowSession());

  const setVisitorFlowState = useCallback((next: VisitorFlowState, reason: string) => {
    try {
      const previous = visitorFlowRef.current.state;
      const updated = transitionVisitorFlow(visitorFlowRef.current, next);
      visitorFlowRef.current = updated;
      console.info("[VisitorFlow] transition", {
        from: previous,
        to: next,
        reason,
        at: Date.now(),
      });
      return true;
    } catch (error) {
      console.error("[VisitorFlow] invalid transition", {
        from: visitorFlowRef.current.state,
        to: next,
        reason,
        error,
      });
      visitorFlowRef.current = { ...visitorFlowRef.current, state: "ERROR" };
      return false;
    }
  }, []);

  const { client, setConfig, setModel, connected, disconnect: disconnectSession, lipSyncRef, assistantAudioPlaying } = useLiveAPIContext();

  // ── Gesture Controller ────────────────────────────────────────────
  const gestureControllerRef = useRef<GestureController | null>(null);
  const gestureQueueRef = useRef<QueuedGesture[]>([]);
  const gestureProcessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureBusyUntilRef = useRef(0);
  const lastGestureAtRef = useRef<Record<GestureState, number>>({
    idle: 0,
    talking: 0,
    waving: 0,
    pointing: 0,
    nodYes: 0,
    bow: 0,
  });
  const speechClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback ref for playAnimation (avoids recreating controller)
  const playAnimationRef = useRef<Avatar3DRef['playAnimation'] | null>(null);
  useEffect(() => {
    playAnimationRef.current = (name: string, options?: { loop?: boolean; duration?: number }) => {
      avatarRef.current?.playAnimation(name, options);
    };
  }, []);

  const resolveGestureDuration = useCallback((gesture: GestureState): number => {
    const runtimeClipDuration = avatarRef.current?.getAnimationDuration(gesture);
    return runtimeClipDuration || FALLBACK_GESTURE_DURATIONS[gesture] || 2;
  }, []);

  const processGestureQueue = useCallback(() => {
    const now = Date.now();
    if (now < gestureBusyUntilRef.current) {
      return;
    }

    const next = gestureQueueRef.current.shift();
    if (!next) {
      return;
    }

    gestureControllerRef.current?.handleEvent({
      type: "gesture",
      gesture: next.gesture,
      duration: next.duration,
    });

    const durationSeconds = next.duration || resolveGestureDuration(next.gesture);
    gestureBusyUntilRef.current = now + durationSeconds * 1000 + 160;

    if (gestureProcessTimerRef.current) {
      clearTimeout(gestureProcessTimerRef.current);
    }
    gestureProcessTimerRef.current = setTimeout(() => {
      gestureProcessTimerRef.current = null;
      processGestureQueue();
    }, Math.max(100, durationSeconds * 1000 + 30));
  }, [resolveGestureDuration]);

  const enqueueGesture = useCallback((
    gesture: GestureState,
    options: { duration?: number; priority?: number; force?: boolean } = {}
  ) => {
    const now = Date.now();
    const cooldown = GESTURE_COOLDOWN_MS[gesture] || 0;
    const previousTime = lastGestureAtRef.current[gesture] || 0;

    if (!options.force && cooldown > 0 && now - previousTime < cooldown) {
      return false;
    }

    lastGestureAtRef.current[gesture] = now;

    gestureQueueRef.current.push({
      gesture,
      duration: options.duration,
      priority: options.priority ?? 1,
      createdAt: now,
    });

    gestureQueueRef.current.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt - b.createdAt;
    });

    processGestureQueue();
    return true;
  }, [processGestureQueue]);

  // Create gesture controller once
  useEffect(() => {
    gestureControllerRef.current = new GestureController(
      (name, options) => playAnimationRef.current?.(name, options),
      { getGestureDuration: resolveGestureDuration }
    );

    return () => {
      gestureControllerRef.current?.destroy();
      if (gestureProcessTimerRef.current) {
        clearTimeout(gestureProcessTimerRef.current);
      }
      if (speechClearTimerRef.current) {
        clearTimeout(speechClearTimerRef.current);
      }
      if (assistantPauseDebounceRef.current) {
        clearTimeout(assistantPauseDebounceRef.current);
      }
    };
  }, [resolveGestureDuration]);

  const fireGesture = useCallback((
    gesture: GestureState,
    duration?: number,
    priority = 1
  ) => {
    enqueueGesture(gesture, { duration, priority });
  }, [enqueueGesture]);

  const captureVisitorPhotoJpeg = useCallback(async () => {
    const videoFirst = videoRef.current;
    if (videoFirst) {
      const stable = await waitForStableVideoFrames(videoFirst);
      if (!stable) {
        const sid = sessionIdRef.current;
        if (sid) {
          void DatabaseManager.logSessionEvent(sid, {
            role: "system",
            eventType: "camera_capture_frame_wait",
            content: "video_frames_not_stable",
          });
        }
      }
    }
    const attempts = 12;
    for (let index = 0; index < attempts; index += 1) {
      const videoEl = videoRef.current;
      if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        const maxWidth = 640;
        const ratio = Math.min(1, maxWidth / videoEl.videoWidth);
        const targetWidth = Math.max(1, Math.round(videoEl.videoWidth * ratio));
        const targetHeight = Math.max(1, Math.round(videoEl.videoHeight * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return null;
        }
        ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
        return canvas.toDataURL("image/jpeg", 0.82);
      }
      await sleep(300);
    }
    return null;
  }, []);

  const stopCameraPreview = useCallback(() => {
    const video = videoRef.current;
    const stream = (video?.srcObject as MediaStream | null) || null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (video) {
      video.srcObject = null;
    }
    setVideoStream(null);
  }, []);

  const describeCameraAccessError = useCallback((error: unknown) => {
    const err = error as { name?: string; message?: string };
    const rawName = String(err?.name || "").trim().toLowerCase();
    if (rawName === "notallowederror" || rawName === "securityerror") {
      return "Camera access was denied. Please allow camera permission in browser settings and try again.";
    }
    if (rawName === "notfounderror" || rawName === "devicesnotfounderror") {
      return "No camera device was found on this system.";
    }
    if (rawName === "notreadableerror" || rawName === "trackstarterror") {
      return "Camera is busy in another app. Please close other camera apps and try again.";
    }
    if (rawName === "overconstrainederror") {
      return "Camera constraints were not supported on this device. Retrying with fallback constraints.";
    }
    const message = String(err?.message || "").trim();
    if (message) {
      return `Camera error: ${message}`;
    }
    return "Unable to access camera right now. Please try again.";
  }, []);

  const openTemporaryCameraStream = useCallback(async () => {
    const startedAt = Date.now();
    console.info("[perf] camera_init_start", { t: startedAt });
    if (!navigator.mediaDevices?.getUserMedia) {
      lastCaptureErrorRef.current = "Camera API is not supported in this browser.";
      return null;
    }
    const cameraRequests: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: "user",
        },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let lastError: unknown = null;
    for (const constraints of cameraRequests) {
      try {
        const getUserMediaPromise = navigator.mediaDevices.getUserMedia(constraints);
        const stream = (await Promise.race([
          getUserMediaPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Camera permission timed out.")), 8000)
          ),
        ])) as MediaStream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // Some browsers require user interaction before play(); capture loop retries until ready.
          }
        }
        setVideoStream(stream);
        lastCaptureErrorRef.current = "";
        console.info("[perf] camera_init_end", {
          t: Date.now(),
          duration_ms: Date.now() - startedAt,
          ok: true,
        });
        return stream;
      } catch (error) {
        lastError = error;
      }
    }

    lastCaptureErrorRef.current = describeCameraAccessError(lastError);
    console.info("[perf] camera_init_end", {
      t: Date.now(),
      duration_ms: Date.now() - startedAt,
      ok: false,
    });
    return null;
  }, [describeCameraAccessError]);

  const captureCheckInPhotoAfterCountdown = useCallback(async (source: string, countdownMs = 5000) => {
    if (captureInFlightRef.current) {
      return false;
    }

    captureInFlightRef.current = true;
    const startedAt = Date.now();
    console.info("[perf] photo_capture_start", { t: startedAt, source, countdown_ms: countdownMs });
    try {
      lastCaptureErrorRef.current = "";
      const activeSessionId = sessionIdRef.current;
      const stream = await openTemporaryCameraStream();
      if (!stream) {
        if (activeSessionId) {
          await DatabaseManager.logSessionEvent(activeSessionId, {
            role: "system",
            eventType: "camera_capture_failed",
            content: lastCaptureErrorRef.current || "Camera stream was unavailable.",
          });
        }
        return false;
      }
      if (countdownMs > 0) {
        await sleep(countdownMs);
      }
      const jpegDataUrl = await captureVisitorPhotoJpeg();
      if (!jpegDataUrl) {
        lastCaptureErrorRef.current =
          "Camera opened but no video frame was available for capture.";
        if (activeSessionId) {
          await DatabaseManager.logSessionEvent(activeSessionId, {
            role: "system",
            eventType: "camera_capture_failed",
            content: lastCaptureErrorRef.current,
          });
        }
        return false;
      }

      visitorCheckInPhotoRef.current = jpegDataUrl;
      sessionPhotoRef.current = jpegDataUrl;

      if (activeSessionId) {
        await DatabaseManager.logSessionEvent(activeSessionId, {
          role: "system",
          eventType: "visitor_photo_captured",
          content: `Captured check-in JPEG snapshot (${source}).`,
        });
      }

      return true;
    } catch (error) {
      lastCaptureErrorRef.current = describeCameraAccessError(error);
      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) {
        await DatabaseManager.logSessionEvent(activeSessionId, {
          role: "system",
          eventType: "camera_capture_failed",
          content: lastCaptureErrorRef.current,
        });
      }
      return false;
    } finally {
      console.info("[perf] photo_capture_end", {
        t: Date.now(),
        duration_ms: Date.now() - startedAt,
        ok: !!visitorCheckInPhotoRef.current,
      });
      captureInFlightRef.current = false;
      stopCameraPreview();
    }
  }, [captureVisitorPhotoJpeg, describeCameraAccessError, openTemporaryCameraStream, stopCameraPreview]);

  const waitForCaptureSettled = useCallback(async (timeoutMs = 2500) => {
    const startedAt = Date.now();
    while (captureInFlightRef.current && Date.now() - startedAt < timeoutMs) {
      await sleep(120);
    }
  }, []);

  const persistSecuritySnapshotIfNeeded = useCallback(async (sessionId: string) => {
    if (
      !sessionId ||
      hasSavedVisitorRef.current ||
      hasPersistedSecuritySnapshotRef.current ||
      !sessionPhotoRef.current
    ) {
      return;
    }

    const snapshot = await DatabaseManager.saveVisitor(
      {
        name: "Unknown Visitor",
        phone: "",
        meetingWith: "",
        intent: "unknown",
        department: "Security",
        purpose: "Auto-captured visitor snapshot (interaction not completed)",
        company: "",
        notes: "Security snapshot captured at interaction start.",
        photo: sessionPhotoRef.current,
      },
      { sessionId }
    );

    hasPersistedSecuritySnapshotRef.current = true;
    await DatabaseManager.updateSession(sessionId, {
      visitorId: snapshot.id,
      summary: "Visitor left before completing details. Security photo captured.",
    });
  }, []);

  // ── Initial Configuration ─────────────────────────────────────────
  useEffect(() => {
    const modelId = "models/gemini-2.5-flash-native-audio-preview-12-2025";
    setModel(modelId);

    setConfig({
      model: modelId,
      responseModalities: "AUDIO",
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Algenib",
          },
        },
      },
      systemInstruction: {
        parts: [{ text: RECEPTIONIST_PERSONA.systemInstruction }],
      },
      tools: TOOLS,
    } as any);
  }, [setConfig, setModel]);

  // Best-effort landscape lock for kiosk devices that allow it.
  useEffect(() => {
    const orientation = (typeof window !== "undefined" ? window.screen?.orientation : undefined) as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined;
    if (orientation?.lock) {
      void orientation.lock("landscape").catch(() => {
        // Ignored: many browsers only allow orientation lock in fullscreen/PWA mode.
      });
    }
  }, []);

  // ── Session Lifecycle (PostgreSQL backend) ───────────────────────
  useEffect(() => {
    let cancelled = false;

    if (connected) {
      if (transientDisconnectTimerRef.current) {
        clearTimeout(transientDisconnectTimerRef.current);
        transientDisconnectTimerRef.current = null;
      }
      const isReconnectResume = isAwaitingReconnectRef.current && !!sessionIdRef.current;
      isAwaitingReconnectRef.current = false;

      if (isReconnectResume) {
        console.info("[VisitorFlow] transient reconnect recovered; preserving session state");
      } else {
        void warmupVisitorAuth();
        visitorFlowRef.current = createVisitorFlowSession();
        void setVisitorFlowState("ASK_PHONE", "session_connected");
        setConversationState({ collectedSlots: {} });
        hasSavedVisitorRef.current = false;
        hasPersistedSecuritySnapshotRef.current = false;
        sessionPhotoRef.current = null;
        visitorCheckInPhotoRef.current = null;
        captureInFlightRef.current = false;
        const kioskId = process.env.REACT_APP_KIOSK_ID || "greenscape-lobby-kiosk";
        void DatabaseManager.startSession({ kioskId }).then((sessionId) => {
          if (!cancelled && sessionId) {
            sessionIdRef.current = sessionId;
          }
        });
      }
    } else {
      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) {
        isAwaitingReconnectRef.current = true;
        if (transientDisconnectTimerRef.current) {
          clearTimeout(transientDisconnectTimerRef.current);
        }
        transientDisconnectTimerRef.current = setTimeout(() => {
          transientDisconnectTimerRef.current = null;
          if (connected) return;
          isAwaitingReconnectRef.current = false;
          visitorFlowRef.current = createVisitorFlowSession();
          if (endSessionResetTimerRef.current) {
            clearTimeout(endSessionResetTimerRef.current);
            endSessionResetTimerRef.current = null;
          }
          setConversationState({ collectedSlots: {} });
          lastLoggedAssistantTextRef.current = "";
          stopCameraPreview();
          const finalSessionId = sessionIdRef.current;
          sessionIdRef.current = null;
          if (!finalSessionId) return;
          void (async () => {
            await waitForCaptureSettled();
            const shouldPersistSnapshot =
              !!sessionPhotoRef.current &&
              !hasSavedVisitorRef.current &&
              !hasPersistedSecuritySnapshotRef.current;
            if (shouldPersistSnapshot) {
              await persistSecuritySnapshotIfNeeded(finalSessionId);
            }
            await DatabaseManager.endSession(finalSessionId, {
              status: "disconnected",
              summary: "Live connection closed before explicit end_interaction.",
            });
            captureInFlightRef.current = false;
            hasSavedVisitorRef.current = false;
            hasPersistedSecuritySnapshotRef.current = false;
            sessionPhotoRef.current = null;
            visitorCheckInPhotoRef.current = null;
          })();
        }, 12000);
      } else {
        visitorFlowRef.current = createVisitorFlowSession();
        if (endSessionResetTimerRef.current) {
          clearTimeout(endSessionResetTimerRef.current);
          endSessionResetTimerRef.current = null;
        }
        setConversationState({ collectedSlots: {} });
        lastLoggedAssistantTextRef.current = "";
        stopCameraPreview();
      }
    }

    return () => {
      cancelled = true;
    };
  }, [connected, persistSecuritySnapshotIfNeeded, setVisitorFlowState, stopCameraPreview, waitForCaptureSettled]);

  // ── AUTO-GREETING ─────────────────────────────────────────────────
  useEffect(() => {
    let cueTimer: ReturnType<typeof setTimeout> | null = null;
    if (connected) {
      setExpressionCue("welcome_warm");
      enqueueGesture("waving", { duration: 6.0, priority: 3, force: true });
      if (!hasSentAutoGreetingRef.current) {
        hasSentAutoGreetingRef.current = true;
        client.send([{ text: "The user is here. Greet them immediately." }]);
      }

      cueTimer = setTimeout(() => {
        setExpressionCue("listening_attentive");
      }, 1800);
    } else {
      if (isAwaitingReconnectRef.current) {
        return;
      }
      hasSentAutoGreetingRef.current = false;
      gestureQueueRef.current = [];
      gestureBusyUntilRef.current = 0;
      if (gestureProcessTimerRef.current) {
        clearTimeout(gestureProcessTimerRef.current);
        gestureProcessTimerRef.current = null;
      }
      gestureControllerRef.current?.resetToIdle();
      prevAssistantAudioPlayingRef.current = false;
      setExpressionCue("neutral_professional");
      setLastAudioText("");
    }

    return () => {
      if (cueTimer) {
        clearTimeout(cueTimer);
      }
    };
  }, [connected, client, enqueueGesture]);

  // ── AUDIO PLAYBACK TRACKING (actual output playback) ──────────────
  useEffect(() => {
    const prev = prevAssistantAudioPlayingRef.current;
    if (!connected) {
      if (prev) {
        gestureControllerRef.current?.handleEvent({ type: 'audioStop' });
      }
      if (assistantPauseDebounceRef.current) {
        clearTimeout(assistantPauseDebounceRef.current);
        assistantPauseDebounceRef.current = null;
      }
      prevAssistantAudioPlayingRef.current = false;
      return;
    }

    if (assistantAudioPlaying && !prev) {
      if (assistantPauseDebounceRef.current) {
        clearTimeout(assistantPauseDebounceRef.current);
        assistantPauseDebounceRef.current = null;
      }
      if (speechClearTimerRef.current) {
        clearTimeout(speechClearTimerRef.current);
      }
      setExpressionCue("explaining_confident");
      gestureControllerRef.current?.handleEvent({ type: 'audioStart' });
    }

    if (!assistantAudioPlaying && prev) {
      if (assistantPauseDebounceRef.current) {
        clearTimeout(assistantPauseDebounceRef.current);
      }
      assistantPauseDebounceRef.current = setTimeout(() => {
        assistantPauseDebounceRef.current = null;
        setExpressionCue("listening_attentive");
        gestureControllerRef.current?.handleEvent({ type: 'audioStop' });
        if (speechClearTimerRef.current) {
          clearTimeout(speechClearTimerRef.current);
        }
        speechClearTimerRef.current = setTimeout(() => {
          setLastAudioText("");
        }, 1800);
      }, 240);
    }

    prevAssistantAudioPlayingRef.current = assistantAudioPlaying;
  }, [assistantAudioPlaying, connected]);

  // Strong interruption handling: immediately bring avatar back to listening.
  useEffect(() => {
    const onInterrupted = () => {
      if (assistantPauseDebounceRef.current) {
        clearTimeout(assistantPauseDebounceRef.current);
        assistantPauseDebounceRef.current = null;
      }
      setExpressionCue("listening_attentive");
      gestureControllerRef.current?.handleEvent({ type: "audioStop" });
      if (speechClearTimerRef.current) {
        clearTimeout(speechClearTimerRef.current);
      }
      setLastAudioText("");

      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) {
        void DatabaseManager.logSessionEvent(activeSessionId, {
          role: "system",
          eventType: "assistant_interrupted",
          content: "User interrupted assistant playback.",
        });
      }
    };

    client.on("interrupted", onInterrupted);
    return () => {
      client.off("interrupted", onInterrupted);
    };
  }, [client]);

  // ── Model Text Content → Speech Bubble ───────────────────────────
  useEffect(() => {
    const onContent = (payload: any) => {
      const parts = payload?.modelTurn?.parts;
      if (!Array.isArray(parts)) return;

      const text = parts
        .map((part: any) => (typeof part?.text === "string" ? part.text.trim() : ""))
        .filter(Boolean)
        .join(" ");

      if (!text) return;

      const now = Date.now();
      const dedupe = lastAssistantTextDedupeRef.current;
      if (dedupe.text === text && now - dedupe.at < 2800) {
        return;
      }
      lastAssistantTextDedupeRef.current = { text, at: now };

      setLastAudioText(text);
      if (text !== lastLoggedAssistantTextRef.current) {
        lastLoggedAssistantTextRef.current = text;
        const activeSessionId = sessionIdRef.current;
        if (activeSessionId) {
          void DatabaseManager.logSessionEvent(activeSessionId, {
            role: "assistant",
            eventType: "assistant_response",
            content: text,
          });
        }
      }
      if (speechClearTimerRef.current) {
        clearTimeout(speechClearTimerRef.current);
      }
      speechClearTimerRef.current = setTimeout(() => {
        setLastAudioText("");
      }, 7000);
    };

    client.on("content", onContent);
    return () => {
      client.off("content", onContent);
    };
  }, [client]);

  // Conversation state for slot-filling
  const [conversationState, setConversationState] = useState<{
    intent?: string;
    collectedSlots: Record<string, string>;
  }>({
    collectedSlots: {}
  });

  const conversationStateRef = useRef(conversationState);
  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  // ── Handle Tool Calls ─────────────────────────────────────────────
  useEffect(() => {
    const onToolCall = async (toolCall: any) => {
      console.log("Tool Call:", toolCall);
      const responses = [];

      for (const fc of toolCall.functionCalls) {
        let result: any = { error: "Unknown tool" };
        const { name, args } = fc;
        const toolStartedAt = Date.now();
        console.info("[flow] input_received", { tool: name, t: toolStartedAt });
        const activeSessionId = sessionIdRef.current;

        if (activeSessionId) {
          void DatabaseManager.logSessionEvent(activeSessionId, {
            role: "tool",
            eventType: `tool_call:${name}`,
            content: JSON.stringify({ ...(args || {}), ts: Date.now() }),
          });
        }

        try {
          if (name === "classify_intent") {
            const normalizedIntent = normalizeIntentName(args.detected_intent);
            setConversationState(prev => ({
              ...prev,
              intent: normalizedIntent
            }));
            setExpressionCue("listening_attentive");

            // Gesture based on intent
            if (normalizedIntent === "info") {
              fireGesture('waving', undefined, 2);
            }
            if (normalizedIntent === "meet_person" || normalizedIntent === "delivery") {
              setExpressionCue("confirming_yes");
              fireGesture('nodYes', undefined, 2);
            }
            if (normalizedIntent === "delivery") {
              visitorFlowRef.current = {
                ...visitorFlowRef.current,
                mode: "delivery",
                isExistingVisitor: false,
              };
              void setVisitorFlowState("DELIVERY_ASK_NAME", "intent_delivery_selected");
            } else {
              visitorFlowRef.current = {
                ...visitorFlowRef.current,
                mode: "new_visitor",
              };
              if (visitorFlowRef.current.state === "IDLE" || visitorFlowRef.current.state === "MODE_SELECTED") {
                void setVisitorFlowState("ASK_PHONE", "intent_non_delivery_selected");
              }
            }

            result = {
              status: "success",
              intent: normalizedIntent,
              raw_intent: String(args.detected_intent || ""),
              message: `Intent classified as ${normalizedIntent}`
            };
            if (activeSessionId) {
              void DatabaseManager.updateSession(activeSessionId, { intent: normalizedIntent });
            }
          }
          else if (name === "collect_slot_value") {
            const normalizedIncomingSlotName = normalizeSlotName(args.slot_name);
            const expectedSlot = expectedSlotForState(visitorFlowRef.current.state);
            const slotName =
              expectedSlot === "visit_company" && normalizedIncomingSlotName === "meeting_with"
                ? "visit_company"
                : normalizedIncomingSlotName;
            const disallowedSlotNames = [
              "department",
              "purpose",
              "appointment_time",
              "reference_id",
              "notes",
            ];
            if (disallowedSlotNames.includes(slotName)) {
              result = {
                status: "ignored",
                slot: slotName,
                message:
                  "This field is not required. Collect only the active flow details before photo capture.",
              };
            } else {
            if (expectedSlot && slotName !== expectedSlot) {
              result = {
                status: "need_more_info",
                slot: slotName,
                expected_slot: expectedSlot,
                message: promptForState(visitorFlowRef.current.state, visitorFlowRef.current.visitorName),
              };
              responses.push({
                name: name,
                id: fc.id,
                response: { result },
              });
              continue;
            }
            const isDeliverySlotName = ["delivery_company", "recipient_company", "recipient_name"].includes(slotName);
            const rawSlotValue = String(args.value || "").trim();
            const existingSlotValue = String(conversationStateRef.current.collectedSlots[slotName] || "").trim();
            const slotValue = mergeCollectedSlotValue(slotName, rawSlotValue, existingSlotValue);
            const phoneDigitsCollected = slotName === "phone" ? toPhoneDigits(slotValue).length : 0;
            const phoneNeedsMoreDigits = slotName === "phone" && phoneDigitsCollected > 0 && phoneDigitsCollected < 10;
            const normalizedPhoneValue = slotName === "phone" ? normalizeIndianMobile(slotValue) : "";
            const phoneInvalid =
              slotName === "phone" &&
              phoneDigitsCollected >= 10 &&
              !isValidIndianMobile(normalizedPhoneValue);
            if (slotName === "phone" && !phoneInvalid && !phoneNeedsMoreDigits) {
              visitorFlowRef.current = {
                ...visitorFlowRef.current,
                phoneNumber: slotValue,
                normalizedPhoneNumber: normalizedPhoneValue,
              };
              if (visitorFlowRef.current.state === "ASK_PHONE") {
                void setVisitorFlowState("SEARCHING_VISITOR", "phone_captured_search_started");
              }
            }
            const shouldResolvePurposeCategory = [
              "purpose",
              "purpose_category",
              "category",
              "delivery_company",
            ].includes(slotName);
            const matchedPurpose = shouldResolvePurposeCategory
              ? findPurposeCategoryMatch(slotValue)
              : null;
            const shouldResolveMemberDestination = [
              "meeting_with",
              "recipient_name",
            ].includes(slotName);
            const memberLookupQueryContext =
              conversationStateRef.current.collectedSlots.recipient_company ||
              conversationStateRef.current.collectedSlots.visit_company ||
              conversationStateRef.current.collectedSlots.target_company ||
              conversationStateRef.current.collectedSlots.came_from ||
              conversationStateRef.current.collectedSlots.company ||
              "";
            const memberLookup = shouldResolveMemberDestination && hasMeaningfulValue(slotValue)
              ? await resolveMembersForDestination(slotValue, {
                  secondaryQuery: memberLookupQueryContext,
                  maxResults: 5,
                })
              : null;
            const matchedMemberIds = memberLookup?.memberIds || [];
            const matchedMembers = memberLookup?.matchedMembers || [];
            const encodedMatchedMembers = matchedMembers.length > 0
              ? encodeMembersForNotes(matchedMembers)
              : "";
            const shouldClearMemberLookupState =
              ["meeting_with", "recipient_name"].includes(slotName) &&
              !!memberLookup &&
              (!memberLookup.ok || matchedMemberIds.length === 0);
            const shouldPromptForUnitNumber =
              slotName === "meeting_with" &&
              !!memberLookup &&
              memberLookup.configured &&
              memberLookup.ok &&
              matchedMemberIds.length === 0;
            if (slotName === "visitor_name" && visitorFlowRef.current.state === "NEW_VISITOR_ASK_NAME") {
              visitorFlowRef.current = { ...visitorFlowRef.current, visitorName: slotValue };
              void setVisitorFlowState("NEW_VISITOR_ASK_COMING_FROM", "captured_new_visitor_name");
            }
            if (slotName === "visitor_name" && visitorFlowRef.current.state === "DELIVERY_ASK_NAME") {
              visitorFlowRef.current = { ...visitorFlowRef.current, deliveryPersonName: slotValue };
              void setVisitorFlowState(
                "DELIVERY_ASK_DELIVERY_COMPANY",
                "captured_delivery_person_name"
              );
            }
            if (slotName === "came_from" && visitorFlowRef.current.state === "NEW_VISITOR_ASK_COMING_FROM") {
              visitorFlowRef.current = { ...visitorFlowRef.current, comingFrom: slotValue };
              void setVisitorFlowState("NEW_VISITOR_ASK_COMPANY", "captured_new_visitor_coming_from");
            }
            if (
              slotName === "delivery_company" &&
              visitorFlowRef.current.state === "DELIVERY_ASK_DELIVERY_COMPANY"
            ) {
              visitorFlowRef.current = { ...visitorFlowRef.current, deliveryCompanyName: slotValue };
              void setVisitorFlowState("DELIVERY_ASK_TARGET_COMPANY", "captured_delivery_company");
            }
            if (
              slotName === "recipient_company" &&
              visitorFlowRef.current.state === "DELIVERY_ASK_TARGET_COMPANY"
            ) {
              visitorFlowRef.current = { ...visitorFlowRef.current, parcelForCompany: slotValue };
              void setVisitorFlowState("DELIVERY_ASK_TARGET_PERSON", "captured_delivery_target_company");
            }
            if (slotName === "visit_company") {
              visitorFlowRef.current = { ...visitorFlowRef.current, companyToVisit: slotValue };
              if (visitorFlowRef.current.state === "NEW_VISITOR_ASK_COMPANY") {
                void setVisitorFlowState("NEW_VISITOR_CAPTURE_PHOTO", "captured_new_visitor_company");
              } else if (visitorFlowRef.current.state === "EXISTING_VISITOR_ASK_COMPANY") {
                void setVisitorFlowState("FETCH_MEMBER_LIST", "captured_existing_visitor_company");
                void setVisitorFlowState("RESOLVE_DESTINATION", "existing_visitor_company_resolved");
              }
            }
            if (slotName === "meeting_with" || slotName === "recipient_name") {
              const hasMember = matchedMemberIds.length > 0;
              const currentFlowState = visitorFlowRef.current.state;
              visitorFlowRef.current = {
                ...visitorFlowRef.current,
                destinationResolved: true,
                selectedMember: hasMember,
                personToMeet: slotName === "meeting_with" ? slotValue : visitorFlowRef.current.personToMeet,
                parcelForPerson: slotName === "recipient_name" ? slotValue : visitorFlowRef.current.parcelForPerson,
              };
              if (currentFlowState === "DELIVERY_ASK_TARGET_PERSON") {
                void setVisitorFlowState("DELIVERY_CAPTURE_PHOTO", "delivery_target_person_collected");
              } else if (hasMember) {
                void setVisitorFlowState("FETCH_MEMBER_LIST", "destination_collected");
                void setVisitorFlowState("RESOLVE_DESTINATION", "member_resolved_from_destination");
                console.info("[VisitorFlow] member resolved", { memberIds: matchedMemberIds });
              }
            }
            const hasAmbiguousMemberMatches =
              slotName === "meeting_with" &&
              !!memberLookup &&
              memberLookup.configured &&
              memberLookup.ok &&
              matchedMemberIds.length > 1;

            setConversationState(prev => ({
              ...prev,
              ...(isDeliverySlotName ? { intent: "delivery" } : {}),
              collectedSlots: {
                ...prev.collectedSlots,
                [slotName]: slotValue,
                ...(shouldClearMemberLookupState
                  ? {
                      member_ids: "",
                      member_lookup_query: memberLookup?.query || "",
                      member_match_count: "0",
                      member_objects_uri: "",
                    }
                  : {}),
                ...(matchedPurpose
                  ? {
                      purpose_category_id: String(matchedPurpose.category.category_id),
                      purpose_category_name: matchedPurpose.category.category_name,
                      ...(matchedPurpose.subCategory
                        ? {
                            purpose_sub_category_id: String(matchedPurpose.subCategory.sub_category_id),
                            purpose_sub_category_name: String(
                              matchedPurpose.subCategory.sub_category_name || ""
                            ),
                          }
                        : {}),
                    }
                  : {}),
                ...(memberLookup && memberLookup.ok && matchedMemberIds.length > 0
                  ? {
                      member_ids: matchedMemberIds.join(","),
                      member_lookup_query: memberLookup.query,
                      member_match_count: String(matchedMemberIds.length),
                      member_objects_uri: encodedMatchedMembers,
                    }
                  : {}),
              }
            }));

            if (matchedPurpose) {
              console.log("ok", matchedPurpose.category.category_id);
            }

            if (activeSessionId && memberLookup?.configured) {
              await DatabaseManager.logSessionEvent(activeSessionId, {
                role: "system",
                eventType: memberLookup.ok && matchedMemberIds.length > 0
                  ? "member_lookup_matched"
                  : "member_lookup_no_match",
                content: JSON.stringify({
                  query: memberLookup.query,
                  member_ids: matchedMemberIds,
                  member_count: matchedMemberIds.length,
                  message: memberLookup.message || "",
                }),
              });
            }

            result = {
              status: "success",
              slot: slotName,
              value: slotValue,
              next_prompt: promptForState(
                visitorFlowRef.current.state,
                visitorFlowRef.current.visitorName
              ),
              ...(phoneNeedsMoreDigits
                ? {
                    partial_phone: true,
                    phone_digits_collected: phoneDigitsCollected,
                    message: `Collected ${phoneDigitsCollected} phone digits. Ask only for remaining digits.`,
                  }
                : {}),
              ...(phoneInvalid
                ? {
                    status: "need_more_info",
                    missing_fields: ["phone"],
                    message: "Please provide a valid 10-digit Indian mobile number.",
                  }
                : {}),
              ...(matchedPurpose
                ? {
                    purpose_category_id: matchedPurpose.category.category_id,
                    purpose_category_name: matchedPurpose.category.category_name,
                    ...(matchedPurpose.subCategory
                      ? {
                          purpose_sub_category_id: matchedPurpose.subCategory.sub_category_id,
                          purpose_sub_category_name: matchedPurpose.subCategory.sub_category_name,
                        }
                      : {}),
                    ok: {
                      purpose_category_id: matchedPurpose.category.category_id,
                    },
                  }
                : {}),
              ...(memberLookup
                ? {
                    member_lookup: {
                      configured: memberLookup.configured,
                      ok: memberLookup.ok,
                      query: memberLookup.query,
                      member_ids: matchedMemberIds,
                      member_count: matchedMemberIds.length,
                    },
                  }
                : {}),
            };
            if (shouldPromptForUnitNumber) {
              result = {
                ...result,
                status: "need_more_info",
                missing_fields: ["unit_number"],
                message:
                  "Sorry, I am not able to find that member. Could you specify the unit number?",
              };
            }
            if (hasAmbiguousMemberMatches) {
              const options = matchedMembers
                .slice(0, 2)
                .map((member) => {
                  const unit = member.building_unit || member.unit_flat_number || "unknown unit";
                  return `${member.unit_member_name || member.member_name} in ${unit}`;
                })
                .join(" or ");
              result = {
                ...result,
                status: "need_more_info",
                missing_fields: ["meeting_with"],
                message: `I found multiple matches. Are you visiting ${options}?`,
              };
            }
            }
          }
          else if (name === "save_visitor_info") {
            const resolvedIntent = normalizeIntentName(
              args.intent || conversationStateRef.current.intent || "meet_person"
            );
            const isDeliveryIntent = resolvedIntent === "delivery";
            const resolvedName =
              args.name ||
              conversationStateRef.current.collectedSlots.visitor_name ||
              conversationStateRef.current.collectedSlots.name ||
              "Visitor";
            const resolvedPhone =
              args.phone ||
              conversationStateRef.current.collectedSlots.phone ||
              conversationStateRef.current.collectedSlots.visitor_phone ||
              "N/A";
            const normalizedPhone = toPhoneDigits(resolvedPhone);
            const resolvedMeetingWith =
              args.meeting_with ||
              conversationStateRef.current.collectedSlots.meeting_with ||
              conversationStateRef.current.collectedSlots.person_to_meet ||
              conversationStateRef.current.collectedSlots.recipient_name ||
              conversationStateRef.current.collectedSlots.whom_to_meet ||
              "N/A";
            const resolvedDeliveryCompany =
              args.delivery_company ||
              conversationStateRef.current.collectedSlots.delivery_company ||
              conversationStateRef.current.collectedSlots.delivery_partner ||
              (isDeliveryIntent
                ? (args.company || conversationStateRef.current.collectedSlots.company || "")
                : "") ||
              "";
            const resolvedRecipientCompany =
              args.recipient_company ||
              conversationStateRef.current.collectedSlots.recipient_company ||
              conversationStateRef.current.collectedSlots.target_company ||
              conversationStateRef.current.collectedSlots.department ||
              "";
            const resolvedRecipientName =
              args.recipient_name ||
              conversationStateRef.current.collectedSlots.recipient_name ||
              conversationStateRef.current.collectedSlots.person_to_meet ||
              conversationStateRef.current.collectedSlots.recipient ||
              conversationStateRef.current.collectedSlots.meeting_with ||
              "";
            const resolvedCameFrom =
              String(
                args.came_from ||
                conversationStateRef.current.collectedSlots.came_from ||
                conversationStateRef.current.collectedSlots.origin ||
                ""
              ).trim() || "Walk-in";
            const resolvedVisitCompany =
              String(
                args.visit_company ||
                conversationStateRef.current.collectedSlots.visit_company ||
                (!isDeliveryIntent ? conversationStateRef.current.collectedSlots.company || "" : "")
              ).trim();
            let finalMeetingWith = isDeliveryIntent
              ? String(resolvedRecipientName || resolvedMeetingWith || "N/A").trim()
              : String(resolvedMeetingWith || "N/A").trim();
            if (!isDeliveryIntent && isExplicitUnknownPerson(finalMeetingWith)) {
              finalMeetingWith = "Not specified";
            }
            const finalCompany = isDeliveryIntent
              ? String(resolvedDeliveryCompany || resolvedCameFrom || "Delivery").trim()
              : String(resolvedVisitCompany || "Walk-in").trim();
            const resolvedPurpose =
              args.purpose ||
              conversationStateRef.current.collectedSlots.purpose ||
              "";
            const resolvedPurposeSubCategoryId = Number(
              conversationStateRef.current.collectedSlots.purpose_sub_category_id || ""
            );
            const resolvedPurposeSubCategoryName =
              conversationStateRef.current.collectedSlots.purpose_sub_category_name || "";
            const mappedPurposeCategoryId = Number(
              conversationStateRef.current.collectedSlots.purpose_category_id || ""
            );
            const mappedPurposeCategoryName =
              conversationStateRef.current.collectedSlots.purpose_category_name || "";
            const finalPurposeCategoryId =
              Number.isFinite(mappedPurposeCategoryId) && mappedPurposeCategoryId > 0
                ? mappedPurposeCategoryId
                : resolvedIntent === "delivery" ? 3 : 1;
            const finalPurposeCategoryName =
              mappedPurposeCategoryName ||
              (resolvedIntent === "delivery" ? "DELIVERY" : "GUEST");
            const resolvedWhereToGo =
              args.where_to_go ||
              conversationStateRef.current.collectedSlots.where_to_go ||
              "";
            const resolvedApprovalDecision = String(
              args.approval_decision ||
              conversationStateRef.current.collectedSlots.approval_decision ||
              ""
            )
              .trim()
              .toLowerCase();
            const resolvedApprovalStatus = String(
              args.approval_status ||
              conversationStateRef.current.collectedSlots.approval_status ||
              ""
            )
              .trim()
              .toLowerCase();
            const resolvedApprovalSource = String(
              conversationStateRef.current.collectedSlots.approval_source || ""
            ).trim();
            let resolvedMemberIdsCsv =
              String(
                conversationStateRef.current.collectedSlots.member_ids ||
                ""
              ).trim();
            let resolvedMemberLookupQuery =
              String(
                conversationStateRef.current.collectedSlots.member_lookup_query ||
                ""
              ).trim();
            let resolvedMemberObjectsEncoded =
              String(
                conversationStateRef.current.collectedSlots.member_objects_uri ||
                ""
              ).trim();
            let resolvedMemberObjects = resolvedMemberObjectsEncoded
              ? decodeMembersFromNotes(resolvedMemberObjectsEncoded)
              : [];
            const memberLookupPrimaryQuery = isDeliveryIntent
              ? [resolvedRecipientName, resolvedMeetingWith]
                  .filter((value) => hasMeaningfulValue(value))
                  .join(" ")
              : [resolvedWhereToGo, resolvedMeetingWith]
                  .filter((value) => hasMeaningfulValue(value))
                  .join(" ");
            const memberLookupSecondaryQuery = isDeliveryIntent
              ? [resolvedRecipientCompany, resolvedDeliveryCompany, resolvedCameFrom]
                  .filter((value) => hasMeaningfulValue(value))
                  .join(" ")
              : [resolvedVisitCompany, resolvedCameFrom]
                  .filter((value) => hasMeaningfulValue(value))
                  .join(" ");

            if (
              resolvedMemberObjects.length === 0 &&
              hasMeaningfulValue(memberLookupPrimaryQuery || memberLookupSecondaryQuery)
            ) {
              const fallbackMemberLookup = await resolveMembersForDestination(
                memberLookupPrimaryQuery || memberLookupSecondaryQuery,
                {
                  secondaryQuery: memberLookupSecondaryQuery || memberLookupPrimaryQuery,
                  maxResults: 5,
                }
              );
              if (fallbackMemberLookup.ok && fallbackMemberLookup.matchedMembers.length > 0) {
                resolvedMemberObjects = fallbackMemberLookup.matchedMembers;
                resolvedMemberIdsCsv = fallbackMemberLookup.memberIds.join(",");
                resolvedMemberLookupQuery = fallbackMemberLookup.query;
                resolvedMemberObjectsEncoded = encodeMembersForNotes(fallbackMemberLookup.matchedMembers);
                visitorFlowRef.current = {
                  ...visitorFlowRef.current,
                  selectedMember: true,
                  destinationResolved: true,
                };
                setConversationState((prev) => ({
                  ...prev,
                  collectedSlots: {
                    ...prev.collectedSlots,
                    member_ids: resolvedMemberIdsCsv,
                    member_lookup_query: resolvedMemberLookupQuery,
                    member_match_count: String(fallbackMemberLookup.memberIds.length),
                    member_objects_uri: resolvedMemberObjectsEncoded,
                  },
                }));
              }
            }

            if (
              (!resolvedMemberIdsCsv || resolvedMemberObjects.length === 0) &&
              hasMeaningfulValue(memberLookupPrimaryQuery)
            ) {
              const memberLookup = await resolveMembersForDestination(
                memberLookupPrimaryQuery,
                {
                  secondaryQuery: memberLookupSecondaryQuery,
                  maxResults: 5,
                }
              );

              if (memberLookup.configured && activeSessionId) {
                await DatabaseManager.logSessionEvent(activeSessionId, {
                  role: "system",
                  eventType: memberLookup.ok && memberLookup.memberIds.length > 0
                    ? "member_lookup_matched_pre_save"
                    : "member_lookup_no_match_pre_save",
                  content: JSON.stringify({
                    query: memberLookup.query,
                    member_ids: memberLookup.memberIds,
                    member_count: memberLookup.memberIds.length,
                    message: memberLookup.message || "",
                  }),
                });
              }

              if (memberLookup.ok && memberLookup.memberIds.length > 0) {
                resolvedMemberIdsCsv = memberLookup.memberIds.join(",");
                resolvedMemberLookupQuery = memberLookup.query;
                resolvedMemberObjects = memberLookup.matchedMembers;
                resolvedMemberObjectsEncoded = encodeMembersForNotes(memberLookup.matchedMembers);

                setConversationState((prev) => ({
                  ...prev,
                  collectedSlots: {
                    ...prev.collectedSlots,
                    member_ids: resolvedMemberIdsCsv,
                    member_lookup_query: resolvedMemberLookupQuery,
                    member_match_count: String(memberLookup.memberIds.length),
                    member_objects_uri: resolvedMemberObjectsEncoded,
                  },
                }));
              }
            }
            if (!isDeliveryIntent && resolvedMemberObjects.length > 1) {
              const options = resolvedMemberObjects
                .slice(0, 2)
                .map((member) => {
                  const unit = member.building_unit || member.unit_flat_number || "unknown unit";
                  return `${member.unit_member_name || member.member_name} in ${unit}`;
                })
                .join(" or ");
              result = {
                status: "need_more_info",
                missing_fields: ["meeting_with"],
                message: `I found multiple matches. Are you visiting ${options}?`,
              };
            } else {
            const notesWithPurposeCategory =
              [
                String(args.notes || "").trim(),
                `purpose_category_id:${finalPurposeCategoryId}`,
                Number.isFinite(resolvedPurposeSubCategoryId) && resolvedPurposeSubCategoryId > 0
                  ? `purpose_sub_category_id:${resolvedPurposeSubCategoryId}`
                  : "",
                hasMeaningfulValue(resolvedWhereToGo)
                  ? `where_to_go:${String(resolvedWhereToGo).trim()}`
                  : "",
                isDeliveryIntent && hasMeaningfulValue(resolvedRecipientCompany)
                  ? `recipient_company:${String(resolvedRecipientCompany).trim()}`
                  : "",
                resolvedMemberIdsCsv
                  ? `member_ids:${resolvedMemberIdsCsv}`
                  : "",
                resolvedMemberLookupQuery
                  ? `member_lookup_query:${resolvedMemberLookupQuery}`
                  : "",
                resolvedMemberObjectsEncoded
                  ? `member_objects_uri:${resolvedMemberObjectsEncoded}`
                  : "",
                resolvedApprovalDecision
                  ? `approval_decision:${resolvedApprovalDecision}`
                  : "",
                resolvedApprovalStatus
                  ? `approval_status:${resolvedApprovalStatus}`
                  : "",
                resolvedApprovalSource
                  ? `approval_source:${resolvedApprovalSource}`
                  : "",
                !isDeliveryIntent && hasMeaningfulValue(resolvedCameFrom)
                  ? `visitor_origin:${String(resolvedCameFrom).trim()}`
                  : "",
                !isDeliveryIntent && hasMeaningfulValue(resolvedVisitCompany)
                  ? `visit_company:${String(resolvedVisitCompany).trim()}`
                  : "",
              ]
                .filter(Boolean)
                .join(" | ");
            const missingFields: string[] = [];
              if (!hasMeaningfulValue(resolvedName) || String(resolvedName).trim().toLowerCase() === "visitor") {
                missingFields.push("name");
              }
              if (isDeliveryIntent) {
                if (!hasMeaningfulValue(resolvedDeliveryCompany)) {
                  missingFields.push("delivery_company");
                }
                if (!hasMeaningfulValue(resolvedRecipientCompany)) {
                  missingFields.push("recipient_company");
                }
                if (!hasMeaningfulValue(resolvedRecipientName)) {
                  missingFields.push("recipient_name");
                }
              } else {
                const mergedSlotsForVisitor: Record<string, string> = {
                  ...conversationStateRef.current.collectedSlots,
                };
                if (args.name) mergedSlotsForVisitor.visitor_name = String(args.name);
                if (args.phone) mergedSlotsForVisitor.phone = String(args.phone);
                if (args.meeting_with) mergedSlotsForVisitor.meeting_with = String(args.meeting_with);
                if (args.came_from) mergedSlotsForVisitor.came_from = String(args.came_from);
                if (args.visit_company) mergedSlotsForVisitor.visit_company = String(args.visit_company);
                if (args.company && !isDeliveryIntent) {
                  mergedSlotsForVisitor.visit_company =
                    mergedSlotsForVisitor.visit_company || String(args.company);
                }
                if (visitorFlowRef.current.isExistingVisitor) {
                  if (!hasMeaningfulValue(mergedSlotsForVisitor.visit_company)) {
                    missingFields.push("visit_company");
                  }
                } else {
                  if (!hasMeaningfulValue(mergedSlotsForVisitor.visitor_name)) {
                    missingFields.push("name");
                  }
                  if (toPhoneDigits(mergedSlotsForVisitor.phone).length < 10) {
                    missingFields.push("phone");
                  }
                  if (!hasMeaningfulValue(mergedSlotsForVisitor.came_from)) {
                    missingFields.push("came_from");
                  }
                  if (!hasMeaningfulValue(mergedSlotsForVisitor.visit_company)) {
                    missingFields.push("visit_company");
                  }
                }
              }

              if (!visitorCheckInPhotoRef.current && captureInFlightRef.current) {
                await waitForCaptureSettled(6000);
              }

              if (missingFields.length > 0) {
                result = {
                  status: "need_more_info",
                  missing_fields: missingFields,
                  message:
                    isDeliveryIntent
                      ? "Collect delivery person name, delivery company, recipient company, and recipient name before saving."
                      : "Collect phone, name, where you are coming from, and company to visit before saving.",
                };
              } else if (!visitorFlowRef.current.isExistingVisitor && !visitorCheckInPhotoRef.current) {
                result = {
                  status: "need_photo_capture",
                  missing_fields: ["photo"],
                  message:
                    isDeliveryIntent
                      ? "Ask the delivery person to stand still for 5 seconds, call capture_photo, then save_visitor_info again."
                      : "Ask the visitor to stand still for 5 seconds, call capture_photo, then save_visitor_info again.",
                };
              } else if (
                isDeliveryIntent &&
                !hasMeaningfulValue(resolvedApprovalDecision)
              ) {
                result = {
                  status: "need_more_info",
                  missing_fields: ["delivery_approval"],
                  message:
                    "Call request_delivery_approval after capture_photo, then call save_visitor_info.",
                };
              } else {
                const existingVisitorIdFromState = visitorFlowRef.current.visitorId;
                const existingVisitorIdFromSlots = Number(
                  conversationStateRef.current.collectedSlots.visitor_id_external || ""
                );
                const effectiveExistingVisitorId =
                  existingVisitorIdFromState ||
                  (Number.isFinite(existingVisitorIdFromSlots) && existingVisitorIdFromSlots > 0
                    ? existingVisitorIdFromSlots
                    : null);
                const isExistingVisitorFlow =
                  !!effectiveExistingVisitorId ||
                  visitorFlowRef.current.isExistingVisitor ||
                  visitorFlowRef.current.mode === "existing_visitor";
                const finalVisitorPhoto = visitorCheckInPhotoRef.current || args.photo || undefined;
                const resolvedDepartment = String(
                  args.department ||
                  conversationStateRef.current.collectedSlots.department ||
                  "Reception"
                ).trim() || "Reception";
                const finalPhone = isDeliveryIntent
                  ? (normalizedPhone || "N/A")
                  : normalizedPhone;
                if (
                  !isExistingVisitorFlow &&
                  visitorFlowRef.current.mode === "new_visitor" &&
                  !canCreateVisitor(visitorFlowRef.current)
                ) {
                  result = {
                    status: "need_photo_capture",
                    missing_fields: ["photo"],
                    message: "Please stand still for 5 seconds while I capture your photo.",
                  };
                } else if (!resolvedMemberObjects.length) {
                  const companyOnlyLookup = await resolveMembersForDestination(
                    resolvedVisitCompany || conversationStateRef.current.collectedSlots.visit_company || "",
                    {
                      secondaryQuery: "",
                      maxResults: 5,
                    }
                  );
                  if (companyOnlyLookup.ok && companyOnlyLookup.matchedMembers.length > 0) {
                    resolvedMemberObjects = companyOnlyLookup.matchedMembers;
                    resolvedMemberIdsCsv = companyOnlyLookup.memberIds.join(",");
                  }
                }

                if (!resolvedMemberObjects.length) {
                  result = {
                    status: "need_more_info",
                    missing_fields: ["visit_company"],
                    message:
                      "I could not resolve the destination company or host. Please tell me the exact company in Cyber One.",
                  };
                } else {
                  let localVisitorId = "";
                  if (!isExistingVisitorFlow) {
                    if (visitorFlowRef.current.mode === "new_visitor") {
                      void setVisitorFlowState("NEW_VISITOR_CREATE_RECORD", "creating_new_visitor_record");
                    }
                    const visitor = await DatabaseManager.saveVisitor(
                      {
                        name: resolvedName,
                        phone: finalPhone,
                        meetingWith: finalMeetingWith,
                        intent: resolvedIntent,
                        department: resolvedDepartment,
                        purpose: resolvedPurpose || (isDeliveryIntent ? "Delivery check-in" : "Visitor check-in"),
                        company: finalCompany,
                        appointmentTime: args.appointment_time,
                        referenceId: args.reference_id,
                        notes: notesWithPurposeCategory,
                        photo: finalVisitorPhoto,
                      },
                      { sessionId: activeSessionId }
                    );
                    localVisitorId = visitor.id;
                    hasSavedVisitorRef.current = true;
                    visitorFlowRef.current = {
                      ...visitorFlowRef.current,
                      visitorCreated: true,
                      visitorName: resolvedName,
                    };
                    console.info("[VisitorFlow] visitor created", { localVisitorId });
                  } else {
                    localVisitorId = String(effectiveExistingVisitorId);
                    visitorFlowRef.current = {
                      ...visitorFlowRef.current,
                      isExistingVisitor: true,
                      visitorId: effectiveExistingVisitorId,
                      visitorName: resolvedName,
                    };
                  }

                  if (activeSessionId && localVisitorId) {
                    void DatabaseManager.updateSession(activeSessionId, {
                      visitorId: localVisitorId,
                      intent: resolvedIntent,
                    });
                  }

                  if (visitorFlowRef.current.state !== "RESOLVE_DESTINATION") {
                    if (visitorFlowRef.current.state !== "FETCH_MEMBER_LIST") {
                      void setVisitorFlowState("FETCH_MEMBER_LIST", "preparing_member_resolution");
                    }
                    void setVisitorFlowState("RESOLVE_DESTINATION", "member_resolution_ready");
                  }
                  void setVisitorFlowState("CREATE_VISITOR_LOG", "calling_visitor_log_api");
                  console.info("[VisitorFlow] visitor log request sent");
                  const configuredCompanyId = Number(process.env.REACT_APP_WALKIN_COMPANY_ID || "");
                  const externalSync = await syncWalkInDetailsToExternalApis({
                    name: resolvedName,
                    phone: normalizedPhone,
                    cameFrom: resolvedCameFrom,
                    meetingWith: finalMeetingWith,
                    localVisitorId: localVisitorId || undefined,
                    intent: resolvedIntent,
                    sessionId: activeSessionId,
                    photo: finalVisitorPhoto,
                    visitorPurposeCategoryId: finalPurposeCategoryId,
                    visitorPurposeSubCategoryId:
                      Number.isFinite(resolvedPurposeSubCategoryId) && resolvedPurposeSubCategoryId > 0
                        ? resolvedPurposeSubCategoryId
                        : undefined,
                    memberDetails: resolvedMemberObjects,
                    companyId: Number.isFinite(configuredCompanyId) && configuredCompanyId > 0
                      ? configuredCompanyId
                      : undefined,
                    companyName: isDeliveryIntent
                      ? (resolvedDeliveryCompany || finalCompany)
                      : (resolvedVisitCompany || finalCompany),
                    isStaff: false,
                  });
                  const addVisitorResult = externalSync.results.find((r) => r.field === "add_visitor_entry");
                  const visitorLogResult = externalSync.results.find((r) => r.field === "add_visitor_log");
                  const fcmResult = externalSync.results.find((r) => r.field === "send_member_notification");
                  if (addVisitorResult && !addVisitorResult.ok && !isExistingVisitorFlow) {
                    result = {
                      status: "error",
                      message:
                        addVisitorResult.error ||
                        "I could not upload the visitor photo. Please retake photo and try again.",
                    };
                    console.error("[VisitorFlow] add visitor failed", addVisitorResult);
                    responses.push({
                      name: name,
                      id: fc.id,
                      response: { result },
                    });
                    continue;
                  }
                  console.info("[VisitorFlow] visitor log response received", visitorLogResult);
                  void setVisitorFlowState("SEND_NOTIFICATION", "calling_fcm_api");
                  console.info("[VisitorFlow] fcm request sent");
                  console.info("[VisitorFlow] fcm response received", fcmResult);

                  const visitorLogId = Number(visitorLogResult?.visitorLogId || 0) || null;
                  visitorFlowRef.current = {
                    ...visitorFlowRef.current,
                    visitorId: visitorFlowRef.current.visitorId || Number(effectiveExistingVisitorId || 0) || null,
                    visitorLogCreated: Boolean(visitorLogResult?.ok && visitorLogId),
                    visitorLogId,
                    fcmSent: Boolean(fcmResult?.ok),
                  };

                  if (!visitorLogResult?.ok || !visitorLogId) {
                    result = {
                      status: "error",
                      message:
                        "I could not complete your entry request right now. Please try again or contact reception.",
                    };
                    console.error("[VisitorFlow] visitor log failed", visitorLogResult);
                  } else if (!fcmResult?.ok) {
                    result = {
                      status: "partial_success",
                      message:
                        "Your visit entry was created, but I could not notify the host yet. Please contact reception.",
                    };
                    console.error("[VisitorFlow] fcm failed", fcmResult);
                  } else if (canEmitFinalSuccess(visitorFlowRef.current)) {
                    void setVisitorFlowState("COMPLETED", "visitor_log_and_fcm_succeeded");
                    console.info("[VisitorFlow] final success emitted", {
                      visitorLogId: visitorFlowRef.current.visitorLogId,
                    });
                    result = {
                      status: "success",
                      visitor_id: localVisitorId,
                      visitor_log_id: visitorFlowRef.current.visitorLogId,
                      message:
                        "Please have a seat in the lobby while your approval request is being sent.",
                      photo_format: isExistingVisitorFlow ? null : "image/jpeg",
                      purpose_category_id: finalPurposeCategoryId,
                      purpose_category_name: finalPurposeCategoryName,
                      purpose_sub_category_id:
                        Number.isFinite(resolvedPurposeSubCategoryId) && resolvedPurposeSubCategoryId > 0
                          ? resolvedPurposeSubCategoryId
                          : null,
                      purpose_sub_category_name: resolvedPurposeSubCategoryName || null,
                      member_ids: resolvedMemberIdsCsv
                        ? resolvedMemberIdsCsv
                            .split(",")
                            .map((id: string) => Number(id))
                            .filter((id: number) => Number.isFinite(id))
                        : [],
                      matched_members: resolvedMemberObjects,
                      approval_decision: resolvedApprovalDecision || null,
                      approval_status: resolvedApprovalStatus || null,
                    };
                  } else {
                    result = {
                      status: "error",
                      message:
                        "I could not complete your entry request right now. Please try again or contact reception.",
                    };
                  }
                }
              }
            }
          }
          else if (name === "check_returning_visitor") {
            if (visitorFlowRef.current.state !== "SEARCHING_VISITOR") {
              void setVisitorFlowState("SEARCHING_VISITOR", "check_returning_visitor_called");
            }
            const normalizedPhone = normalizeIndianMobile(args.phone || "");
            if (!isValidIndianMobile(normalizedPhone)) {
              result = {
                is_returning: false,
                status: "need_more_info",
                missing_fields: ["phone"],
                message: "Please provide a valid 10-digit mobile number.",
              };
            } else {
              const lookup = await lookupVisitorByMobile(normalizedPhone);
              if (!lookup.configured) {
                visitorFlowRef.current = { ...visitorFlowRef.current, state: "ERROR" };
                result = {
                  is_returning: false,
                  status: "error",
                  message: "Visitor search service is not configured.",
                };
              } else if (!lookup.ok) {
                visitorFlowRef.current = { ...visitorFlowRef.current, state: "ERROR" };
                result = {
                  is_returning: false,
                  status: "error",
                  message: lookup.message || "Unable to search visitor right now.",
                };
              } else if (lookup.found && lookup.visitor) {
                const visitorId = Number(lookup.visitor.id) || null;
                visitorFlowRef.current = {
                  ...visitorFlowRef.current,
                  mode: "existing_visitor",
                  isExistingVisitor: true,
                  visitorId,
                  visitorName: lookup.visitor.name,
                  visitorCreated: false,
                  photoCaptured: false,
                  photoUploaded: false,
                };
                void setVisitorFlowState("EXISTING_VISITOR_FOUND", "search_result_found");
                void setVisitorFlowState("EXISTING_VISITOR_ASK_COMPANY", "existing_visitor_prompt_destination");
                console.info("[VisitorFlow] existing visitor found", {
                  visitorId,
                  visitorName: lookup.visitor.name,
                });
                setConversationState(prev => ({
                  ...prev,
                  collectedSlots: {
                    ...prev.collectedSlots,
                    visitor_name: lookup.visitor?.name || "",
                    phone: normalizedPhone,
                    visitor_id_external: String(lookup.visitor?.id || ""),
                    ...(lookup.visitor?.comingFrom
                      ? { came_from: lookup.visitor.comingFrom }
                      : {}),
                  },
                }));
                result = {
                  is_returning: true,
                  name: lookup.visitor.name,
                  visitor_id: lookup.visitor.id,
                  message: `Hello ${lookup.visitor.name}, welcome again. Which company in Cyber One are you visiting today?`,
                };
              } else {
                visitorFlowRef.current = {
                  ...visitorFlowRef.current,
                  mode: "new_visitor",
                  isExistingVisitor: false,
                  visitorId: null,
                  visitorName: "",
                  visitorCreated: false,
                };
                void setVisitorFlowState("NEW_VISITOR_ASK_NAME", "search_result_not_found");
                console.info("[VisitorFlow] new visitor path started", { normalizedPhone });
                result = { is_returning: false, normalized_phone: normalizedPhone };
              }
            }
          }
          else if (name === "route_to_department") {
            setExpressionCue("explaining_confident");
            fireGesture('pointing', undefined, 2);
            result = {
              status: "success",
              department: args.department,
              message: `Routing ${args.visitor_name} to ${args.department} for ${args.intent}`
            };
          }
          else if (name === "request_approval") {
            setConversationState((prev) => ({
              ...prev,
              collectedSlots: {
                ...prev.collectedSlots,
                approval_status: "approved",
                approval_source: "request_approval",
              },
            }));
            if (activeSessionId) {
              await DatabaseManager.logSessionEvent(activeSessionId, {
                role: "system",
                eventType: "approval_request_approved",
                content: `Approval granted for ${args.visitor_name || "visitor"}.`,
              });
            }
            result = {
              status: "approved",
              message: `Approval granted for ${args.visitor_name}`
            };
          }
          else if (name === "request_delivery_approval") {
            const resolvedDeliveryCompany =
              String(
                args.delivery_company ||
                conversationStateRef.current.collectedSlots.delivery_company ||
                conversationStateRef.current.collectedSlots.delivery_partner ||
                conversationStateRef.current.collectedSlots.company ||
                ""
              ).trim();
            const resolvedRecipientCompany =
              String(
                args.recipient_company ||
                conversationStateRef.current.collectedSlots.recipient_company ||
                conversationStateRef.current.collectedSlots.target_company ||
                conversationStateRef.current.collectedSlots.department ||
                ""
              ).trim();
            const resolvedRecipientName =
              String(
                args.recipient_name ||
                conversationStateRef.current.collectedSlots.recipient_name ||
                conversationStateRef.current.collectedSlots.person_to_meet ||
                conversationStateRef.current.collectedSlots.recipient ||
                conversationStateRef.current.collectedSlots.meeting_with ||
                ""
              ).trim();
            const resolvedTrackingNumber =
              String(
                args.tracking_number ||
                conversationStateRef.current.collectedSlots.reference_id ||
                ""
              ).trim();
            const resolvedParcelDescription =
              String(
                args.parcel_description ||
                conversationStateRef.current.collectedSlots.purpose ||
                "Parcel delivery"
              ).trim();
            const resolvedDeliveryPersonName =
              String(
                args.delivery_person_name ||
                conversationStateRef.current.collectedSlots.visitor_name ||
                ""
              ).trim();

            const missingFields: string[] = [];
            if (!hasMeaningfulValue(resolvedDeliveryCompany)) {
              missingFields.push("delivery_company");
            }
            if (!hasMeaningfulValue(resolvedRecipientCompany)) {
              missingFields.push("recipient_company");
            }
            if (!hasMeaningfulValue(resolvedRecipientName)) {
              missingFields.push("recipient_name");
            }
            if (!hasMeaningfulValue(resolvedDeliveryPersonName)) {
              missingFields.push("delivery_person_name");
            }

            if (missingFields.length > 0) {
              result = {
                status: "need_more_info",
                missing_fields: missingFields,
                message:
                  "Collect delivery person name, delivery company, recipient company, and recipient name before requesting delivery approval.",
              };
            } else if (!visitorCheckInPhotoRef.current) {
              result = {
                status: "need_photo_capture",
                missing_fields: ["photo"],
                message:
                  "Ask the delivery person to stand still for 5 seconds, call capture_photo, then request_delivery_approval.",
              };
            } else {
              const approval = await requestDeliveryApproval({
                deliveryCompany: resolvedDeliveryCompany,
                recipientCompany: resolvedRecipientCompany,
                recipientName: resolvedRecipientName,
                trackingNumber: resolvedTrackingNumber,
                parcelDescription: resolvedParcelDescription,
                deliveryPersonName: resolvedDeliveryPersonName,
                photoDataUrl: visitorCheckInPhotoRef.current,
                sessionId: activeSessionId,
              });

              if (activeSessionId) {
                await DatabaseManager.logSessionEvent(activeSessionId, {
                  role: "system",
                  eventType: `delivery_approval_${approval.decision}`,
                  content: approval.message,
                });
              }

              setConversationState((prev) => ({
                ...prev,
                collectedSlots: {
                  ...prev.collectedSlots,
                  approval_decision: approval.decision,
                  approval_status: approval.status,
                  approval_source: "request_delivery_approval",
                },
              }));

              result = {
                status: approval.status,
                decision: approval.decision,
                message: approval.message,
                status_code: approval.statusCode || null,
              };
            }
          }
          else if (name === "check_staff_availability") {
            const isAvailable = Math.random() > 0.3;
            result = {
              available: isAvailable,
              staff_name: args.staff_name,
              message: isAvailable
                ? `${args.staff_name} is available`
                : `${args.staff_name} is currently unavailable`
            };
          }
          else if (name === "notify_staff") {
            setConversationState((prev) => ({
              ...prev,
              collectedSlots: {
                ...prev.collectedSlots,
                approval_status: "approved",
                approval_source: "notify_staff",
              },
            }));
            if (activeSessionId) {
              await DatabaseManager.logSessionEvent(activeSessionId, {
                role: "system",
                eventType: "staff_notified_approval_received",
                content: `Approval granted by ${args.staff_name || "staff"}.`,
              });
            }
            result = { status: "approved", message: "Approval granted by " + args.staff_name };
          }
          else if (name === "log_delivery") {
            const resolvedDeliveryCompany =
              String(
                args.company ||
                conversationStateRef.current.collectedSlots.delivery_company ||
                conversationStateRef.current.collectedSlots.delivery_partner ||
                conversationStateRef.current.collectedSlots.company ||
                "Delivery"
              ).trim();
            const resolvedRecipientCompany =
              String(
                args.recipient_company ||
                conversationStateRef.current.collectedSlots.recipient_company ||
                conversationStateRef.current.collectedSlots.target_company ||
                conversationStateRef.current.collectedSlots.department ||
                "Greenscape"
              ).trim();
            const resolvedRecipient =
              String(
                args.recipient ||
                conversationStateRef.current.collectedSlots.recipient_name ||
                conversationStateRef.current.collectedSlots.meeting_with ||
                conversationStateRef.current.collectedSlots.recipient ||
                "N/A"
              ).trim();
            const resolvedDepartment = resolvedRecipientCompany || "Delivery";
            const resolvedDecision = String(args.approval_decision || "").trim().toLowerCase();
            const deliveryNotes = [String(args.description || "").trim()];
            if (resolvedRecipientCompany) {
              deliveryNotes.push(`recipient_company:${resolvedRecipientCompany}`);
            }
            if (resolvedDecision) {
              deliveryNotes.push(`approval_decision:${resolvedDecision}`);
            }
            deliveryNotes.push(`approval_source:request_delivery_approval`);
            await DatabaseManager.saveVisitor({
              name: `Delivery from ${resolvedDeliveryCompany}`,
              phone: "N/A",
              meetingWith: resolvedRecipient,
              intent: "delivery",
              department: resolvedDepartment,
              purpose: "Delivery",
              company: resolvedDeliveryCompany,
              referenceId: args.tracking_number,
              notes: deliveryNotes.filter(Boolean).join(" | "),
              photo: sessionPhotoRef.current || undefined,
            }, { sessionId: activeSessionId });
            hasSavedVisitorRef.current = true;
            result = {
              status: "success",
              message: `Delivery logged for ${resolvedDepartment}`
            };
          }
          else if (name === "end_interaction") {
            const hasCollectedAnySlot = Object.values(conversationStateRef.current.collectedSlots).some(
              (value) => hasMeaningfulValue(value)
            );
            if (!hasSavedVisitorRef.current && hasCollectedAnySlot) {
              const readiness = getMissingFieldsBeforePhoto(
                conversationStateRef.current.intent,
                conversationStateRef.current.collectedSlots
              );
              const pending = [...readiness.missing];
              if (!visitorCheckInPhotoRef.current) {
                pending.push("photo");
              }
              if (
                readiness.flow === "delivery" &&
                !hasMeaningfulValue(conversationStateRef.current.collectedSlots.approval_decision)
              ) {
                pending.push("delivery_approval");
              }
              pending.push("save_visitor_info");

              if (activeSessionId) {
                await DatabaseManager.logSessionEvent(activeSessionId, {
                  role: "system",
                  eventType: "end_interaction_blocked_pending_data",
                  content: JSON.stringify({
                    flow: readiness.flow,
                    pending_fields: Array.from(new Set(pending)),
                  }),
                });
              }

              result = {
                status: "need_more_info",
                flow: readiness.flow,
                missing_fields: Array.from(new Set(pending)),
                message:
                  readiness.flow === "delivery"
                    ? "Do not end interaction yet. Complete delivery details, photo, approval, then save visitor info."
                    : "Do not end interaction yet. Complete visitor details, photo, then save visitor info.",
              };
            } else {
              if (activeSessionId) {
                await persistSecuritySnapshotIfNeeded(activeSessionId);
                await DatabaseManager.endSession(activeSessionId, {
                  status: "completed",
                  summary: "Interaction completed through end_interaction tool.",
                });
                sessionIdRef.current = null;
              }
              setExpressionCue("goodbye_formal");
              fireGesture('bow', undefined, 3);
              console.log("Interaction ended. Resetting in 5 seconds...");
              if (endSessionResetTimerRef.current) {
                clearTimeout(endSessionResetTimerRef.current);
              }
              endSessionResetTimerRef.current = setTimeout(() => {
                endSessionResetTimerRef.current = null;
                stopCameraPreview();
                disconnectSession();
                setVideoStream(null);
                setConversationState({ collectedSlots: {} });
                visitorCheckInPhotoRef.current = null;
                setLastAudioText("");
                setExpressionCue("neutral_professional");
              }, 5000);
              result = { status: "success", message: "Resetting kiosk." };
            }
          }
          else if (name === "capture_photo") {
            const hasExistingVisitorId = Number(
              conversationStateRef.current.collectedSlots.visitor_id_external || ""
            );
            if (
              visitorFlowRef.current.isExistingVisitor ||
              visitorFlowRef.current.mode === "existing_visitor" ||
              (Number.isFinite(hasExistingVisitorId) && hasExistingVisitorId > 0)
            ) {
              result = {
                status: "blocked",
                message:
                  "Photo capture is not required for returning visitors. Please continue with company and host details.",
              };
              responses.push({
                name: name,
                id: fc.id,
                response: { result },
              });
              continue;
            }
            if (!canCapturePhoto(visitorFlowRef.current)) {
              result = {
                status: "blocked",
                message: "Photo capture is not required for this visitor. Please continue with destination details.",
              };
              console.warn("[VisitorFlow] blocked photo transition", {
                state: visitorFlowRef.current.state,
                isExistingVisitor: visitorFlowRef.current.isExistingVisitor,
                destinationResolved: visitorFlowRef.current.destinationResolved,
              });
              responses.push({
                name: name,
                id: fc.id,
                response: { result },
              });
              continue;
            }
            const photoReadiness = getMissingFieldsBeforePhoto(
              conversationStateRef.current.intent,
              conversationStateRef.current.collectedSlots
            );
            if (photoReadiness.missing.length > 0) {
              if (activeSessionId) {
                await DatabaseManager.logSessionEvent(activeSessionId, {
                  role: "system",
                  eventType: "camera_capture_blocked_missing_fields",
                  content: JSON.stringify({
                    flow: photoReadiness.flow,
                    missing_fields: photoReadiness.missing,
                    intent: conversationStateRef.current.intent || "",
                  }),
                });
              }
              result = {
                status: "need_more_info",
                flow: photoReadiness.flow,
                missing_fields: photoReadiness.missing,
                message:
                  photoReadiness.flow === "delivery"
                    ? "Collect delivery person name, delivery company, recipient company, and recipient name before photo capture."
                    : "Collect name, phone, where they came from, company they want to meet, and person or unit before photo capture.",
              };
            } else {
              const captureState =
                visitorFlowRef.current.mode === "delivery"
                  ? "DELIVERY_CAPTURE_PHOTO"
                  : "NEW_VISITOR_CAPTURE_PHOTO";
              if (visitorFlowRef.current.state !== captureState) {
                void setVisitorFlowState(captureState, "capture_photo_started");
              }
              // Respond to Gemini immediately so the Live API doesn't time out
              // waiting for the tool response during the 5-second countdown.
              result = {
                status: "success",
                message: "Photo capture started. The photo will be ready in 5 seconds. Proceed with the next step.",
                format: "image/jpeg",
              };

              // Fire photo capture in the background (not awaited)
              void (async () => {
                const captured = await captureCheckInPhotoAfterCountdown("tool_call_after_5s_still_pose", 5000);
                if (!captured) {
                  console.warn("[capture_photo] Background capture failed:", lastCaptureErrorRef.current);
                } else {
                  visitorFlowRef.current = {
                    ...visitorFlowRef.current,
                    photoCaptured: true,
                    photoUploaded: true,
                  };
                  void setVisitorFlowState(
                    visitorFlowRef.current.mode === "delivery"
                      ? "DELIVERY_UPLOAD_PHOTO"
                      : "NEW_VISITOR_UPLOAD_PHOTO",
                    "photo_capture_completed"
                  );
                  console.info("[VisitorFlow] photo step entered and completed");
                }
              })();
            }
          }
        } catch (e: any) {
          result = { error: e.message };
        }

        responses.push({
          name: name,
          id: fc.id,
          response: { result },
        });
        console.info("[perf] tool_handler_end", {
          tool: name,
          t: Date.now(),
          duration_ms: Date.now() - toolStartedAt,
        });
      }

      if (responses.length === 0) {
        return;
      }

      if (!connected || client.status !== "connected") {
        console.warn("Skipping tool response because live socket is not connected.");
        return;
      }

      console.info("[VisitorFlow] assistant reply emitted", {
        at: Date.now(),
        responseCount: responses.length,
      });
      client.sendToolResponse({ functionResponses: responses });
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client, connected, disconnectSession, fireGesture, captureCheckInPhotoAfterCountdown, waitForCaptureSettled, persistSecuritySnapshotIfNeeded, setVisitorFlowState, stopCameraPreview]);

  return (
    <div className="kiosk-screen">
      {/* ── Title ───────────────────────────────────────────────── */}
      <header className="kiosk-header">
        <h1 className="kiosk-title">Greenscape Receptionist</h1>
      </header>

      {/* ── Avatar (upper-body crop) ────────────────────────────── */}
      <div className="kiosk-avatar-frame">
        <div className="kiosk-avatar-crop">
          <Avatar3D
            ref={avatarRef}
            connected={connected}
            speechText={lastAudioText}
            expressionCue={expressionCue}
            isAudioPlaying={assistantAudioPlaying}
            lipSyncRef={lipSyncRef}
          />
        </div>
      </div>

      {/* ── Start / Connect button ──────────────────────────────── */}
      <div className="kiosk-connect-area">
        <ControlTray
          videoRef={videoRef}
          supportsVideo={false}
          onVideoStreamChange={setVideoStream}
          enableEditingSettings={false}
        />
      </div>

      {/* ── New Visitor & Delivery (voice via Pratik) ───────────── */}
      <div className="kiosk-cards-row">
        <div className="kiosk-card">
          <span className="material-symbols-outlined kiosk-card-icon">person_add</span>
          <span className="kiosk-card-label">New Visitor</span>
        </div>
        <div className="kiosk-card">
          <span className="material-symbols-outlined kiosk-card-icon">local_shipping</span>
          <span className="kiosk-card-label">Delivery</span>
        </div>
      </div>

      {/* Hidden video element for capture */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          bottom: "80px",
          right: "20px",
          width: "200px",
          borderRadius: "10px",
          border: "2px solid #555",
          display: videoStream ? "block" : "none"
        }}
      />
    </div>
  );
}

function App() {
  const isAdminPath =
    typeof window !== "undefined" &&
    window.location.pathname.toLowerCase().startsWith("/admin");

  if (isAdminPath) {
    return <AdminDashboard />;
  }

  if (!API_KEY) {
    return (
      <div className="app-container">
        <main className="app-main">
          <div className="main-app-area">
            <h1 className="app-title">Greenscape Receptionist</h1>
            <p className="status-text">
              Missing `REACT_APP_GEMINI_API_KEY` in frontend environment.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <LiveAPIProvider options={apiOptions}>
      <ReceptionistApp />
    </LiveAPIProvider>
  );
}

export default App;
