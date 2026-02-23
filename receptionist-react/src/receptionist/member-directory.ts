type ApiEnvelope<T = unknown> = {
  status?: string;
  status_code?: number;
  message?: string;
  data?: T;
};

type LoginEnvelope = ApiEnvelope<{ access_token?: string; token?: string }>;
type MemberListEnvelope = ApiEnvelope<MemberUnitRecord[]>;

type MemberUnitRecord = {
  id?: number;
  fk_unit_id?: number;
  member_name?: string;
  building_unit?: string;
  unit_flat_number?: string;
  soc_building_name?: string;
  member_details?: MemberDetailRecord[];
  [key: string]: unknown;
};

type MemberDetailRecord = {
  member_id?: number | string;
  member_first_name?: string;
  member_last_name?: string;
  member_email_id?: string;
  member_mobile_number?: string;
  member_type_name?: string;
  user_id?: number | string | null;
  [key: string]: unknown;
};

export type MatchedMember = {
  member_id: number;
  member_name: string;
  member_type_name: string;
  member_mobile_number: string;
  member_email_id: string;
  user_id: string;
  unit_id: number | null;
  building_unit: string;
  unit_flat_number: string;
  soc_building_name: string;
  unit_member_name: string;
};

export type MemberLookupResult = {
  configured: boolean;
  ok: boolean;
  query: string;
  memberIds: number[];
  matchedMembers: MatchedMember[];
  totalCandidates: number;
  statusCode?: number;
  message?: string;
};

const GATE_LOGIN_API_URL = String(process.env.REACT_APP_GATE_LOGIN_API_URL || "").trim();
const GATE_LOGIN_USERNAME = String(process.env.REACT_APP_GATE_LOGIN_USERNAME || "").trim();
const GATE_LOGIN_PASSWORD = String(process.env.REACT_APP_GATE_LOGIN_PASSWORD || "").trim();
const MEMBER_LIST_API_URL = String(
  process.env.REACT_APP_MEMBER_LIST_API_URL || "https://socbackend.cubeone.in/api/admin/member/list"
).trim();
const MEMBER_LIST_COMPANY_ID = String(process.env.REACT_APP_WALKIN_COMPANY_ID || "8196").trim();

const REQUEST_TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_SCORE_FOR_MATCH = 45;

let authToken: string | null = null;
let authPromise: Promise<string> | null = null;
let memberCache: { fetchedAt: number; rows: MemberUnitRecord[] } | null = null;

function normalizeText(input: unknown) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDisplayText(input: unknown) {
  return String(input || "").trim();
}

function tokenize(input: string) {
  return normalizeText(input)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasMemberApiConfig() {
  return !!(
    GATE_LOGIN_API_URL &&
    GATE_LOGIN_USERNAME &&
    GATE_LOGIN_PASSWORD &&
    MEMBER_LIST_API_URL &&
    MEMBER_LIST_COMPANY_ID
  );
}

async function parseEnvelopeSafe(response: Response): Promise<ApiEnvelope> {
  try {
    return (await response.json()) as ApiEnvelope;
  } catch {
    return {};
  }
}

async function loginAndGetToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && authToken) {
    return authToken;
  }

  if (!forceRefresh && authPromise) {
    return authPromise;
  }

  authPromise = (async () => {
    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(GATE_LOGIN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: GATE_LOGIN_USERNAME,
          password: GATE_LOGIN_PASSWORD,
        }),
        signal: controller.signal,
      });

      const payload = (await parseEnvelopeSafe(response)) as LoginEnvelope;
      const token = String(payload?.data?.access_token || payload?.data?.token || "").trim();

      if (!response.ok || !token) {
        const message = String(payload?.message || `Member login failed (HTTP ${response.status})`);
        throw new Error(message);
      }

      authToken = token;
      return token;
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => {
    authPromise = null;
  });

  return authPromise;
}

async function fetchMemberDirectoryRows(forceRefresh = false): Promise<{
  configured: boolean;
  ok: boolean;
  rows: MemberUnitRecord[];
  statusCode?: number;
  message?: string;
}> {
  if (!hasMemberApiConfig()) {
    return {
      configured: false,
      ok: false,
      rows: [],
      message: "Member API configuration is missing.",
    };
  }

  if (
    !forceRefresh &&
    memberCache &&
    Date.now() - memberCache.fetchedAt < CACHE_TTL_MS &&
    memberCache.rows.length > 0
  ) {
    return {
      configured: true,
      ok: true,
      rows: memberCache.rows,
      statusCode: 200,
      message: "cached",
    };
  }

  const requestUrl = new URL(MEMBER_LIST_API_URL);
  if (!requestUrl.searchParams.get("company_id")) {
    requestUrl.searchParams.set("company_id", MEMBER_LIST_COMPANY_ID);
  }

  let token: string;
  try {
    token = await loginAndGetToken(forceRefresh);
  } catch (error: any) {
    return {
      configured: true,
      ok: false,
      rows: [],
      message: String(error?.message || "Member login failed"),
    };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(requestUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      const payload = (await parseEnvelopeSafe(response)) as MemberListEnvelope;
      const statusCode = response.status;

      if ((statusCode === 401 || statusCode === 403) && attempt === 0) {
        token = await loginAndGetToken(true);
        continue;
      }

      if (!response.ok) {
        return {
          configured: true,
          ok: false,
          rows: [],
          statusCode,
          message: String(payload?.message || `Member list failed (HTTP ${statusCode})`),
        };
      }

      const rows = Array.isArray(payload?.data) ? payload.data : [];
      memberCache = {
        fetchedAt: Date.now(),
        rows,
      };

      return {
        configured: true,
        ok: true,
        rows,
        statusCode,
        message: String(payload?.message || "ok"),
      };
    } catch (error: any) {
      if (attempt === 0) {
        continue;
      }
      return {
        configured: true,
        ok: false,
        rows: [],
        message: String(error?.message || "Member list request failed"),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    configured: true,
    ok: false,
    rows: [],
    message: "Unable to fetch member directory.",
  };
}

function buildMemberName(detail: MemberDetailRecord, unit: MemberUnitRecord) {
  const fromDetail = [toDisplayText(detail.member_first_name), toDisplayText(detail.member_last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fromDetail) {
    return fromDetail;
  }

  return toDisplayText(unit.member_name) || "Unknown member";
}

function memberToSearchFields(member: MatchedMember) {
  return [
    member.member_name,
    member.unit_member_name,
    member.building_unit,
    member.unit_flat_number,
    member.soc_building_name,
    member.member_email_id,
    member.member_mobile_number,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function scoreMember(member: MatchedMember, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const queryTokens = tokenize(normalizedQuery);
  const fields = memberToSearchFields(member);

  const normalizedName = normalizeText(member.member_name);
  const normalizedUnitMemberName = normalizeText(member.unit_member_name);
  const normalizedBuildingUnit = normalizeText(member.building_unit);
  const normalizedFlat = normalizeText(member.unit_flat_number);

  let score = 0;

  if (normalizedName === normalizedQuery) {
    score += 180;
  }

  if (normalizedUnitMemberName === normalizedQuery) {
    score += 130;
  }

  if (normalizedBuildingUnit === normalizedQuery || normalizedFlat === normalizedQuery) {
    score += 120;
  }

  fields.forEach((field) => {
    if (!field) return;
    if (field.includes(normalizedQuery)) {
      score += 90;
    }
  });

  queryTokens.forEach((token) => {
    if (token.length < 2) return;

    const tokenInFields = fields.some((field) => field.includes(token));
    if (tokenInFields) {
      score += 14;
    }

    if (normalizedFlat === token || normalizedBuildingUnit.includes(token)) {
      score += 24;
    }
  });

  const digitTokens = normalizedQuery.match(/\d+/g) || [];
  if (digitTokens.length > 0) {
    const unitDigits = `${normalizedBuildingUnit} ${normalizedFlat}`;
    digitTokens.forEach((digits) => {
      if (unitDigits.includes(digits)) {
        score += 35;
      }
    });
  }

  return score;
}

function flattenMembers(rows: MemberUnitRecord[]): MatchedMember[] {
  const flattened: MatchedMember[] = [];

  rows.forEach((unit) => {
    const details = Array.isArray(unit.member_details) ? unit.member_details : [];

    details.forEach((detail) => {
      const memberId = toNumber(detail.member_id);
      if (!memberId) return;

      flattened.push({
        member_id: memberId,
        member_name: buildMemberName(detail, unit),
        member_type_name: toDisplayText(detail.member_type_name),
        member_mobile_number: toDisplayText(detail.member_mobile_number),
        member_email_id: toDisplayText(detail.member_email_id),
        user_id: toDisplayText(detail.user_id),
        unit_id: toNumber(unit.id),
        building_unit: toDisplayText(unit.building_unit),
        unit_flat_number: toDisplayText(unit.unit_flat_number),
        soc_building_name: toDisplayText(unit.soc_building_name),
        unit_member_name: toDisplayText(unit.member_name),
      });
    });
  });

  return flattened;
}

function compactMembers(members: MatchedMember[]) {
  return members.map((member) => ({
    member_id: member.member_id,
    member_name: member.member_name,
    member_type_name: member.member_type_name,
    member_mobile_number: member.member_mobile_number,
    member_email_id: member.member_email_id,
    user_id: member.user_id,
    unit_id: member.unit_id,
    building_unit: member.building_unit,
    unit_flat_number: member.unit_flat_number,
    soc_building_name: member.soc_building_name,
    unit_member_name: member.unit_member_name,
  }));
}

export function encodeMembersForNotes(members: MatchedMember[]) {
  try {
    return encodeURIComponent(JSON.stringify(compactMembers(members)));
  } catch {
    return "";
  }
}

export function decodeMembersFromNotes(encoded: string) {
  const raw = String(encoded || "").trim();
  if (!raw) return [] as MatchedMember[];

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) return [] as MatchedMember[];
    return parsed
      .map((item) => ({
        member_id: Number(item?.member_id),
        member_name: toDisplayText(item?.member_name),
        member_type_name: toDisplayText(item?.member_type_name),
        member_mobile_number: toDisplayText(item?.member_mobile_number),
        member_email_id: toDisplayText(item?.member_email_id),
        user_id: toDisplayText(item?.user_id),
        unit_id: toNumber(item?.unit_id),
        building_unit: toDisplayText(item?.building_unit),
        unit_flat_number: toDisplayText(item?.unit_flat_number),
        soc_building_name: toDisplayText(item?.soc_building_name),
        unit_member_name: toDisplayText(item?.unit_member_name),
      }))
      .filter((item) => Number.isFinite(item.member_id) && item.member_id > 0);
  } catch {
    return [] as MatchedMember[];
  }
}

export async function resolveMembersForDestination(
  primaryQuery: string,
  options: { secondaryQuery?: string; maxResults?: number } = {}
): Promise<MemberLookupResult> {
  const normalizedPrimary = toDisplayText(primaryQuery);
  const normalizedSecondary = toDisplayText(options.secondaryQuery || "");
  const combinedQuery = [normalizedPrimary, normalizedSecondary].filter(Boolean).join(" ").trim();

  if (!combinedQuery) {
    return {
      configured: hasMemberApiConfig(),
      ok: false,
      query: combinedQuery,
      memberIds: [],
      matchedMembers: [],
      totalCandidates: 0,
      message: "Destination query is empty.",
    };
  }

  const directory = await fetchMemberDirectoryRows();
  if (!directory.ok) {
    return {
      configured: directory.configured,
      ok: false,
      query: combinedQuery,
      memberIds: [],
      matchedMembers: [],
      totalCandidates: 0,
      statusCode: directory.statusCode,
      message: directory.message,
    };
  }

  const members = flattenMembers(directory.rows);
  const scored = members
    .map((member) => ({
      member,
      score: scoreMember(member, combinedQuery),
    }))
    .filter((entry) => entry.score >= MIN_SCORE_FOR_MATCH)
    .sort((a, b) => b.score - a.score);

  const dedupedMap = new Map<number, { member: MatchedMember; score: number }>();
  scored.forEach((entry) => {
    const existing = dedupedMap.get(entry.member.member_id);
    if (!existing || entry.score > existing.score) {
      dedupedMap.set(entry.member.member_id, entry);
    }
  });

  const maxResults = Math.max(1, Math.min(Number(options.maxResults || 5), 10));
  const deduped = Array.from(dedupedMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((entry) => entry.member);

  return {
    configured: true,
    ok: true,
    query: combinedQuery,
    memberIds: deduped.map((member) => member.member_id),
    matchedMembers: deduped,
    totalCandidates: members.length,
    statusCode: directory.statusCode,
    message: deduped.length > 0 ? "matched" : "no_match",
  };
}
