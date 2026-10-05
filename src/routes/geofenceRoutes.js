const express = require('express');
const router = express.Router();
const dynamicGeofenceService = require('../services/dynamicGeofenceService');

/**
 * GET /api/geofences
 * Fetch all dynamic geofence zones
 */
router.get('/geofences', async (req, res) => {
  try {
    const geofences = await dynamicGeofenceService.getAllGeofences();
    res.json({
      success: true,
      count: geofences.length,
      geofences,
    });
  } catch (error) {
    console.error('[GeofenceRoutes] Error fetching geofences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/geofences
 * Create and persist a new dynamic polygon or circular geofence
 */
router.post('/geofences', async (req, res) => {
  try {
    const { name, coordinates, color, type, radius_meters } = req.body;

    if (!name || !coordinates) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, coordinates (array of [lat, lng])',
      });
    }

    const created = await dynamicGeofenceService.createGeofence({
      name,
      coordinates,
      color: color || '#00F0FF',
      type: type || 'polygon',
      radius_meters: radius_meters || 100,
    });

    res.status(201).json({
      success: true,
      message: `Geofence "${name}" created successfully`,
      geofence: created,
    });
  } catch (error) {
    console.error('[GeofenceRoutes] Error creating geofence:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/geofences/:id
 * Remove a geofence zone
 */
router.delete('/geofences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dynamicGeofenceService.deleteGeofence(id);
    res.json({
      success: true,
      message: `Geofence ${id} removed`,
      result,
    });
  } catch (error) {
    console.error('[GeofenceRoutes] Error deleting geofence:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
