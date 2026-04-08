/**
 * Aggregates gate login, visitor search, and member directory behind the receptionist API.
 * One shared token + optional in-memory member index for search-first resolution.
 *
 * Enable with KIOSK_GATE_PROXY_ENABLED truthy (1, true, yes, on — see parse-env-bool.js).
 * All /api/kiosk/* JSON responses use HTTP 200 with ok / errorCode / proxyEnabled for client fallback.
 */

const { parseEnvBoolTruthy } = require("./parse-env-bool");

const REQUEST_TIMEOUT_MS = 12000;
const MEMBER_INDEX_TTL_MS = 5 * 60 * 1000;
const TOKEN_FALLBACK_TTL_MS = 25 * 60 * 1000;

let cachedToken = "";
let tokenValidUntil = 0;
let memberIndex = { fetchedAt: 0, rows: [], flat: [] };

function trimSlash(s) {
  return String(s || "").replace(/\/+$/, "");
}

function isEnabled() {
  return parseEnvBoolTruthy(process.env.KIOSK_GATE_PROXY_ENABLED);
}

function gateConfig() {
  const baseUrl = trimSlash(process.env.KIOSK_GATE_BASE_URL || process.env.REACT_APP_GATE_API_BASE_URL || "");
  const loginUrl = String(
    process.env.KIOSK_GATE_LOGIN_URL ||
      process.env.REACT_APP_GATE_LOGIN_API_URL ||
      ""
  ).trim();
  const username = String(process.env.KIOSK_GATE_USERNAME || "").trim();
  const password = String(process.env.KIOSK_GATE_PASSWORD || "").trim();
  const companyId = String(process.env.KIOSK_GATE_COMPANY_ID || process.env.REACT_APP_WALKIN_COMPANY_ID || "8196");
  const memberListUrl = String(
    process.env.KIOSK_MEMBER_LIST_URL ||
      process.env.REACT_APP_MEMBER_LIST_API_URL ||
      ""
  ).trim();
  const visitorSearchOverride = String(
    process.env.KIOSK_VISITOR_SEARCH_URL || process.env.REACT_APP_VISITOR_SEARCH_URL || ""
  ).trim();
  return { baseUrl, loginUrl, username, password, companyId, memberListUrl, visitorSearchOverride };
}

/** Safe for JSON — no secrets. */
function gateConfigDiagnostics(cfg) {
  return {
    hasBaseUrl: !!cfg.baseUrl,
    hasLoginUrl: !!cfg.loginUrl,
    hasUsername: !!cfg.username,
    hasPassword: !!cfg.password,
    companyId: String(cfg.companyId || "").trim(),
    hasMemberListUrl: !!cfg.memberListUrl,
    hasVisitorSearchOverride: !!cfg.visitorSearchOverride,
  };
}

function gateLoginConfigured(cfg) {
  return !!(cfg.loginUrl && cfg.username && cfg.password);
}

function tokenCachedNow() {
  const now = Date.now();
  return !!(cachedToken && now < tokenValidUntil - 60_000);
}

function memberIndexWarmNow() {
  const now = Date.now();
  if (!memberIndex.fetchedAt) return false;
  return now - memberIndex.fetchedAt < MEMBER_INDEX_TTL_MS;
}

function memberIndexAgeMs() {
  if (!memberIndex.fetchedAt) return null;
  return Date.now() - memberIndex.fetchedAt;
}

function buildHealthPayload() {
  const cfg = gateConfig();
  const enabled = isEnabled();
  const gateOk = gateLoginConfigured(cfg);
  const memberListConfigured = !!cfg.memberListUrl;
  let errorCode = null;
  let errorMessage = null;
  if (enabled && !gateOk) {
    errorCode = "GATE_CONFIG_INCOMPLETE";
    errorMessage = "Gate login URL or credentials are missing.";
  }
  return {
    ok: enabled && gateOk,
    proxyEnabled: enabled,
    gateLoginConfigured: gateOk,
    memberListConfigured,
    tokenCached: tokenCachedNow(),
    memberIndexWarm: memberListConfigured ? memberIndexWarmNow() : null,
    memberIndexAgeMs: memberIndex.fetchedAt ? memberIndexAgeMs() : null,
    memberIndexSize: memberIndex.flat.length,
    companyId: String(cfg.companyId || "").trim(),
    errorCode,
    errorMessage,
  };
}

function logKioskProxyBootSummary() {
  const cfg = gateConfig();
  const cid = String(cfg.companyId || "").trim() || "(unset)";
  console.info(
    `[kiosk-gate] startup proxyEnabled=${isEnabled()} gateLoginConfigured=${gateLoginConfigured(cfg)} memberListConfigured=${!!cfg.memberListUrl} companyId=${cid}`
  );
}

/** HTTP 200 + consistent envelope when proxy is off (client fallback). */
function sendProxyDisabled(res) {
  const cfg = gateConfig();
  return res.status(200).json({
    ok: false,
    proxyEnabled: false,
    errorCode: "PROXY_DISABLED",
    errorMessage: "Kiosk gate proxy is disabled on this server. Set KIOSK_GATE_PROXY_ENABLED to 1, true, yes, or on.",
    gateLoginConfigured: gateLoginConfigured(cfg),
    memberListConfigured: !!cfg.memberListUrl,
    config: gateConfigDiagnostics(cfg),
  });
}

function onlyDigits(input) {
  return String(input || "").replace(/\D/g, "");
}

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input) {
  return normalizeText(input)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    return { response, payload };
  } finally {
    clearTimeout(to);
  }
}

async function ensureToken(cfg) {
  const now = Date.now();
  if (cachedToken && now < tokenValidUntil - 60_000) {
    return cachedToken;
  }
  if (!cfg.loginUrl || !cfg.username || !cfg.password) {
    throw new Error("Kiosk gate login is not configured");
  }
  const { response, payload } = await fetchJson(cfg.loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: cfg.username, password: cfg.password }),
  });
  const token = String(payload?.data?.access_token || payload?.data?.token || "").trim();
  if (!response.ok || !token) {
    throw new Error(String(payload?.message || `Gate login failed (${response.status})`));
  }
  cachedToken = token;
  let ttl = TOKEN_FALLBACK_TTL_MS;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "===".slice((b64.length + 3) % 4);
      const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
      if (json.exp && typeof json.exp === "number") {
        ttl = Math.max(60_000, json.exp * 1000 - now - 120_000);
      }
    }
  } catch {
    /* use fallback */
  }
  tokenValidUntil = now + ttl;
  return cachedToken;
}

function buildVisitorSearchUrl(cfg, mobile) {
  if (cfg.visitorSearchOverride) {
    const u = new URL(
      cfg.visitorSearchOverride.startsWith("http")
        ? cfg.visitorSearchOverride
        : `https://${cfg.visitorSearchOverride}`
    );
    u.searchParams.set("company_id", cfg.companyId);
    u.searchParams.set("mobile_number", mobile);
    return u.toString();
  }
  const u = new URL(`${cfg.baseUrl}/api/visitor/entry`);
  u.searchParams.set("company_id", cfg.companyId);
  u.searchParams.set("mobile_number", mobile);
  return u.toString();
}

function extractVisitorId(row) {
  const raw = row?.id ?? row?.visitor_id ?? row?.fk_visitor_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function flattenMembersForIndex(rows) {
  const flat = [];
  for (const unit of rows) {
    const details = Array.isArray(unit.member_details) ? unit.member_details : [];
    for (const d of details) {
      const mid = Number(d.member_id);
      if (!Number.isFinite(mid) || mid <= 0) continue;
      const name = [d.member_first_name, d.member_last_name]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      const displayName = name || String(unit.member_name || d.company_name || "Unknown");
      flat.push({
        member_id: mid,
        member_name: displayName,
        member_type_name: String(d.member_type_name || ""),
        member_mobile_number: String(d.member_mobile_number || ""),
        member_email_id: String(d.member_email_id || ""),
        user_id: String(d.user_id ?? ""),
        unit_id: unit.id != null ? Number(unit.id) : null,
        building_unit: String(unit.building_unit || ""),
        unit_flat_number: String(unit.unit_flat_number || ""),
        soc_building_name: String(unit.soc_building_name || ""),
        unit_member_name: String(unit.member_name || ""),
        company_name: String(d.company_name || d.tenant_name || unit.company_name || unit.tenant_name || ""),
      });
    }
  }
  return flat;
}

function scoreMember(member, query) {
  const MIN = 45;
  const nq = normalizeText(query);
  if (!nq) return 0;
  const fields = [
    member.member_name,
    member.unit_member_name,
    member.building_unit,
    member.unit_flat_number,
    member.soc_building_name,
    member.company_name,
  ]
    .map((x) => normalizeText(x))
    .filter(Boolean);
  let score = 0;
  if (normalizeText(member.member_name) === nq) score += 180;
  if (normalizeText(member.unit_member_name) === nq) score += 130;
  const flat = `${member.building_unit} ${member.unit_flat_number}`;
  if (normalizeText(flat).includes(nq) || nq.split(" ").every((t) => flat.toLowerCase().includes(t))) score += 90;
  for (const f of fields) {
    if (f.includes(nq)) score += 70;
  }
  for (const tok of tokenize(nq)) {
    if (fields.some((f) => f.includes(tok))) score += 14;
  }
  const digits = nq.match(/\d+/g) || [];
  const unitDigits = normalizeText(flat);
  for (const d of digits) {
    if (unitDigits.includes(d)) score += 35;
  }
  return score >= MIN ? score : 0;
}

/**
 * @param {"all"|"company"|"recipient"|"person"} mode
 */
function scoreMemberWithMode(member, query, mode = "all") {
  const MIN = 45;
  let s = scoreMember(member, query);
  const nq = normalizeText(query);
  if (!nq) return s >= MIN ? s : 0;
  const cn = normalizeText(member.company_name);
  const mn = normalizeText(member.member_name);
  const umn = normalizeText(member.unit_member_name);
  if (mode === "company" && cn) {
    if (cn.includes(nq) || tokenize(nq).every((t) => cn.includes(t))) {
      s += 78;
    }
  }
  if ((mode === "recipient" || mode === "person") && nq) {
    if ((mn && mn.includes(nq)) || (umn && umn.includes(nq))) {
      s += 68;
    }
  }
  return s >= MIN ? s : 0;
}

async function ensureMemberIndex(cfg) {
  const now = Date.now();
  if (
    memberIndex.rows.length > 0 &&
    now - memberIndex.fetchedAt < MEMBER_INDEX_TTL_MS
  ) {
    return memberIndex;
  }
  if (!cfg.memberListUrl) {
    memberIndex = { fetchedAt: now, rows: [], flat: [] };
    return memberIndex;
  }
  const token = await ensureToken(cfg);
  const url = new URL(cfg.memberListUrl);
  if (!url.searchParams.get("company_id")) {
    url.searchParams.set("company_id", cfg.companyId);
  }
  const { response, payload } = await fetchJson(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    cachedToken = "";
    tokenValidUntil = 0;
    throw new Error("Member list unauthorized — token refreshed on next call");
  }
  if (!response.ok) {
    throw new Error(String(payload?.message || `Member list HTTP ${response.status}`));
  }
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const flat = flattenMembersForIndex(rows);
  memberIndex = { fetchedAt: now, rows, flat };
  return memberIndex;
}

async function performVisitorLookup(cfg, mobile) {
  const token = await ensureToken(cfg);
  const searchUrl = buildVisitorSearchUrl(cfg, mobile);
  const { response, payload } = await fetchJson(searchUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    cachedToken = "";
    tokenValidUntil = 0;
    return { ok: false, auth_error: true, message: "Gate auth failed" };
  }
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const found = rows.length > 0;
  const row = found ? rows[0] : null;
  return {
    ok: true,
    found,
    visitor: row
      ? {
          id: extractVisitorId(row),
          name: String(row.name || row.visitor_name || "").trim(),
          mobile: String(row.mobile || row.mobile_number || mobile),
          visitorImage: String(row.visitor_image || ""),
          comingFrom: String(row.coming_from || row.came_from || "").trim(),
        }
      : null,
    message: String(payload?.message || ""),
  };
}

/**
 * Core member search (no Express). Used by routes and batch-lookup.
 * @param {Record<string, unknown>} body
 * @param {"company"|"recipient"|null} forcedMode
 */
async function executeMemberSearchCore(body, forcedMode) {
  const cfg = gateConfig();
  const primary = String(body?.query || "").trim();
  const secondary = String(body?.secondaryQuery || "").trim();
  const scoringQuery = primary || [primary, secondary].filter(Boolean).join(" ").trim();
  const modeRaw = forcedMode || String(body?.searchMode || "all").toLowerCase();
  const mode =
    modeRaw === "company" || modeRaw === "recipient" || modeRaw === "person" ? modeRaw : "all";
  const started = Date.now();
  if (!scoringQuery) {
    return {
      ok: false,
      errorCode: "QUERY_REQUIRED",
      errorMessage: "query required",
      duration_ms: Date.now() - started,
      configured: !!cfg.memberListUrl,
      query: "",
      searchMode: mode,
      memberIds: [],
      matchedMembers: [],
      totalCandidates: 0,
      message: "",
    };
  }
  try {
    const { flat } = await ensureMemberIndex(cfg);
    if (!flat.length) {
      return {
        ok: true,
        errorCode: null,
        errorMessage: null,
        duration_ms: Date.now() - started,
        configured: !!cfg.memberListUrl,
        query: scoringQuery,
        searchMode: mode,
        memberIds: [],
        matchedMembers: [],
        totalCandidates: 0,
        message: cfg.memberListUrl ? "empty_directory" : "member_list_not_configured",
      };
    }
    const scored = flat
      .map((m) => ({ m, score: scoreMemberWithMode(m, scoringQuery, mode) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const dedup = new Map();
    for (const { m, score } of scored) {
      const prev = dedup.get(m.member_id);
      if (!prev || score > prev) dedup.set(m.member_id, { m, score });
    }
    const top = Array.from(dedup.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.m);
    return {
      ok: true,
      errorCode: null,
      errorMessage: null,
      duration_ms: Date.now() - started,
      configured: true,
      query: scoringQuery,
      searchMode: mode,
      memberIds: top.map((m) => m.member_id),
      matchedMembers: top,
      totalCandidates: flat.length,
      message: top.length ? "matched" : "no_match",
    };
  } catch (e) {
    return {
      ok: false,
      errorCode: "MEMBER_INDEX_ERROR",
      errorMessage: e?.message || String(e),
      duration_ms: Date.now() - started,
      configured: !!cfg.memberListUrl,
      query: scoringQuery,
      searchMode: mode,
      memberIds: [],
      matchedMembers: [],
      totalCandidates: 0,
      message: "",
    };
  }
}

/**
 * @param {import('express').Express} app
 */
function mountKioskGateRoutes(app) {
  app.get("/api/kiosk/proxy-status", (_req, res) => {
    const cfg = gateConfig();
    const config = gateConfigDiagnostics(cfg);
    return res.status(200).json({
      proxyEnabled: isEnabled(),
      gateLoginConfigured: gateLoginConfigured(cfg),
      memberListConfigured: !!cfg.memberListUrl,
      companyId: String(cfg.companyId || "").trim(),
      config,
    });
  });

  app.get("/api/kiosk/health", (_req, res) => {
    return res.status(200).json(buildHealthPayload());
  });

  app.post("/api/kiosk/warmup", async (_req, res) => {
    const cfg = gateConfig();
    const config = gateConfigDiagnostics(cfg);

    if (!isEnabled()) {
      console.info("[kiosk-gate] warmup skipped: KIOSK_GATE_PROXY_ENABLED is not truthy");
      return res.status(200).json({
        ok: false,
        proxyEnabled: false,
        gateLoginOk: false,
        memberWarmOk: false,
        errorCode: "PROXY_DISABLED",
        errorMessage:
          "Kiosk gate proxy is disabled on this server. Set KIOSK_GATE_PROXY_ENABLED to 1, true, yes, or on.",
        gateLoginConfigured: gateLoginConfigured(cfg),
        memberListConfigured: !!cfg.memberListUrl,
        config,
      });
    }

    if (!gateLoginConfigured(cfg)) {
      const msg =
        "Incomplete gate login env: set KIOSK_GATE_LOGIN_URL (or REACT_APP_GATE_LOGIN_API_URL), KIOSK_GATE_USERNAME, KIOSK_GATE_PASSWORD.";
      console.warn("[kiosk-gate] warmup failed:", msg, config);
      return res.status(200).json({
        ok: false,
        proxyEnabled: true,
        gateLoginOk: false,
        memberWarmOk: false,
        errorCode: "GATE_CONFIG_INCOMPLETE",
        errorMessage: msg,
        gateLoginConfigured: false,
        memberListConfigured: !!cfg.memberListUrl,
        config,
      });
    }

    try {
      await ensureToken(cfg);
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("[kiosk-gate] warmup gate login exception:", msg, e);
      return res.status(200).json({
        ok: false,
        proxyEnabled: true,
        gateLoginOk: false,
        memberWarmOk: false,
        errorCode: "GATE_LOGIN_FAILED",
        errorMessage: msg,
        gateLoginConfigured: true,
        memberListConfigured: !!cfg.memberListUrl,
        config,
      });
    }

    let memberWarmOk = true;
    let memberError = "";
    if (cfg.memberListUrl) {
      try {
        await ensureMemberIndex(cfg);
        memberWarmOk = true;
      } catch (e) {
        memberWarmOk = false;
        memberError = e?.message || String(e);
        console.error("[kiosk-gate] warmup member index exception:", memberError, e);
      }
    }

    if (cfg.memberListUrl && !memberWarmOk) {
      return res.status(200).json({
        ok: true,
        proxyEnabled: true,
        gateLoginOk: true,
        memberWarmOk: false,
        errorCode: "MEMBER_INDEX_WARM_FAILED",
        errorMessage: memberError,
        tokenCached: !!cachedToken,
        memberIndexSize: memberIndex.flat.length,
        gateLoginConfigured: true,
        memberListConfigured: true,
        config,
      });
    }

    return res.status(200).json({
      ok: true,
      proxyEnabled: true,
      gateLoginOk: true,
      memberWarmOk,
      errorCode: null,
      errorMessage: null,
      tokenCached: !!cachedToken,
      memberIndexSize: memberIndex.flat.length,
      gateLoginConfigured: true,
      memberListConfigured: !!cfg.memberListUrl,
      config,
    });
  });

  app.post("/api/kiosk/visitor-search", async (req, res) => {
    if (!isEnabled()) {
      return sendProxyDisabled(res);
    }
    const cfg = gateConfig();
    const mobile = onlyDigits(req.body?.phone || req.body?.mobile || "");
    const started = Date.now();
    if (mobile.length !== 10) {
      return res.status(200).json({
        ok: false,
        proxyEnabled: true,
        errorCode: "INVALID_PHONE",
        errorMessage: "Phone must be exactly 10 digits.",
        duration_ms: Date.now() - started,
        configured: true,
        found: false,
        visitor: null,
        message: "",
        gateLoginConfigured: gateLoginConfigured(cfg),
        memberListConfigured: !!cfg.memberListUrl,
      });
    }
    try {
      const out = await performVisitorLookup(cfg, mobile);
      const duration_ms = Date.now() - started;
      if (out.auth_error) {
        return res.status(200).json({
          ok: false,
          proxyEnabled: true,
          errorCode: "VISITOR_SEARCH_AUTH_FAILED",
          errorMessage: out.message || "Gate auth failed",
          duration_ms,
          configured: true,
          found: false,
          visitor: null,
          message: out.message || "",
          gateLoginConfigured: gateLoginConfigured(cfg),
          memberListConfigured: !!cfg.memberListUrl,
        });
      }
      return res.status(200).json({
        ok: true,
        proxyEnabled: true,
        errorCode: null,
        errorMessage: null,
        duration_ms,
        configured: true,
        found: out.found,
        visitor: out.visitor,
        message: out.message,
        gateLoginConfigured: gateLoginConfigured(cfg),
        memberListConfigured: !!cfg.memberListUrl,
      });
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("[kiosk-gate] visitor-search exception:", msg, e);
      return res.status(200).json({
        ok: false,
        proxyEnabled: true,
        errorCode: "VISITOR_SEARCH_ERROR",
        errorMessage: msg,
        duration_ms: Date.now() - started,
        configured: true,
        found: false,
        visitor: null,
        message: "",
        gateLoginConfigured: gateLoginConfigured(cfg),
        memberListConfigured: !!cfg.memberListUrl,
      });
    }
  });

  app.post("/api/kiosk/batch-lookup", async (req, res) => {
    if (!isEnabled()) {
      return sendProxyDisabled(res);
    }
    const cfg = gateConfig();
    const started = Date.now();
    const phone = onlyDigits(req.body?.phone || req.body?.mobile || "");
    const primary = String(req.body?.member_primary || req.body?.query || "").trim();
    const secondary = String(req.body?.member_secondary || req.body?.secondaryQuery || "").trim();
    const modeRaw = String(req.body?.searchMode || "recipient").toLowerCase();
    const forced =
      modeRaw === "company" ? "company" : modeRaw === "recipient" || modeRaw === "person" ? "recipient" : null;
    const scoringQuery = primary || [primary, secondary].filter(Boolean).join(" ").trim();
    /** When a member/destination query is present, default to member-only (no visitor search) unless client opts in. */
    const includeVisitorInBatch =
      req.body?.include_visitor === true ||
      req.body?.includeVisitor === true ||
      req.body?.skip_visitor === false ||
      req.body?.skipVisitor === false;
    const skipVisitor = includeVisitorInBatch
      ? false
      : req.body?.skip_visitor === true ||
        req.body?.skipVisitor === true ||
        Boolean(scoringQuery);

    try {
      await ensureToken(cfg);
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("[kiosk-gate] batch-lookup gate login:", msg, e);
      return res.status(200).json({
        ok: false,
        proxyEnabled: true,
        errorCode: "GATE_LOGIN_FAILED",
        errorMessage: msg,
        duration_ms: Date.now() - started,
        visitor: null,
        members: null,
        gateLoginConfigured: gateLoginConfigured(cfg),
        memberListConfigured: !!cfg.memberListUrl,
      });
    }

    const visitorPart =
      skipVisitor || phone.length !== 10
        ? Promise.resolve({ skipped: true })
        : performVisitorLookup(cfg, phone).catch((e) => ({
            ok: false,
            errorCode: "VISITOR_LOOKUP_ERROR",
            errorMessage: e?.message || String(e),
          }));

    const memberPart = scoringQuery
      ? executeMemberSearchCore(
          {
            query: primary || scoringQuery,
            secondaryQuery: secondary,
            searchMode: modeRaw,
          },
          forced
        )
      : Promise.resolve({ skipped: true });

    try {
      const [visitor, members] = await Promise.all([visitorPart, memberPart]);
      return res.status(200).json({
        ok: true,
        proxyEnabled: true,
        errorCode: null,
        errorMessage: null,
        duration_ms: Date.now() - started,
        visitor,
        members,
        gateLoginConfigured: gateLoginConfigured(cfg),
        memberListConfigured: !!cfg.memberListUrl,
      });
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("[kiosk-gate] batch-lookup exception:", msg, e);
      return res.status(200).json({
        ok: false,
        proxyEnabled: true,
        errorCode: "BATCH_LOOKUP_ERROR",
        errorMessage: msg,
        duration_ms: Date.now() - started,
        visitor: null,
        members: null,
        gateLoginConfigured: gateLoginConfigured(cfg),
        memberListConfigured: !!cfg.memberListUrl,
      });
    }
  });

  async function handleMemberRoute(req, res, forcedMode) {
    if (!isEnabled()) {
      return sendProxyDisabled(res);
    }
    const cfg = gateConfig();
    const result = await executeMemberSearchCore(req.body || {}, forcedMode);
    const base = {
      proxyEnabled: true,
      gateLoginConfigured: gateLoginConfigured(cfg),
      memberListConfigured: !!cfg.memberListUrl,
      ...result,
    };
    return res.status(200).json(base);
  }

  app.post("/api/kiosk/member-search", (req, res) => {
    return handleMemberRoute(req, res, null);
  });

  app.post("/api/kiosk/company-search", (req, res) => {
    return handleMemberRoute(req, res, "company");
  });

  app.post("/api/kiosk/recipient-search", (req, res) => {
    return handleMemberRoute(req, res, "recipient");
  });

  logKioskProxyBootSummary();
}

module.exports = {
  mountKioskGateRoutes,
  isEnabled,
  parseEnvBoolTruthy,
  buildHealthPayload,
  gateLoginConfigured,
};
