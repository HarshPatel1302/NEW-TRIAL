import { resolveReceptionistApiBaseUrl } from "../receptionist-api-base";

describe("resolveReceptionistApiBaseUrl", () => {
  const prevEnv = process.env.REACT_APP_RECEPTIONIST_API_URL;

  afterEach(() => {
    process.env.REACT_APP_RECEPTIONIST_API_URL = prevEnv;
  });

  test("default /api joins window.origin (jsdom)", () => {
    delete process.env.REACT_APP_RECEPTIONIST_API_URL;
    expect(resolveReceptionistApiBaseUrl()).toMatch(/\/api$/);
    expect(resolveReceptionistApiBaseUrl()).toContain(window.location.origin);
  });

  test("non-local page rewrites localhost backend URL to same-origin /api (tunnel-safe)", () => {
    jest.isolateModules(() => {
      process.env.REACT_APP_RECEPTIONIST_API_URL = "http://localhost:5050/api";
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          hostname: "kiosk-demo.trycloudflare.com",
          origin: "https://kiosk-demo.trycloudflare.com",
        },
      });
      const { resolveReceptionistApiBaseUrl: resolve } = require("../receptionist-api-base");
      expect(resolve()).toBe("https://kiosk-demo.trycloudflare.com/api");
    });
  });

  test("LAN hostname rewrites localhost backend URL to same-origin /api (remote device on HTTP)", () => {
    jest.isolateModules(() => {
      process.env.REACT_APP_RECEPTIONIST_API_URL = "http://127.0.0.1:5050/api";
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          hostname: "192.168.1.11",
          origin: "http://192.168.1.11:3000",
        },
      });
      const { resolveReceptionistApiBaseUrl: resolve } = require("../receptionist-api-base");
      expect(resolve()).toBe("http://192.168.1.11:3000/api");
    });
  });

  test("absolute non-localhost URL is preserved on remote page", () => {
    jest.isolateModules(() => {
      process.env.REACT_APP_RECEPTIONIST_API_URL = "https://api.example.com/v1";
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          hostname: "kiosk-demo.trycloudflare.com",
          origin: "https://kiosk-demo.trycloudflare.com",
        },
      });
      const { resolveReceptionistApiBaseUrl: resolve } = require("../receptionist-api-base");
      expect(resolve()).toBe("https://api.example.com/v1");
    });
  });
});
