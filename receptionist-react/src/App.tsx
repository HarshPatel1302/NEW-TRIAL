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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const { client, setConfig, setModel, connected, lipSyncRef, assistantAudioPlaying } = useLiveAPIContext();

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

  const openTemporaryCameraStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return null;
    }
    const getUserMediaPromise = navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
      },
      audio: false,
    });
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
    return stream;
  }, []);

  const captureCheckInPhotoAfterCountdown = useCallback(async (source: string, countdownMs = 5000) => {
    if (captureInFlightRef.current) {
      return false;
    }

    captureInFlightRef.current = true;
    try {
      const stream = await openTemporaryCameraStream();
      if (!stream) {
        return false;
      }
      if (countdownMs > 0) {
        await sleep(countdownMs);
      }
      const jpegDataUrl = await captureVisitorPhotoJpeg();
      if (!jpegDataUrl) {
        return false;
      }

      visitorCheckInPhotoRef.current = jpegDataUrl;
      sessionPhotoRef.current = jpegDataUrl;

      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) {
        await DatabaseManager.logSessionEvent(activeSessionId, {
          role: "system",
          eventType: "visitor_photo_captured",
          content: `Captured check-in JPEG snapshot (${source}).`,
        });
      }

      return true;
    } finally {
      captureInFlightRef.current = false;
      stopCameraPreview();
    }
  }, [captureVisitorPhotoJpeg, openTemporaryCameraStream, stopCameraPreview]);

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
  }, [connected, persistSecuritySnapshotIfNeeded, stopCameraPreview, waitForCaptureSettled]);

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
      console.log("Tool Call:", toolCall);
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
            setConversationState(prev => ({
              ...prev,
              intent: args.detected_intent
            }));
            setExpressionCue("listening_attentive");

            // Gesture based on intent
            if (args.detected_intent === 'sales_inquiry' || args.detected_intent === 'first_time_visit') {
              fireGesture('waving', undefined, 2);
            }
            if (
              args.detected_intent === 'meeting_request' ||
              args.detected_intent === 'meet_person' ||
              args.detected_intent === 'appointment'
            ) {
              setExpressionCue("confirming_yes");
              fireGesture('nodYes', undefined, 2);
            }

            result = {
              status: "success",
              intent: args.detected_intent,
              message: `Intent classified as ${args.detected_intent}`
            };
            if (activeSessionId) {
              void DatabaseManager.updateSession(activeSessionId, { intent: args.detected_intent });
            }
          }
          else if (name === "collect_slot_value") {
            const slotName = String(args.slot_name || "").trim().toLowerCase();
            const slotValue = String(args.value || "").trim();
            const shouldResolvePurposeCategory = [
              "purpose",
              "purpose_category",
              "category",
              "company",
              "delivery_company",
              "delivery_partner",
            ].includes(slotName);
            const matchedPurpose = shouldResolvePurposeCategory
              ? findPurposeCategoryMatch(slotValue)
              : null;
            const shouldResolveMemberDestination = [
              "where_to_go",
              "person_to_meet",
              "meeting_with",
              "whom_to_meet",
              "recipient",
              "recipient_name",
              "recipient_company",
            ].includes(slotName);
            const memberLookupQueryContext =
              conversationState.collectedSlots.where_to_go ||
              conversationState.collectedSlots.came_from ||
              conversationState.collectedSlots.company ||
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

            setConversationState(prev => ({
              ...prev,
              collectedSlots: {
                ...prev.collectedSlots,
                [slotName]: slotValue,
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
          }
          else if (name === "save_visitor_info") {
            const resolvedIntent = args.intent || conversationState.intent || "unknown";
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
              conversationState.collectedSlots.person_to_meet ||
              conversationState.collectedSlots.meeting_with ||
              conversationState.collectedSlots.whom_to_meet ||
              "N/A";
            const resolvedCameFrom =
              args.came_from ||
              args.company ||
              conversationState.collectedSlots.came_from ||
              conversationState.collectedSlots.origin ||
              conversationState.collectedSlots.company ||
              "N/A";
            const resolvedPurpose =
              args.purpose ||
              conversationState.collectedSlots.purpose ||
              "";
            const resolvedPurposeCategoryId = Number(
              conversationState.collectedSlots.purpose_category_id || ""
            );
            const resolvedPurposeCategoryName =
              conversationState.collectedSlots.purpose_category_name || "";
            const resolvedPurposeSubCategoryId = Number(
              conversationState.collectedSlots.purpose_sub_category_id || ""
            );
            const resolvedPurposeSubCategoryName =
              conversationState.collectedSlots.purpose_sub_category_name || "";
            const resolvedWhereToGo =
              args.where_to_go ||
              conversationState.collectedSlots.where_to_go ||
              "";
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

            if (!resolvedMemberIdsCsv && (hasMeaningfulValue(resolvedMeetingWith) || hasMeaningfulValue(resolvedWhereToGo))) {
              const memberLookup = await resolveMembersForDestination(
                [resolvedWhereToGo, resolvedMeetingWith]
                  .filter((value) => hasMeaningfulValue(value))
                  .join(" "),
                {
                  secondaryQuery: resolvedCameFrom,
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
                Number.isFinite(resolvedPurposeCategoryId) && resolvedPurposeCategoryId > 0
                  ? `purpose_category_id:${resolvedPurposeCategoryId}`
                  : "",
                Number.isFinite(resolvedPurposeSubCategoryId) && resolvedPurposeSubCategoryId > 0
                  ? `purpose_sub_category_id:${resolvedPurposeSubCategoryId}`
                  : "",
                hasMeaningfulValue(resolvedWhereToGo)
                  ? `where_to_go:${String(resolvedWhereToGo).trim()}`
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
              ]
                .filter(Boolean)
                .join(" | ");
            const missingFields: string[] = [];
            if (!hasMeaningfulValue(resolvedName) || String(resolvedName).trim().toLowerCase() === "visitor") {
              missingFields.push("name");
            }
            if (!isValidVisitorPhone(resolvedPhone)) {
              missingFields.push("phone");
            }
            if (!hasMeaningfulValue(resolvedWhereToGo)) {
              missingFields.push("where_to_go");
            }
            if (!hasMeaningfulValue(resolvedMeetingWith)) {
              missingFields.push("meeting_with");
            }
            if (!hasMeaningfulValue(resolvedCameFrom)) {
              missingFields.push("came_from");
            }

            if (missingFields.length > 0) {
              result = {
                status: "need_more_info",
                missing_fields: missingFields,
                message:
                  "Collect name, phone, where_to_go, meeting_with, and came_from before saving. Ask one missing field at a time.",
              };
            } else if (!visitorCheckInPhotoRef.current) {
              result = {
                status: "need_photo_capture",
                missing_fields: ["photo"],
                message:
                  "Ask the visitor to stand still for 5 seconds, call capture_photo, then save_visitor_info again.",
              };
            } else {
              const finalVisitorPhoto = visitorCheckInPhotoRef.current || args.photo || undefined;
              const visitor = await DatabaseManager.saveVisitor({
                name: resolvedName,
                phone: normalizedPhone,
                meetingWith: resolvedMeetingWith,
                intent: resolvedIntent,
                department: args.department,
                purpose: resolvedPurpose,
                company: resolvedCameFrom,
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
                purpose_category_id: Number.isFinite(resolvedPurposeCategoryId) && resolvedPurposeCategoryId > 0
                  ? resolvedPurposeCategoryId
                  : null,
                purpose_category_name: resolvedPurposeCategoryName || null,
                purpose_sub_category_id:
                  Number.isFinite(resolvedPurposeSubCategoryId) && resolvedPurposeSubCategoryId > 0
                    ? resolvedPurposeSubCategoryId
                    : null,
                purpose_sub_category_name: resolvedPurposeSubCategoryName || null,
                member_ids: resolvedMemberIdsCsv
                  ? resolvedMemberIdsCsv.split(",").map((id: string) => Number(id)).filter((id: number) => Number.isFinite(id))
                  : [],
                matched_members: resolvedMemberObjects,
              };
              if (activeSessionId) {
                void DatabaseManager.updateSession(activeSessionId, {
                  visitorId: visitor.id,
                  intent: resolvedIntent,
                });
              }

              // External API sync is best-effort and must not block speech/tool response.
              void (async () => {
                const externalSync = await syncWalkInDetailsToExternalApis({
                  name: resolvedName,
                  phone: normalizedPhone,
                  cameFrom: resolvedCameFrom,
                  meetingWith: resolvedMeetingWith,
                  localVisitorId: visitor.id,
                  intent: resolvedIntent,
                  sessionId: activeSessionId,
                  photo: finalVisitorPhoto,
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
            result = visitor
              ? { is_returning: true, last_visit: visitor.timestamp, name: visitor.name }
              : { is_returning: false };
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

            if (missingFields.length > 0) {
              result = {
                status: "need_more_info",
                missing_fields: missingFields,
                message:
                  "Collect delivery company, recipient company, and recipient name before requesting delivery approval.",
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
                conversationState.collectedSlots.person_to_meet ||
                conversationState.collectedSlots.recipient ||
                "N/A"
              ).trim();
            const resolvedDepartment = String(args.department || "Administration").trim() || "Administration";
            const resolvedDecision = String(args.approval_decision || "").trim().toLowerCase();
            const deliveryNotes = [String(args.description || "").trim()];
            if (resolvedRecipientCompany) {
              deliveryNotes.push(`recipient_company:${resolvedRecipientCompany}`);
            }
            if (resolvedDecision) {
              deliveryNotes.push(`approval_decision:${resolvedDecision}`);
            }
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
              setConversationState({ collectedSlots: {} });
              visitorCheckInPhotoRef.current = null;
              setLastAudioText("");
              setExpressionCue("neutral_professional");
            }, 6000);
            result = { status: "success", message: "Resetting kiosk." };
          }
          else if (name === "capture_photo") {
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
                message: "Camera not available. Ensure video permission is enabled and try again.",
              };
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

      client.sendToolResponse({ functionResponses: responses });
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client, connected, conversationState, fireGesture, captureCheckInPhotoAfterCountdown, persistSecuritySnapshotIfNeeded, stopCameraPreview]);

  return (
    <div className="app-container">
      <main className="app-main">
        <div className="main-app-area">
          <h1 className="app-title">Greenscape Receptionist</h1>

          <div className="avatar-wrapper">
            <Avatar3D
              ref={avatarRef}
              connected={connected}
              speechText={lastAudioText}
              expressionCue={expressionCue}
              isAudioPlaying={assistantAudioPlaying}
              lipSyncRef={lipSyncRef}
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
