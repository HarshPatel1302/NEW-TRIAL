/**
 * Server-side CubeOne / gate API calls — avoids browser CORS when the kiosk is served
 * from another origin (e.g. Cloudflare Tunnel). Credentials come from env only.
 */
const { uploadVisitorPhotoAndGetS3Link } = require("./cover-upload");

const REQUEST_TIMEOUT_MS = 12000;

function trimSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

function sanitizeText(input) {
  return String(input || "").trim();
}

function onlyDigits(input) {
  return String(input || "").replace(/\D/g, "");
}

function toPositiveInt(input) {
  const value = Number(input);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  return rounded > 0 ? rounded : null;
}

function toMessageText(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveConfig() {
  const loginUrl =
    process.env.CUBEONE_LOGIN_URL ||
    process.env.GATE_LOGIN_API_URL ||
    "https://societybackend.cubeone.in/api/login";
  const username =
    process.env.CUBEONE_LOGIN_USERNAME || process.env.GATE_LOGIN_USERNAME || "";
  const password =
    process.env.CUBEONE_LOGIN_PASSWORD || process.env.GATE_LOGIN_PASSWORD || "";
  const gateBase =
    trimSlash(
      process.env.CUBEONE_GATE_BASE ||
        process.env.GATE_API_BASE_URL ||
        "https://stggateapi.cubeone.in"
    );
  const memberListUrl =
    process.env.CUBEONE_MEMBER_LIST_URL ||
    process.env.MEMBER_LIST_API_URL ||
    "https://socbackend.cubeone.in/api/admin/member/list";
  const companyId =
    String(
      process.env.CUBEONE_COMPANY_ID || process.env.WALKIN_COMPANY_ID || "8196"
    ).trim();
  const visitorLogUrl =
    process.env.CUBEONE_VISITOR_LOG_URL ||
    process.env.GATE_VISITOR_LOG_URL ||
    `${gateBase}/api/visitor/log`;
  const notifyUrl =
    process.env.CUBEONE_VISITOR_NOTIFY_URL ||
    process.env.GATE_VISITOR_NOTIFY_URL ||
    `${gateBase}/api/visitor/sendFcmNotification`;
  const purposeCatVisitor = Number(
    process.env.CUBEONE_VISITOR_PURPOSE_CATEGORY_ID ||
      process.env.VISITOR_PURPOSE_CATEGORY_ID ||
      "1"
  );
  const purposeCatDelivery = Number(
    process.env.CUBEONE_DELIVERY_PURPOSE_CATEGORY_ID ||
      process.env.DELIVERY_PURPOSE_CATEGORY_ID ||
      "3"
  );
  const cardId = Number(
    process.env.CUBEONE_VISITOR_LOG_CARD_ID || process.env.VISITOR_LOG_CARD_ID || "1"
  );
  const companyName =
    process.env.CUBEONE_VISITOR_LOG_COMPANY_NAME ||
    process.env.VISITOR_LOG_COMPANY_NAME ||
    "Greenscape Group";
  const inGate =
    process.env.CUBEONE_VISITOR_LOG_IN_GATE ||
    process.env.VISITOR_LOG_IN_GATE ||
    "MAIN GATE";

  return {
    loginUrl,
    username,
    password,
    gateBase,
    memberListUrl,
    companyId,
    visitorLogUrl,
    notifyUrl,
    purposeCatVisitor: Number.isFinite(purposeCatVisitor) ? purposeCatVisitor : 1,
    purposeCatDelivery: Number.isFinite(purposeCatDelivery) ? purposeCatDelivery : 3,
    cardId: Number.isFinite(cardId) ? cardId : 1,
    companyName,
    inGate,
  };
}

function isConfigured() {
  const c = resolveConfig();
  return !!(c.username && c.password && c.gateBase);
}

let accessToken = null;
let refreshPromise = null;

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function login(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(config.loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: config.username,
        password: config.password,
      }),
      signal: controller.signal,
    });
    const payload = await parseJsonSafe(response);
    const token = String(
      payload?.data?.access_token || payload?.data?.token || ""
    ).trim();
    if (!response.ok || !token) {
      throw new Error(
        toMessageText(payload?.message) || `Login failed (HTTP ${response.status})`
      );
    }
    accessToken = token;
    return token;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureToken(config) {
  if (accessToken) return accessToken;
  if (refreshPromise) return refreshPromise;
  refreshPromise = login(config).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function requestWithAuth(config, url, init, retry = true) {
  await ensureToken(config);
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    let payload = await parseJsonSafe(response);
    if ((response.status === 401 || response.status === 403) && retry) {
      accessToken = null;
      await login(config);
      return requestWithAuth(config, url, init, false);
    }
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function extractVisitorId(data) {
  if (!data || typeof data !== "object") return null;
  const candidates = [
    data.visitor_id,
    data.id,
    data.fk_visitor_id,
    data.fkVisitorId,
    data.data?.id,
    data.data?.visitor_id,
    data.visitor?.id,
    data.visitor?.visitor_id,
  ];
  for (const c of candidates) {
    const v = toPositiveInt(c);
    if (v) return v;
  }
  return null;
}

function extractVisitorLogId(data) {
  if (!data || typeof data !== "object") return null;
  const candidates = [
    data.visitor_log_id,
    data.visitorLogId,
    data.log_id,
    data.id,
    data.data?.visitor_log_id,
    data.data?.id,
  ];
  for (const c of candidates) {
    const v = toPositiveInt(c);
    if (v) return v;
  }
  return null;
}

function formatGateDateTime(value) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date();
  if (Number.isNaN(date.getTime())) return formatGateDateTime(Date.now());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function buildMemberDetailsPayload(details) {
  const source = Array.isArray(details.memberDetails) ? details.memberDetails : [];
  return source
    .map((member) => {
      const unitId = toPositiveInt(member.unit_id);
      const buildingUnit = sanitizeText(
        member.building_unit || member.unit_flat_number || ""
      );
      const memberIds = sanitizeText(
        String(member.member_ids || member.member_id || "")
      );
      const name = sanitizeText(
        member.name || member.member_name || member.unit_member_name || ""
      );
      const mobile = sanitizeText(
        member.mobile_number || member.member_mobile_number || ""
      );
      const email = sanitizeText(member.email || member.member_email_id || "");
      const memberOldSsoId = sanitizeText(
        String(member.member_old_sso_id || member.user_id || "")
      );
      return {
        unit_id: unitId,
        building_unit: buildingUnit,
        member_ids: memberIds,
        name,
        mobile_number: mobile,
        email,
        member_old_sso_id: memberOldSsoId,
      };
    })
    .filter((m) => sanitizeText(m.member_ids).length > 0 || sanitizeText(m.name).length > 0);
}

function resolvePurposeCategoryId(config, details) {
  const explicit = toPositiveInt(details.visitorPurposeCategoryId);
  if (explicit) return explicit;
  const intent = sanitizeText(details.intent || "").toLowerCase();
  if (intent === "delivery") return config.purposeCatDelivery;
  return config.purposeCatVisitor;
}

function resolvePrimaryMember(details) {
  const source = Array.isArray(details.memberDetails) ? details.memberDetails : [];
  for (const member of source) {
    const memberId =
      toPositiveInt(member.member_ids) || toPositiveInt(member.member_id);
    const userId = sanitizeText(String(member.user_id || ""));
    const memberMobileNumber = onlyDigits(
      String(member.member_mobile_number || member.mobile_number || "")
    );
    if (memberId && userId && memberMobileNumber) {
      return { memberId, userId, memberMobileNumber };
    }
  }
  const fallback = source.find(
    (m) => toPositiveInt(m.member_ids || m.member_id)
  );
  if (fallback) {
    return {
      memberId: toPositiveInt(fallback.member_ids || fallback.member_id),
      userId: sanitizeText(String(fallback.user_id || "")),
      memberMobileNumber: onlyDigits(
        String(fallback.member_mobile_number || fallback.mobile_number || "")
      ),
    };
  }
  return { memberId: null, userId: "", memberMobileNumber: "" };
}

function buildNotificationFormData(
  config,
  details,
  visitorId,
  visitorLogId,
  primary,
  options = { includeFile: true }
) {
  const companyId =
    toPositiveInt(details.companyId) || toPositiveInt(config.companyId) || Number(config.companyId);
  const purposeCategoryId = resolvePurposeCategoryId(config, details);
  const purposeLabel = purposeCategoryId === config.purposeCatDelivery ? "Delivery" : "Guest";
  const fd = new FormData();
  fd.append("company_id", String(companyId));
  fd.append("name", sanitizeText(details.name));
  fd.append("mobile", onlyDigits(details.phone));
  fd.append("purpose", purposeLabel);
  fd.append("in_time", formatGateDateTime(details.visitorCheckIn));
  fd.append("user_id", primary.userId);
  fd.append("visitor_count", String(toPositiveInt(details.visitorCount) || 1));
  fd.append("purpose_details", purposeLabel);
  fd.append("coming_from", sanitizeText(details.cameFrom));
  fd.append("member_mobile_number", primary.memberMobileNumber);
  fd.append("visitor_id", String(visitorId));
  fd.append("member_id", String(primary.memberId));
  fd.append("purpose_category", String(purposeCategoryId));
  fd.append("visitor_log_id", String(visitorLogId));
  fd.append("self_check_in", "false");
  fd.append("is_staff", String(Boolean(details.isStaff)));

  if (options.includeFile !== false) {
    const photo = sanitizeText(details.photo || "");
    if (photo && /^https?:\/\//i.test(photo)) {
      fd.append("file", photo);
    } else if (photo.startsWith("data:image")) {
      const match = /^data:([^;]+);base64,(.+)$/i.exec(photo);
      if (match) {
        const buf = Buffer.from(match[2].replace(/\s/g, ""), "base64");
        const blob = new Blob([buf], { type: match[1] || "image/jpeg" });
        fd.append("file", blob, "visitor.jpg");
      }
    }
  }
  return fd;
}

async function searchVisitor(config, details) {
  const mobile = onlyDigits(details.phone);
  if (!mobile) {
    return {
      result: {
        field: "search_visitor",
        configured: true,
        ok: false,
        skipped: true,
        message: "Skipped search — no phone.",
      },
      found: false,
      visitorId: null,
    };
  }
  const url = new URL(`${config.gateBase}/api/visitor/entry`);
  url.searchParams.set("company_id", config.companyId);
  url.searchParams.set("mobile_number", mobile);
  const { response, payload } = await requestWithAuth(config, url.toString(), {
    method: "GET",
  });
  if (!response.ok) {
    return {
      result: {
        field: "search_visitor",
        configured: true,
        ok: false,
        statusCode: response.status,
        error: toMessageText(payload?.message) || `HTTP ${response.status}`,
      },
      found: false,
      visitorId: null,
    };
  }
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const found = rows.length > 0;
  const visitorId = found ? extractVisitorId(rows[0]) : null;
  const firstRow = found && rows[0] && typeof rows[0] === "object" ? rows[0] : null;
  const visitorName = firstRow
    ? sanitizeText(
        String(
          firstRow.name ||
            firstRow.visitor_name ||
            firstRow.full_name ||
            firstRow.visitorName ||
            ""
        )
      )
    : "";
  return {
    result: {
      field: "search_visitor",
      configured: true,
      ok: true,
      statusCode: response.status,
      message: toMessageText(payload?.message),
      visitorId,
    },
    found,
    visitorId,
    visitorName,
    row: firstRow,
  };
}

async function searchVisitorRoute(req, res) {
  const config = resolveConfig();
  if (!isConfigured()) {
    return res.status(503).json({
      ok: false,
      message: "CubeOne not configured on server.",
    });
  }
  const phone = onlyDigits(req.query.phone || req.body?.phone || "");
  if (!phone) {
    return res.status(400).json({ ok: false, message: "phone is required" });
  }
  try {
    const search = await searchVisitor(config, { phone });
    if (!search.result.ok) {
      return res.status(search.result.statusCode || 502).json({
        ok: false,
        message: search.result.error || search.result.message || "search failed",
      });
    }
    return res.json({
      ok: true,
      found: search.found,
      visitor_id: search.visitorId || null,
      visitor_name: search.visitorName || "",
      row: search.row || null,
    });
  } catch (e) {
    return res.status(502).json({
      ok: false,
      message: e.message || "search visitor failed",
    });
  }
}

async function addVisitorEntry(config, details) {
  const mobile = onlyDigits(details.phone);
  if (!mobile) {
    return {
      field: "add_visitor_entry",
      configured: true,
      ok: false,
      skipped: true,
      error: "No phone for add visitor.",
    };
  }
  let visitorImagePayload = "jj";
  const normalizedPhoto = sanitizeText(details.photo || "");
  if (normalizedPhoto) {
    if (/^https?:\/\//i.test(normalizedPhoto)) {
      visitorImagePayload = normalizedPhoto;
    } else {
      try {
        const uploaded = await uploadVisitorPhotoAndGetS3Link(normalizedPhoto, {
          fileNameHint: sanitizeText(details.name).slice(0, 24) || "visitor",
          username: config.username,
          password: config.password,
          loginUrl: config.loginUrl,
        });
        if (uploaded.s3Link) visitorImagePayload = uploaded.s3Link;
      } catch (e) {
        console.warn("[cubeone-integration] photo upload failed", e.message);
      }
    }
  }
  const body = {
    name: sanitizeText(details.name),
    visitor_image: visitorImagePayload,
    mobile_number: mobile,
    coming_from: sanitizeText(details.cameFrom),
    came_from: sanitizeText(details.cameFrom),
    meeting_with: sanitizeText(details.meetingWith),
  };
  const url = `${config.gateBase}/api/visitor/entry`;
  const { response, payload } = await requestWithAuth(config, url, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return {
      field: "add_visitor_entry",
      configured: true,
      ok: false,
      statusCode: response.status,
      error: toMessageText(payload?.message) || `HTTP ${response.status}`,
      requestPayload: body,
    };
  }
  const visitorId = extractVisitorId(payload?.data || payload);
  return {
    field: "add_visitor_entry",
    configured: true,
    ok: true,
    statusCode: response.status,
    message: toMessageText(payload?.message),
    visitorId,
    requestPayload: body,
  };
}

async function addVisitorLog(config, details, remoteVisitorId) {
  const visitorId = toPositiveInt(remoteVisitorId);
  if (!visitorId) {
    return {
      field: "add_visitor_log",
      configured: true,
      ok: false,
      error: "Missing visitor_id for log.",
    };
  }
  const categoryId = resolvePurposeCategoryId(config, details);
  const subCategoryId = toPositiveInt(details.visitorPurposeSubCategoryId);
  const companyId =
    toPositiveInt(details.companyId) || toPositiveInt(config.companyId) || Number(config.companyId);
  const payload = {
    visitor_id: visitorId,
    visitor_purpose_category_id: categoryId,
    ...(subCategoryId ? { visitor_purpose_sub_category_id: subCategoryId } : {}),
    visitor_card_number: sanitizeText(details.visitorCardNumber || ""),
    visitor_card_id: toPositiveInt(details.visitorCardId) || config.cardId,
    visitor_count: toPositiveInt(details.visitorCount) || 1,
    visitor_coming_from: sanitizeText(details.cameFrom),
    visitor_check_in: formatGateDateTime(details.visitorCheckIn),
    is_always_allowed: Boolean(details.isAlwaysAllowed),
    company_id: companyId,
    company_name: sanitizeText(details.companyName || config.companyName),
    in_gate: sanitizeText(details.inGate || config.inGate),
    vehicle_number: sanitizeText(details.vehicleNumber || ""),
    is_checked_out: Boolean(details.isCheckedOut),
    is_staff: Boolean(details.isStaff),
    member_details: buildMemberDetailsPayload(details),
  };
  const { response, payload: resPayload } = await requestWithAuth(
    config,
    config.visitorLogUrl,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  const visitorLogId = extractVisitorLogId(resPayload?.data || resPayload);
  if (!response.ok) {
    return {
      field: "add_visitor_log",
      configured: true,
      ok: false,
      statusCode: response.status,
      error: toMessageText(resPayload?.message) || `HTTP ${response.status}`,
      visitorId,
      visitorLogId,
      requestPayload: payload,
    };
  }
  return {
    field: "add_visitor_log",
    configured: true,
    ok: true,
    statusCode: response.status,
    message: toMessageText(resPayload?.message),
    visitorId,
    visitorLogId,
    requestPayload: payload,
  };
}

async function sendNotification(config, details, visitorId, visitorLogId) {
  const vid = toPositiveInt(visitorId);
  const lid = toPositiveInt(visitorLogId);
  if (!vid || !lid) {
    return {
      field: "send_member_notification",
      configured: true,
      ok: false,
      error: "Missing visitor_id or visitor_log_id for FCM.",
    };
  }
  const primary = resolvePrimaryMember(details);
  if (!primary.memberId || !primary.userId || !primary.memberMobileNumber) {
    return {
      field: "send_member_notification",
      configured: true,
      ok: false,
      error: "Missing member_id, user_id, or member_mobile for FCM.",
    };
  }
  let fd = buildNotificationFormData(config, details, vid, lid, primary);
  let { response, payload } = await requestWithAuth(config, config.notifyUrl, {
    method: "POST",
    body: fd,
  });
  let messageText = toMessageText(payload?.message);
  if (!response.ok && response.status === 400 && /file/i.test(messageText)) {
    const fd2 = buildNotificationFormData(config, details, vid, lid, primary, {
      includeFile: false,
    });
    ({ response, payload } = await requestWithAuth(config, config.notifyUrl, {
      method: "POST",
      body: fd2,
    }));
    messageText = toMessageText(payload?.message);
  }
  if (!response.ok) {
    return {
      field: "send_member_notification",
      configured: true,
      ok: false,
      statusCode: response.status,
      error: messageText || `HTTP ${response.status}`,
      visitorId: vid,
      visitorLogId: lid,
    };
  }
  return {
    field: "send_member_notification",
    configured: true,
    ok: true,
    statusCode: response.status,
    message: messageText,
    visitorId: vid,
    visitorLogId: lid,
  };
}

async function fetchMemberList(req, res) {
  const config = resolveConfig();
  if (!config.username || !config.password) {
    return res.status(503).json({
      message: "CubeOne login not configured on server (GATE_LOGIN_* or CUBEONE_*).",
      data: [],
    });
  }
  try {
    const url = new URL(config.memberListUrl);
    if (!url.searchParams.get("company_id")) {
      url.searchParams.set(
        "company_id",
        String(req.query.company_id || config.companyId)
      );
    }
    const { response, payload } = await requestWithAuth(config, url.toString(), {
      method: "GET",
    });
    return res.status(response.status).json(payload);
  } catch (e) {
    console.error("[cubeone-integration] member-list", e);
    return res.status(502).json({
      message: e.message || "Member list proxy failed",
      data: [],
    });
  }
}

async function walkInSync(req, res) {
  const config = resolveConfig();
  if (!isConfigured()) {
    return res.status(503).json({
      attempted: false,
      allSuccessful: false,
      results: [
        {
          field: "search_visitor",
          configured: false,
          ok: false,
          error: "CubeOne not configured on server.",
        },
      ],
    });
  }
  const details = req.body || {};
  try {
    const search = await searchVisitor(config, details);
    let resolvedVisitorId = search.visitorId;
    let addResult;
    if (search.result.ok && !search.found) {
      addResult = await addVisitorEntry(config, details);
      if (addResult.ok && addResult.visitorId) {
        resolvedVisitorId = addResult.visitorId;
      }
    } else {
      addResult = {
        field: "add_visitor_entry",
        configured: search.result.configured,
        ok: true,
        skipped: true,
        message: search.result.ok
          ? "Visitor already exists — skipped add."
          : "Search failed — skipped add.",
      };
    }
    const logResult = await addVisitorLog(config, details, resolvedVisitorId);
    let notificationResult;
    if (logResult.ok) {
      notificationResult = await sendNotification(
        config,
        details,
        logResult.visitorId || resolvedVisitorId,
        logResult.visitorLogId
      );
    } else {
      notificationResult = {
        field: "send_member_notification",
        configured: true,
        ok: true,
        skipped: true,
        message: "Skipped FCM — visitor log failed.",
      };
    }
    const results = [search.result, addResult, logResult, notificationResult];
    const attempted = results.some((r) => r.configured);
    const allSuccessful =
      attempted &&
      results.filter((r) => r.configured && !r.skipped).every((r) => r.ok);
    return res.json({ attempted, allSuccessful, results });
  } catch (e) {
    console.error("[cubeone-integration] walk-in-sync", e);
    return res.status(502).json({
      attempted: true,
      allSuccessful: false,
      results: [
        {
          field: "search_visitor",
          configured: true,
          ok: false,
          error: e.message || "Walk-in sync failed",
        },
      ],
    });
  }
}

function registerCubeOneRoutes(app) {
  app.get("/api/integrations/cubeone/member-list", fetchMemberList);
  app.get("/api/integrations/cubeone/search-visitor", searchVisitorRoute);
  app.post("/api/integrations/cubeone/walk-in-sync", walkInSync);
}

module.exports = {
  registerCubeOneRoutes,
  isConfigured,
  resolveConfig,
};
