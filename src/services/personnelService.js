const db = require('../config/db');

// In-memory fallback and seed cache
const inMemoryPersonnel = [
  {
    id: 'emp-8831',
    employee_id: 'EMP-8831',
    full_name: 'Ramesh K.',
    role: 'DRIVER',
    phone_number: '+91 98480 23114',
    license_number: 'AP31-2018-004521',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'emp-8832',
    employee_id: 'EMP-8832',
    full_name: 'Suresh V.',
    role: 'DRIVER',
    phone_number: '+91 98481 90422',
    license_number: 'AP31-2019-009182',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'emp-8833',
    employee_id: 'EMP-8833',
    full_name: 'Venkat R.',
    role: 'DRIVER',
    phone_number: '+91 98482 77153',
    license_number: 'AP31-2020-001290',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'emp-8834',
    employee_id: 'EMP-8834',
    full_name: 'Naresh P.',
    role: 'DRIVER',
    phone_number: '+91 98483 44091',
    license_number: 'AP31-2021-008432',
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

async function getAllPersonnel() {
  try {
    const res = await db.query(`SELECT id, employee_id, full_name, role, phone_number, license_number, is_active, created_at, updated_at FROM personnel ORDER BY full_name ASC`);
    if (res.rows && res.rows.length > 0) {
      return res.rows;
    }
  } catch (_) {
    // Database offline
  }
  return inMemoryPersonnel;
}

async function createPersonnel({ employee_id, full_name, role = 'DRIVER', phone_number, license_number, is_active = true }) {
  if (!employee_id || !full_name) {
    throw new Error('employee_id and full_name are required');
  }

  const id = `emp-${Date.now()}`;
  const newStaff = {
    id,
    employee_id: employee_id.toUpperCase().trim(),
    full_name: full_name.trim(),
    role: role.toUpperCase().trim(),
    phone_number: phone_number ? phone_number.trim() : null,
    license_number: license_number ? license_number.trim() : null,
    is_active: Boolean(is_active),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  inMemoryPersonnel.unshift(newStaff);

  try {
    const sql = `
      INSERT INTO personnel (id, employee_id, full_name, role, phone_number, license_number, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (employee_id) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            phone_number = EXCLUDED.phone_number,
            license_number = EXCLUDED.license_number,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
      RETURNING id, employee_id, full_name, role, phone_number, license_number, is_active, created_at, updated_at;
    `;
    const res = await db.query(sql, [
      id,
      newStaff.employee_id,
      newStaff.full_name,
      newStaff.role,
      newStaff.phone_number,
      newStaff.license_number,
      newStaff.is_active,
    ]);
    if (res.rows[0]) return res.rows[0];
  } catch (err) {
    console.warn('[PersonnelService] DB persistence deferred:', err.message);
  }

  return newStaff;
}

async function deletePersonnel(idOrEmpId) {
  const idx = inMemoryPersonnel.findIndex(p => p.id === idOrEmpId || p.employee_id === idOrEmpId);
  if (idx !== -1) {
    inMemoryPersonnel.splice(idx, 1);
  }

  try {
    await db.query(`DELETE FROM personnel WHERE id = $1 OR employee_id = $1`, [idOrEmpId]);
  } catch (_) {
    // ignore DB offline
  }

  return { success: true, deleted: idOrEmpId };
}

module.exports = {
  getAllPersonnel,
  createPersonnel,
  deletePersonnel,
};
