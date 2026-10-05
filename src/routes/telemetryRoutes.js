const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');
const geofenceService = require('../services/geofenceService');

// POST /api/telemetry - Batch upload GPS coordinates
router.post('/telemetry', telemetryController.postBatchTelemetry);

// GET /api/telemetry/history - Historical route replay coordinates
router.get('/telemetry/history', telemetryController.getTelemetryHistory);

// GET /api/telemetry/geofence-check - Direct spatial test endpoint
router.get('/telemetry/geofence-check', async (req, res) => {
  try {
    const { lon, lat, radius } = req.query;
    if (!lon || !lat) {
      return res.status(400).json({ error: 'Missing required query parameters: lon, lat' });
    }

    const inside = await geofenceService.checkPointInGeofence(
      parseFloat(lon),
      parseFloat(lat),
      radius ? parseFloat(radius) : undefined
    );

    res.json({
      longitude: parseFloat(lon),
      latitude: parseFloat(lat),
      inside_geofence: inside,
      method: 'ST_DWithin(use_spheroid=false)',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
