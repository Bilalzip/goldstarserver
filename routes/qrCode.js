const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateQrCode, getBusinessQrCodes } = require('../controllers/qrCodeController');

router.get('/generate', auth, generateQrCode);
router.get('/business', auth, getBusinessQrCodes);

module.exports = router; 