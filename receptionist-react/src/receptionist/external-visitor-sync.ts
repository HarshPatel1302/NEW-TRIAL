import type { MatchedMember } from "./member-directory";

type SyncKey =
  | "search_visitor"
  | "add_visitor_entry"
  | "add_visitor_log"
  | "send_member_notification";

type ExternalMemberDetail = {
  unit_id?: number | string | null;
  building_unit?: string;
  member_ids?: string | number;
  member_id?: string | number;
  name?: string;
  member_name?: string;
  mobile_number?: string;
  member_mobile_number?: string;
  email?: string;
  member_email_id?: string;
  member_old_sso_id?: string;
  user_id?: string | number | null;
};

export type ExternalWalkInDetails = {
  name: string;
  phone: string;
  cameFrom: string;
  meetingWith: string;
  photo?: string;
  localVisitorId?: string;
  intent?: string;
  sessionId?: string | null;
  visitorPurposeCategoryId?: number | string | null;
  visitorPurposeSubCategoryId?: number | string | null;
  visitorCardNumber?: string;
  visitorCardId?: number | string | null;
  visitorCount?: number | string | null;
  visitorCheckIn?: string | Date | number;
  isAlwaysAllowed?: boolean;
  isCheckedOut?: boolean;
  companyId?: number | string | null;
  companyName?: string;
  inGate?: string;
  vehicleNumber?: string;
  isStaff?: boolean;
  memberDetails?: Array<ExternalMemberDetail | MatchedMember>;
};

type FieldSyncResult = {
  field: SyncKey;
  configured: boolean;
  ok: boolean;
  statusCode?: number;
  error?: string;
  skipped?: boolean;
  message?: string;
  visitorId?: number | null;
  visitorLogId?: number | null;
  requestPayload?: Record<string, unknown>;
};

export type ExternalSyncResult = {
  attempted: boolean;
  allSuccessful: boolean;
  results: FieldSyncResult[];
};

type ApiEnvelope<T = unknown> = {
  message?: string;
  status?: string;
  status_code?: number;
  success?: boolean;
  data?: T;
};

type VisitorSearchData = Array<Record<string, unknown>>;
type VisitorSearchResponse = ApiEnvelope<VisitorSearchData>;
type VisitorAddResponse = ApiEnvelope<Record<string, unknown>>;
type VisitorLogResponse = ApiEnvelope<Record<string, unknown>>;
type VisitorNotificationResponse = ApiEnvelope<Record<string, unknown>>;
type LoginResponse = ApiEnvelope<{ access_token?: string }>;

type GateApiClientConfig = {
  baseUrl: string;
  loginUrl: string;
  username: string;
  password: string;
  companyId: string;
};

const REQUEST_TIMEOUT_MS = 7000;
const GATE_API_BASE_URL = process.env.REACT_APP_GATE_API_BASE_URL || "";
const GATE_LOGIN_API_URL =
  process.env.REACT_APP_GATE_LOGIN_API_URL || process.env.REACT_APP_VR_LOGIN_URL || "";
const GATE_LOGIN_USERNAME =
  process.env.REACT_APP_GATE_LOGIN_USERNAME || process.env.REACT_APP_VR_LOGIN_USERNAME || "";
const GATE_LOGIN_PASSWORD =
  process.env.REACT_APP_GATE_LOGIN_PASSWORD || process.env.REACT_APP_VR_LOGIN_PASSWORD || "";
const COMPANY_ID = process.env.REACT_APP_WALKIN_COMPANY_ID || process.env.REACT_APP_VR_COMPANY_ID || "8196";
const GATE_VISITOR_LOG_API_URL = String(
  process.env.REACT_APP_VISITOR_LOG_API_URL ||
    process.env.REACT_APP_VR_VISITOR_LOG_URL ||
    `${trimSlash(GATE_API_BASE_URL)}/api/visitor/log`
).trim();
const GATE_VISITOR_NOTIFICATION_API_URL = String(
  process.env.REACT_APP_VISITOR_NOTIFICATION_API_URL ||
    process.env.REACT_APP_VR_SEND_FCM_URL ||
    `${trimSlash(GATE_API_BASE_URL)}/api/visitor/sendFcmNotification`
).trim();
const DEFAULT_VISITOR_LOG_COMPANY_NAME = String(
  process.env.REACT_APP_VISITOR_LOG_COMPANY_NAME ||
    process.env.REACT_APP_VR_COMPANY_NAME ||
    "Greenscape Group"
).trim();
const DEFAULT_VISITOR_LOG_IN_GATE = String(
  // process.env.REACT_APP_VISITOR_LOG_IN_GATE || process.env.REACT_APP_VR_IN_GATE || "cyberone lobby"
   "cyberone lobby"
).trim();
const DEFAULT_VISITOR_PURPOSE_CATEGORY_ID = Number(
  process.env.REACT_APP_VISITOR_PURPOSE_CATEGORY_ID || "1"
);
const DEFAULT_DELIVERY_PURPOSE_CATEGORY_ID = Number(
  process.env.REACT_APP_DELIVERY_PURPOSE_CATEGORY_ID || "3"
);
const DEFAULT_VISITOR_LOG_CARD_ID = Number(
  process.env.REACT_APP_VISITOR_LOG_CARD_ID || "1"
);
const RECEPTIONIST_API_BASE_URL = trimSlash(
  process.env.REACT_APP_RECEPTIONIST_API_URL || "http://localhost:5050/api"
);
const RECEPTIONIST_API_KEY = process.env.REACT_APP_RECEPTIONIST_API_KEY || "";
const KIOSK_ID = process.env.REACT_APP_KIOSK_ID || "";
/** Optional full URL base for GET visitor search (e.g. mock or alternate path). Query params company_id & mobile_number are set/overwritten by the client. */
const VISITOR_SEARCH_URL_OVERRIDE = String(
  process.env.REACT_APP_VISITOR_SEARCH_URL || process.env.REACT_APP_VR_VISITOR_SEARCH_URL || ""
).trim();
const VISITOR_CREATE_URL_OVERRIDE = String(
  process.env.REACT_APP_VR_VISITOR_CREATE_URL || ""
).trim();
const VISITOR_IMAGE_UPLOAD_URL = String(
  process.env.REACT_APP_VR_IMAGE_UPLOAD_URL || process.env.REACT_APP_IMAGE_UPLOAD_URL || ""
).trim();
const MAX_UPLOAD_IMAGE_BYTES = 500 * 1024;

export type VisitorSearchLookupResult = {
  configured: boolean;
  ok: boolean;
  found: boolean;
  statusCode?: number;
  message?: string;
  visitor?: {
    id: number;
    name: string;
    mobile: string;
    visitorImage: string;
    comingFrom: string;
  } | null;
};

function onlyDigits(input: string) {
  return String(input || "").replace(/\D/g, "");
}

export function normalizeIndianMobile(input: unknown) {
  const digits = onlyDigits(String(input || ""));
  if (!digits) return "";
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function isValidIndianMobile(input: unknown) {
  const normalized = normalizeIndianMobile(input);
  return /^[6-9]\d{9}$/.test(normalized);
}

function sanitizeText(input: string) {
  return String(input || "").trim();
}

function toPositiveInt(input: unknown) {
  const value = Number(input);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  return rounded > 0 ? rounded : null;
}

function normalizeGateTimestamp(value?: string | Date | number) {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }
  const raw = sanitizeText(String(value || ""));
  if (!raw) {
    return new Date();
  }

  // Accept either "YYYY-MM-DD HH:mm:ss" or ISO-like formats.
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function formatGateDateTime(value?: string | Date | number) {
  const date = normalizeGateTimestamp(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildMemberDetailsPayload(details: ExternalWalkInDetails) {
  const source = Array.isArray(details.memberDetails) ? details.memberDetails : [];
  const mapped = source
    .map((member): Record<string, unknown> => {
      const unitId = toPositiveInt((member as ExternalMemberDetail).unit_id);
      const buildingUnit = sanitizeText(
        String(
          (member as ExternalMemberDetail).building_unit ||
            (member as MatchedMember).building_unit ||
            (member as MatchedMember).unit_flat_number ||
            ""
        )
      );
      const memberIds = sanitizeText(
        String(
          (member as ExternalMemberDetail).member_ids ||
            (member as ExternalMemberDetail).member_id ||
            (member as MatchedMember).member_id ||
            ""
        )
      );
      const name = sanitizeText(
        String(
          (member as ExternalMemberDetail).name ||
            (member as ExternalMemberDetail).member_name ||
            (member as MatchedMember).member_name ||
            (member as MatchedMember).unit_member_name ||
            ""
        )
      );
      const mobile = sanitizeText(
        String(
          (member as ExternalMemberDetail).mobile_number ||
            (member as ExternalMemberDetail).member_mobile_number ||
            (member as MatchedMember).member_mobile_number ||
            ""
        )
      );
      const email = sanitizeText(
        String(
          (member as ExternalMemberDetail).email ||
            (member as ExternalMemberDetail).member_email_id ||
            (member as MatchedMember).member_email_id ||
            ""
        )
      );
      const memberOldSsoId = sanitizeText(
        String(
          (member as ExternalMemberDetail).member_old_sso_id ||
            (member as ExternalMemberDetail).user_id ||
            (member as MatchedMember).user_id ||
            ""
        )
      );

      const memberIdsPayload =
        memberIds && /^\d+$/.test(memberIds) ? Number(memberIds) : memberIds;
      const mobileDigits = onlyDigits(mobile);

      return {
        unit_id: unitId,
        building_unit: buildingUnit,
        member_ids: memberIdsPayload,
        name,
        mobile_number: mobileDigits.length >= 10 ? Number(mobileDigits) : mobile,
        email,
        member_old_sso_id: memberOldSsoId,
      };
    })
    .filter((member) => {
      const hasMemberId = sanitizeText(String(member.member_ids || "")).length > 0;
      const hasMemberName = sanitizeText(String(member.name || "")).length > 0;
      return hasMemberId || hasMemberName;
    });

  return mapped;
}

function extractVisitorId(data: unknown): number | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const candidates = [
    record.visitor_id,
    record.id,
    record.fk_visitor_id,
    record.fkVisitorId,
    (record.visitor as Record<string, unknown> | undefined)?.id,
    (record.visitor as Record<string, unknown> | undefined)?.visitor_id,
    (record.data as Record<string, unknown> | undefined)?.id,
    (record.data as Record<string, unknown> | undefined)?.visitor_id,
  ];

  for (const candidate of candidates) {
    const value = toPositiveInt(candidate);
    if (value) {
      return value;
    }
  }

  return null;
}

function extractVisitorLogId(data: unknown): number | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  const candidates = [
    record.visitor_log_id,
    record.visitorLogId,
    record.log_id,
    record.id,
    (record.data as Record<string, unknown> | undefined)?.visitor_log_id,
    (record.data as Record<string, unknown> | undefined)?.visitorLogId,
    (record.data as Record<string, unknown> | undefined)?.id,
  ];

  for (const candidate of candidates) {
    const value = toPositiveInt(candidate);
    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Gate `sendFcmNotification` expects multipart `file` like curl `--form file=@path`.
 * Appending a string does not produce a real file part; use a Blob filename.
 */
function visitorPhotoToImageBlob(photo: string): Blob | null {
  const normalized = sanitizeText(photo);
  if (!normalized || isHttpUrl(normalized)) {
    return null;
  }
  if (normalized.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(normalized.replace(/\s/g, ""));
    if (match) {
      try {
        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const mime = String(match[1] || "image/jpeg").split(";")[0].trim();
        return new Blob([bytes], { type: mime || "image/jpeg" });
      } catch {
        return null;
      }
    }
    return null;
  }
  try {
    const raw = toBase64Payload(normalized);
    if (!raw) return null;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: "image/jpeg" });
  } catch {
    return null;
  }
}

function toBase64Payload(input: string) {
  const value = sanitizeText(input);
  if (!value) return "";
  if (value.startsWith("data:")) {
    const commaIndex = value.indexOf(",");
    return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
  }
  return value;
}

function trimSlash(url: string) {
  return String(url || "").replace(/\/+$/, "");
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isUnauthorizedStatus(status: number) {
  return status === 401 || status === 403;
}

function buildPhotoFileNameHint(details: ExternalWalkInDetails) {
  const name = sanitizeText(details.name)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const phone = onlyDigits(details.phone).slice(-10);
  const visitorPart = sanitizeText(details.localVisitorId || "").slice(0, 18);
  return [name, phone, visitorPart].filter(Boolean).join("-") || "visitor";
}

function buildReceptionistApiHeaders() {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (RECEPTIONIST_API_KEY) {
    headers.set("x-api-key", RECEPTIONIST_API_KEY);
  }
  if (KIOSK_ID) {
    headers.set("x-kiosk-id", KIOSK_ID);
  }
  return headers;
}

function toMessageText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function parseEnvelopeSafe(response: Response): Promise<ApiEnvelope> {
  try {
    return (await response.json()) as ApiEnvelope;
  } catch {
    return {};
  }
}

type UploadPhotoResult = {
  ok: boolean;
  url: string;
  error: string;
};

async function uploadVisitorPhotoToCloud(
  photo: string,
  details: ExternalWalkInDetails,
  authContext: {
    authToken?: string;
    loginUrl?: string;
    username?: string;
    password?: string;
    refreshAuthToken?: () => Promise<string>;
  } = {},
  retryIfUnauthorized = true
): Promise<UploadPhotoResult> {
  const normalizedPhoto = sanitizeText(photo);
  if (!normalizedPhoto) {
    return { ok: false, url: "", error: "Photo is missing." };
  }

  const imageBlob = visitorPhotoToImageBlob(normalizedPhoto);
  if (!imageBlob) {
    return { ok: false, url: "", error: "Unable to parse captured photo." };
  }
  if (imageBlob.size > MAX_UPLOAD_IMAGE_BYTES) {
    return {
      ok: false,
      url: "",
      error: `Captured image exceeds 500KB (${Math.round(imageBlob.size / 1024)}KB). Please retake photo.`,
    };
  }

  const requestUrl =
    VISITOR_IMAGE_UPLOAD_URL ||
    (RECEPTIONIST_API_BASE_URL ? `${RECEPTIONIST_API_BASE_URL}/media/upload-cover` : "");
  if (!requestUrl) {
    return { ok: false, url: "", error: "Image upload API is not configured." };
  }
  const controller = new AbortController();
  const timeout: ReturnType<typeof setTimeout> = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS + 5000
  );

  try {
    console.info("[WalkInSync] Visitor photo upload call", {
      method: "POST",
      url: requestUrl,
    });

    const fileName = `${buildPhotoFileNameHint(details)}.jpg`;
    let response: Response;
    let payload: ApiEnvelope = {};
    if (VISITOR_IMAGE_UPLOAD_URL) {
      const formData = new FormData();
      formData.append("cover_image", imageBlob, fileName);
      response = await fetch(requestUrl, {
        method: "POST",
        headers: authContext.authToken
          ? { Authorization: `Bearer ${sanitizeText(authContext.authToken)}` }
          : undefined,
        body: formData,
        signal: controller.signal,
      });
      payload = await parseEnvelopeSafe(response);
    } else {
      response = await fetch(requestUrl, {
        method: "POST",
        headers: buildReceptionistApiHeaders(),
        body: JSON.stringify({
          photoDataUrl: normalizedPhoto,
          fileNameHint: buildPhotoFileNameHint(details),
          authToken: sanitizeText(authContext.authToken || ""),
          loginUrl: sanitizeText(authContext.loginUrl || ""),
          username: sanitizeText(authContext.username || ""),
          password: String(authContext.password || ""),
        }),
        signal: controller.signal,
      });
      payload = await parseEnvelopeSafe(response);
    }
    console.info("[WalkInSync] Visitor photo upload response", {
      status: response.status,
      ok: response.ok,
      message: toMessageText(payload?.message),
    });

    if (
      !response.ok &&
      retryIfUnauthorized &&
      isUnauthorizedStatus(response.status) &&
      typeof authContext.refreshAuthToken === "function"
    ) {
      const refreshedToken = sanitizeText(await authContext.refreshAuthToken());
      if (refreshedToken) {
        return uploadVisitorPhotoToCloud(
          normalizedPhoto,
          details,
          {
            ...authContext,
            authToken: refreshedToken,
          },
          false
        );
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        url: "",
        error: toMessageText(payload?.message) || `Image upload failed (HTTP ${response.status})`,
      };
    }

    const s3Link = sanitizeText(
      ((payload?.data as Record<string, unknown> | undefined)?.s3_link as string) ||
        ((payload?.data as Record<string, unknown> | undefined)?.s3Link as string) ||
        ((payload?.data as Record<string, unknown> | undefined)?.url as string) ||
        ((payload?.data as Record<string, unknown> | undefined)?.cover_image as string) ||
        ""
    );
    if (!s3Link && VISITOR_IMAGE_UPLOAD_URL) {
      return { ok: false, url: "", error: "Image upload API did not return an image URL." };
    }
    return { ok: true, url: s3Link, error: "" };
  } catch (error) {
    console.warn("[WalkInSync] Visitor photo upload failed", error);
    return {
      ok: false,
      url: "",
      error: error instanceof Error ? error.message : "Image upload failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isExpiredTokenEnvelope(payload: ApiEnvelope, status: number) {
  const message = toMessageText(payload?.message).trim();
  return status === 401 && message === "Too late due to exp claim";
}

class GateVisitorApiClient {
  private readonly baseUrl: string;
  private readonly loginUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly companyId: string;

  private accessToken: string | null = null;
  private initPromise: Promise<void>;
  private refreshPromise: Promise<void> | null = null;

  constructor(config: GateApiClientConfig) {
    this.baseUrl = trimSlash(config.baseUrl);
    this.loginUrl = config.loginUrl;
    this.username = config.username;
    this.password = config.password;
    this.companyId = config.companyId;
    // Constructor bootstraps auth so token is ready for API calls.
    this.initPromise = this.refreshToken().catch((error) => {
      console.error("[WalkInSync] Initial login failed", error);
    });
  }

  private hasLoginConfig() {
    return !!(this.loginUrl && this.username && this.password);
  }

  private hasApiConfig() {
    return !!(this.baseUrl && this.companyId);
  }

  private async login(): Promise<void> {
    if (!this.hasLoginConfig()) {
      throw new Error("Missing gate login configuration");
    }

    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      console.debug("[WalkInSync] Login API call", {
        method: "POST",
        url: this.loginUrl,
      });

      const response = await fetch(this.loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
        signal: controller.signal,
      });

      const payload = (await parseEnvelopeSafe(response)) as LoginResponse;
      console.debug("[WalkInSync] Login API response", {
        status: response.status,
        ok: response.ok,
        message: toMessageText(payload?.message),
      });

      const token = payload?.data?.access_token;
      if (!response.ok || !token) {
        throw new Error(toMessageText(payload?.message) || `Login failed (HTTP ${response.status})`);
      }

      this.accessToken = token;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async refreshToken(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.login().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async requestWithAuth(
    url: string,
    init: RequestInit,
    retryIfExpired = true
  ): Promise<{ response: Response; payload: ApiEnvelope }> {
    await this.initPromise;
    if (!this.accessToken) {
      await this.refreshToken();
    }

    const headers = new Headers(init.headers || {});
    const isFormDataBody =
      typeof FormData !== "undefined" && init.body instanceof FormData;
    if (init.body !== undefined && !isFormDataBody && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const payload = await parseEnvelopeSafe(response);

      if (
        retryIfExpired &&
        (isExpiredTokenEnvelope(payload, response.status) || isUnauthorizedStatus(response.status))
      ) {
        console.warn(
          "[WalkInSync] Auth expired/unauthorized. Refreshing token and retrying request."
        );
        await this.refreshToken();
        return this.requestWithAuth(url, init, false);
      }

      return { response, payload };
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolvePurposeCategoryId(details: ExternalWalkInDetails) {
    const explicit = toPositiveInt(details.visitorPurposeCategoryId);
    if (explicit) {
      return explicit;
    }
    const intent = sanitizeText(details.intent || "").toLowerCase();
    if (intent === "delivery") {
      return toPositiveInt(DEFAULT_DELIVERY_PURPOSE_CATEGORY_ID) || 3;
    }
    return toPositiveInt(DEFAULT_VISITOR_PURPOSE_CATEGORY_ID) || 1;
  }

  private resolvePurposeSubCategoryId(details: ExternalWalkInDetails) {
    return toPositiveInt(details.visitorPurposeSubCategoryId);
  }

  private resolveVisitorIdForLog(remoteVisitorId?: number | null) {
    return (
      toPositiveInt(remoteVisitorId) || null
    );
  }

  private resolvePurposeLabel(details: ExternalWalkInDetails) {
    const explicitCategoryId = this.resolvePurposeCategoryId(details);
    if (explicitCategoryId === 3) {
      return "Delivery";
    }
    return "Guest";
  }

  private resolvePrimaryMember(details: ExternalWalkInDetails) {
    const source = Array.isArray(details.memberDetails) ? details.memberDetails : [];
    const fallbackCandidates: Array<{
      memberId: number;
      userId: string;
      memberMobileNumber: string;
    }> = [];

    for (const member of source) {
      const memberId =
        toPositiveInt((member as ExternalMemberDetail).member_ids) ||
        toPositiveInt((member as ExternalMemberDetail).member_id) ||
        toPositiveInt((member as MatchedMember).member_id);
      const userId = sanitizeText(
        String(
          (member as ExternalMemberDetail).user_id ||
            (member as MatchedMember).user_id ||
            ""
        )
      );
      const memberMobileNumber = onlyDigits(
        String(
          (member as ExternalMemberDetail).member_mobile_number ||
            (member as ExternalMemberDetail).mobile_number ||
            (member as MatchedMember).member_mobile_number ||
            ""
        )
      );

      if (memberId && userId && memberMobileNumber) {
        return {
          memberId,
          userId,
          memberMobileNumber,
        };
      }

      if (memberId) {
        fallbackCandidates.push({
          memberId,
          userId,
          memberMobileNumber,
        });
      }
    }

    if (fallbackCandidates.length > 0) {
      return fallbackCandidates[0];
    }

    return {
      memberId: null as number | null,
      userId: "",
      memberMobileNumber: "",
    };
  }

  private buildVisitorNotificationFormData(
    details: ExternalWalkInDetails,
    visitorId: number,
    visitorLogId: number,
    primaryMember: { memberId: number; userId: string; memberMobileNumber: string },
    options: { includeFileField?: boolean } = {}
  ) {
    const includeFileField = options.includeFileField !== false;
    const formData = new FormData();
    const companyId = toPositiveInt(details.companyId) || toPositiveInt(this.companyId);
    const visitorCount = toPositiveInt(details.visitorCount) || 1;
    const purposeCategoryId = this.resolvePurposeCategoryId(details);
    const purposeLabel = this.resolvePurposeLabel(details);
    const visitorMobile = onlyDigits(details.phone);
    const visitorName = sanitizeText(details.name);

    formData.append("company_id", String(companyId || this.companyId));
    formData.append("name", visitorName);
    formData.append("mobile", visitorMobile);
    formData.append("purpose", purposeLabel);
    formData.append("in_time", formatGateDateTime(details.visitorCheckIn));
    formData.append("user_id", primaryMember.userId);
    formData.append("visitor_count", String(visitorCount));
    formData.append("purpose_details", purposeLabel);
    formData.append("coming_from", sanitizeText(details.cameFrom));
    formData.append("member_mobile_number", primaryMember.memberMobileNumber);
    formData.append("visitor_id", String(visitorId));
    formData.append("member_id", String(primaryMember.memberId));
    formData.append("purpose_category", String(purposeCategoryId));
    formData.append("visitor_log_id", String(visitorLogId));
    formData.append("self_check_in", "false");
    formData.append("is_staff", String(Boolean(details.isStaff ?? false)));

    const photoBlob = visitorPhotoToImageBlob(sanitizeText(details.photo || ""));
    if (includeFileField && photoBlob) {
      formData.append("file", photoBlob, "visitor.jpg");
    }

    return formData;
  }

  private buildVisitorLogPayload(details: ExternalWalkInDetails, visitorId: number) {
    const categoryId = this.resolvePurposeCategoryId(details);
    const subCategoryId = this.resolvePurposeSubCategoryId(details);
    const visitorCardId = toPositiveInt(details.visitorCardId) || toPositiveInt(DEFAULT_VISITOR_LOG_CARD_ID);
    const companyId = toPositiveInt(details.companyId) || toPositiveInt(this.companyId);
    const companyName = sanitizeText(details.companyName || DEFAULT_VISITOR_LOG_COMPANY_NAME);
    const inGate = sanitizeText(details.inGate || DEFAULT_VISITOR_LOG_IN_GATE);
    const vehicleNumber = sanitizeText(details.vehicleNumber || "");
    const visitorCardNumber = sanitizeText(details.visitorCardNumber || "");
    const visitorCount = toPositiveInt(details.visitorCount) || 1;
    const memberDetails = buildMemberDetailsPayload(details);

    return {
      visitor_id: visitorId,
      visitor_purpose_category_id: categoryId,
      ...(subCategoryId ? { visitor_purpose_sub_category_id: subCategoryId } : {}),
      visitor_card_number: visitorCardNumber,
      ...(visitorCardId ? { visitor_card_id: visitorCardId } : {}),
      visitor_count: visitorCount,
      visitor_coming_from: sanitizeText(details.cameFrom),
      visitor_check_in: formatGateDateTime(details.visitorCheckIn),
      is_always_allowed: Boolean(details.isAlwaysAllowed ?? false),
      company_id: companyId,
      company_name: companyName,
      in_gate: inGate,
      vehicle_number: vehicleNumber,
      is_checked_out: Boolean(details.isCheckedOut ?? false),
      is_staff: Boolean(details.isStaff ?? false),
      member_details: memberDetails,
    };
  }

  async searchVisitor(details: ExternalWalkInDetails): Promise<{
    result: FieldSyncResult;
    found: boolean;
    visitorId: number | null;
    visitorRow?: Record<string, unknown> | null;
  }> {
    if (!this.hasApiConfig() || !this.hasLoginConfig()) {
      return {
        result: {
          field: "search_visitor",
          configured: false,
          ok: false,
          error: "Missing gate API configuration",
        },
        found: false,
        visitorId: null,
        visitorRow: null,
      };
    }

    const mobile = onlyDigits(details.phone);
    if (!mobile) {
      return {
        result: {
          field: "search_visitor",
          configured: true,
          ok: false,
          skipped: true,
          message: "Skipped search because phone number is missing.",
        },
        found: false,
        visitorId: null,
        visitorRow: null,
      };
    }

    let searchUrl: string;
    if (VISITOR_SEARCH_URL_OVERRIDE) {
      const requestUrl = new URL(
        VISITOR_SEARCH_URL_OVERRIDE.startsWith("http")
          ? VISITOR_SEARCH_URL_OVERRIDE
          : `https://${VISITOR_SEARCH_URL_OVERRIDE}`
      );
      requestUrl.searchParams.set("company_id", this.companyId);
      requestUrl.searchParams.set("mobile_number", mobile);
      searchUrl = requestUrl.toString();
    } else {
      const requestUrl = new URL(`${this.baseUrl}/api/visitor/entry`);
      requestUrl.searchParams.set("company_id", this.companyId);
      requestUrl.searchParams.set("mobile_number", mobile);
      searchUrl = requestUrl.toString();
    }

    const startedAt = Date.now();
    console.info("[perf] visitor_search_start", {
      t: startedAt,
      method: "GET",
      url: searchUrl,
    });

    const { response, payload } = await this.requestWithAuth(searchUrl, {
      method: "GET",
    });

    console.info("[perf] visitor_search_end", {
      t: Date.now(),
      duration_ms: Date.now() - startedAt,
      status: response.status,
      ok: response.ok,
      message: toMessageText(payload?.message),
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

    const rows = Array.isArray((payload as VisitorSearchResponse)?.data)
      ? (payload as VisitorSearchResponse).data || []
      : [];
    const found = rows.length > 0;
    const firstRow = found ? rows[0] : null;
    const visitorId = firstRow ? extractVisitorId(firstRow) : null;

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
      visitorRow: firstRow,
    };
  }

  async addVisitorEntry(details: ExternalWalkInDetails): Promise<FieldSyncResult> {
    if (!this.hasApiConfig() || !this.hasLoginConfig()) {
      return {
        field: "add_visitor_entry",
        configured: false,
        ok: false,
        error: "Missing gate API configuration",
      };
    }

    const mobile = onlyDigits(details.phone);
    if (!mobile) {
      return {
        field: "add_visitor_entry",
        configured: true,
        ok: false,
        skipped: true,
        error: "Skipped add visitor entry because phone number is missing.",
      };
    }

    const requestUrl = VISITOR_CREATE_URL_OVERRIDE || `${this.baseUrl}/api/visitor/entry`;
    const normalizedCameFrom = sanitizeText(details.cameFrom);
    const normalizedMeetingWith = sanitizeText(details.meetingWith);
    const normalizedPhoto = sanitizeText(details.photo || "");
    const photoBase64 = toBase64Payload(normalizedPhoto);
    let visitorImagePayload = photoBase64 || "jj";

    if (normalizedPhoto) {
      if (isHttpUrl(normalizedPhoto)) {
        visitorImagePayload = normalizedPhoto;
      } else {
        const uploadedPhoto = await uploadVisitorPhotoToCloud(normalizedPhoto, details, {
          authToken: this.accessToken || "",
          loginUrl: this.loginUrl,
          username: this.username,
          password: this.password,
          refreshAuthToken: async () => {
            await this.refreshToken();
            return this.accessToken || "";
          },
        });
        if (!uploadedPhoto.ok) {
          return {
            field: "add_visitor_entry",
            configured: true,
            ok: false,
            error: uploadedPhoto.error || "Photo upload failed.",
          };
        }
        if (uploadedPhoto.url) {
          visitorImagePayload = uploadedPhoto.url;
        }
      }
    }

    const payload = {
      name: sanitizeText(details.name),
      visitor_image: visitorImagePayload,
      mobile_number: mobile,
      // External systems vary in field naming; send both supported aliases.
      coming_from: normalizedCameFrom,
      came_from: normalizedCameFrom,
      meeting_with: normalizedMeetingWith,
    };

    const startedAt = Date.now();
    console.info("[perf] visitor_create_start", {
      t: startedAt,
      method: "POST",
      url: requestUrl,
      payload,
    });

    const { response, payload: responsePayload } = await this.requestWithAuth(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const typed = responsePayload as VisitorAddResponse;

    console.info("[perf] visitor_create_end", {
      t: Date.now(),
      duration_ms: Date.now() - startedAt,
      status: response.status,
      ok: response.ok,
      message: toMessageText(typed?.message),
    });

    if (!response.ok) {
      return {
        field: "add_visitor_entry",
        configured: true,
        ok: false,
        statusCode: response.status,
        error: toMessageText(typed?.message) || `HTTP ${response.status}`,
        requestPayload: payload,
      };
    }

    const visitorId = extractVisitorId(typed?.data || {});
    return {
      field: "add_visitor_entry",
      configured: true,
      ok: true,
      statusCode: response.status,
      message: toMessageText(typed?.message),
      visitorId,
      requestPayload: payload,
    };
  }

  async addVisitorLog(details: ExternalWalkInDetails, remoteVisitorId?: number | null): Promise<FieldSyncResult> {
    if (!this.hasLoginConfig() || !GATE_VISITOR_LOG_API_URL) {
      return {
        field: "add_visitor_log",
        configured: false,
        ok: false,
        error: "Missing visitor log API configuration",
      };
    }

    const visitorId = this.resolveVisitorIdForLog(remoteVisitorId);
    if (!visitorId) {
      return {
        field: "add_visitor_log",
        configured: true,
        ok: false,
        error:
          "Unable to resolve visitor_id for visitor log. Ensure search/add visitor returns an id.",
      };
    }

    const payload = this.buildVisitorLogPayload(details, visitorId);
    const startedAt = Date.now();
    console.info("[perf] visitor_log_start", {
      t: startedAt,
      method: "POST",
      url: GATE_VISITOR_LOG_API_URL,
      payload,
    });

    const { response, payload: responsePayload } = await this.requestWithAuth(
      GATE_VISITOR_LOG_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    const typed = responsePayload as VisitorLogResponse;
    const visitorLogId = extractVisitorLogId(typed?.data || typed);

    console.info("[perf] visitor_log_end", {
      t: Date.now(),
      duration_ms: Date.now() - startedAt,
      status: response.status,
      ok: response.ok,
      message: toMessageText(typed?.message),
    });

    if (!response.ok) {
      return {
        field: "add_visitor_log",
        configured: true,
        ok: false,
        statusCode: response.status,
        error: toMessageText(typed?.message) || `HTTP ${response.status}`,
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
      message: toMessageText(typed?.message),
      visitorId,
      visitorLogId,
      requestPayload: payload,
    };
  }

  async sendVisitorNotification(
    details: ExternalWalkInDetails,
    remoteVisitorId?: number | null,
    remoteVisitorLogId?: number | null
  ): Promise<FieldSyncResult> {
    if (!this.hasLoginConfig() || !GATE_VISITOR_NOTIFICATION_API_URL) {
      return {
        field: "send_member_notification",
        configured: false,
        ok: false,
        error: "Missing visitor notification API configuration",
      };
    }

    const visitorId = this.resolveVisitorIdForLog(remoteVisitorId);
    const visitorLogId = toPositiveInt(remoteVisitorLogId);
    if (!visitorId || !visitorLogId) {
      return {
        field: "send_member_notification",
        configured: true,
        ok: false,
        error:
          "Unable to resolve visitor_id or visitor_log_id for member notification.",
        visitorId,
        visitorLogId,
      };
    }

    const primaryMember = this.resolvePrimaryMember(details);
    if (!primaryMember.memberId || !primaryMember.userId || !primaryMember.memberMobileNumber) {
      return {
        field: "send_member_notification",
        configured: true,
        ok: false,
        error:
          "Unable to resolve member_id, user_id, or member_mobile_number for member notification.",
        visitorId,
        visitorLogId,
      };
    }

    const formData = this.buildVisitorNotificationFormData(details, visitorId, visitorLogId, {
      memberId: primaryMember.memberId,
      userId: primaryMember.userId,
      memberMobileNumber: primaryMember.memberMobileNumber,
    });

    const startedAt = Date.now();
    console.info("[perf] notification_start", {
      t: startedAt,
      method: "POST",
      url: GATE_VISITOR_NOTIFICATION_API_URL,
      visitor_id: visitorId,
      visitor_log_id: visitorLogId,
      member_id: primaryMember.memberId,
    });

    let notificationRequest = await this.requestWithAuth(
      GATE_VISITOR_NOTIFICATION_API_URL,
      {
        method: "POST",
        body: formData,
      }
    );
    let response = notificationRequest.response;
    let typed = notificationRequest.payload as VisitorNotificationResponse;
    let messageText = toMessageText(typed?.message);

    if (!response.ok && response.status === 400 && /file/i.test(messageText)) {
      const retryFormData = this.buildVisitorNotificationFormData(
        details,
        visitorId,
        visitorLogId,
        {
          memberId: primaryMember.memberId,
          userId: primaryMember.userId,
          memberMobileNumber: primaryMember.memberMobileNumber,
        },
        { includeFileField: false }
      );
      notificationRequest = await this.requestWithAuth(
        GATE_VISITOR_NOTIFICATION_API_URL,
        {
          method: "POST",
          body: retryFormData,
        }
      );
      response = notificationRequest.response;
      typed = notificationRequest.payload as VisitorNotificationResponse;
      messageText = toMessageText(typed?.message);
    }

    console.info("[perf] notification_end", {
      t: Date.now(),
      duration_ms: Date.now() - startedAt,
      status: response.status,
      ok: response.ok,
      message: messageText,
    });

    if (!response.ok) {
      return {
        field: "send_member_notification",
        configured: true,
        ok: false,
        statusCode: response.status,
        error: messageText || `HTTP ${response.status}`,
        visitorId,
        visitorLogId,
        requestPayload: {
          visitor_id: visitorId,
          visitor_log_id: visitorLogId,
          member_id: primaryMember.memberId,
          user_id: primaryMember.userId,
        },
      };
    }

    return {
      field: "send_member_notification",
      configured: true,
      ok: true,
      statusCode: response.status,
      message: messageText,
      visitorId,
      visitorLogId,
      requestPayload: {
        visitor_id: visitorId,
        visitor_log_id: visitorLogId,
        member_id: primaryMember.memberId,
        user_id: primaryMember.userId,
      },
    };
  }
}

let gateApiClient: GateVisitorApiClient | null = null;

function getGateApiClient() {
  if (!gateApiClient) {
    gateApiClient = new GateVisitorApiClient({
      baseUrl: GATE_API_BASE_URL,
      loginUrl: GATE_LOGIN_API_URL,
      username: GATE_LOGIN_USERNAME,
      password: GATE_LOGIN_PASSWORD,
      companyId: COMPANY_ID,
    });
  }
  return gateApiClient;
}

export async function syncWalkInDetailsToExternalApis(
  details: ExternalWalkInDetails
): Promise<ExternalSyncResult> {
  const startedAt = Date.now();
  console.info("[flow] sync_walkin_start", { t: startedAt, intent: details.intent || "" });
  const client = getGateApiClient();
  const search = await client.searchVisitor(details);
  let resolvedVisitorId = search.visitorId;

  let addResult: FieldSyncResult;
  if (search.result.ok && !search.found) {
    addResult = await client.addVisitorEntry(details);
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
        ? "Skipped add visitor API because visitor already exists."
        : "Skipped add visitor API because search failed.",
    };
  }

  const addLogResult = await client.addVisitorLog(details, resolvedVisitorId);
  let notificationResult: FieldSyncResult;
  if (addLogResult.ok) {
    notificationResult = await client.sendVisitorNotification(
      details,
      addLogResult.visitorId || resolvedVisitorId,
      addLogResult.visitorLogId
    );
  } else {
    notificationResult = {
      field: "send_member_notification",
      configured: !!GATE_VISITOR_NOTIFICATION_API_URL,
      ok: true,
      skipped: true,
      message: "Skipped member notification because visitor log API did not succeed.",
    };
  }

  const results = [search.result, addResult, addLogResult, notificationResult];
  const attempted = results.some((result) => result.configured);
  const allSuccessful =
    attempted &&
    results
      .filter((result) => result.configured && !result.skipped)
      .every((result) => result.ok);

  const output = {
    attempted,
    allSuccessful,
    results,
  };
  console.info("[flow] sync_walkin_end", {
    t: Date.now(),
    duration_ms: Date.now() - startedAt,
    attempted,
    allSuccessful,
  });
  return output;
}

export async function warmupVisitorAuth(): Promise<void> {
  try {
    getGateApiClient();
  } catch (error) {
    console.warn("[WalkInSync] Warmup auth skipped", error);
  }
}
