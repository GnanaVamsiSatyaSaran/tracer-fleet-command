const personnelService = require('../services/personnelService');

async function getPersonnel(req, res) {
  try {
    const staff = await personnelService.getAllPersonnel();
    res.json({
      success: true,
      count: staff.length,
      personnel: staff,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function postPersonnel(req, res) {
  try {
    const { employee_id, full_name, role, phone_number, license_number, is_active } = req.body;
    const created = await personnelService.createPersonnel({
      employee_id,
      full_name,
      role,
      phone_number,
      license_number,
      is_active,
    });
    res.status(201).json({
      success: true,
      message: `Personnel "${created.full_name}" registered successfully`,
      personnel: created,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

async function deletePersonnel(req, res) {
  try {
    const { id } = req.params;
    const result = await personnelService.deletePersonnel(id);
    res.json({
      success: true,
      message: `Personnel ${id} removed`,
      result,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getPersonnel,
  postPersonnel,
  deletePersonnel,
};
