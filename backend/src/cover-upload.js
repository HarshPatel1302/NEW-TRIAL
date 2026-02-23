const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_LOGIN_URL = "https://societybackend.cubeone.in/api/login";

const COVER_UPLOAD_API_URL =
  process.env.COVER_UPLOAD_API_URL ||
  "https://meetservice.cubeone.in/api/v1/upload-cover";
const VISITOR_PHOTO_STORAGE_DIR =
  process.env.VISITOR_PHOTO_STORAGE_DIR || "./storage/visitor-photos";

let accessToken = null;
let refreshPromise = null;

function toMessageText(value) {
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

function sanitizeFileNameHint(input) {
  return String(input || "visitor")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "visitor";
}

function resolveStorageDir() {
  if (path.isAbsolute(VISITOR_PHOTO_STORAGE_DIR)) {
    return VISITOR_PHOTO_STORAGE_DIR;
  }

  const normalized = VISITOR_PHOTO_STORAGE_DIR.replace(/^\.?\//, "");
  return path.resolve(__dirname, "..", normalized);
}

function extractBase64Payload(photoData) {
  const raw = String(photoData || "").trim();
  if (!raw) {
    throw new Error("photoDataUrl is required");
  }

  if (raw.startsWith("data:")) {
    const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) {
      throw new Error("Invalid data URL photo payload");
    }
    return { mimeType: match[1].toLowerCase(), base64: match[2] };
  }

  return { mimeType: "image/jpeg", base64: raw };
}

function decodePhotoBuffer(photoData) {
  const { mimeType, base64 } = extractBase64Payload(photoData);
  const cleaned = base64.replace(/\s/g, "");
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer || buffer.length < 64) {
    throw new Error("Photo payload too small or invalid");
  }
  return { mimeType, buffer };
}

async function persistPhotoBuffer(photoData, fileNameHint) {
  const { mimeType, buffer } = decodePhotoBuffer(photoData);
  const storageDir = resolveStorageDir();
  await fs.mkdir(storageDir, { recursive: true });

  const now = Date.now();
  const rand = crypto.randomInt(100000, 999999);
  const safeHint = sanitizeFileNameHint(fileNameHint);
  const fileName = `${now}-${rand}-${safeHint}.jpg`;
  const filePath = path.join(storageDir, fileName);

  await fs.writeFile(filePath, buffer);
  return {
    mimeType,
    fileName,
    filePath,
    relativePath: path.relative(process.cwd(), filePath),
  };
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function resolveLoginConfig(options = {}) {
  return {
    loginUrl:
      String(options.loginUrl || "").trim() ||
      process.env.COVER_UPLOAD_LOGIN_URL ||
      process.env.GATE_LOGIN_API_URL ||
      DEFAULT_LOGIN_URL,
    username:
      String(options.username || "").trim() ||
      process.env.COVER_UPLOAD_USERNAME ||
      process.env.GATE_LOGIN_USERNAME ||
      "",
    password:
      String(options.password || "").trim() ||
      process.env.COVER_UPLOAD_PASSWORD ||
      process.env.GATE_LOGIN_PASSWORD ||
      "",
  };
}

function extractToken(payload) {
  return (
    payload?.data?.access_token ||
    payload?.data?.token ||
    payload?.access_token ||
    payload?.token ||
    ""
  );
}

function hasLoginConfig(loginConfig) {
  return !!(loginConfig?.loginUrl && loginConfig?.username && loginConfig?.password);
}

async function loginForToken(loginConfig) {
  if (!hasLoginConfig(loginConfig)) {
    throw new Error("Missing cover-upload login configuration");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(loginConfig.loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginConfig.username,
        password: loginConfig.password,
      }),
      signal: controller.signal,
    });
    const payload = await parseJsonSafe(response);
    const token = extractToken(payload);

    if (!response.ok || !token) {
      throw new Error(
        toMessageText(payload?.message) || `Cover upload login failed (HTTP ${response.status})`
      );
    }
    accessToken = String(token);
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshToken(loginConfig) {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = loginForToken(loginConfig).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function ensureToken({ authToken, loginConfig } = {}) {
  const provided = String(authToken || "").trim();
  if (provided) {
    accessToken = provided;
    return accessToken;
  }
  if (accessToken) {
    return accessToken;
  }
  await refreshToken(loginConfig);
  return accessToken;
}

async function uploadFileToCloud({ filePath, fileName, mimeType, authToken, loginConfig }, retry = true) {
  if (!COVER_UPLOAD_API_URL) {
    throw new Error("Missing COVER_UPLOAD_API_URL");
  }

  const token = await ensureToken({ authToken, loginConfig });
  const fileBuffer = await fs.readFile(filePath);
  const formData = new FormData();
  const blob = new Blob([fileBuffer], {
    type: mimeType || "image/jpeg",
  });
  formData.append(
    "cover_image",
    blob,
    fileName
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(COVER_UPLOAD_API_URL, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
      signal: controller.signal,
    });
    const payload = await parseJsonSafe(response);

    if ((response.status === 401 || response.status === 403) && retry && hasLoginConfig(loginConfig)) {
      await refreshToken(loginConfig);
      return uploadFileToCloud(
        { filePath, fileName, mimeType, authToken: accessToken, loginConfig },
        false
      );
    }

    if (!response.ok) {
      throw new Error(
        toMessageText(payload?.message) || `Cover upload failed (HTTP ${response.status})`
      );
    }

    const s3Link = payload?.data?.s3_link || payload?.data?.s3Link || "";
    if (!s3Link) {
      throw new Error("Cover upload response missing data.s3_link");
    }

    return {
      s3Link: String(s3Link),
      payload,
      status: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadVisitorPhotoAndGetS3Link(photoData, options = {}) {
  const { fileNameHint = "visitor", authToken = "" } = options;
  const loginConfig = resolveLoginConfig(options);
  const persisted = await persistPhotoBuffer(photoData, fileNameHint);
  const uploaded = await uploadFileToCloud({
    ...persisted,
    authToken,
    loginConfig,
  });
  return {
    s3Link: uploaded.s3Link,
    localPath: persisted.relativePath,
    fileName: persisted.fileName,
  };
}

module.exports = {
  uploadVisitorPhotoAndGetS3Link,
};
