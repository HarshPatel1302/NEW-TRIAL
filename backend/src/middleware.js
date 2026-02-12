const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { query } = require("./db");

function getApiKey() {
  return (process.env.BACKEND_API_KEY || "").trim();
}

function buildAuthMiddleware() {
  const configuredApiKey = getApiKey();
  if (!configuredApiKey) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const headerKey = (req.header("x-api-key") || "").trim();
    const authHeader = (req.header("authorization") || "").trim();
    const bearerKey = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const provided = headerKey || bearerKey;

    if (!provided) {
      return res.status(401).json({ error: "Missing API key" });
    }

    const providedBuffer = Buffer.from(provided);
    const configuredBuffer = Buffer.from(configuredApiKey);
    const isMatch =
      providedBuffer.length === configuredBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, configuredBuffer);

    if (!isMatch) {
      return res.status(403).json({ error: "Invalid API key" });
    }

    return next();
  };
}

function buildRateLimiter() {
  const windowMs = Math.max(1000, Number(process.env.RATE_LIMIT_WINDOW_MS || 60000));
  const max = Math.max(100, Number(process.env.RATE_LIMIT_MAX || 600));
  return rateLimit({
    windowMs,
    max,
    skip: (req) => req.path.startsWith("/api/health"),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again shortly." },
  });
}

function buildAuditMiddleware() {
  return (req, res, next) => {
    const startedAt = Date.now();
    const requestId =
      req.header("x-request-id") ||
      req.header("x-correlation-id") ||
      crypto.randomUUID();

    res.setHeader("x-request-id", requestId);

    res.on("finish", () => {
      if (req.path.startsWith("/api/health")) {
        return;
      }

      const durationMs = Date.now() - startedAt;
      const method = req.method;
      const route = req.originalUrl || req.path;
      const statusCode = res.statusCode;
      const ipAddress =
        req.header("x-forwarded-for") ||
        req.socket?.remoteAddress ||
        "";
      const userAgent = req.header("user-agent") || "";
      const kioskId = req.header("x-kiosk-id") || "";

      void query(
        `INSERT INTO api_audit_logs
          (method, route, status_code, duration_ms, ip_address, user_agent, kiosk_id, request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          method,
          route,
          statusCode,
          durationMs,
          String(ipAddress).slice(0, 255),
          String(userAgent).slice(0, 512),
          String(kioskId).slice(0, 128),
          requestId,
        ]
      ).catch((error) => {
        // Avoid crashing request cycle if logging fails.
        console.warn("Audit log insert failed:", error.message);
      });
    });

    next();
  };
}

module.exports = {
  buildAuthMiddleware,
  buildRateLimiter,
  buildAuditMiddleware,
};
