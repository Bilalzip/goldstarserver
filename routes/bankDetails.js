const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getBankDetails, updateBankDetails } = require('../controllers/bankDetailsController');

router.get('/', auth, getBankDetails);
router.post('/', auth, updateBankDetails);

module.exports = router; 