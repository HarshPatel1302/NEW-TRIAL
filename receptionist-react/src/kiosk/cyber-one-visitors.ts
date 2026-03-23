/**
 * Dummy pre-registered visitors for QR simulation and 6-digit passcode entry (Cyber One kiosk).
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
