/**
 * Shared truthy parsing for feature flags (KIOSK_GATE_PROXY_ENABLED, etc.).
 * Accepts: 1, true, yes, on (case-insensitive). Empty / other → false.
 * @param {string | undefined | null} raw
 * @returns {boolean}
 */
function parseEnvBoolTruthy(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

module.exports = { parseEnvBoolTruthy };
