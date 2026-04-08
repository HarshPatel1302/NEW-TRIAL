/**
 * Integration tests for /api/kiosk/* (Express + in-memory proxy state).
 * Each block resets env and reloads the module to avoid cross-test leakage.
 */
const request = require("supertest");
const express = require("express");

function freshApp() {
  jest.resetModules();
  const { mountKioskGateRoutes } = require("./kiosk-gate-proxy");
  const app = express();
  app.use(express.json());
  mountKioskGateRoutes(app);
  return app;
}

describe("kiosk gate proxy — disabled", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.KIOSK_GATE_PROXY_ENABLED = "0";
  });

  test("GET /api/kiosk/health reports proxy off", async () => {
    const app = freshApp();
    const res = await request(app).get("/api/kiosk/health");
    expect(res.status).toBe(200);
    expect(res.body.proxyEnabled).toBe(false);
    expect(res.body.tokenCached).toBe(false);
  });

  test("POST /api/kiosk/warmup returns PROXY_DISABLED with shape", async () => {
    const app = freshApp();
    const res = await request(app).post("/api/kiosk/warmup").send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.errorCode).toBe("PROXY_DISABLED");
    expect(res.body.proxyEnabled).toBe(false);
    expect(res.body.gateLoginOk).toBe(false);
    expect(res.body.memberWarmOk).toBe(false);
  });

  test("POST /api/kiosk/visitor-search returns structured body (not 503)", async () => {
    const app = freshApp();
    const res = await request(app).post("/api/kiosk/visitor-search").send({ phone: "9999999999" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.errorCode).toBe("PROXY_DISABLED");
    expect(res.body.proxyEnabled).toBe(false);
  });
});

describe("kiosk gate proxy — truthy enable flags", () => {
  test("enables proxy for YES", async () => {
    jest.resetModules();
    process.env.KIOSK_GATE_PROXY_ENABLED = "YES";
    process.env.KIOSK_GATE_LOGIN_URL = "http://127.0.0.1:65530/invalid-login";
    process.env.KIOSK_GATE_USERNAME = "u";
    process.env.KIOSK_GATE_PASSWORD = "p";
    const app = freshApp();
    const h = await request(app).get("/api/kiosk/health");
    expect(h.body.proxyEnabled).toBe(true);
    expect(h.body.gateLoginConfigured).toBe(true);
  });
});

describe("kiosk gate proxy — enabled, gate login fails", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.KIOSK_GATE_PROXY_ENABLED = "on";
    process.env.KIOSK_GATE_LOGIN_URL = "http://127.0.0.1:65530/nope";
    process.env.KIOSK_GATE_USERNAME = "x";
    process.env.KIOSK_GATE_PASSWORD = "y";
  });

  test("warmup returns GATE_LOGIN_FAILED (HTTP 200)", async () => {
    const app = freshApp();
    const res = await request(app).post("/api/kiosk/warmup").send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.errorCode).toBe("GATE_LOGIN_FAILED");
    expect(res.body.gateLoginOk).toBe(false);
  });
});

describe("kiosk gate proxy — enabled with mocked fetch (visitor + member)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("visitor-search success envelope", async () => {
    jest.resetModules();
    process.env.KIOSK_GATE_PROXY_ENABLED = "true";
    process.env.KIOSK_GATE_LOGIN_URL = "https://mock.test/login";
    process.env.KIOSK_GATE_USERNAME = "u";
    process.env.KIOSK_GATE_PASSWORD = "p";
    process.env.KIOSK_GATE_BASE_URL = "https://mock.test";
    process.env.KIOSK_GATE_COMPANY_ID = "1";

    global.fetch = jest.fn(async (url, init) => {
      const u = String(url);
      if (u.includes("/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { access_token: "fake.jwt.token" } }),
        };
      }
      if (u.includes("visitor") || u.includes("entry")) {
        expect(init?.headers?.Authorization).toMatch(/^Bearer /);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 42,
                name: "Test Visitor",
                mobile: "9999999999",
                visitor_image: "",
                coming_from: "ACME",
              },
            ],
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const app = freshApp();
    const res = await request(app).post("/api/kiosk/visitor-search").send({ phone: "9999999999" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.errorCode).toBeNull();
    expect(res.body.found).toBe(true);
    expect(res.body.visitor?.name).toBe("Test Visitor");
  });

  test("member-search QUERY_REQUIRED envelope", async () => {
    jest.resetModules();
    process.env.KIOSK_GATE_PROXY_ENABLED = "1";
    process.env.KIOSK_GATE_LOGIN_URL = "https://mock.test/login";
    process.env.KIOSK_GATE_USERNAME = "u";
    process.env.KIOSK_GATE_PASSWORD = "p";

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { access_token: "fake.jwt.token" } }),
    }));

    const app = freshApp();
    const res = await request(app).post("/api/kiosk/member-search").send({ query: "" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.errorCode).toBe("QUERY_REQUIRED");
  });

  test("member index fetch failure returns MEMBER_INDEX_ERROR", async () => {
    jest.resetModules();
    process.env.KIOSK_GATE_PROXY_ENABLED = "1";
    process.env.KIOSK_GATE_LOGIN_URL = "https://mock.test/login";
    process.env.KIOSK_GATE_USERNAME = "u";
    process.env.KIOSK_GATE_PASSWORD = "p";
    process.env.KIOSK_MEMBER_LIST_URL = "https://mock.test/members?company_id=1";

    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes("/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { access_token: "fake.jwt.token" } }),
        };
      }
      return {
        ok: false,
        status: 500,
        json: async () => ({ message: "member boom" }),
      };
    });

    const app = freshApp();
    const res = await request(app).post("/api/kiosk/member-search").send({ query: "someone" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.errorCode).toBe("MEMBER_INDEX_ERROR");
    expect(String(res.body.errorMessage || "")).toContain("member boom");
  });

  test("batch-lookup skip_visitor skips gate visitor lookup", async () => {
    jest.resetModules();
    process.env.KIOSK_GATE_PROXY_ENABLED = "true";
    process.env.KIOSK_GATE_LOGIN_URL = "https://mock.test/login";
    process.env.KIOSK_GATE_USERNAME = "u";
    process.env.KIOSK_GATE_PASSWORD = "p";
    process.env.KIOSK_GATE_BASE_URL = "https://mock.test";
    process.env.KIOSK_GATE_COMPANY_ID = "1";

    let visitorEntryFetchCount = 0;
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes("/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { access_token: "fake.jwt.token" } }),
        };
      }
      if (u.includes("/api/visitor/entry")) {
        visitorEntryFetchCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const app = freshApp();
    const res = await request(app)
      .post("/api/kiosk/batch-lookup")
      .send({ phone: "9999999999", skip_visitor: true, member_primary: "" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.visitor).toEqual({ skipped: true });
    expect(visitorEntryFetchCount).toBe(0);
  });

  test("batch-lookup with member_primary skips visitor lookup by default", async () => {
    jest.resetModules();
    process.env.KIOSK_GATE_PROXY_ENABLED = "true";
    process.env.KIOSK_GATE_LOGIN_URL = "https://mock.test/login";
    process.env.KIOSK_GATE_USERNAME = "u";
    process.env.KIOSK_GATE_PASSWORD = "p";
    process.env.KIOSK_GATE_BASE_URL = "https://mock.test";
    process.env.KIOSK_GATE_COMPANY_ID = "1";

    let visitorEntryFetchCount = 0;
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes("/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { access_token: "fake.jwt.token" } }),
        };
      }
      if (u.includes("/api/visitor/entry")) {
        visitorEntryFetchCount += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    const app = freshApp();
    const res = await request(app)
      .post("/api/kiosk/batch-lookup")
      .send({ phone: "9999999999", member_primary: "Alice" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.visitor).toEqual({ skipped: true });
    expect(visitorEntryFetchCount).toBe(0);
  });
});
