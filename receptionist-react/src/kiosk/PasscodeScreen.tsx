import { useCallback, useRef, useState } from "react";
import {
  CYBER_ONE_PRE_REGISTERED,
  resolveVisitorByPasscode,
  type PreRegisteredVisitor,
} from "./cyber-one-visitors";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"] as const;

type Props = {
  onBack: () => void;
  onSuccess: (visitor: PreRegisteredVisitor) => void;
};

export function PasscodeScreen({ onBack, onSuccess }: Props) {
  const [digits, setDigits] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const digitsRef = useRef("");
  digitsRef.current = digits;

  const append = useCallback(
    (key: string) => {
      setError(null);
      if (key === "⌫") {
        setDigits((d) => d.slice(0, -1));
        return;
      }
      if (key === "✓") {
        const d = digitsRef.current;
        if (d.length !== 6) {
          setError("Enter all 6 digits.");
          return;
        }
        void resolveVisitorByPasscode(d).then((visitor) => {
          if (!visitor) {
            setError("Invalid passcode.");
            return;
          }
          onSuccess(visitor);
        });
        return;
      }
      if (digitsRef.current.length >= 6) return;
      if (/^\d$/.test(key)) {
        setDigits((cur) => cur + key);
      }
    },
    [onSuccess],
  );

  const slots = Array.from({ length: 6 }, (_, i) => digits[i] ?? "");

  return (
    <div className="cyber-subscreen cyber-passcode-screen">
      <button type="button" className="cyber-back" onClick={onBack}>
        ← Back
      </button>
      <h1 className="cyber-subscreen-title">Enter your passcode</h1>
      <p className="cyber-subscreen-hint">
        Each invite QR has a paired temporary passcode. Use passcode if QR scan fails.
      </p>

      <div className="cyber-passcode-slots" aria-label="Passcode digits">
        {slots.map((ch, i) => (
          <span key={i} className={`cyber-passcode-slot ${ch ? "filled" : ""}`}>
            {ch ? "•" : ""}
          </span>
        ))}
      </div>

      {error ? <p className="cyber-error">{error}</p> : null}

      <div className="cyber-keypad" role="group" aria-label="Numeric keypad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`cyber-key ${k === "✓" ? "cyber-key-enter" : ""} ${k === "⌫" ? "cyber-key-back" : ""}`}
            onClick={() => append(k)}
          >
            {k === "⌫" ? <span className="material-symbols-outlined">backspace</span> : k}
          </button>
        ))}
      </div>

      <details className="cyber-dev-hint">
        <summary>Fallback demo passcodes (only if invite API is unavailable)</summary>
        <ul className="cyber-dev-hint-list">
          {CYBER_ONE_PRE_REGISTERED.map((v) => (
            <li key={v.passcode}>
              <strong>{v.passcode}</strong> — {v.fullName}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
