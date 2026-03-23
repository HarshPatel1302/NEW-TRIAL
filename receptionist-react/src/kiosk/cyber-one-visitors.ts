/**
 * Temporary fallback pre-registered visitors for QR/passcode checks.
 * Primary mode should be invite-service lookup (API), with this list used only if API is unavailable.
 */

export type PreRegisteredVisitor = {
  /** Exactly 6 digits */
  passcode: string;
  /** Short code encoded on QR / typed for camera simulation */
  qrToken: string;
  fullName: string;
  phone: string;
  companyToVisit: string;
  meetingWith: string;
};

export const CYBER_ONE_PRE_REGISTERED: PreRegisteredVisitor[] = [
  {
    passcode: "482916",
    qrToken: "CY1-AMIT-01",
    fullName: "Amit Sharma",
    phone: "+91 98765 43210",
    companyToVisit: "Neon Labs Pvt Ltd",
    meetingWith: "Priya Nair",
  },
  {
    passcode: "739105",
    qrToken: "CY1-SARAH-02",
    fullName: "Sarah Mitchell",
    phone: "+1 415 555 0198",
    companyToVisit: "Cyber One Holdings",
    meetingWith: "James Okonkwo",
  },
  {
    passcode: "615243",
    qrToken: "CY1-RAHUL-03",
    fullName: "Rahul Verma",
    phone: "+91 99887 76655",
    companyToVisit: "Vertex Analytics",
    meetingWith: "Elena Rossi",
  },
  {
    passcode: "357924",
    qrToken: "CY1-MARIA-04",
    fullName: "Maria González",
    phone: "+34 612 555 014",
    companyToVisit: "Iberia Logistics",
    meetingWith: "David Chen",
  },
  {
    passcode: "864201",
    qrToken: "CY1-KWAME-05",
    fullName: "Kwame Asante",
    phone: "+233 24 555 7788",
    companyToVisit: "AfriTech Solutions",
    meetingWith: "Olivia Brooks",
  },
];

export function findVisitorByPasscode(digits: string): PreRegisteredVisitor | undefined {
  const clean = digits.replace(/\D/g, "").slice(0, 6);
  return CYBER_ONE_PRE_REGISTERED.find((v) => v.passcode === clean);
}

export function findVisitorByQrToken(raw: string): PreRegisteredVisitor | undefined {
  const key = raw.trim().toUpperCase().replace(/\s+/g, "");
  return CYBER_ONE_PRE_REGISTERED.find((v) => v.qrToken.toUpperCase().replace(/\s+/g, "") === key);
}

type InviteLookupResponse = {
  visitor?: {
    passcode?: string;
    qrToken?: string;
    fullName?: string;
    phone?: string;
    companyToVisit?: string;
    meetingWith?: string;
  } | null;
};

const INVITE_LOOKUP_API_URL = (process.env.REACT_APP_INVITE_LOOKUP_API_URL || "").trim();
const INVITE_LOOKUP_API_KEY = (process.env.REACT_APP_INVITE_LOOKUP_API_KEY || "").trim();
const INVITE_LOOKUP_TIMEOUT_MS = 5000;

function normalizeVisitor(raw: InviteLookupResponse["visitor"]): PreRegisteredVisitor | null {
  if (!raw) return null;
  const passcode = String(raw.passcode || "").replace(/\D/g, "").slice(0, 6);
  const qrToken = String(raw.qrToken || "").trim();
  const fullName = String(raw.fullName || "").trim();
  if (!passcode || !qrToken || !fullName) return null;
  return {
    passcode,
    qrToken,
    fullName,
    phone: String(raw.phone || ""),
    companyToVisit: String(raw.companyToVisit || ""),
    meetingWith: String(raw.meetingWith || ""),
  };
}

async function lookupInviteFromApi(params: { passcode?: string; qrToken?: string }): Promise<PreRegisteredVisitor | null> {
  if (!INVITE_LOOKUP_API_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVITE_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(INVITE_LOOKUP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INVITE_LOOKUP_API_KEY ? { "x-api-key": INVITE_LOOKUP_API_KEY } : {}),
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as InviteLookupResponse;
    return normalizeVisitor(data.visitor);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveVisitorByPasscode(digits: string): Promise<PreRegisteredVisitor | undefined> {
  const clean = digits.replace(/\D/g, "").slice(0, 6);
  if (!clean) return undefined;
  const apiVisitor = await lookupInviteFromApi({ passcode: clean });
  if (apiVisitor) return apiVisitor;
  return findVisitorByPasscode(clean);
}

export async function resolveVisitorByQrToken(raw: string): Promise<PreRegisteredVisitor | undefined> {
  const key = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!key) return undefined;
  const apiVisitor = await lookupInviteFromApi({ qrToken: key });
  if (apiVisitor) return apiVisitor;
  return findVisitorByQrToken(key);
}
