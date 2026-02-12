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
import { GestureController, GestureState } from "./components/Avatar3D/gesture-controller";
import { ExpressionCue } from "./components/Avatar3D/facial-types";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

type QueuedGesture = {
  gesture: GestureState;
  duration?: number;
  priority: number;
  createdAt: number;
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

function ReceptionistApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<Avatar3DRef>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [lastAudioText, setLastAudioText] = useState<string>("");
  const [expressionCue, setExpressionCue] = useState<ExpressionCue>("neutral_professional");
  const prevAssistantAudioPlayingRef = useRef(false);

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
    };
  }, [resolveGestureDuration]);

  const fireGesture = useCallback((
    gesture: GestureState,
    duration?: number,
    priority = 1
  ) => {
    enqueueGesture(gesture, { duration, priority });
  }, [enqueueGesture]);

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

  // ── AUTO-GREETING ─────────────────────────────────────────────────
  useEffect(() => {
    let cueTimer: ReturnType<typeof setTimeout> | null = null;
    if (connected) {
      setExpressionCue("welcome_warm");
      enqueueGesture("waving", { duration: 6.0, priority: 3, force: true });
      client.send([{ text: "The user is here. Greet them immediately." }]);

      cueTimer = setTimeout(() => {
        setExpressionCue("listening_attentive");
      }, 1800);
    } else {
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
      prevAssistantAudioPlayingRef.current = false;
      return;
    }

    if (assistantAudioPlaying && !prev) {
      if (speechClearTimerRef.current) {
        clearTimeout(speechClearTimerRef.current);
      }
      setExpressionCue("explaining_confident");
      gestureControllerRef.current?.handleEvent({ type: 'audioStart' });
    }

    if (!assistantAudioPlaying && prev) {
      setExpressionCue("listening_attentive");
      gestureControllerRef.current?.handleEvent({ type: 'audioStop' });
      if (speechClearTimerRef.current) {
        clearTimeout(speechClearTimerRef.current);
      }
      speechClearTimerRef.current = setTimeout(() => {
        setLastAudioText("");
      }, 1800);
    }

    prevAssistantAudioPlayingRef.current = assistantAudioPlaying;
  }, [assistantAudioPlaying, connected]);

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
          }
          else if (name === "collect_slot_value") {
            setConversationState(prev => ({
              ...prev,
              collectedSlots: {
                ...prev.collectedSlots,
                [args.slot_name]: args.value
              }
            }));
            result = {
              status: "success",
              slot: args.slot_name,
              value: args.value
            };
          }
          else if (name === "save_visitor_info") {
            const visitor = await DatabaseManager.saveVisitor({
              name: args.name,
              phone: args.phone || conversationState.collectedSlots.phone || "N/A",
              meetingWith: args.meeting_with || conversationState.collectedSlots.person_to_meet || "N/A",
              intent: args.intent || conversationState.intent || "unknown",
              department: args.department,
              purpose: args.purpose,
              company: args.company,
              appointmentTime: args.appointment_time,
              referenceId: args.reference_id,
              notes: args.notes
            });
            result = { status: "success", visitor_id: visitor.id };
          }
          else if (name === "check_returning_visitor") {
            const visitor = DatabaseManager.findByPhone(args.phone);
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
            await new Promise((resolve) => setTimeout(resolve, 3000));
            result = {
              status: "approved",
              message: `Approval granted for ${args.visitor_name}`
            };
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
            await new Promise((resolve) => setTimeout(resolve, 6000));
            result = { status: "approved", message: "Approval granted by " + args.staff_name };
          }
          else if (name === "log_delivery") {
            await DatabaseManager.saveVisitor({
              name: `Delivery from ${args.company}`,
              phone: "N/A",
              meetingWith: args.recipient || "N/A",
              intent: "delivery",
              department: args.department,
              purpose: "Delivery",
              company: args.company,
              referenceId: args.tracking_number,
              notes: args.description
            });
            result = {
              status: "success",
              message: `Delivery logged for ${args.department}`
            };
          }
          else if (name === "end_interaction") {
            setExpressionCue("goodbye_formal");
            fireGesture('bow', undefined, 3);
            console.log("Interaction ended. Resetting in 5 seconds...");
            setTimeout(() => {
              client.disconnect();
              setVideoStream(null);
              setConversationState({ collectedSlots: {} });
              setLastAudioText("");
              setExpressionCue("neutral_professional");
            }, 6000);
            result = { status: "success", message: "Resetting kiosk." };
          }
          else if (name === "capture_photo") {
            if (videoRef.current) {
              const canvas = document.createElement("canvas");
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
              canvas.toDataURL("image/jpeg");
              result = { status: "success", message: "Photo captured successfully." };
            } else {
              result = { status: "error", message: "Camera not available." };
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

      client.sendToolResponse({ functionResponses: responses });
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client, conversationState, fireGesture]);

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
            supportsVideo={true}
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
  return (
    <LiveAPIProvider options={apiOptions}>
      <ReceptionistApp />
    </LiveAPIProvider>
  );
}

export default App;
