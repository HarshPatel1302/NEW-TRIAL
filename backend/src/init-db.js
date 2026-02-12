const fs = require("fs");
const path = require("path");
const { query, close } = require("./db");

async function initDb() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  try {
    await query(schemaSql);
    console.log("Database schema initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize database schema:", error.message);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

void initDb();
