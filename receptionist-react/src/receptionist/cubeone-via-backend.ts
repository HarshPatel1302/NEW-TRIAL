/**
 * When the kiosk is served from a different origin (e.g. Cloudflare Tunnel), browser calls to
 * CubeOne APIs fail CORS. Route those calls through the receptionist backend instead.
 */
export function cubeOneViaBackend(): boolean {
  const v = String(process.env.REACT_APP_CUBEONE_VIA_BACKEND || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function receptionistApiBase(): string {
  return String(process.env.REACT_APP_RECEPTIONIST_API_URL || "").trim().replace(/\/+$/, "");
}

export function cubeOneProxyConfigured(): boolean {
  if (!cubeOneViaBackend()) return false;
  // Backend may require x-api-key only when BACKEND_API_KEY is set; base URL is enough to try the proxy.
  return !!receptionistApiBase();
}

export function buildReceptionistHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra || {}),
  };
  const key = String(process.env.REACT_APP_RECEPTIONIST_API_KEY || "").trim();
  const kiosk = String(process.env.REACT_APP_KIOSK_ID || "").trim();
  if (key) headers["x-api-key"] = key;
  if (kiosk) headers["x-kiosk-id"] = kiosk;
  return headers;
}
