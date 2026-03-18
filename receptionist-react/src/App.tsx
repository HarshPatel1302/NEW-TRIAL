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
import { syncWalkInDetailsToExternalApis } from "./receptionist/external-visitor-sync";
import { requestDeliveryApproval } from "./receptionist/delivery-approval";
import {
  decodeMembersFromNotes,
  encodeMembersForNotes,
  resolveMembersForDestination,
} from "./receptionist/member-directory";
import purposeCatalog from "./receptionist/purpose.json";
import { GestureController, GestureState } from "./components/Avatar3D/gesture-controller";
import { markLatency, logLatency } from "./lib/latency";
import {
  hasMeaningfulValue,
  toPhoneDigits,
  isValidVisitorPhone,
  normalizeIntentName,
  getMissingFieldsBeforePhoto,
  getNextSlotToAsk,
} from "./receptionist/slot-utils";
import { ExpressionCue } from "./components/Avatar3D/facial-types";
import AdminDashboard from "./admin/AdminDashboard";

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
    flat: "meeting_with",
    flat_number: "meeting_with",
    company_to_visit: "company_to_visit",
    which_company: "company_to_visit",
    visit_company: "company_to_visit",
    person_in_company: "person_in_company",
    contact_person: "person_in_company",
    recipient_person: "recipient_name",
    parcel_for_person: "recipient_name",
    parcel_recipient_name: "recipient_name",
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
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      const existing = video.srcObject as MediaStream;
      if (existing.getVideoTracks().some((t) => t.readyState === "live")) {
        lastCaptureErrorRef.current = "";
        return existing;
      }
    }

    const cameraRequests: MediaStreamConstraints[] = [
      { video: { facingMode: "user" }, audio: false },
      { video: true, audio: false },
    ];

    let lastError: unknown = null;
    for (const constraints of cameraRequests) {
      try {
        const stream = (await Promise.race([
          navigator.mediaDevices.getUserMedia(constraints),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Camera permission timed out.")), 8000)
          ),
        ])) as MediaStream;

        if (video) {
          video.srcObject = stream;
          setVideoStream(stream);
          try {
            await video.play();
          } catch {
            // Capture loop will retry until video has dimensions.
          }
          for (let i = 0; i < 60; i++) {
            await sleep(100);
            if (video.videoWidth > 0 && video.videoHeight > 0) break;
          }
        }
        lastCaptureErrorRef.current = "";
        return stream;
      } catch (error) {
        lastError = error;
      }
    }

    lastCaptureErrorRef.current = describeCameraAccessError(lastError);
    return null;
  }, [describeCameraAccessError]);

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
  }, [captureVisitorPhotoJpeg, describeCameraAccessError, openTemporaryCameraStream, stopCameraPreview]);

  const waitForCaptureSettled = useCallback(async (timeoutMs = 9000) => {
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
    } else {
      setConversationState({ collectedSlots: {} });
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
            close_reason: "interrupted_by_user",
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
  }, [connected, persistSecuritySnapshotIfNeeded, stopCameraPreview, waitForCaptureSettled]);

  // ── AUTO-GREETING ─────────────────────────────────────────────────
  useEffect(() => {
    let cueTimer: ReturnType<typeof setTimeout> | null = null;
    if (connected) {
      setExpressionCue("welcome_warm");
      enqueueGesture("waving", { duration: 6.0, priority: 3, force: true });
      if (!hasSentAutoGreetingRef.current) {
        hasSentAutoGreetingRef.current = true;
        client.send([{ text: "The user is here. Say exactly: Hello, welcome to Greenscape. I am Pratik. How can I help you today? Then stop and wait for their response. Do not ask for phone or any other question until they have stated their purpose." }]);
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

  // ── Handle Tool Calls ─────────────────────────────────────────────
  useEffect(() => {
    const onToolCall = async (toolCall: any) => {
      const toolCallStart = Date.now();
      markLatency("tool_call_received", sessionIdRef.current);
      if (process.env.NODE_ENV === "development") {
        console.log("[Tool] received", toolCall?.functionCalls?.length, "calls at", toolCallStart);
      }
      const responses = [];

      for (const fc of toolCall.functionCalls) {
        let result: any = { error: "Unknown tool" };
        const { name, args } = fc;
        const activeSessionId = sessionIdRef.current;

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

            const nextSlot = normalizedIntent === "delivery" ? "visitor_name" : "phone";
            result = {
              status: "success",
              intent: normalizedIntent,
              raw_intent: String(args.detected_intent || ""),
              next_slot: nextSlot,
              message: normalizedIntent === "delivery"
                ? "Intent: delivery. Next: ask 'Please tell me your name.'"
                : "Intent: visitor. Next: ask 'Could you share your phone number please?'",
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
            const isDeliverySlotName = ["delivery_company", "recipient_company", "recipient_name"].includes(slotName);
            const rawSlotValue = String(args.value || "").trim();
            const existingSlotValue = String(conversationState.collectedSlots[slotName] || "").trim();
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
            const shouldResolveMemberDestination = false;
            const memberLookupQueryContext =
              conversationState.collectedSlots.recipient_company ||
              conversationState.collectedSlots.target_company ||
              conversationState.collectedSlots.company_to_visit ||
              conversationState.collectedSlots.came_from ||
              conversationState.collectedSlots.company ||
              "";
            const memberLookup = shouldResolveMemberDestination && hasMeaningfulValue(slotValue)
              ? await resolveMembersForDestination(slotValue, {
                  secondaryQuery: memberLookupQueryContext,
                  maxResults: 1,
                })
              : null;
            const matchedMemberIds = memberLookup?.memberIds || [];
            const matchedMembers = memberLookup?.matchedMembers || [];
            const encodedMatchedMembers = matchedMembers.length > 0
              ? encodeMembersForNotes(matchedMembers)
              : "";
            const shouldClearMemberLookupState =
              ["meeting_with", "recipient_name", "person_in_company"].includes(slotName) &&
              !!memberLookup &&
              (!memberLookup.ok || matchedMemberIds.length === 0);
            const shouldPromptForUnitNumber =
              (slotName === "meeting_with" || slotName === "person_in_company") &&
              !!memberLookup &&
              memberLookup.configured &&
              memberLookup.ok &&
              matchedMemberIds.length === 0;

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

            const updatedSlots = { ...conversationState.collectedSlots, [slotName]: slotValue };
            const nextSlot = getNextSlotToAsk(conversationState.intent, updatedSlots);
            const collectedSummary: Record<string, string> = {};
            for (const [k, v] of Object.entries(updatedSlots)) {
              if (hasMeaningfulValue(v) && !["member_ids", "member_lookup_query", "member_match_count", "member_objects_uri", "purpose_category_id", "purpose_category_name", "purpose_sub_category_id", "purpose_sub_category_name"].includes(k)) {
                collectedSummary[k] = String(v);
              }
            }

            result = {
              status: "success",
              slot: slotName,
              value: slotValue,
              collected_slots: collectedSummary,
              next_slot: nextSlot,
              message: nextSlot
                ? `Collected ${slotName}. Next: ask for ${nextSlot}. Do not ask for ${slotName} again.`
                : `Collected ${slotName}. All slots complete. Proceed to photo capture.`,
              ...(phoneNeedsMoreDigits
                ? {
                    partial_phone: true,
                    phone_digits_collected: phoneDigitsCollected,
                    message: `Collected ${phoneDigitsCollected} phone digits. Ask only for remaining digits. Do not ask for full phone again.`,
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
            }
          }
          else if (name === "collect_slots_batch") {
            const rawSlots = args.slots && typeof args.slots === "object" ? args.slots : {};
            const disallowed = ["department", "purpose", "appointment_time", "reference_id", "notes"];
            const merged: Record<string, string> = { ...conversationState.collectedSlots };
            for (const [k, v] of Object.entries(rawSlots)) {
              const slotName = normalizeSlotName(k);
              if (disallowed.includes(slotName)) continue;
              const value = String(v ?? "").trim();
              if (!hasMeaningfulValue(value)) continue;
              merged[slotName] = mergeCollectedSlotValue(slotName, value, merged[slotName]);
            }
            setConversationState(prev => ({ ...prev, collectedSlots: merged }));
            const nextSlot = getNextSlotToAsk(conversationState.intent, merged);
            const collectedSummary: Record<string, string> = {};
            for (const [k, v] of Object.entries(merged)) {
              if (hasMeaningfulValue(v) && !["member_ids", "member_lookup_query", "member_match_count", "member_objects_uri", "purpose_category_id", "purpose_category_name", "purpose_sub_category_id", "purpose_sub_category_name"].includes(k)) {
                collectedSummary[k] = String(v);
              }
            }
            result = {
              status: "success",
              collected_slots: collectedSummary,
              next_slot: nextSlot,
              message: nextSlot
                ? `Collected ${Object.keys(collectedSummary).length} slots. Next: ask for ${nextSlot}.`
                : `Collected ${Object.keys(collectedSummary).length} slots. All required complete. Proceed to photo capture.`,
            };
          }
          else if (name === "save_visitor_info") {
            const resolvedIntent = normalizeIntentName(
              args.intent || conversationState.intent || "meet_person"
            );
            const isDeliveryIntent = resolvedIntent === "delivery";
            const resolvedName =
              args.name ||
              conversationState.collectedSlots.visitor_name ||
              conversationState.collectedSlots.name ||
              "Visitor";
            const resolvedPhone =
              args.phone ||
              conversationState.collectedSlots.phone ||
              conversationState.collectedSlots.visitor_phone ||
              "N/A";
            const normalizedPhone = toPhoneDigits(resolvedPhone);
            const resolvedMeetingWith =
              args.meeting_with ||
              conversationState.collectedSlots.meeting_with ||
              conversationState.collectedSlots.person_to_meet ||
              conversationState.collectedSlots.recipient_name ||
              conversationState.collectedSlots.whom_to_meet ||
              "N/A";
            const resolvedDeliveryCompany =
              args.delivery_company ||
              conversationState.collectedSlots.delivery_company ||
              conversationState.collectedSlots.delivery_partner ||
              args.company ||
              conversationState.collectedSlots.company ||
              "";
            const resolvedRecipientCompany =
              args.recipient_company ||
              conversationState.collectedSlots.recipient_company ||
              conversationState.collectedSlots.target_company ||
              conversationState.collectedSlots.department ||
              "";
            const resolvedRecipientName =
              args.recipient_name ||
              conversationState.collectedSlots.recipient_name ||
              conversationState.collectedSlots.person_to_meet ||
              conversationState.collectedSlots.recipient ||
              conversationState.collectedSlots.meeting_with ||
              "";
            const resolvedCameFrom =
              args.came_from ||
              args.company ||
              conversationState.collectedSlots.came_from ||
              conversationState.collectedSlots.origin ||
              conversationState.collectedSlots.company ||
              "Walk-in";
            const visitorCompanyToVisit = String(
              conversationState.collectedSlots.company_to_visit ||
              args.company_to_visit ||
              ""
            ).trim();
            const visitorPersonInCompany = String(
              conversationState.collectedSlots.person_in_company ||
              args.person_in_company ||
              conversationState.collectedSlots.meeting_with ||
              conversationState.collectedSlots.person_to_meet ||
              ""
            ).trim();
            const finalMeetingWith = isDeliveryIntent
              ? String(resolvedRecipientName || resolvedMeetingWith || "N/A").trim()
              : hasMeaningfulValue(visitorCompanyToVisit)
                ? visitorPersonInCompany
                  ? `${visitorCompanyToVisit} - ${visitorPersonInCompany}`
                  : visitorCompanyToVisit
                : String(resolvedMeetingWith || "N/A").trim();
            const finalCompany = isDeliveryIntent
              ? String(resolvedDeliveryCompany || resolvedCameFrom || "Delivery").trim()
              : String(resolvedCameFrom || "Walk-in").trim();
            const resolvedPurpose =
              args.purpose ||
              conversationState.collectedSlots.purpose ||
              "";
            const resolvedPurposeSubCategoryId = Number(
              conversationState.collectedSlots.purpose_sub_category_id || ""
            );
            const resolvedPurposeSubCategoryName =
              conversationState.collectedSlots.purpose_sub_category_name || "";
            const mappedPurposeCategoryId = Number(
              conversationState.collectedSlots.purpose_category_id || ""
            );
            const mappedPurposeCategoryName =
              conversationState.collectedSlots.purpose_category_name || "";
            const finalPurposeCategoryId =
              Number.isFinite(mappedPurposeCategoryId) && mappedPurposeCategoryId > 0
                ? mappedPurposeCategoryId
                : resolvedIntent === "delivery" ? 3 : 1;
            const finalPurposeCategoryName =
              mappedPurposeCategoryName ||
              (resolvedIntent === "delivery" ? "DELIVERY" : "GUEST");
            const resolvedWhereToGo =
              args.where_to_go ||
              conversationState.collectedSlots.where_to_go ||
              "";
            const resolvedApprovalDecision = String(
              args.approval_decision ||
              conversationState.collectedSlots.approval_decision ||
              ""
            )
              .trim()
              .toLowerCase();
            const resolvedApprovalStatus = String(
              args.approval_status ||
              conversationState.collectedSlots.approval_status ||
              ""
            )
              .trim()
              .toLowerCase();
            const resolvedApprovalSource = String(
              conversationState.collectedSlots.approval_source || ""
            ).trim();
            let resolvedMemberIdsCsv =
              String(
                conversationState.collectedSlots.member_ids ||
                ""
              ).trim();
            let resolvedMemberLookupQuery =
              String(
                conversationState.collectedSlots.member_lookup_query ||
                ""
              ).trim();
            let resolvedMemberObjectsEncoded =
              String(
                conversationState.collectedSlots.member_objects_uri ||
                ""
              ).trim();
            let resolvedMemberObjects = resolvedMemberObjectsEncoded
              ? decodeMembersFromNotes(resolvedMemberObjectsEncoded)
              : [];
            const resolvedCompanyToVisit =
              args.company_to_visit ||
              conversationState.collectedSlots.company_to_visit ||
              "";
            const resolvedPersonInCompany =
              args.person_in_company ||
              conversationState.collectedSlots.person_in_company ||
              conversationState.collectedSlots.meeting_with ||
              conversationState.collectedSlots.person_to_meet ||
              "";
            const memberLookupPrimaryQuery = isDeliveryIntent
              ? [resolvedRecipientName, resolvedMeetingWith]
                  .filter((value) => hasMeaningfulValue(value))
                  .join(" ")
              : [resolvedCompanyToVisit, resolvedPersonInCompany, resolvedWhereToGo, resolvedMeetingWith]
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
                  maxResults: 1,
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
                !isDeliveryIntent && hasMeaningfulValue(visitorCompanyToVisit)
                  ? `recipient_company:${String(visitorCompanyToVisit).trim()}`
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
                if (!hasMeaningfulValue(conversationState.collectedSlots.came_from) && !hasMeaningfulValue(args.came_from) && !hasMeaningfulValue(conversationState.collectedSlots.origin)) {
                  missingFields.push("came_from");
                }
                if (!hasMeaningfulValue(visitorCompanyToVisit)) {
                  missingFields.push("company_to_visit");
                }
              }

              if (!visitorCheckInPhotoRef.current && captureInFlightRef.current) {
                await waitForCaptureSettled(6000);
              }

              if (missingFields.length > 0) {
                const nextSlot = missingFields[0] === "name" ? "visitor_name" : missingFields[0];
                const slotToQuestion: Record<string, string> = {
                  visitor_name: "May I know your name please?",
                  phone: "Could you share your phone number please?",
                  came_from: "Where did you come from? For example, Walk-in or Shadowfax.",
                  company_to_visit: "Which company would you like to visit?",
                  person_in_company: "Which person in that company would you like to meet?",
                  meeting_with: "Which office or unit number would you like to visit?",
                  delivery_company: "Which parcel company are you from?",
                  recipient_company: "Which company in Greenscape is this parcel for?",
                  recipient_name: "Who is this parcel for in that company?",
                };
                const askThis = slotToQuestion[nextSlot] || nextSlot;
                result = {
                  status: "need_more_info",
                  missing_fields: missingFields,
                  next_slot: nextSlot,
                  message: `Ask only: "${askThis}" Do not ask for already collected fields.`,
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
              } else if (!isDeliveryIntent && hasMeaningfulValue(visitorPersonInCompany) && (!resolvedMemberIdsCsv || resolvedMemberObjects.length === 0)) {
                result = {
                  status: "need_more_info",
                  missing_fields: ["unit_number"],
                  message:
                    "Sorry, I am not able to find that member. Could you specify the unit number?",
                };
              } else {
                const finalVisitorPhoto = visitorCheckInPhotoRef.current || args.photo || undefined;
                const resolvedDepartment = String(
                  args.department ||
                  conversationState.collectedSlots.department ||
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
                    companyName: isDeliveryIntent
                      ? (resolvedDeliveryCompany || finalCompany)
                      : undefined,
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
            const visitor = await DatabaseManager.findByPhone(args.phone);
            const updatedSlots = {
              ...conversationState.collectedSlots,
              phone: toPhoneDigits(args.phone || ""),
              ...(visitor ? { visitor_name: visitor.name } : {}),
            };
            if (visitor) {
              setConversationState(prev => ({
                ...prev,
                collectedSlots: {
                  ...prev.collectedSlots,
                  visitor_name: visitor.name,
                  phone: toPhoneDigits(args.phone || ""),
                },
              }));
              const nextSlot = getNextSlotToAsk(conversationState.intent, updatedSlots);
              result = {
                is_returning: true,
                last_visit: visitor.timestamp,
                name: visitor.name,
                collected_slots: updatedSlots,
                next_slot: nextSlot,
                message: `Returning visitor. Name auto-filled. Next: ask for ${nextSlot}. Do not ask for phone or name again.`,
              };
            } else {
              const nextSlot = getNextSlotToAsk(conversationState.intent, updatedSlots);
              result = {
                is_returning: false,
                collected_slots: updatedSlots,
                next_slot: nextSlot,
                message: `New visitor. Next: ask "May I know your name please?" Do not ask for phone again.`,
              };
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
                conversationState.collectedSlots.delivery_company ||
                conversationState.collectedSlots.delivery_partner ||
                conversationState.collectedSlots.company ||
                ""
              ).trim();
            const resolvedRecipientCompany =
              String(
                args.recipient_company ||
                conversationState.collectedSlots.recipient_company ||
                conversationState.collectedSlots.target_company ||
                conversationState.collectedSlots.department ||
                ""
              ).trim();
            const resolvedRecipientName =
              String(
                args.recipient_name ||
                conversationState.collectedSlots.recipient_name ||
                conversationState.collectedSlots.person_to_meet ||
                conversationState.collectedSlots.recipient ||
                conversationState.collectedSlots.meeting_with ||
                ""
              ).trim();
            const resolvedTrackingNumber =
              String(
                args.tracking_number ||
                conversationState.collectedSlots.reference_id ||
                ""
              ).trim();
            const resolvedParcelDescription =
              String(
                args.parcel_description ||
                conversationState.collectedSlots.purpose ||
                "Parcel delivery"
              ).trim();
            const resolvedDeliveryPersonName =
              String(
                args.delivery_person_name ||
                conversationState.collectedSlots.visitor_name ||
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

              const sayToVisitor =
                approval.decision === "allow"
                  ? "Say: Approval granted. Please use the delivery lift to go up."
                  : "Say: Please keep the parcel at the lobby. The team will collect it.";
              result = {
                status: approval.status,
                decision: approval.decision,
                message: approval.message,
                status_code: approval.statusCode || null,
                instruction: sayToVisitor,
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
                conversationState.collectedSlots.delivery_company ||
                conversationState.collectedSlots.delivery_partner ||
                conversationState.collectedSlots.company ||
                "Delivery"
              ).trim();
            const resolvedRecipientCompany =
              String(
                args.recipient_company ||
                conversationState.collectedSlots.recipient_company ||
                conversationState.collectedSlots.target_company ||
                conversationState.collectedSlots.department ||
                "Greenscape"
              ).trim();
            const resolvedRecipient =
              String(
                args.recipient ||
                conversationState.collectedSlots.recipient_name ||
                conversationState.collectedSlots.meeting_with ||
                conversationState.collectedSlots.recipient ||
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
            const hasCollectedAnySlot = Object.values(conversationState.collectedSlots).some(
              (value) => hasMeaningfulValue(value)
            );
            if (!hasSavedVisitorRef.current && hasCollectedAnySlot) {
              const readiness = getMissingFieldsBeforePhoto(
                conversationState.intent,
                conversationState.collectedSlots
              );
              const pending = [...readiness.missing];
              if (!visitorCheckInPhotoRef.current) {
                pending.push("photo");
              }
              if (
                readiness.flow === "delivery" &&
                !hasMeaningfulValue(conversationState.collectedSlots.approval_decision)
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
                  close_reason: "completed_by_system",
                });
                sessionIdRef.current = null;
              }
              setExpressionCue("goodbye_formal");
              console.log("Interaction ended. Auto-closing in 5 seconds...");
              setTimeout(() => {
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
            const photoReadiness = getMissingFieldsBeforePhoto(
              conversationState.intent,
              conversationState.collectedSlots
            );
            if (photoReadiness.missing.length > 0) {
              if (activeSessionId) {
                await DatabaseManager.logSessionEvent(activeSessionId, {
                  role: "system",
                  eventType: "camera_capture_blocked_missing_fields",
                  content: JSON.stringify({
                    flow: photoReadiness.flow,
                    missing_fields: photoReadiness.missing,
                    intent: conversationState.intent || "",
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
                    : "Collect name, phone, and whom they want to visit before photo capture.",
              };
            } else {
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
      }

      if (responses.length === 0) {
        return;
      }

      if (!connected || client.status !== "connected") {
        console.warn("Skipping tool response because live socket is not connected.");
        return;
      }

      if (process.env.NODE_ENV === "development") {
        logLatency("tool_response_sent", "tool_call_received");
      }
      client.sendToolResponse({ functionResponses: responses });
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client, connected, conversationState, disconnectSession, fireGesture, captureCheckInPhotoAfterCountdown, waitForCaptureSettled, persistSecuritySnapshotIfNeeded, stopCameraPreview]);

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

      {/* ── 3 Action Cards ──────────────────────────────────────── */}
      <div className="kiosk-cards-row">
        <div className="kiosk-card">
          <span className="material-symbols-outlined kiosk-card-icon">qr_code_2</span>
          <span className="kiosk-card-label">QR Code / Passcode</span>
        </div>
        <div className="kiosk-card">
          <span className="material-symbols-outlined kiosk-card-icon">person_add</span>
          <span className="kiosk-card-label">New Visitor</span>
        </div>
        <div className="kiosk-card">
          <span className="material-symbols-outlined kiosk-card-icon">local_shipping</span>
          <span className="kiosk-card-label">Delivery</span>
        </div>
      </div>

      {/* Video element for photo capture - visible when stream exists so camera can load */}
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
