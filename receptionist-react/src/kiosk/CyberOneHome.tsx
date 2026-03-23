type Props = {
  onSelectQr: () => void;
  onSelectPasscode: () => void;
  onSelectVirtual: () => void;
  flashMessage?: string | null;
};

export function CyberOneHome({ onSelectQr, onSelectPasscode, onSelectVirtual, flashMessage }: Props) {
  return (
    <div className="cyber-home">
      <header className="cyber-home-header">
        <h1 className="cyber-home-title">Welcome to Cyber One</h1>
        {flashMessage ? (
          <p className="cyber-home-flash" role="status">
            {flashMessage}
          </p>
        ) : null}
      </header>
      <div className="cyber-home-tiles">
        <button type="button" className="cyber-tile" onClick={onSelectQr}>
          <span className="material-symbols-outlined cyber-tile-icon">qr_code_scanner</span>
          <span className="cyber-tile-label">QR Code</span>
        </button>
        <button type="button" className="cyber-tile" onClick={onSelectPasscode}>
          <span className="material-symbols-outlined cyber-tile-icon">pin</span>
          <span className="cyber-tile-label">Passcode</span>
        </button>
        <button type="button" className="cyber-tile" onClick={onSelectVirtual}>
          <span className="material-symbols-outlined cyber-tile-icon">support_agent</span>
          <span className="cyber-tile-label">Virtual Receptionist</span>
        </button>
      </div>
    </div>
  );
}
