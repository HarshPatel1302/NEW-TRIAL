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

import { useRef, useState, useEffect } from "react";
import "./App.scss";
import { LiveAPIProvider, useLiveAPIContext } from "./contexts/LiveAPIContext";
import { Altair } from "./components/altair/Altair";
import ControlTray from "./components/control-tray/ControlTray";
import { LiveClientOptions } from "./types";
import { RECEPTIONIST_PERSONA } from "./receptionist/config";
import { TOOLS } from "./receptionist/tools";
import { DatabaseManager } from "./receptionist/database";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

function ReceptionistApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  // Add setModel to destructuring
  const { client, setConfig, setModel, connected } = useLiveAPIContext();

  // Initial Configuration
  useEffect(() => {
    // STRICT ALIGNMENT: Gemini 2.5 Preview + Flattened Config
    const modelId = "models/gemini-2.5-flash-native-audio-preview-12-2025";
    setModel(modelId);

    setConfig({
      model: modelId,
      responseModalities: "AUDIO",
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Puck",
          },
        },
      },
      systemInstruction: {
        parts: [{ text: RECEPTIONIST_PERSONA.systemInstruction }],
      },
      tools: TOOLS,
    } as any);
  }, [setConfig, setModel]);

  // AUTO-GREETING
  useEffect(() => {
    if (connected) {
      // Force the model to speak first
      client.send([{ text: "The user is here. Greet them immediately." }]);
    }
  }, [connected, client]);

  // Conversation state for slot-filling
  const [conversationState, setConversationState] = useState<{
    intent?: string;
    collectedSlots: Record<string, string>;
  }>({
    collectedSlots: {}
  });

  // Handle Tool Calls
  useEffect(() => {
    const onToolCall = async (toolCall: any) => {
      console.log("Tool Call:", toolCall);
      const responses = [];

      for (const fc of toolCall.functionCalls) {
        let result: any = { error: "Unknown tool" };
        const { name, args } = fc;

        try {
          if (name === "classify_intent") {
            // Record the detected intent
            setConversationState(prev => ({
              ...prev,
              intent: args.detected_intent
            }));
            result = {
              status: "success",
              intent: args.detected_intent,
              message: `Intent classified as ${args.detected_intent}`
            };
            console.log(`Intent classified: ${args.detected_intent}`);
          }
          else if (name === "collect_slot_value") {
            // Track collected slot values
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
            console.log(`Collected slot: ${args.slot_name} = ${args.value}`);
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
            console.log("Visitor saved:", visitor);
          }
          else if (name === "check_returning_visitor") {
            const visitor = DatabaseManager.findByPhone(args.phone);
            result = visitor
              ? { is_returning: true, last_visit: visitor.timestamp, name: visitor.name }
              : { is_returning: false };
          }
          else if (name === "route_to_department") {
            result = {
              status: "success",
              department: args.department,
              message: `Routing ${args.visitor_name} to ${args.department} for ${args.intent}`
            };
            console.log(`Routed to ${args.department}:`, args);
          }
          else if (name === "request_approval") {
            console.log("Requesting approval...");
            // Simulate approval request with delay
            await new Promise((resolve) => setTimeout(resolve, 3000));
            result = {
              status: "approved",
              message: `Approval granted for ${args.visitor_name}`
            };
            console.log("Approval granted");
          }
          else if (name === "check_staff_availability") {
            // Simulate staff availability check
            // In production, this would check a real calendar/availability system
            const isAvailable = Math.random() > 0.3; // 70% available
            result = {
              available: isAvailable,
              staff_name: args.staff_name,
              message: isAvailable
                ? `${args.staff_name} is available`
                : `${args.staff_name} is currently unavailable`
            };
            console.log(`Staff availability: ${args.staff_name} - ${isAvailable ? 'Available' : 'Unavailable'}`);
          }
          else if (name === "notify_staff") {
            console.log("Waiting for approval...");
            // Simulate approval delay (5 seconds + 1s buffer)
            await new Promise((resolve) => setTimeout(resolve, 6000));
            result = { status: "approved", message: "Approval granted by " + args.staff_name };
          }
          else if (name === "log_delivery") {
            console.log("Logging delivery:", args);
            // In production, this would save to a delivery log system
            // For now, we'll save it to the visitor database
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
            // Wait 5 seconds for the final spoken response to play out, then disconnect
            console.log("Interaction ended. Resetting in 5 seconds...");
            setTimeout(() => {
              client.disconnect();
              setVideoStream(null); // Reset video stream if needed
              // Reset conversation state
              setConversationState({ collectedSlots: {} });
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
              console.log("Photo Captured:", dataUrl.substring(0, 50) + "...");
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
  }, [client, conversationState]);

  return (
    <div className="App" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
      <main>
        <div className="main-app-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>

          <h1 style={{ color: 'white', fontFamily: 'sans-serif', textAlign: 'center' }}>
            Greenscape Receptionist
          </h1>

          <div style={{ margin: '40px 0', transform: 'scale(1.5)' }}>
            <Altair />
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
              display: videoStream ? "block" : "none" // Only show when stream is active
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
