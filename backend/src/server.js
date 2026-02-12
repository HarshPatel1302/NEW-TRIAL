const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const XLSX = require("xlsx");
const { query } = require("./db");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : true;

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function toVisitorDto(row) {
  return {
    id: String(row.id),
    name: row.name,
    phone: row.phone,
    meetingWith: row.meeting_with || "",
    timestamp: new Date(row.updated_at || row.created_at).getTime(),
    intent: row.intent || "unknown",
    department: row.department || "",
    purpose: row.purpose || "",
    company: row.company || "",
    appointmentTime: row.appointment_time || "",
    referenceId: row.reference_id || "",
    notes: row.notes || "",
    photo: row.photo || "",
  };
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/visitors/upsert", async (req, res) => {
  const {
    name = "",
    phone = "",
    meetingWith = "",
    intent = "unknown",
    department = "",
    purpose = "",
    company = "",
    appointmentTime = "",
    referenceId = "",
    notes = "",
    photo = "",
    sessionId = null,
  } = req.body || {};

  if (!name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    let result;

    if (normalizedPhone) {
      result = await query(
        `INSERT INTO visitors (
          name, phone, normalized_phone, meeting_with, intent, department,
          purpose, company, appointment_time, reference_id, notes, photo
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (normalized_phone) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          meeting_with = EXCLUDED.meeting_with,
          intent = EXCLUDED.intent,
          department = EXCLUDED.department,
          purpose = EXCLUDED.purpose,
          company = EXCLUDED.company,
          appointment_time = EXCLUDED.appointment_time,
          reference_id = EXCLUDED.reference_id,
          notes = EXCLUDED.notes,
          photo = EXCLUDED.photo,
          updated_at = NOW()
        RETURNING *`,
        [
          name.trim(),
          String(phone),
          normalizedPhone,
          String(meetingWith),
          String(intent || "unknown"),
          String(department),
          String(purpose),
          String(company),
          String(appointmentTime),
          String(referenceId),
          String(notes),
          String(photo),
        ]
      );
    } else {
      result = await query(
        `INSERT INTO visitors (
          name, phone, normalized_phone, meeting_with, intent, department,
          purpose, company, appointment_time, reference_id, notes, photo
        ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *`,
        [
          name.trim(),
          String(phone),
          String(meetingWith),
          String(intent || "unknown"),
          String(department),
          String(purpose),
          String(company),
          String(appointmentTime),
          String(referenceId),
          String(notes),
          String(photo),
        ]
      );
    }

    const visitorRow = result.rows[0];

    if (sessionId) {
      await query(
        `UPDATE sessions
         SET visitor_id = $2, intent = COALESCE($3, intent), updated_at = NOW()
         WHERE id = $1`,
        [Number(sessionId), visitorRow.id, intent || null]
      );
    }

    return res.json({ visitor: toVisitorDto(visitorRow) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/visitors/search", async (req, res) => {
  const phone = String(req.query.phone || "");
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return res.json({ visitor: null });
  }

  try {
    const result = await query(
      `SELECT * FROM visitors
       WHERE normalized_phone = $1
          OR (char_length($1) >= 7 AND normalized_phone LIKE ('%' || $1))
       ORDER BY
         CASE WHEN normalized_phone = $1 THEN 0 ELSE 1 END,
         updated_at DESC
       LIMIT 1`,
      [normalizedPhone]
    );

    if (result.rows.length === 0) {
      return res.json({ visitor: null });
    }

    return res.json({ visitor: toVisitorDto(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/visitors", async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 200), 1000);
  try {
    const result = await query(
      `SELECT * FROM visitors
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.json({ visitors: result.rows.map(toVisitorDto) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/sessions/start", async (req, res) => {
  const {
    visitorId = null,
    kioskId = null,
    intent = null,
    status = "active",
  } = req.body || {};

  try {
    const result = await query(
      `INSERT INTO sessions (visitor_id, kiosk_id, intent, status, started_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [visitorId ? Number(visitorId) : null, kioskId, intent, status]
    );

    return res.json({ session: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch("/api/sessions/:id", async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isFinite(sessionId)) {
    return res.status(400).json({ error: "Invalid session id" });
  }

  const { visitorId, intent, status, summary } = req.body || {};

  try {
    const result = await query(
      `UPDATE sessions
       SET
         visitor_id = COALESCE($2, visitor_id),
         intent = COALESCE($3, intent),
         status = COALESCE($4, status),
         summary = COALESCE($5, summary),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [sessionId, visitorId ? Number(visitorId) : null, intent || null, status || null, summary || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ session: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/sessions/:id/events", async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isFinite(sessionId)) {
    return res.status(400).json({ error: "Invalid session id" });
  }

  const { role = "", eventType = "", content = "", rawPayload = null } = req.body || {};
  if (!role || !eventType) {
    return res.status(400).json({ error: "role and eventType are required" });
  }

  try {
    await query(
      `INSERT INTO conversation_events (session_id, role, event_type, content, raw_payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, String(role), String(eventType), String(content || ""), rawPayload]
    );

    await query(`UPDATE sessions SET updated_at = NOW() WHERE id = $1`, [sessionId]);

    return res.status(201).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/sessions/:id/end", async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isFinite(sessionId)) {
    return res.status(400).json({ error: "Invalid session id" });
  }

  const { status = "completed", summary = "" } = req.body || {};

  try {
    const result = await query(
      `UPDATE sessions
       SET status = $2, summary = $3, ended_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [sessionId, String(status), String(summary)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ session: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/exports/visitors.csv", async (_req, res) => {
  try {
    const result = await query(
      `SELECT
        id, name, phone, meeting_with, intent, department, purpose, company,
        appointment_time, reference_id, notes, created_at, updated_at
       FROM visitors
       ORDER BY updated_at DESC`
    );

    const header = [
      "id",
      "name",
      "phone",
      "meeting_with",
      "intent",
      "department",
      "purpose",
      "company",
      "appointment_time",
      "reference_id",
      "notes",
      "created_at",
      "updated_at",
    ];

    const lines = [header.join(",")];
    for (const row of result.rows) {
      lines.push(
        [
          row.id,
          row.name,
          row.phone,
          row.meeting_with,
          row.intent,
          row.department,
          row.purpose,
          row.company,
          row.appointment_time,
          row.reference_id,
          row.notes,
          row.created_at,
          row.updated_at,
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="greenscape-visitors-${Date.now()}.csv"`
    );
    return res.send(lines.join("\n"));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/exports/visitors.xlsx", async (_req, res) => {
  try {
    const result = await query(
      `SELECT
        id, name, phone, meeting_with, intent, department, purpose, company,
        appointment_time, reference_id, notes, created_at, updated_at
       FROM visitors
       ORDER BY updated_at DESC`
    );

    const rows = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      meeting_with: row.meeting_with,
      intent: row.intent,
      department: row.department,
      purpose: row.purpose,
      company: row.company,
      appointment_time: row.appointment_time,
      reference_id: row.reference_id,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Visitors");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="greenscape-visitors-${Date.now()}.xlsx"`
    );
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/exports/sessions.csv", async (_req, res) => {
  try {
    const result = await query(
      `SELECT
        s.id,
        s.kiosk_id,
        s.status,
        s.intent,
        s.summary,
        s.started_at,
        s.ended_at,
        v.name AS visitor_name,
        v.phone AS visitor_phone
       FROM sessions s
       LEFT JOIN visitors v ON v.id = s.visitor_id
       ORDER BY s.started_at DESC`
    );

    const header = [
      "id",
      "kiosk_id",
      "status",
      "intent",
      "summary",
      "started_at",
      "ended_at",
      "visitor_name",
      "visitor_phone",
    ];
    const lines = [header.join(",")];
    for (const row of result.rows) {
      lines.push(
        [
          row.id,
          row.kiosk_id,
          row.status,
          row.intent,
          row.summary,
          row.started_at,
          row.ended_at,
          row.visitor_name,
          row.visitor_phone,
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="greenscape-sessions-${Date.now()}.csv"`
    );
    return res.send(lines.join("\n"));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Receptionist backend listening on http://localhost:${PORT}`);
});
