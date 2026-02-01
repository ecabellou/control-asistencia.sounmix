const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const statusController = require('../controllers/statusController');

router.post('/scan', attendanceController.scanQR);
router.get('/check-status/:employeeId', statusController.checkStatus);
router.get('/reports', attendanceController.getReports);

module.exports = router;
