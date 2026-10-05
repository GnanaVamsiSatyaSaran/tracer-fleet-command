const db = require('../config/db');

// In-memory cache & fallback when PostgreSQL is offline
const inMemoryGeofences = [
  {
    id: 'krc-hub-default',
    name: 'KRC Central Transit Hub',
    color: '#00F0FF',
    type: 'circle',
    center: [17.782167, 83.377472],
    radius_meters: 100,
    coordinates: [
      [17.783067, 83.377472],
      [17.782800, 83.378372],
      [17.782167, 83.378372],
      [17.781267, 83.377472],
      [17.781534, 83.376572],
      [17.782167, 83.376572],
      [17.783067, 83.377472],
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'north-gate-zone',
    name: 'North Academic Gate',
    color: '#00F0FF',
    type: 'polygon',
    coordinates: [
      [17.784200, 83.375200],
      [17.784800, 83.376400],
      [17.783900, 83.376900],
      [17.783400, 83.375700],
      [17.784200, 83.375200],
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: 'beach-road-corridor',
    name: 'Beach Road Transit Corridor',
    color: '#00F0FF',
    type: 'polygon',
    coordinates: [
      [17.783200, 83.378400],
      [17.783600, 83.379500],
      [17.781800, 83.380200],
      [17.781500, 83.379000],
      [17.783200, 83.378400],
    ],
    created_at: new Date().toISOString(),
  },
];

/**
 * Ensures the dynamic_geofences table exists in PostgreSQL / PostGIS.
 */
async function ensureTableExists() {
  try {
    const createSql = `
      CREATE TABLE IF NOT EXISTS dynamic_geofences (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        color VARCHAR(32) DEFAULT '#00F0FF',
        type VARCHAR(32) DEFAULT 'polygon',
        coordinates JSONB NOT NULL,
        radius_meters NUMERIC DEFAULT 100,
        polygon_geom GEOMETRY(Polygon, 4326),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await db.query(createSql);
  } catch (err) {
    // If DB offline, silently fallback to memory store
  }
}

// Attempt table creation on initialization
ensureTableExists();

/**
 * Fetches all dynamic geofences.
 */
async function getAllGeofences() {
  try {
    const res = await db.query(`SELECT id, name, color, type, coordinates, radius_meters, created_at FROM dynamic_geofences ORDER BY created_at DESC`);
    if (res.rows && res.rows.length > 0) {
      return res.rows;
    }
  } catch (_) {
    // DB offline, return in-memory
  }
  return inMemoryGeofences;
}

/**
 * Creates a new geofence polygon.
 */
async function createGeofence({ name, coordinates, color = '#00F0FF', type = 'polygon', radius_meters = 100 }) {
  if (!name || !coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    throw new Error('Geofence requires a name and at least 3 coordinate pairs [lat, lng]');
  }

  const id = `geo-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newGeofence = {
    id,
    name,
    color,
    type,
    coordinates,
    radius_meters,
    created_at: new Date().toISOString(),
  };

  // 1. Save in memory
  inMemoryGeofences.unshift(newGeofence);

  // 2. Attempt save in PostGIS if connected
  try {
    // Construct WKT polygon string: POLYGON((lon lat, lon lat, ...))
    const closedCoords = [...coordinates];
    const first = closedCoords[0];
    const last = closedCoords[closedCoords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      closedCoords.push(first);
    }
    const wktPairs = closedCoords.map(c => `${c[1]} ${c[0]}`).join(', ');
    const wkt = `POLYGON((${wktPairs}))`;

    const sql = `
      INSERT INTO dynamic_geofences (id, name, color, type, coordinates, radius_meters, polygon_geom)
      VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_GeomFromText($7), 4326))
      RETURNING id, name, color, type, coordinates, radius_meters, created_at;
    `;
    const res = await db.query(sql, [
      id,
      name,
      color,
      type,
      JSON.stringify(coordinates),
      radius_meters,
      wkt,
    ]);
    if (res.rows[0]) return res.rows[0];
  } catch (err) {
    console.warn('[DynamicGeofenceService] DB insert skipped or deferred:', err.message);
  }

  return newGeofence;
}

/**
 * Deletes a geofence by ID.
 */
async function deleteGeofence(id) {
  const idx = inMemoryGeofences.findIndex(g => g.id === id);
  if (idx !== -1) {
    inMemoryGeofences.splice(idx, 1);
  }

  try {
    await db.query(`DELETE FROM dynamic_geofences WHERE id = $1`, [id]);
  } catch (_) {
    // ignore DB offline
  }

  return { success: true, deleted_id: id };
}

module.exports = {
  getAllGeofences,
  createGeofence,
  deleteGeofence,
};
