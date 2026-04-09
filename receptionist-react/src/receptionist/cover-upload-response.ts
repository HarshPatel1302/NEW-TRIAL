/**
 * Normalizes meetservice / CubeOne / proxy upload-cover JSON into a single HTTPS URL string.
 */

function sanitizeText(input: string) {
  return String(input || "").trim();
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(sanitizeText(value));
}

type LoosePayload = {
  data?: unknown;
  message?: string;
  success?: boolean;
  [key: string]: unknown;
};

/** First plausible image URL from upload-cover style responses. */
export function extractCoverUploadImageUrl(payload: unknown): string {
  const tryString = (v: unknown) => {
    const s = sanitizeText(String(v || ""));
    if (!s) return "";
    if (isHttpUrl(s)) return s;
    return "";
  };

  const p = payload as LoosePayload;
  const data = p?.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const keys = [
      "s3_link",
      "s3Link",
      "url",
      "cover_image",
      "coverImage",
      "image_url",
      "imageUrl",
      "file_url",
      "fileUrl",
      "path",
      "link",
    ];
    for (const k of keys) {
      const hit = tryString(d[k]);
      if (hit) return hit;
    }
  }
  if (p && typeof p === "object") {
    for (const k of ["url", "s3_link", "s3Link", "cover_image"]) {
      const hit = tryString((p as Record<string, unknown>)[k]);
      if (hit) return hit;
    }
  }
  return deepFindFirstHttpUrl(payload);
}

function deepFindFirstHttpUrl(obj: unknown, depth = 0): string {
  if (depth > 5 || obj === null || obj === undefined) return "";
  if (typeof obj === "string") {
    const s = obj.trim();
    return isHttpUrl(s) ? s : "";
  }
  if (typeof obj !== "object") return "";
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const found = deepFindFirstHttpUrl(v, depth + 1);
    if (found) return found;
  }
  return "";
}
