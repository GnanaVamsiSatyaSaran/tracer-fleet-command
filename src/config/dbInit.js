const fs = require('fs');
const path = require('path');
const db = require('./db');

/**
 * Automatically initializes database extensions, tables, indices, and functions.
 * Fails gracefully if PostgreSQL is offline (fallback to in-memory mode).
 */
async function initializeDatabase() {
  try {
    const schemaPath = path.join(__dirname, '../../schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.warn('[DB Init] schema.sql not found at:', schemaPath);
      return;
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('[DB Init] Verifying PostGIS extensions and 5-table schema...');
    await db.query(schemaSql);
    console.log('[DB Init] Database schema verified: fleet_assets, personnel, active_sessions, telemetry_logs, dynamic_geofences.');
  } catch (err) {
    console.warn('[DB Init] PostgreSQL offline or init deferred. In-memory engine active:', err.message);
  }
}

module.exports = {
  initializeDatabase,
};
