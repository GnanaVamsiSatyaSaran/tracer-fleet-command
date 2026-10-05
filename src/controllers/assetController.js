const assetService = require('../services/assetService');

async function getAssets(req, res) {
  try {
    const assets = await assetService.getAllAssets();
    res.json({
      success: true,
      count: assets.length,
      assets,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function postAsset(req, res) {
  try {
    const { asset_tag, license_plate, model, capacity, status } = req.body;
    const created = await assetService.createAsset({
      asset_tag,
      license_plate,
      model,
      capacity,
      status,
    });
    res.status(201).json({
      success: true,
      message: `Asset "${created.asset_tag}" registered successfully`,
      asset: created,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

async function deleteAsset(req, res) {
  try {
    const { id } = req.params;
    const result = await assetService.deleteAsset(id);
    res.json({
      success: true,
      message: `Asset ${id} removed`,
      result,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getAssets,
  postAsset,
  deleteAsset,
};
