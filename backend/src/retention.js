const dotenv = require("dotenv");
const { query, close } = require("./db");

dotenv.config();

async function runRetention() {
  const retentionDays = Math.max(1, Number(process.env.RETENTION_DAYS || 180));

  try {
    const eventsResult = await query(
      `DELETE FROM conversation_events
       WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [retentionDays]
    );

    const sessionsResult = await query(
      `DELETE FROM sessions
       WHERE status IN ('completed', 'disconnected')
         AND ended_at IS NOT NULL
         AND ended_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [retentionDays]
    );

    const auditResult = await query(
      `DELETE FROM api_audit_logs
       WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [retentionDays]
    );

    console.log(
      `Retention complete (days=${retentionDays}): events=${eventsResult.rowCount}, sessions=${sessionsResult.rowCount}, auditLogs=${auditResult.rowCount}`
    );
  } catch (error) {
    console.error("Retention task failed:", error.message);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

void runRetention();
