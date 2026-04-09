/**
 * Structured CLI logging for full API flow: method, URL, redacted body, status, duration, redacted JSON response.
 * Large/binary fields (photos, data URLs) become length-only metadata. Secrets are stripped.
 *
 * BACKEND_HTTP_LOG:
 *   unset, non-production → "summary" (keys + sizes + short previews)
 *   0 | false | off       → disabled
 *   1 | true | on         → summary
 *   verbose | 2           → full redacted trees (still truncates huge strings)
 */

const crypto = require("crypto");

const SENSITIVE_KEY_RE =
  /^(password|passwd|pwd|secret|token|authorization|auth|api[_-]?key|bearer|credential)$/i;
const PHOTOISH_KEY_RE = /photo|image|dataurl|base64|cover|filecontent|blob/i;

function resolveMode() {
  const raw = String(process.env.BACKEND_HTTP_LOG || "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return null;
  }
  if (raw === "verbose" || raw === "2") {
    return "verbose";
  }
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return "summary";
  }
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return "summary";
}

const MAX_STRING_VERBOSE = 4000;
const MAX_STRING_SUMMARY = 240;

function truncateStr(s, max) {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…[truncated totalLen=${s.length}]`;
}

function redactValue(key, value, mode, depth) {
  if (depth > 14) {
    return "[max-depth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  const keyStr = String(key || "");

  if (SENSITIVE_KEY_RE.test(keyStr) || keyStr.toLowerCase() === "x-api-key") {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    if (/^data:image\//i.test(value) || (PHOTOISH_KEY_RE.test(keyStr) && value.length > 400)) {
      return `[binary/string len=${value.length} preview=data:${value.slice(5, 15)}…]`;
    }
    if (value.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 200))) {
      return `[likely-base64 len=${value.length}]`;
    }
    const max = mode === "verbose" ? MAX_STRING_VERBOSE : MAX_STRING_SUMMARY;
    return truncateStr(value, max);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, i) => redactValue(String(i), item, mode, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(k, v, mode, depth + 1);
    }
    return out;
  }

  return String(value);
}

function bodySummary(obj, mode) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return redactValue("_", obj, mode, 0);
  }
  const keys = Object.keys(obj);
  const sizes = {};
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") {
      sizes[k] = v.length;
    } else if (v && typeof v === "object") {
      sizes[k] = Array.isArray(v) ? `array(${v.length})` : "object";
    }
  }
  return {
    keys,
    fieldLengths: sizes,
    redacted: redactValue("_", obj, mode === "verbose" ? "verbose" : "summary", 0),
  };
}

function logLine(payload) {
  console.log(
    `[api-flow] ${JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })}`
  );
}

function shouldSkipPath(path) {
  const p = String(path || "");
  return (
    p === "/" ||
    p === "/favicon.ico" ||
    p.startsWith("/api/health") ||
    p === "/api/kiosk/proxy-status" ||
    p === "/api/kiosk/health"
  );
}

function buildHttpFlowLogger() {
  const mode = resolveMode();
  if (!mode) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const path = req.originalUrl || req.path || req.url || "";
    const pathname = path.split("?")[0];

    if (shouldSkipPath(pathname)) {
      return next();
    }

    const requestId =
      req.flowRequestId ||
      req.header("x-request-id") ||
      req.header("x-correlation-id") ||
      crypto.randomUUID();

    const t0 = Date.now();
    const base = {
      requestId,
      method: req.method,
      path: pathname,
      query:
        req.query && Object.keys(req.query).length > 0
          ? redactValue("query", req.query, mode, 0)
          : undefined,
    };

    const bodyIn =
      req.body && typeof req.body === "object" && Object.keys(req.body).length > 0
        ? mode === "verbose"
          ? redactValue("body", req.body, "verbose", 0)
          : bodySummary(req.body, "summary")
        : undefined;

    logLine({
      ...base,
      phase: "request",
      contentType: req.get("content-type") || null,
      kioskId: req.get("x-kiosk-id") || null,
      body: bodyIn,
    });

    let responseLogged = false;

    const origJson = res.json.bind(res);
    res.json = function flowLoggedJson(body) {
      if (!responseLogged) {
        responseLogged = true;
        const durationMs = Date.now() - t0;
        const payload =
          mode === "verbose"
            ? redactValue("body", body, "verbose", 0)
            : bodySummary(
                body && typeof body === "object" ? body : { _raw: body },
                "summary"
              );
        logLine({
          ...base,
          phase: "response",
          status: res.statusCode,
          durationMs,
          body: payload,
        });
      }
      return origJson(body);
    };

    const origSend = res.send.bind(res);
    res.send = function flowLoggedSend(chunk) {
      if (!responseLogged) {
        responseLogged = true;
        const durationMs = Date.now() - t0;
        let preview;
        if (Buffer.isBuffer(chunk)) {
          preview = `[buffer len=${chunk.length}]`;
        } else if (typeof chunk === "string") {
          preview =
            chunk.length > 400
              ? `${chunk.slice(0, 200)}…[text len=${chunk.length}]`
              : chunk;
        } else {
          preview = chunk;
        }
        logLine({
          ...base,
          phase: "response",
          status: res.statusCode,
          durationMs,
          body: preview,
          send: true,
        });
      }
      return origSend(chunk);
    };

    res.on("finish", () => {
      if (!responseLogged) {
        logLine({
          ...base,
          phase: "response",
          status: res.statusCode,
          durationMs: Date.now() - t0,
          body: null,
          note: "finish_without_json_or_send_body",
        });
      }
    });

    next();
  };
}

module.exports = { buildHttpFlowLogger, resolveMode };
