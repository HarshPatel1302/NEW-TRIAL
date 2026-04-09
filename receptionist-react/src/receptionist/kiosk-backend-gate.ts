/**
 * Optional aggregation: visitor search + member search via receptionist backend
 * (shared gate auth + in-memory member index on server).
 *
 * REACT_APP_KIOSK_GATE_PROXY=1 and same API base/key as DatabaseManager.
 */

import type { VisitorSearchLookupResult } from "./external-visitor-sync";
import type { MatchedMember, MemberLookupResult, MemberSearchMode } from "./member-directory";
import {
  defaultKioskGateProxyEnabled,
  explicitKioskProxyRequested,
} from "./kiosk-runtime-defaults";
import { resolveReceptionistApiBaseUrl } from "../lib/receptionist-api-base";
import { perfRecordSummary } from "./perf-summary";

function onlyDigitsPhone(input: string): string {
  return String(input || "").replace(/\D/g, "");
}

const API_KEY = String(process.env.REACT_APP_RECEPTIONIST_API_KEY || "").trim();

export function isKioskGateProxyEnabled(): boolean {
  return defaultKioskGateProxyEnabled() && !!API_KEY;
}

/** Last GET /api/kiosk/proxy-status result (session-scoped module state). */
export type KioskProxyStatusPayload = {
  proxyEnabled: boolean;
  gateLoginConfigured: boolean;
  memberListConfigured?: boolean;
  companyId?: string;
  config?: Record<string, unknown>;
};

export type KioskWarmupPayload = {
  ok: boolean;
  proxyEnabled: boolean;
  gateLoginOk: boolean;
  memberWarmOk: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  tokenCached?: boolean;
  memberIndexSize?: number;
  config?: Record<string, unknown>;
};

export type KioskProxyHealthPayload = Record<string, unknown>;

let skipKioskWarmupUntilReload = false;
let loggedExplicitBackendProxyOff = false;

/** Test hook */
export function resetKioskProxyClientStateForTests(): void {
  skipKioskWarmupUntilReload = false;
  loggedExplicitBackendProxyOff = false;
}

function kioskResponseIndicatesFallback(data: {
  ok?: boolean;
  proxyEnabled?: boolean;
  errorCode?: string | null;
}): boolean {
  if (data.proxyEnabled === false) return true;
  if (data.errorCode === "PROXY_DISABLED") return true;
  if (data.ok === false) return true;
  return false;
}

async function kioskFetch(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${resolveReceptionistApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });
}

async function kioskGet(path: string): Promise<Response> {
  return fetch(`${resolveReceptionistApiBaseUrl()}${path}`, {
    method: "GET",
    headers: {
      "x-api-key": API_KEY,
    },
  });
}

async function readResponseJson<T>(res: Response): Promise<{ parsed: T | null; raw: string }> {
  const raw = await res.text();
  try {
    return { parsed: JSON.parse(raw) as T, raw };
  } catch {
    return { parsed: null, raw };
  }
}

/**
 * Cheap probe: no gate token fetch. Use before POST /warmup to avoid blind retries when proxy is off.
 */
export async function fetchKioskProxyStatus(): Promise<KioskProxyStatusPayload | null> {
  if (!isKioskGateProxyEnabled()) return null;
  try {
    const res = await kioskGet("/kiosk/proxy-status");
    const { parsed, raw } = await readResponseJson<KioskProxyStatusPayload>(res);
    if (!parsed) {
      console.warn("[KioskProxy] proxy-status unreadable", { httpStatus: res.status, bodyPreview: raw.slice(0, 400) });
      return null;
    }
    if (parsed.proxyEnabled === false && explicitKioskProxyRequested() && !loggedExplicitBackendProxyOff) {
      loggedExplicitBackendProxyOff = true;
      console.warn(
        "[KioskProxy] REACT_APP_KIOSK_GATE_PROXY is truthy but the API reports the kiosk proxy is disabled. Continuing in fallback mode (direct gate / local directory).",
        parsed
      );
    }
    return parsed;
  } catch (e) {
    console.warn("[KioskProxy] proxy-status network error", e);
    return null;
  }
}

/** Read-only server health (no token refresh). For dev/staging diagnostics. */
export async function fetchKioskProxyHealth(): Promise<KioskProxyHealthPayload | null> {
  if (!isKioskGateProxyEnabled()) return null;
  try {
    const res = await kioskGet("/kiosk/health");
    const { parsed, raw } = await readResponseJson<KioskProxyHealthPayload>(res);
    if (!parsed) {
      console.warn("[KioskProxy] /kiosk/health unreadable", res.status, raw.slice(0, 400));
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn("[KioskProxy] /kiosk/health error", e);
    return null;
  }
}

/**
 * Best-effort: never throws; failures are logged with full JSON. Kiosk keeps running (direct gate fallback).
 */
export async function kioskBackendWarmup(): Promise<void> {
  if (!isKioskGateProxyEnabled()) return;
  if (skipKioskWarmupUntilReload) return;

  const status = await fetchKioskProxyStatus();
  if (status && status.proxyEnabled === false) {
    console.info(
      "[KioskProxy] backend reports kiosk proxy disabled (KIOSK_GATE_PROXY_ENABLED not truthy). Skipping warmup; proxy calls use fallback.",
      status
    );
    skipKioskWarmupUntilReload = true;
    return;
  }

  try {
    const res = await kioskFetch("/kiosk/warmup", {});
    const { parsed: data, raw } = await readResponseJson<KioskWarmupPayload>(res);

    if (!data) {
      console.warn("[KioskProxy] warmup: non-JSON or empty body (non-fatal)", {
        httpStatus: res.status,
        bodyPreview: raw.slice(0, 500),
      });
      return;
    }

    if (!res.ok) {
      console.warn("[KioskProxy] warmup: unexpected HTTP (non-fatal)", {
        httpStatus: res.status,
        body: data,
        rawPreview: raw.slice(0, 500),
      });
      if (
        res.status === 503 &&
        String((data as { error?: string }).error || "").includes("Kiosk gate proxy disabled")
      ) {
        skipKioskWarmupUntilReload = true;
      }
      return;
    }

    if (data.proxyEnabled === false) {
      console.info("[KioskProxy] warmup body: proxy off; skipping further warmups this session.", data);
      skipKioskWarmupUntilReload = true;
      if (explicitKioskProxyRequested() && !loggedExplicitBackendProxyOff) {
        loggedExplicitBackendProxyOff = true;
        console.warn(
          "[KioskProxy] REACT_APP_KIOSK_GATE_PROXY is truthy but warmup reports proxy disabled. Fallback mode.",
          data
        );
      }
      return;
    }

    if (data.ok === true) {
      if (data.memberWarmOk === false) {
        console.warn(
          "[KioskProxy] warmup degraded: gate token ok but member index warm failed; member proxy may error until fixed.",
          data
        );
      } else if (process.env.REACT_APP_RECEPTIONIST_PERF === "1") {
        console.info("[KioskProxy] warmup ok", data);
      }
      return;
    }

    console.warn(
      "[KioskProxy] warmup failed (session continues; use direct gate / local flows where configured)",
      data
    );
  } catch (e) {
    console.warn("[KioskProxy] warmup network error (non-fatal)", e);
  }
}

/** Returns null to fall back to direct gate calls. */
export async function kioskVisitorSearchByPhone(
  phoneDigits: string
): Promise<VisitorSearchLookupResult | null> {
  if (!isKioskGateProxyEnabled()) return null;
  const started = Date.now();
  try {
    const res = await kioskFetch("/kiosk/visitor-search", { phone: phoneDigits });
    const { parsed: data, raw } = await readResponseJson<{
      ok?: boolean;
      configured?: boolean;
      found?: boolean;
      visitor?: {
        id: number;
        name: string;
        mobile: string;
        visitorImage: string;
        comingFrom: string;
      } | null;
      message?: string;
      error?: string;
    }>(res);
    if (!data) {
      console.warn("[KioskProxy] visitor-search unreadable body", res.status, raw.slice(0, 400));
      return null;
    }
    if (!res.ok || kioskResponseIndicatesFallback(data)) {
      console.warn("[KioskProxy] visitor-search fallback", { httpStatus: res.status, body: data });
      return null;
    }
    const duration_ms = Date.now() - started;
    perfRecordSummary("kiosk_proxy_visitor_search_ms", duration_ms);
    if (process.env.REACT_APP_RECEPTIONIST_PERF === "1") {
      console.info("[ReceptionistPerf] kiosk_visitor_search", { duration_ms, found: data.found });
    }
    return {
      configured: true,
      ok: true,
      found: !!data.found,
      message: data.message || "",
      visitor: data.visitor
        ? {
            id: data.visitor.id,
            name: data.visitor.name,
            mobile: data.visitor.mobile,
            visitorImage: data.visitor.visitorImage || "",
            comingFrom: data.visitor.comingFrom || "",
          }
        : null,
    };
  } catch (e) {
    console.warn("[KioskProxy] visitor-search error", e);
    return null;
  }
}

/**
 * Single round-trip: optional visitor lookup + member scoring on the server.
 * For kiosk member resolution, pass `skipVisitor: true` so only destination matching runs (no visitor search).
 */
export async function kioskBatchLookup(params: {
  phone: string;
  member_primary: string;
  member_secondary?: string;
  searchMode?: MemberSearchMode;
  /** When true, server skips gate visitor lookup (member resolution only). */
  skipVisitor?: boolean;
}): Promise<{
  duration_ms: number;
  visitor:
    | VisitorSearchLookupResult
    | { skipped: true }
    | { ok: false; auth_error?: boolean; error?: string; message?: string };
  members: MemberLookupResult | { skipped: true } | { ok: false; error?: string };
} | null> {
  if (!isKioskGateProxyEnabled()) return null;
  const started = Date.now();
  try {
    const res = await kioskFetch("/kiosk/batch-lookup", {
      phone: onlyDigitsPhone(params.phone),
      member_primary: params.member_primary,
      member_secondary: params.member_secondary || "",
      searchMode: params.searchMode || "recipient",
      ...(params.skipVisitor ? { skip_visitor: true } : {}),
    });
    const { parsed: data, raw } = await readResponseJson<{
      ok?: boolean;
      duration_ms?: number;
      visitor?: unknown;
      members?: unknown;
      error?: string;
    }>(res);
    if (!data) {
      console.warn("[KioskProxy] batch-lookup unreadable body", res.status, raw.slice(0, 400));
      return null;
    }
    if (!res.ok || kioskResponseIndicatesFallback(data)) {
      console.warn("[KioskProxy] batch-lookup fallback", { httpStatus: res.status, body: data });
      return null;
    }
    const duration_ms = Date.now() - started;
    perfRecordSummary("kiosk_proxy_batch_lookup_ms", duration_ms);
    if (process.env.REACT_APP_RECEPTIONIST_PERF === "1") {
      console.info("[ReceptionistPerf] kiosk_batch_lookup", { duration_ms });
    }

    const visitorRaw = data.visitor;
    let visitor:
      | VisitorSearchLookupResult
      | { skipped: true }
      | { ok: false; auth_error?: boolean; error?: string; message?: string };
    if (visitorRaw && typeof visitorRaw === "object" && "skipped" in visitorRaw && visitorRaw.skipped) {
      visitor = { skipped: true };
    } else if (
      visitorRaw &&
      typeof visitorRaw === "object" &&
      "ok" in visitorRaw &&
      (visitorRaw as { ok: boolean }).ok === false
    ) {
      const v = visitorRaw as { auth_error?: boolean; error?: string; message?: string };
      visitor = { ok: false, auth_error: v.auth_error, error: v.error, message: v.message };
    } else if (visitorRaw && typeof visitorRaw === "object" && "found" in visitorRaw) {
      const v = visitorRaw as {
        ok?: boolean;
        found?: boolean;
        visitor?: {
          id: number;
          name: string;
          mobile: string;
          visitorImage: string;
          comingFrom: string;
        } | null;
        message?: string;
      };
      visitor = {
        configured: true,
        ok: !!v.ok,
        found: !!v.found,
        message: v.message || "",
        visitor: v.visitor
          ? {
              id: v.visitor.id,
              name: v.visitor.name,
              mobile: v.visitor.mobile,
              visitorImage: v.visitor.visitorImage || "",
              comingFrom: v.visitor.comingFrom || "",
            }
          : null,
      };
    } else {
      visitor = { skipped: true };
    }

    const membersRaw = data.members;
    let members: MemberLookupResult | { skipped: true } | { ok: false; error?: string };
    if (membersRaw && typeof membersRaw === "object" && "skipped" in membersRaw && membersRaw.skipped) {
      members = { skipped: true };
    } else if (membersRaw && typeof membersRaw === "object" && "ok" in membersRaw) {
      const m = membersRaw as {
        ok: boolean;
        configured?: boolean;
        query?: string;
        memberIds?: number[];
        matchedMembers?: MatchedMember[];
        totalCandidates?: number;
        message?: string;
        error?: string;
      };
      if (!m.ok) {
        members = { ok: false, error: m.error };
      } else {
        members = {
          configured: !!m.configured,
          ok: true,
          query: String(m.query || params.member_primary),
          memberIds: Array.isArray(m.memberIds) ? m.memberIds : [],
          matchedMembers: Array.isArray(m.matchedMembers) ? m.matchedMembers : [],
          totalCandidates: Number(m.totalCandidates || 0),
          message: m.message || "",
        };
      }
    } else {
      members = { skipped: true };
    }

    return { duration_ms, visitor, members };
  } catch (e) {
    console.warn("[KioskProxy] batch-lookup error", e);
    return null;
  }
}

export async function kioskMemberSearch(
  query: string,
  secondaryQuery?: string,
  searchMode: MemberSearchMode = "all"
): Promise<MemberLookupResult | null> {
  if (!isKioskGateProxyEnabled()) return null;
  const started = Date.now();
  const path =
    searchMode === "company"
      ? "/kiosk/company-search"
      : searchMode === "recipient"
        ? "/kiosk/recipient-search"
        : "/kiosk/member-search";
  try {
    const res = await kioskFetch(path, {
      query,
      secondaryQuery: secondaryQuery || "",
      searchMode,
    });
    const { parsed: data, raw } = await readResponseJson<{
      ok?: boolean;
      configured?: boolean;
      query?: string;
      memberIds?: number[];
      matchedMembers?: MatchedMember[];
      totalCandidates?: number;
      message?: string;
      error?: string;
    }>(res);
    if (!data) {
      console.warn("[KioskProxy] member-search unreadable body", res.status, raw.slice(0, 400));
      return null;
    }
    if (!res.ok || kioskResponseIndicatesFallback(data)) {
      console.warn("[KioskProxy] member-search fallback", { httpStatus: res.status, body: data });
      return null;
    }
    const duration_ms = Date.now() - started;
    perfRecordSummary(`kiosk_proxy_member_search_ms_${searchMode}`, duration_ms);
    if (process.env.REACT_APP_RECEPTIONIST_PERF === "1") {
      console.info("[ReceptionistPerf] kiosk_member_search", {
        duration_ms,
        count: data.matchedMembers?.length || 0,
        searchMode,
      });
    }
    return {
      configured: !!data.configured,
      ok: true,
      query: String(data.query || query),
      memberIds: Array.isArray(data.memberIds) ? data.memberIds : [],
      matchedMembers: Array.isArray(data.matchedMembers) ? data.matchedMembers : [],
      totalCandidates: Number(data.totalCandidates || 0),
      message: data.message || "",
    };
  } catch (e) {
    console.warn("[KioskProxy] member-search error", e);
    return null;
  }
}
