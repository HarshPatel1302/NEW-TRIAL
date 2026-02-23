export type DeliveryApprovalDecision = "allow" | "decline" | "lobby_drop";

export type DeliveryApprovalRequest = {
  deliveryCompany: string;
  recipientCompany: string;
  recipientName: string;
  trackingNumber?: string;
  parcelDescription?: string;
  deliveryPersonName?: string;
  photoDataUrl?: string;
  sessionId?: string | null;
};

export type DeliveryApprovalResult = {
  status: "success" | "pending_api" | "error";
  decision: DeliveryApprovalDecision;
  message: string;
  statusCode?: number;
  raw?: unknown;
};

const DELIVERY_APPROVAL_API_URL = String(
  process.env.REACT_APP_DELIVERY_APPROVAL_API_URL || ""
).trim();
const DELIVERY_APPROVAL_API_KEY = String(
  process.env.REACT_APP_DELIVERY_APPROVAL_API_KEY || ""
).trim();
const REQUEST_TIMEOUT_MS = 9000;

function normalizeDecision(value: unknown): DeliveryApprovalDecision | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z_ ]+/g, "")
    .replace(/\s+/g, "_");

  if (!normalized) return null;

  if (["allow", "allowed", "approve", "approved", "granted", "grant"].includes(normalized)) {
    return "allow";
  }
  if (["decline", "declined", "reject", "rejected", "deny", "denied"].includes(normalized)) {
    return "decline";
  }
  if (
    [
      "lobby_drop",
      "drop_at_lobby",
      "leave_at_lobby",
      "collect_from_lobby",
      "lobby",
      "drop",
    ].includes(normalized)
  ) {
    return "lobby_drop";
  }

  return null;
}

function fallbackMessage(decision: DeliveryApprovalDecision) {
  if (decision === "allow") {
    return "Approval granted. Please use the delivery lift to go up.";
  }
  if (decision === "decline") {
    return "Delivery has been declined. Please take the parcel back.";
  }
  return "Please keep the parcel at the lobby. The team will collect it.";
}

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function requestDeliveryApproval(
  input: DeliveryApprovalRequest
): Promise<DeliveryApprovalResult> {
  if (!DELIVERY_APPROVAL_API_URL) {
    return {
      status: "pending_api",
      decision: "lobby_drop",
      message:
        "Delivery approval API is not configured yet. Please keep the parcel at lobby for collection.",
    };
  }

  const controller = new AbortController();
  const timeout: ReturnType<typeof setTimeout> = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (DELIVERY_APPROVAL_API_KEY) {
      headers.set("x-api-key", DELIVERY_APPROVAL_API_KEY);
    }

    const response = await fetch(DELIVERY_APPROVAL_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        delivery_company: input.deliveryCompany,
        recipient_company: input.recipientCompany,
        recipient_name: input.recipientName,
        tracking_number: input.trackingNumber || "",
        parcel_description: input.parcelDescription || "",
        delivery_person_name: input.deliveryPersonName || "",
        photo_data_url: input.photoDataUrl || "",
        session_id: input.sessionId || null,
        approval_options: ["allow", "decline", "lobby_drop"],
      }),
      signal: controller.signal,
    });

    const payload = await parseJsonSafe(response);
    const decision =
      normalizeDecision((payload as any)?.decision) ||
      normalizeDecision((payload as any)?.data?.decision) ||
      (response.ok ? "allow" : "lobby_drop");
    const message =
      String((payload as any)?.message || "").trim() ||
      String((payload as any)?.data?.message || "").trim() ||
      fallbackMessage(decision);

    if (!response.ok) {
      return {
        status: "error",
        decision,
        message,
        statusCode: response.status,
        raw: payload,
      };
    }

    return {
      status: "success",
      decision,
      message,
      statusCode: response.status,
      raw: payload,
    };
  } catch (error: any) {
    return {
      status: "error",
      decision: "lobby_drop",
      message:
        error?.name === "AbortError"
          ? "Approval request timed out. Please keep the parcel at lobby."
          : "Approval service is unavailable. Please keep the parcel at lobby.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
