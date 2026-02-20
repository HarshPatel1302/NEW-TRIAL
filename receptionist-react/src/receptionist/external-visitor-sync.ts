type SyncKey = "search_visitor" | "add_visitor_entry";

export type ExternalWalkInDetails = {
  name: string;
  phone: string;
  cameFrom: string;
  meetingWith: string;
  localVisitorId?: string;
  intent?: string;
  sessionId?: string | null;
};

type FieldSyncResult = {
  field: SyncKey;
  configured: boolean;
  ok: boolean;
  statusCode?: number;
  error?: string;
  skipped?: boolean;
  message?: string;
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
const GATE_LOGIN_API_URL = process.env.REACT_APP_GATE_LOGIN_API_URL || "";
const GATE_LOGIN_USERNAME = process.env.REACT_APP_GATE_LOGIN_USERNAME || "";
const GATE_LOGIN_PASSWORD = process.env.REACT_APP_GATE_LOGIN_PASSWORD || "";
const COMPANY_ID = process.env.REACT_APP_WALKIN_COMPANY_ID || "8196";

function onlyDigits(input: string) {
  return String(input || "").replace(/\D/g, "");
}

function sanitizeText(input: string) {
  return String(input || "").trim();
}

function trimSlash(url: string) {
  return String(url || "").replace(/\/+$/, "");
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
      console.info("[WalkInSync] Login API call", {
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
      console.info("[WalkInSync] Login API response", {
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
    if (init.body !== undefined && !headers.has("Content-Type")) {
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

      if (retryIfExpired && isExpiredTokenEnvelope(payload, response.status)) {
        console.warn(
          "[WalkInSync] Token expired (exp claim). Refreshing token and retrying request."
        );
        await this.refreshToken();
        return this.requestWithAuth(url, init, false);
      }

      return { response, payload };
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchVisitor(details: ExternalWalkInDetails): Promise<{ result: FieldSyncResult; found: boolean }> {
    if (!this.hasApiConfig() || !this.hasLoginConfig()) {
      return {
        result: {
          field: "search_visitor",
          configured: false,
          ok: false,
          error: "Missing gate API configuration",
        },
        found: false,
      };
    }

    const requestUrl = new URL(`${this.baseUrl}/api/visitor/entry`);
    requestUrl.searchParams.set("company_id", this.companyId);
    requestUrl.searchParams.set("mobile_number", onlyDigits(details.phone));
    console.info("[WalkInSync] Search API call", {
      method: "GET",
      url: requestUrl.toString(),
    });

    const { response, payload } = await this.requestWithAuth(requestUrl.toString(), {
      method: "GET",
    });

    console.info("[WalkInSync] Search API response", {
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
      };
    }

    const found =
      Array.isArray((payload as VisitorSearchResponse)?.data) &&
      ((payload as VisitorSearchResponse).data?.length || 0) > 0;

    return {
      result: {
        field: "search_visitor",
        configured: true,
        ok: true,
        statusCode: response.status,
        message: toMessageText(payload?.message),
      },
      found,
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

    const requestUrl = `${this.baseUrl}/api/visitor/entry`;
    const normalizedCameFrom = sanitizeText(details.cameFrom);
    const normalizedMeetingWith = sanitizeText(details.meetingWith);
    const payload = {
      name: sanitizeText(details.name),
      visitor_image: "jj",
      mobile_number: onlyDigits(details.phone),
      // External systems vary in field naming; send both supported aliases.
      coming_from: normalizedCameFrom,
      came_from: normalizedCameFrom,
      meeting_with: normalizedMeetingWith,
    };

    console.info("[WalkInSync] Add API call", {
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

    console.info("[WalkInSync] Add API response", {
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
      };
    }

    return {
      field: "add_visitor_entry",
      configured: true,
      ok: true,
      statusCode: response.status,
      message: toMessageText(typed?.message),
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
  const client = getGateApiClient();
  const search = await client.searchVisitor(details);

  let addResult: FieldSyncResult;
  if (search.result.ok && !search.found) {
    addResult = await client.addVisitorEntry(details);
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

  const results = [search.result, addResult];
  const attempted = results.some((result) => result.configured);
  const allSuccessful =
    attempted &&
    results
      .filter((result) => result.configured && !result.skipped)
      .every((result) => result.ok);

  return {
    attempted,
    allSuccessful,
    results,
  };
}
