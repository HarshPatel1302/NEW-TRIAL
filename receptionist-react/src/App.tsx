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
    // Set Model
    setModel("models/gemini-2.5-flash-native-audio-preview-12-2025");

    // Set Config (Tools, System Prompt, Generation Config)
    setConfig({
      generationConfig: {
        responseModalities: "AUDIO",
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Puck",
            },
          },
        },
      } as any,
      matchConfig: {
        tools: TOOLS,
        systemInstruction: {
          parts: [{ text: RECEPTIONIST_PERSONA.systemInstruction }],
        }
      } as any
      // Note: 'matchConfig' isn't standard, checking if SDK expects tools at root level of config or special place.
      // Usually defaults in Python SDK are 'tools' at root. TS SDK might strictly allow it.
      // Let's try root level casting to 'any' for the config object to be safe.
    } as any);
  }, [setConfig, setModel]);

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
            // Simulate notification
            await new Promise((resolve) => setTimeout(resolve, 1000));
            result = { status: "notified", message: `${args.staff_name} notified` };
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
            enableEditingSettings={false} // Hide settings to keep it simple
          >
          </ControlTray>
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
