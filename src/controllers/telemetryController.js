const telemetryService = require('../services/telemetryService');

/**
 * Controller for POST /api/telemetry
 * Handles batch JSON uploads of GPS coordinates.
 */
async function postBatchTelemetry(req, res) {
  try {
    const payload = req.body;

    // Normalize input: allow either raw JSON array or wrapped object
    const batch = Array.isArray(payload)
      ? payload
      : (payload.telemetry || payload.records || payload.data);

    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payload format. Expected a non-empty array of telemetry objects in request body or under "telemetry" key.',
      });
    }

    const { insertedCount, records } = await telemetryService.recordBatchTelemetry(batch);

    return res.status(201).json({
      success: true,
      message: `Successfully processed ${insertedCount} telemetry points`,
      processed_count: insertedCount,
      records: records.map(r => ({
        id: r.id,
        asset_id: r.asset_id,
        latitude: parseFloat(r.latitude),
        longitude: parseFloat(r.longitude),
        speed: parseFloat(r.speed),
        heading: r.heading ? parseFloat(r.heading) : null,
        inside_geofence: r.inside_geofence,
        recorded_at: r.recorded_at,
      })),
    });
  } catch (error) {
    console.error('[TelemetryController] Error processing batch:', error);

    // Differentiate client validation errors from server failures
    const isValidationError = error.message.includes('Invalid') || error.message.includes('must include');
    const statusCode = isValidationError ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Internal server error while processing telemetry batch',
    });
  }
}

/**
 * Controller for GET /api/telemetry/history
 * Fetches coordinates for a given asset_id and date.
 */
async function getTelemetryHistory(req, res) {
  try {
    const { asset_id, date, limit } = req.query;

    if (!asset_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: asset_id (e.g., ?asset_id=GITAM-BUS-01)',
      });
    }

    const points = await telemetryService.getTelemetryHistory(
      asset_id,
      date || null,
      limit || 500
    );

    return res.json({
      success: true,
      asset_id,
      date: date || new Date().toISOString().slice(0, 10),
      count: points.length,
      points,
    });
  } catch (error) {
    console.error('[TelemetryController] Error fetching history:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal error retrieving route history',
    });
  }
}

module.exports = {
  postBatchTelemetry,
  getTelemetryHistory,
};

