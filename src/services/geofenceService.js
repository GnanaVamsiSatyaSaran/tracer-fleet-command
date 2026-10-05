const db = require('../config/db');

// Default Campus Geofence Configuration (e.g. Central Transit Hub)
const DEFAULT_CAMPUS_GEOFENCE = {
  centerLongitude: parseFloat(process.env.CAMPUS_CENTER_LON || '83.377500'),
  centerLatitude: parseFloat(process.env.CAMPUS_CENTER_LAT || '17.782167'),
  radiusMeters: parseFloat(process.env.CAMPUS_RADIUS_METERS || '100.0'),
};

/**
 * Checks if a coordinate pair falls within the campus geofence radius.
 * STRICT REQUIREMENT: Uses PostGIS ST_DWithin with use_spheroid = false for spherical optimization.
 * 
 * @param {number} longitude - WGS84 Longitude
 * @param {number} latitude - WGS84 Latitude
 * @param {number} [radiusMeters] - Buffer radius in meters
 * @param {number} [centerLon] - Geofence center longitude
 * @param {number} [centerLat] - Geofence center latitude
 * @param {object} [client] - Optional transactional pg client
 * @returns {Promise<boolean>} - True if inside the geofence
 */
async function checkPointInGeofence(
  longitude,
  latitude,
  radiusMeters = DEFAULT_CAMPUS_GEOFENCE.radiusMeters,
  centerLon = DEFAULT_CAMPUS_GEOFENCE.centerLongitude,
  centerLat = DEFAULT_CAMPUS_GEOFENCE.centerLatitude,
  client = db
) {
  // PostGIS spatial query using ST_DWithin with use_spheroid = false
  // Cast to geography to measure metric distance directly on the sphere
  const sql = `
    SELECT ST_DWithin(
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
      $5,
      false
    ) AS inside_geofence;
  `;

  const values = [
    Number(longitude),
    Number(latitude),
    Number(centerLon),
    Number(centerLat),
    Number(radiusMeters),
  ];

  const result = await client.query(sql, values);
  return result.rows[0]?.inside_geofence === true;
}

/**
 * SQL Expression snippet for embedding ST_DWithin with use_spheroid = false
 * directly into batch INSERT ... SELECT statements.
 */
function getGeofenceSqlExpression(lonCol, latCol, centerLonParam, centerLatParam, radiusParam) {
  return `ST_DWithin(
    ST_SetSRID(ST_MakePoint(${lonCol}, ${latCol}), 4326)::geography,
    ST_SetSRID(ST_MakePoint(${centerLonParam}, ${centerLatParam}), 4326)::geography,
    ${radiusParam},
    false
  )`;
}

module.exports = {
  checkPointInGeofence,
  getGeofenceSqlExpression,
  DEFAULT_CAMPUS_GEOFENCE,
};
