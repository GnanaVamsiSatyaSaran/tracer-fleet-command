const db = require('../config/db');

// In-memory fallback and seed cache
const inMemoryAssets = [
  {
    id: 'asset-gitam-01',
    asset_tag: 'GITAM-BUS-01',
    license_plate: 'AP 31 TJ 1001',
    model: 'Tata Marcopolo 45-Seater',
    capacity: 45,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  },
  {
    id: 'asset-gitam-02',
    asset_tag: 'GITAM-BUS-02',
    license_plate: 'AP 31 TJ 1002',
    model: 'Ashok Leyland Lynx 40-Seater',
    capacity: 40,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  },
  {
    id: 'asset-gitam-03',
    asset_tag: 'GITAM-BUS-03',
    license_plate: 'AP 31 TJ 1003',
    model: 'Eicher Skyline Pro 36-Seater',
    capacity: 36,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  },
  {
    id: 'asset-gitam-04',
    asset_tag: 'GITAM-BUS-04',
    license_plate: 'AP 31 TJ 1004',
    model: 'Force Traveller Shuttle',
    capacity: 26,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  },
];

async function getAllAssets() {
  try {
    const res = await db.query(`SELECT id, asset_tag, license_plate, model, capacity, status, created_at, updated_at FROM fleet_assets ORDER BY asset_tag ASC`);
    if (res.rows && res.rows.length > 0) {
      return res.rows;
    }
  } catch (_) {
    // Database offline or empty
  }
  return inMemoryAssets;
}

async function createAsset({ asset_tag, license_plate, model, capacity = 40, status = 'ACTIVE' }) {
  if (!asset_tag || !license_plate || !model) {
    throw new Error('asset_tag, license_plate, and model are required fields');
  }

  const id = `asset-${Date.now()}`;
  const newAsset = {
    id,
    asset_tag: asset_tag.toUpperCase().trim(),
    license_plate: license_plate.toUpperCase().trim(),
    model: model.trim(),
    capacity: parseInt(capacity, 10) || 40,
    status: status.toUpperCase().trim(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Cache in memory
  inMemoryAssets.unshift(newAsset);

  // Persist to PostgreSQL if online
  try {
    const sql = `
      INSERT INTO fleet_assets (id, asset_tag, license_plate, model, capacity, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (asset_tag) DO UPDATE 
        SET license_plate = EXCLUDED.license_plate,
            model = EXCLUDED.model,
            capacity = EXCLUDED.capacity,
            status = EXCLUDED.status,
            updated_at = NOW()
      RETURNING id, asset_tag, license_plate, model, capacity, status, created_at, updated_at;
    `;
    const res = await db.query(sql, [
      id,
      newAsset.asset_tag,
      newAsset.license_plate,
      newAsset.model,
      newAsset.capacity,
      newAsset.status,
    ]);
    if (res.rows[0]) return res.rows[0];
  } catch (err) {
    console.warn('[AssetService] DB persistence deferred:', err.message);
  }

  return newAsset;
}

async function deleteAsset(idOrTag) {
  const idx = inMemoryAssets.findIndex(a => a.id === idOrTag || a.asset_tag === idOrTag);
  if (idx !== -1) {
    inMemoryAssets.splice(idx, 1);
  }

  try {
    await db.query(`DELETE FROM fleet_assets WHERE id = $1 OR asset_tag = $1`, [idOrTag]);
  } catch (_) {
    // ignore DB offline
  }

  return { success: true, deleted: idOrTag };
}

module.exports = {
  getAllAssets,
  createAsset,
  deleteAsset,
};
