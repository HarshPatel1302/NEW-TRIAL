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
import cn from "classnames";
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
  const { client, setConfig, setModel, connected, connect } = useLiveAPIContext();

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
    } as any);
  }, [setConfig, setModel]);

  // AUTO-GREETING
  useEffect(() => {
    if (connected) {
      // Force the model to speak first
      client.send([{ text: "The user is here. Greet them immediately." }]);
    }
  }, [connected, client]);

  // Handle Tool Calls
  useEffect(() => {
    const onToolCall = async (toolCall: any) => {
      console.log("Tool Call:", toolCall);
      const responses = [];

      for (const fc of toolCall.functionCalls) {
        let result: any = { error: "Unknown tool" };
        const { name, args } = fc;

        try {
          if (name === "save_visitor_info") {
            const visitor = DatabaseManager.saveVisitor({
              name: args.name,
              phone: args.phone,
              meetingWith: args.meeting_with,
            });
            result = { status: "success", visitor_id: visitor.id };
          } else if (name === "check_returning_visitor") {
            const visitor = DatabaseManager.findByPhone(args.phone);
            result = visitor
              ? { is_returning: true, last_visit: visitor.timestamp, name: visitor.name }
              : { is_returning: false };
          } else if (name === "notify_staff") {
            console.log("Waiting for approval...");
            // Simulate approval delay (5 seconds + 1s buffer)
            await new Promise((resolve) => setTimeout(resolve, 6000));
            result = { status: "approved", message: "Approval granted by " + args.staff_name };
          } else if (name === "end_interaction") {
            // Wait 5 seconds for the final spoken response to play out, then disconnect
            console.log("Interaction ended. Resetting in 5 seconds...");
            setTimeout(() => {
              client.disconnect();
              setVideoStream(null); // Reset video stream if needed
            }, 6000);
            result = { status: "success", message: "Resetting kiosk." };
          } else if (name === "capture_photo") {
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
  }, [client]);

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
