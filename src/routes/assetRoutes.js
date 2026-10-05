const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');

// GET /api/assets - List all transit assets
router.get('/assets', assetController.getAssets);

// POST /api/assets - Register new vehicle transponder
router.post('/assets', assetController.postAsset);

// DELETE /api/assets/:id - Decommission or delete asset
router.delete('/assets/:id', assetController.deleteAsset);

module.exports = router;
