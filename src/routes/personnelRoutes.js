const express = require('express');
const router = express.Router();
const personnelController = require('../controllers/personnelController');

// GET /api/personnel - List all drivers and transit staff
router.get('/personnel', personnelController.getPersonnel);

// POST /api/personnel - Register new driver or operator
router.post('/personnel', personnelController.postPersonnel);

// DELETE /api/personnel/:id - Remove or deactivate staff member
router.delete('/personnel/:id', personnelController.deletePersonnel);

module.exports = router;
