/**
 * Resolves the receptionist JSON API base (no trailing slash).
 *
 * - Default `/api`: same origin as the page → works with CRA dev proxy + Cloudflare Tunnel
 *   (remote browsers must not call localhost:5050 on *their* machine).
 * - If REACT_APP_RECEPTIONIST_API_URL is an absolute URL pointing at localhost but the page
 *   is loaded from a non-local host (e.g. *.trycloudflare.com), force same-origin `/api`
 *   so tunnel + phone testing works without editing .env.
 * - Absolute non-local URLs are passed through (production / custom gateways).
 */

function stripTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

function isLocalhostBackendUrl(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url);
}

export function resolveReceptionistApiBaseUrl(): string {
  const envRaw =
    typeof process !== "undefined" && process.env.REACT_APP_RECEPTIONIST_API_URL !== undefined
      ? String(process.env.REACT_APP_RECEPTIONIST_API_URL).trim()
      : "";
  const pathDefault = "/api";
  const token = envRaw.length > 0 ? envRaw : pathDefault;

  if (/^https?:\/\//i.test(token)) {
    let abs = stripTrailingSlashes(token);
    if (typeof window !== "undefined" && window.location?.hostname) {
      const h = window.location.hostname;
      const pageIsNonLocal = h !== "localhost" && h !== "127.0.0.1";
      if (pageIsNonLocal && isLocalhostBackendUrl(`${abs}/`)) {
        return stripTrailingSlashes(`${window.location.origin.replace(/\/$/, "")}/api`);
      }
    }
    return abs;
  }

  const path = token.startsWith("/") ? token : `/${token}`;

  if (typeof window !== "undefined" && window.location?.origin) {
    return stripTrailingSlashes(`${window.location.origin.replace(/\/$/, "")}${path}`);
  }

  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return stripTrailingSlashes(`http://127.0.0.1:5050${path}`);
  }

  return stripTrailingSlashes(`http://127.0.0.1:3000${path}`);
}
