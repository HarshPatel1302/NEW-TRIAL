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
import { GestureController } from "./components/Avatar3D/gesture-controller";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

function ReceptionistApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<Avatar3DRef>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [lastAudioText, setLastAudioText] = useState<string>("");
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const { client, setConfig, setModel, connected, lipSyncRef } = useLiveAPIContext();

  // ── Gesture Controller ────────────────────────────────────────────
  const gestureControllerRef = useRef<GestureController | null>(null);

  // Stable callback ref for playAnimation (avoids recreating controller)
  const playAnimationRef = useRef<Avatar3DRef['playAnimation'] | null>(null);
  useEffect(() => {
    playAnimationRef.current = (name: string, options?: { loop?: boolean; duration?: number }) => {
      avatarRef.current?.playAnimation(name, options);
    };
  });

  // Create gesture controller once
  useEffect(() => {
    gestureControllerRef.current = new GestureController(
      (name, options) => playAnimationRef.current?.(name, options)
    );
    return () => {
      gestureControllerRef.current?.destroy();
    };
  }, []);

  // Helper to fire gesture events
  const fireGesture = useCallback((gesture: string, duration?: number) => {
    gestureControllerRef.current?.handleEvent({
      type: 'gesture',
      gesture: gesture as any,
      duration,
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

  // ── AUTO-GREETING ─────────────────────────────────────────────────
  useEffect(() => {
    if (connected) {
      fireGesture('waving', 2);
      client.send([{ text: "The user is here. Greet them immediately." }]);
    }
  }, [connected, client, fireGesture]);

  // ── AUDIO PLAYBACK TRACKING → Gesture Controller ──────────────────
  useEffect(() => {
    const onAudioChunk = () => {
      if (!isAudioPlaying) {
        setIsAudioPlaying(true);
        gestureControllerRef.current?.handleEvent({ type: 'audioStart' });
      }
    };

    const onTurnComplete = () => {
      setIsAudioPlaying(false);
      gestureControllerRef.current?.handleEvent({ type: 'audioStop' });
    };

    const onInterrupted = () => {
      setIsAudioPlaying(false);
      gestureControllerRef.current?.handleEvent({ type: 'audioStop' });
    };

    client.on('audio', onAudioChunk);
    client.on('turncomplete', onTurnComplete);
    client.on('interrupted', onInterrupted);

    return () => {
      client.off('audio', onAudioChunk);
      client.off('turncomplete', onTurnComplete);
      client.off('interrupted', onInterrupted);
    };
  }, [client, isAudioPlaying]);

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

            // Gesture based on intent
            if (args.detected_intent === 'sales_inquiry' || args.detected_intent === 'first_time_visit') {
              fireGesture('waving', 2);
            }
            if (args.detected_intent === 'meeting_request' || args.detected_intent === 'appointment') {
              fireGesture('nodYes', 1.5);
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
            fireGesture('pointing', 2);
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
            fireGesture('bow', 3);
            console.log("Interaction ended. Resetting in 5 seconds...");
            setTimeout(() => {
              client.disconnect();
              setVideoStream(null);
              setConversationState({ collectedSlots: {} });
              setIsAudioPlaying(false);
            }, 6000);
            result = { status: "success", message: "Resetting kiosk." };
          }
          else if (name === "capture_photo") {
            if (videoRef.current) {
              const canvas = document.createElement("canvas");
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
              const dataUrl = canvas.toDataURL("image/jpeg");
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
    <div className="App" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
      <main>
        <div className="main-app-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>

          <h1 style={{ color: 'white', fontFamily: 'sans-serif', textAlign: 'center' }}>
            Greenscape Receptionist
          </h1>

          <div style={{ margin: '40px 0', width: '100%' }}>
            <Avatar3D
              ref={avatarRef}
              connected={connected}
              speechText={lastAudioText}
              isAudioPlaying={isAudioPlaying}
              lipSyncRef={lipSyncRef}
            />
          </div>

          <div style={{ color: '#aaa', marginBottom: 20 }}>
            {connected ? "Listening..." : "Click Start to begin"}
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
