const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const XLSX = require("xlsx");
const { query, close } = require("./db");

dotenv.config();

async function runBackup() {
  const backupDir = process.env.BACKUP_DIR || "./backups";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resolvedDir = path.resolve(process.cwd(), backupDir);
  const outputPath = path.join(resolvedDir, `greenscape-backup-${timestamp}.xlsx`);

  try {
    fs.mkdirSync(resolvedDir, { recursive: true });

    const visitors = await query(
      `SELECT * FROM visitors ORDER BY updated_at DESC`
    );
    const sessions = await query(
      `SELECT * FROM sessions ORDER BY started_at DESC`
    );
    const events = await query(
      `SELECT * FROM conversation_events ORDER BY created_at DESC LIMIT 50000`
    );
    const auditLogs = await query(
      `SELECT * FROM api_audit_logs ORDER BY created_at DESC LIMIT 50000`
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(visitors.rows),
      "visitors"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(sessions.rows),
      "sessions"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(events.rows),
      "conversation_events"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(auditLogs.rows),
      "api_audit_logs"
    );

    XLSX.writeFile(workbook, outputPath);
    console.log(`Backup written: ${outputPath}`);
  } catch (error) {
    console.error("Backup task failed:", error.message);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

void runBackup();
