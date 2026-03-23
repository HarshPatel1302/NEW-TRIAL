import { useState } from "react";
import {
  CYBER_ONE_PRE_REGISTERED,
  findVisitorByQrToken,
  type PreRegisteredVisitor,
} from "./cyber-one-visitors";

type Props = {
  onBack: () => void;
  onRecognized: (visitor: PreRegisteredVisitor) => void;
};

export function QrScanScreen({ onBack, onRecognized }: Props) {
  const [simulatedInput, setSimulatedInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tryRecognize = (token: string) => {
    const v = findVisitorByQrToken(token);
    if (!v) {
      setError("Code not recognized. Try a visitor code from the list below.");
      return;
    }
    setError(null);
    onRecognized(v);
  };

  return (
    <div className="cyber-subscreen">
      <button type="button" className="cyber-back" onClick={onBack}>
        ← Back
      </button>
      <h1 className="cyber-subscreen-title">Show your code</h1>
      <p className="cyber-subscreen-hint">Align your QR in the frame. On PCs without a camera, simulate a scan below.</p>

      <div className="cyber-camera-frame" aria-label="Camera preview (simulated)">
        <div className="cyber-camera-placeholder">
          <span className="material-symbols-outlined cyber-camera-icon">photo_camera</span>
          <p>Camera preview</p>
          <span className="cyber-camera-badge">Simulated on this device</span>
        </div>
      </div>

      <div className="cyber-simulate-panel">
        <label className="cyber-simulate-label" htmlFor="qr-sim-input">
          Simulate scan — enter visitor code
        </label>
        <div className="cyber-simulate-row">
          <input
            id="qr-sim-input"
            className="cyber-simulate-input"
            value={simulatedInput}
            onChange={(e) => setSimulatedInput(e.target.value)}
            placeholder="e.g. CY1-AMIT-01"
            autoComplete="off"
          />
          <button type="button" className="cyber-primary-btn" onClick={() => tryRecognize(simulatedInput)}>
            Submit
          </button>
        </div>
        {error ? <p className="cyber-error">{error}</p> : null}
        <p className="cyber-simulate-hint">Quick test — tap a code:</p>
        <div className="cyber-chip-row">
          {CYBER_ONE_PRE_REGISTERED.map((v) => (
            <button
              key={v.qrToken}
              type="button"
              className="cyber-chip"
              onClick={() => tryRecognize(v.qrToken)}
            >
              {v.qrToken}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
