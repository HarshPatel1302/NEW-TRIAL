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
import { Avatar3DRef } from "./components/Avatar3D/Avatar3D";
import AvatarController, { AvatarPipelineMode } from "./components/avatar/AvatarController";
import ControlTray from "./components/control-tray/ControlTray";
import { LiveClientOptions } from "./types";
import { RECEPTIONIST_PERSONA } from "./receptionist/config";
import { TOOLS } from "./receptionist/tools";
import { DatabaseManager } from "./receptionist/database";
import {
  searchVisitorByPhoneInGate,
  syncWalkInDetailsToExternalApis,
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

const API_KEY = (process.env.REACT_APP_GEMINI_API_KEY || "").trim();
const AVATAR_PIPELINE_MODE: AvatarPipelineMode =
  String(process.env.REACT_APP_AVATAR_PIPELINE_MODE || "legacy").trim().toLowerCase() === "local"
    ? "local"
    : "legacy";
const LOCAL_AVATAR_PIPELINE_ENABLED = AVATAR_PIPELINE_MODE === "local";
const ENABLE_CAMERA_PERSON_DETECTION =
  String(process.env.REACT_APP_ENABLE_CAMERA_PERSON_DETECTION || "false")
    .trim()
    .toLowerCase() === "true";

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
const TOOL_SIGNATURE_CACHE_TTL_MS = 10000;

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

function isValidVisitorPhone(value: unknown) {
  const digits = toPhoneDigits(value);
  return digits.length >= 10;
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

function defaultPurposeCategoryForIntent(intent: unknown) {
  const normalizedIntent = normalizeIntentName(intent);
  if (normalizedIntent === "delivery") return 3;
  if (normalizedIntent.includes("vendor")) return 5;
  if (normalizedIntent.includes("cab")) return 2;
  if (normalizedIntent.includes("member_staff") || normalizedIntent.includes("memberstaff")) return 6;
  if (normalizedIntent.includes("staff")) return 4;
  return 1;
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
    if (!isValidVisitorPhone(collectedSlots.phone || collectedSlots.visitor_phone || "")) {
      missing.push("phone");
    }
    if (!hasMeaningfulValue(collectedSlots.came_from) && !hasMeaningfulValue(collectedSlots.origin)) {
      missing.push("came_from");
    }
    if (!hasMeaningfulValue(collectedSlots.meeting_with) && !hasMeaningfulValue(collectedSlots.person_to_meet)) {
      missing.push("meeting_with");
    }
  }

  return { flow, missing };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    floor: "meeting_with",
    floor_number: "meeting_with",
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

function findPurposeCategoryById(categoryId: number) {
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return null;
  }
  return PURPOSE_CATALOG.data.find((category) => category.category_id === categoryId) || null;
}

function buildToolArgsSignature(name: string, args: unknown) {
  const safeName = String(name || "").trim();
  let serializedArgs = "";
  try {
    serializedArgs = JSON.stringify(args || {});
  } catch {
    serializedArgs = String(args || "");
  }
  return `${safeName}:${serializedArgs}`;
}

type ConversationState = {
  intent?: string;
  collectedSlots: Record<string, string>;
};

function cloneConversationState(state: ConversationState): ConversationState {
  return {
    intent: state.intent,
    collectedSlots: {
      ...(state.collectedSlots || {}),
    },
  };
}

function getPositiveInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
}

function hasNotifiableMemberContact(member: Record<string, unknown>) {
  const memberId =
    getPositiveInt(member.member_id) ||
    getPositiveInt(member.member_ids) ||
    getPositiveInt(member.id);
  const userId = String(member.user_id || member.member_old_sso_id || "").trim();
  const mobile = String(member.member_mobile_number || member.mobile_number || "").replace(/\D/g, "");
  return Boolean(memberId && userId && mobile.length >= 10);
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
  const autoConnectInFlightRef = useRef(false);
  const lastAutoConnectAtRef = useRef(0);
  const toolResponseCacheRef = useRef<Map<string, { at: number; result: any }>>(new Map());
  const recentToolSignatureCacheRef = useRef<Map<string, { at: number; result: any }>>(new Map());

  const { client, setConfig, setModel, connected, lipSyncRef, assistantAudioPlaying: liveAssistantAudioPlaying, connect } = useLiveAPIContext();
  const [localAvatarAudioPlaying, setLocalAvatarAudioPlaying] = useState(false);
  const effectiveAssistantAudioPlaying = LOCAL_AVATAR_PIPELINE_ENABLED
    ? localAvatarAudioPlaying
    : liveAssistantAudioPlaying;

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
    const attempts = 12;
    for (let index = 0; index < attempts; index += 1) {
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const maxWidth = 640;
        const ratio = Math.min(1, maxWidth / video.videoWidth);
        const targetWidth = Math.max(1, Math.round(video.videoWidth * ratio));
        const targetHeight = Math.max(1, Math.round(video.videoHeight * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return null;
        }
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
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
        return stream;
      } catch (error) {
        lastError = error;
      }
    }

    lastCaptureErrorRef.current = describeCameraAccessError(lastError);
    return null;
  }, [describeCameraAccessError]);

  const detectFaceInPreview = useCallback(async () => {
    if (typeof window === "undefined") {
      return { supported: false, detected: true };
    }

    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return { supported: false, detected: false };
    }

    const FaceDetectorCtor = (window as any).FaceDetector as
      | (new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
          detect: (input: CanvasImageSource) => Promise<unknown[]>;
        })
      | undefined;
    if (!FaceDetectorCtor) {
      // Browser does not support native face detection; allow capture fallback.
      return { supported: false, detected: true };
    }

    try {
      const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(video);
      return {
        supported: true,
        detected: Array.isArray(faces) && faces.length > 0,
      };
    } catch {
      return { supported: true, detected: false };
    }
  }, []);

  const captureCheckInPhotoAfterCountdown = useCallback(async (source: string, countdownMs = 5000) => {
    if (captureInFlightRef.current) {
      return false;
    }

    captureInFlightRef.current = true;
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

      let faceCheckSupported = false;
      let faceDetected = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const faceCheck = await detectFaceInPreview();
        faceCheckSupported = faceCheckSupported || faceCheck.supported;
        if (faceCheck.detected) {
          faceDetected = true;
          break;
        }
        await sleep(300);
      }
      if (faceCheckSupported && !faceDetected) {
        lastCaptureErrorRef.current =
          "Face not detected clearly. Please face the camera and try again.";
        if (activeSessionId) {
          await DatabaseManager.logSessionEvent(activeSessionId, {
            role: "system",
            eventType: "camera_capture_blocked_no_face_detected",
            content: lastCaptureErrorRef.current,
          });
        }
        return false;
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
      captureInFlightRef.current = false;
      stopCameraPreview();
    }
  }, [
    captureVisitorPhotoJpeg,
    describeCameraAccessError,
    detectFaceInPreview,
    openTemporaryCameraStream,
    stopCameraPreview,
  ]);

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
    const responseModalities = LOCAL_AVATAR_PIPELINE_ENABLED ? "TEXT" : "AUDIO";
    setModel(modelId);

    const nextConfig: any = {
      model: modelId,
      responseModalities,
      systemInstruction: {
        parts: [{ text: RECEPTIONIST_PERSONA.systemInstruction }],
      },
      tools: TOOLS,
    };
    if (!LOCAL_AVATAR_PIPELINE_ENABLED) {
      nextConfig.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Algenib",
          },
        },
      };
    }

    setConfig(nextConfig);
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

  // ── Camera Person Detection Auto-Start ───────────────────────────
  useEffect(() => {
    if (!ENABLE_CAMERA_PERSON_DETECTION || connected || typeof window === "undefined") {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    let cancelled = false;
    let detectionTimer: ReturnType<typeof setTimeout> | null = null;
    let detectionStream: MediaStream | null = null;
    let detectionVideo: HTMLVideoElement | null = null;
    let detectionCanvas: HTMLCanvasElement | null = null;
    let previousLuma: Uint8ClampedArray | null = null;
    let consecutiveDetections = 0;

    const MOTION_THRESHOLD = 0.055;
    const REQUIRED_DETECTIONS = 2;
    const DETECTION_INTERVAL_MS = 700;
    const AUTO_CONNECT_COOLDOWN_MS = 10000;

    type FaceDetectorLike = { detect: (input: CanvasImageSource) => Promise<unknown[]> };
    let faceDetector: FaceDetectorLike | null = null;
    const FaceDetectorCtor = (window as any).FaceDetector as
      | (new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike)
      | undefined;

    if (FaceDetectorCtor) {
      try {
        faceDetector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
      } catch {
        faceDetector = null;
      }
    }

    const stopDetection = () => {
      if (detectionTimer) {
        clearTimeout(detectionTimer);
        detectionTimer = null;
      }
      if (detectionStream) {
        detectionStream.getTracks().forEach((track) => track.stop());
        detectionStream = null;
      }
      if (detectionVideo) {
        detectionVideo.srcObject = null;
        detectionVideo = null;
      }
      previousLuma = null;
      consecutiveDetections = 0;
    };

    const detectMotion = () => {
      if (!detectionVideo || detectionVideo.readyState < 2) {
        return false;
      }

      if (!detectionCanvas) {
        detectionCanvas = document.createElement("canvas");
        detectionCanvas.width = 96;
        detectionCanvas.height = 72;
      }
      const ctx = detectionCanvas.getContext("2d");
      if (!ctx) {
        return false;
      }

      ctx.drawImage(detectionVideo, 0, 0, detectionCanvas.width, detectionCanvas.height);
      const frame = ctx.getImageData(0, 0, detectionCanvas.width, detectionCanvas.height).data;
      const luma = new Uint8ClampedArray(detectionCanvas.width * detectionCanvas.height);

      for (let pixel = 0, index = 0; pixel < frame.length; pixel += 4, index += 1) {
        const red = frame[pixel];
        const green = frame[pixel + 1];
        const blue = frame[pixel + 2];
        luma[index] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
      }

      let motionDetected = false;
      if (previousLuma) {
        let diff = 0;
        for (let i = 0; i < luma.length; i += 1) {
          diff += Math.abs(luma[i] - previousLuma[i]);
        }
        const motionScore = diff / (luma.length * 255);
        motionDetected = motionScore >= MOTION_THRESHOLD;
      }

      previousLuma = luma;
      return motionDetected;
    };

    const scheduleNext = (delayMs = DETECTION_INTERVAL_MS) => {
      if (cancelled) {
        return;
      }
      if (detectionTimer) {
        clearTimeout(detectionTimer);
      }
      detectionTimer = setTimeout(() => {
        void detectPresenceTick();
      }, delayMs);
    };

    const detectPresenceTick = async () => {
      if (cancelled || connected) {
        return;
      }
      if (!detectionVideo || detectionVideo.readyState < 2) {
        scheduleNext(350);
        return;
      }

      let personDetected = false;
      if (faceDetector) {
        try {
          const faces = await faceDetector.detect(detectionVideo);
          personDetected = Array.isArray(faces) && faces.length > 0;
        } catch {
          personDetected = false;
        }
      }
      if (!personDetected) {
        personDetected = detectMotion();
      }

      consecutiveDetections = personDetected
        ? consecutiveDetections + 1
        : Math.max(0, consecutiveDetections - 1);

      if (consecutiveDetections >= REQUIRED_DETECTIONS) {
        const now = Date.now();
        const cooldownComplete = now - lastAutoConnectAtRef.current >= AUTO_CONNECT_COOLDOWN_MS;
        if (!autoConnectInFlightRef.current && cooldownComplete) {
          autoConnectInFlightRef.current = true;
          lastAutoConnectAtRef.current = now;
          stopDetection();
          try {
            await connect();
          } catch (error) {
            console.warn("Auto-connect from camera detection failed:", error);
          } finally {
            autoConnectInFlightRef.current = false;
          }
          return;
        }
      }

      scheduleNext();
    };

    const startDetection = async () => {
      try {
        detectionStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
      } catch {
        try {
          detectionStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } catch (error) {
          console.warn("Unable to start person-detection camera:", error);
          if (!cancelled) {
            detectionTimer = setTimeout(() => {
              void startDetection();
            }, 3000);
          }
          return;
        }
      }

      detectionVideo = document.createElement("video");
      detectionVideo.autoplay = true;
      detectionVideo.muted = true;
      detectionVideo.playsInline = true;
      detectionVideo.srcObject = detectionStream;
      try {
        await detectionVideo.play();
      } catch {
        // On some browsers, autoplay may require interaction; frame loop will still retry.
      }

      scheduleNext(350);
    };

    void startDetection();

    return () => {
      cancelled = true;
      stopDetection();
    };
  }, [connected, connect]);

  // ── Session Lifecycle (PostgreSQL backend) ───────────────────────
  useEffect(() => {
    let cancelled = false;

    if (connected) {
      conversationStateRef.current = { collectedSlots: {} };
      setConversationState(conversationStateRef.current);
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
    } else {
      conversationStateRef.current = { collectedSlots: {} };
      setConversationState(conversationStateRef.current);
      lastLoggedAssistantTextRef.current = "";
      stopCameraPreview();
      const activeSessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (activeSessionId) {
        void (async () => {
          await waitForCaptureSettled();
          const shouldPersistSnapshot =
            !!sessionPhotoRef.current &&
            !hasSavedVisitorRef.current &&
            !hasPersistedSecuritySnapshotRef.current;
          if (shouldPersistSnapshot) {
            await persistSecuritySnapshotIfNeeded(activeSessionId);
          }
          await DatabaseManager.endSession(activeSessionId, {
            status: "disconnected",
            summary: "Live connection closed before explicit end_interaction.",
          });
          captureInFlightRef.current = false;
          hasSavedVisitorRef.current = false;
          hasPersistedSecuritySnapshotRef.current = false;
          sessionPhotoRef.current = null;
          visitorCheckInPhotoRef.current = null;
        })();
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    connected,
    persistSecuritySnapshotIfNeeded,
    stopCameraPreview,
    waitForCaptureSettled,
  ]);

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

    if (effectiveAssistantAudioPlaying && !prev) {
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

    if (!effectiveAssistantAudioPlaying && prev) {
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

    prevAssistantAudioPlayingRef.current = effectiveAssistantAudioPlaying;
  }, [connected, effectiveAssistantAudioPlaying]);

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
  const [conversationState, setConversationState] = useState<ConversationState>({
    collectedSlots: {}
  });
  const conversationStateRef = useRef<ConversationState>(cloneConversationState(conversationState));

  const replaceConversationState = useCallback((nextState: ConversationState) => {
    const cloned = cloneConversationState(nextState);
    conversationStateRef.current = cloned;
    setConversationState(cloned);
    return cloned;
  }, []);

  const updateConversationState = useCallback((updater: (prev: ConversationState) => ConversationState) => {
    const next = cloneConversationState(updater(cloneConversationState(conversationStateRef.current)));
    conversationStateRef.current = next;
    setConversationState(next);
    return next;
  }, []);

  useEffect(() => {
    conversationStateRef.current = cloneConversationState(conversationState);
  }, [conversationState]);

  // ── Handle Tool Calls ─────────────────────────────────────────────
  useEffect(() => {
    const onToolCall = async (toolCall: any) => {
      console.log("Tool Call:", toolCall);
      const responses = [];

      for (const fc of toolCall.functionCalls) {
        let result: any = { error: "Unknown tool" };
        const { name, args } = fc;
        const functionCallId = String(fc?.id || "").trim();
        const dedupeBySignatureEligible =
          name === "classify_intent" ||
          name === "collect_slot_value" ||
          name === "check_returning_visitor";
        const toolArgsSignature = dedupeBySignatureEligible
          ? buildToolArgsSignature(name, args)
          : "";
        const activeSessionId = sessionIdRef.current;
        const now = Date.now();

        // Keep caches bounded and fresh.
        for (const [cacheKey, cacheValue] of toolResponseCacheRef.current.entries()) {
          if (now - cacheValue.at > 2 * 60 * 1000) {
            toolResponseCacheRef.current.delete(cacheKey);
          }
        }
        for (const [cacheKey, cacheValue] of recentToolSignatureCacheRef.current.entries()) {
          if (now - cacheValue.at > TOOL_SIGNATURE_CACHE_TTL_MS) {
            recentToolSignatureCacheRef.current.delete(cacheKey);
          }
        }

        if (functionCallId) {
          const cachedByCallId = toolResponseCacheRef.current.get(functionCallId);
          if (cachedByCallId) {
            // Same function call id already handled; ignore duplicate event delivery.
            continue;
          }
        }
        if (toolArgsSignature) {
          const cachedBySignature = recentToolSignatureCacheRef.current.get(toolArgsSignature);
          if (cachedBySignature) {
            if (functionCallId) {
              toolResponseCacheRef.current.set(functionCallId, {
                at: now,
                result: cachedBySignature.result,
              });
            }
            responses.push({
              name,
              id: fc.id,
              response: { result: cachedBySignature.result },
            });
            continue;
          }
        }

        if (activeSessionId) {
          void DatabaseManager.logSessionEvent(activeSessionId, {
            role: "tool",
            eventType: `tool_call:${name}`,
            content: JSON.stringify(args || {}),
          });
        }

        try {
          if (name === "classify_intent") {
            const normalizedIntent = normalizeIntentName(args.detected_intent);
            updateConversationState((prev) => ({
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
            const slotName = normalizeSlotName(args.slot_name);
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
            const activeFlow = inferActiveFlow(conversationStateRef.current.intent, conversationStateRef.current.collectedSlots);
            const nameAlreadyCollected = hasMeaningfulValue(
              conversationStateRef.current.collectedSlots.visitor_name ||
              conversationStateRef.current.collectedSlots.name ||
              ""
            );
            const phoneAlreadyCollected = isValidVisitorPhone(
              conversationStateRef.current.collectedSlots.phone ||
              conversationStateRef.current.collectedSlots.visitor_phone ||
              ""
            );
            const cameFromAlreadyCollected = hasMeaningfulValue(
              conversationStateRef.current.collectedSlots.came_from ||
              conversationStateRef.current.collectedSlots.origin ||
              ""
            );
            if (slotName === "phone" && activeFlow === "visitor" && !nameAlreadyCollected) {
              result = {
                status: "need_more_info",
                missing_fields: ["name"],
                message: "Collect visitor name first, then ask for phone number.",
              };
            } else if (slotName === "came_from" && activeFlow === "visitor" && !phoneAlreadyCollected) {
              result = {
                status: "need_more_info",
                missing_fields: ["phone"],
                message: "Collect visitor phone number before asking where they came from.",
              };
            } else if (slotName === "meeting_with" && activeFlow === "visitor" && !cameFromAlreadyCollected) {
              result = {
                status: "need_more_info",
                missing_fields: ["came_from"],
                message: "Collect where the visitor came from before asking whom they want to meet.",
              };
            } else {
            const isDeliverySlotName = ["delivery_company", "recipient_company", "recipient_name"].includes(slotName);
            const rawSlotValue = String(args.value || "").trim();
            const existingSlotValue = String(conversationStateRef.current.collectedSlots[slotName] || "").trim();
            const slotValue = mergeCollectedSlotValue(slotName, rawSlotValue, existingSlotValue);
            const phoneDigitsCollected = slotName === "phone" ? toPhoneDigits(slotValue).length : 0;
            const phoneNeedsMoreDigits = slotName === "phone" && phoneDigitsCollected > 0 && phoneDigitsCollected < 10;
            const shouldResolvePurposeCategory = [
              "purpose",
              "purpose_category",
              "category",
              "company",
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
              conversationStateRef.current.collectedSlots.target_company ||
              conversationStateRef.current.collectedSlots.came_from ||
              conversationStateRef.current.collectedSlots.company ||
              "";
            const memberLookup = shouldResolveMemberDestination && hasMeaningfulValue(slotValue)
              ? await resolveMembersForDestination(slotValue, {
                  secondaryQuery: memberLookupQueryContext,
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
            const isVisitorDestinationSlot = slotName === "meeting_with";
            const isDeliveryRecipientSlot = slotName === "recipient_name";
            const shouldPromptForUnitNumber =
              isVisitorDestinationSlot &&
              !!memberLookup &&
              memberLookup.configured &&
              memberLookup.ok &&
              matchedMemberIds.length === 0;
            const shouldPromptForDestinationClarification =
              isVisitorDestinationSlot &&
              !!memberLookup &&
              memberLookup.configured &&
              memberLookup.ok &&
              matchedMemberIds.length > 1;
            const shouldPromptForRecipientLocation =
              isDeliveryRecipientSlot &&
              !!memberLookup &&
              memberLookup.configured &&
              memberLookup.ok &&
              matchedMemberIds.length === 0;
            const shouldPromptForRecipientClarification =
              isDeliveryRecipientSlot &&
              !!memberLookup &&
              memberLookup.configured &&
              memberLookup.ok &&
              matchedMemberIds.length > 1;

            updateConversationState((prev) => ({
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
              ...(phoneNeedsMoreDigits
                ? {
                    partial_phone: true,
                    phone_digits_collected: phoneDigitsCollected,
                    message: `Collected ${phoneDigitsCollected} phone digits. Ask only for remaining digits.`,
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
            if (shouldPromptForDestinationClarification) {
              result = {
                ...result,
                status: "need_more_info",
                missing_fields: ["meeting_with"],
                message:
                  "I found multiple matches. Could you specify the floor or unit number?",
              };
            } else if (shouldPromptForRecipientClarification) {
              result = {
                ...result,
                status: "need_more_info",
                missing_fields: ["recipient_name"],
                message:
                  "I found multiple matches. Could you specify the floor or office number?",
              };
            } else if (shouldPromptForUnitNumber) {
              result = {
                ...result,
                status: "need_more_info",
                missing_fields: ["unit_number"],
                message:
                  "Sorry, I am not able to find that member. Could you specify the floor or unit number?",
              };
            } else if (shouldPromptForRecipientLocation) {
              result = {
                ...result,
                status: "need_more_info",
                missing_fields: ["recipient_name"],
                message:
                  "Sorry, I am not able to find that recipient. Could you specify the floor or office number?",
              };
            }
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
              args.company ||
              conversationStateRef.current.collectedSlots.company ||
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
              args.came_from ||
              args.company ||
              conversationStateRef.current.collectedSlots.came_from ||
              conversationStateRef.current.collectedSlots.origin ||
              conversationStateRef.current.collectedSlots.company ||
              "Walk-in";
            const finalMeetingWith = isDeliveryIntent
              ? String(resolvedRecipientName || resolvedMeetingWith || "N/A").trim()
              : String(resolvedMeetingWith || "N/A").trim();
            const finalCompany = isDeliveryIntent
              ? String(resolvedDeliveryCompany || resolvedCameFrom || "Delivery").trim()
              : String(resolvedCameFrom || "Walk-in").trim();
            const resolvedPurpose =
              args.purpose ||
              conversationStateRef.current.collectedSlots.purpose ||
              "";
            const mappedPurposeCategoryId = Number(
              args.purpose_category_id ||
              conversationStateRef.current.collectedSlots.purpose_category_id ||
              ""
            );
            const resolvedPurposeSubCategoryId = Number(
              args.purpose_sub_category_id ||
              conversationStateRef.current.collectedSlots.purpose_sub_category_id ||
              ""
            );
            const resolvedPurposeSubCategoryName =
              String(
                args.purpose_sub_category_name ||
                conversationStateRef.current.collectedSlots.purpose_sub_category_name ||
                ""
              ).trim();
            const fallbackPurposeCategoryId = defaultPurposeCategoryForIntent(resolvedIntent);
            const finalPurposeCategoryId =
              Number.isFinite(mappedPurposeCategoryId) && mappedPurposeCategoryId > 0
                ? mappedPurposeCategoryId
                : fallbackPurposeCategoryId;
            const mappedPurposeCategoryName =
              String(
                args.purpose_category_name ||
                conversationStateRef.current.collectedSlots.purpose_category_name ||
                ""
              ).trim();
            const finalPurposeCategoryName =
              mappedPurposeCategoryName ||
              findPurposeCategoryById(finalPurposeCategoryId)?.category_name ||
              findPurposeCategoryById(defaultPurposeCategoryForIntent(resolvedIntent))?.category_name ||
              (finalPurposeCategoryId === 3 ? "DELIVERY" : "GUEST");
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
              : resolvedCameFrom;

            if (
              (!resolvedMemberIdsCsv || resolvedMemberObjects.length === 0) &&
              hasMeaningfulValue(memberLookupPrimaryQuery)
            ) {
              const memberLookup = await resolveMembersForDestination(
                memberLookupPrimaryQuery,
                {
                  secondaryQuery: memberLookupSecondaryQuery,
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

                updateConversationState((prev) => ({
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
              ]
                .filter(Boolean)
                .join(" | ");
            const missingFields: string[] = [];
              const uniqueResolvedMemberIds = Array.from(
                new Set(
                  resolvedMemberObjects
                    .map((member) =>
                      getPositiveInt(
                        (member as Record<string, unknown>).member_id ||
                          (member as Record<string, unknown>).member_ids
                      )
                    )
                    .filter((value): value is number => Number.isFinite(value))
                )
              );
              const hasResolvedMember = uniqueResolvedMemberIds.length > 0 && resolvedMemberObjects.length > 0;
              const hasAmbiguousMemberMatches =
                resolvedMemberObjects.length > 1 || uniqueResolvedMemberIds.length > 1;
              const hasNotifiableMember = resolvedMemberObjects.some((member) =>
                hasNotifiableMemberContact(member as Record<string, unknown>)
              );
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
                if (!isValidVisitorPhone(resolvedPhone)) {
                  missingFields.push("phone");
                }
                if (!hasMeaningfulValue(resolvedCameFrom)) {
                  missingFields.push("came_from");
                }
                if (!hasMeaningfulValue(resolvedMeetingWith)) {
                  missingFields.push("meeting_with");
                }
              }

              if (missingFields.length > 0) {
                result = {
                  status: "need_more_info",
                  missing_fields: missingFields,
                  message:
                    isDeliveryIntent
                      ? "Collect delivery person name, delivery company, recipient company, and recipient name before saving."
                      : "Collect name, phone, where they came from, and whom they want to visit before saving. Ask one missing field at a time.",
                };
              } else if (!visitorCheckInPhotoRef.current) {
                result = {
                  status: "need_photo_capture",
                  missing_fields: ["photo"],
                  message:
                    isDeliveryIntent
                      ? "Ask the delivery person to stand still for 5 seconds, call capture_photo, then save_visitor_info again."
                      : "Ask the visitor to stand still for 5 seconds, call capture_photo, then save_visitor_info again.",
                };
              } else if (!hasResolvedMember) {
                result = {
                  status: "need_more_info",
                  missing_fields: [isDeliveryIntent ? "recipient_name" : "unit_number"],
                  message:
                    isDeliveryIntent
                      ? "Sorry, I am not able to find that recipient. Could you specify the floor or office number?"
                      : "Sorry, I am not able to find that member. Could you specify the floor or unit number?",
                };
              } else if (hasAmbiguousMemberMatches) {
                result = {
                  status: "need_more_info",
                  missing_fields: [isDeliveryIntent ? "recipient_name" : "meeting_with"],
                  message:
                    isDeliveryIntent
                      ? "I found multiple recipient matches. Could you specify the floor or office number?"
                      : "I found multiple matches. Could you specify the floor or unit number?",
                };
              } else if (!hasNotifiableMember) {
                result = {
                  status: "need_more_info",
                  missing_fields: [isDeliveryIntent ? "recipient_name" : "meeting_with"],
                  message:
                    isDeliveryIntent
                      ? "I found the recipient but their contact details are incomplete. Could you confirm the floor or office number?"
                      : "I found the member but contact details are incomplete. Could you confirm the floor or unit number?",
                };
              } else {
                const finalVisitorPhoto = visitorCheckInPhotoRef.current || args.photo || undefined;
                const resolvedDepartment = String(
                  args.department ||
                  conversationStateRef.current.collectedSlots.department ||
                  "Reception"
                ).trim() || "Reception";
                const finalPhone = isDeliveryIntent
                  ? (normalizedPhone || "N/A")
                  : normalizedPhone;
                const visitor = await DatabaseManager.saveVisitor({
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
                }, { sessionId: activeSessionId });

                hasSavedVisitorRef.current = true;
                result = {
                  status: "success",
                  visitor_id: visitor.id,
                  photo_format: "image/jpeg",
                  purpose_category_id: finalPurposeCategoryId,
                  purpose_category_name: finalPurposeCategoryName,
                  purpose_sub_category_id:
                    Number.isFinite(resolvedPurposeSubCategoryId) && resolvedPurposeSubCategoryId > 0
                      ? resolvedPurposeSubCategoryId
                      : null,
                  purpose_sub_category_name: resolvedPurposeSubCategoryName || null,
                  member_ids: resolvedMemberIdsCsv
                    ? resolvedMemberIdsCsv.split(",").map((id: string) => Number(id)).filter((id: number) => Number.isFinite(id))
                    : [],
                  matched_members: resolvedMemberObjects,
                  approval_decision: resolvedApprovalDecision || null,
                  approval_status: resolvedApprovalStatus || null,
                };
                if (activeSessionId) {
                  void DatabaseManager.updateSession(activeSessionId, {
                    visitorId: visitor.id,
                    intent: resolvedIntent,
                  });
                }

                // External API sync is best-effort and must not block speech/tool response.
                void (async () => {
                  const configuredCompanyId = Number(process.env.REACT_APP_WALKIN_COMPANY_ID || "");
                  const externalSync = await syncWalkInDetailsToExternalApis({
                    name: resolvedName,
                    phone: normalizedPhone,
                    cameFrom: finalCompany,
                    meetingWith: finalMeetingWith,
                    localVisitorId: visitor.id,
                    intent: resolvedIntent,
                    sessionId: activeSessionId,
                    photo: finalVisitorPhoto,
                    visitorPurposeCategoryId:
                      finalPurposeCategoryId,
                    visitorPurposeSubCategoryId:
                      Number.isFinite(resolvedPurposeSubCategoryId) && resolvedPurposeSubCategoryId > 0
                        ? resolvedPurposeSubCategoryId
                        : undefined,
                    memberDetails: resolvedMemberObjects,
                    companyId: Number.isFinite(configuredCompanyId) && configuredCompanyId > 0
                      ? configuredCompanyId
                      : undefined,
                    companyName: isDeliveryIntent ? finalCompany : undefined,
                    isStaff: false,
                  });

                  if (activeSessionId && externalSync.attempted && !externalSync.allSuccessful) {
                    await DatabaseManager.logSessionEvent(activeSessionId, {
                      role: "system",
                      eventType: "external_walkin_sync_partial_failure",
                      content: JSON.stringify(externalSync.results),
                    });
                  }
                })();
              }
          }
          else if (name === "check_returning_visitor") {
            const phoneInput = String(args.phone || "").trim();
            const gateSearch = await searchVisitorByPhoneInGate(phoneInput);

            if (gateSearch.configured && gateSearch.ok) {
              let resolvedName = String(gateSearch.visitorName || "").trim();
              if (gateSearch.found && !hasMeaningfulValue(resolvedName)) {
                const localFallback = await DatabaseManager.findByPhone(phoneInput);
                resolvedName = String(localFallback?.name || "").trim();
              }

              if (gateSearch.found && hasMeaningfulValue(resolvedName)) {
                updateConversationState((prev) => ({
                  ...prev,
                  collectedSlots: {
                    ...prev.collectedSlots,
                    visitor_name: resolvedName,
                  },
                }));
              }

              result = {
                is_returning: gateSearch.found,
                name: resolvedName || null,
                visitor_id: gateSearch.visitorId ?? null,
                skip_name_prompt: gateSearch.found && hasMeaningfulValue(resolvedName),
                source: "gate_api",
              };
            } else {
              const visitor = await DatabaseManager.findByPhone(phoneInput);
              if (visitor) {
                updateConversationState((prev) => ({
                  ...prev,
                  collectedSlots: {
                    ...prev.collectedSlots,
                    visitor_name: visitor.name,
                  },
                }));
                result = {
                  is_returning: true,
                  last_visit: visitor.timestamp,
                  name: visitor.name,
                  skip_name_prompt: true,
                  source: "local_fallback",
                  gate_search_error: gateSearch.error || "Gate visitor search failed",
                };
              } else {
                result = {
                  is_returning: false,
                  source: "local_fallback",
                  gate_search_error: gateSearch.error || "Gate visitor search failed",
                };
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
            await new Promise((resolve) => setTimeout(resolve, 350));
            updateConversationState((prev) => ({
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

              updateConversationState((prev) => ({
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
            await new Promise((resolve) => setTimeout(resolve, 500));
            updateConversationState((prev) => ({
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
              setTimeout(() => {
                stopCameraPreview();
                client.disconnect();
                setVideoStream(null);
                replaceConversationState({ collectedSlots: {} });
                visitorCheckInPhotoRef.current = null;
                setLastAudioText("");
                setExpressionCue("neutral_professional");
              }, 6000);
              result = { status: "success", message: "Resetting kiosk." };
            }
          }
          else if (name === "capture_photo") {
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
                    : "Collect name, phone, where they came from, and whom they want to visit before photo capture.",
              };
            } else {
              const captured = await captureCheckInPhotoAfterCountdown("tool_call_after_5s_still_pose", 5000);
              if (captured) {
                result = {
                  status: "success",
                  message: "Photo captured successfully in JPG format after 5 seconds.",
                  format: "image/jpeg",
                };
              } else {
                result = {
                  status: "error",
                  message:
                    lastCaptureErrorRef.current ||
                    "Camera not available. Ensure video permission is enabled and try again.",
                };
              }
            }
          }
        } catch (e: any) {
          result = { error: e.message };
        }

        if (toolArgsSignature) {
          recentToolSignatureCacheRef.current.set(toolArgsSignature, {
            at: Date.now(),
            result,
          });
        }
        if (functionCallId) {
          toolResponseCacheRef.current.set(functionCallId, {
            at: Date.now(),
            result,
          });
        }

        responses.push({
          name: name,
          id: fc.id,
          response: { result },
        });
      }

      if (responses.length === 0) {
        return;
      }

      if (!connected || client.status !== "connected") {
        console.warn("Skipping tool response because live socket is not connected.");
        return;
      }

      client.sendToolResponse({ functionResponses: responses });
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [
    captureCheckInPhotoAfterCountdown,
    client,
    connected,
    fireGesture,
    persistSecuritySnapshotIfNeeded,
    replaceConversationState,
    stopCameraPreview,
    updateConversationState,
  ]);

  return (
    <div className="app-container">
      <main className="app-main">
        <div className="main-app-area">
          <h1 className="app-title">Greenscape Receptionist</h1>

          <div className="avatar-wrapper">
            <AvatarController
              ref={avatarRef}
              mode={AVATAR_PIPELINE_MODE}
              connected={connected}
              speechText={lastAudioText}
              expressionCue={expressionCue}
              isAudioPlaying={effectiveAssistantAudioPlaying}
              lipSyncRef={lipSyncRef}
              onLocalPlaybackStateChange={setLocalAvatarAudioPlaying}
            />
          </div>

          <ControlTray
            videoRef={videoRef}
            supportsVideo={false}
            onVideoStreamChange={setVideoStream}
            enableEditingSettings={false}
          >
          </ControlTray>

          {/* Hidden video element for capture, or visible for preview */}
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
      </main>
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
