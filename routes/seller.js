const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkSellerRole } = require('../middleware/roles');
const {
  getSellerDashboard,
  getSellerReferrals,
  generateSellerReferralCode,
  getSellerPayments
} = require('../controllers/sellerController');

router.get('/dashboard-stats', auth, checkSellerRole, getSellerDashboard);
router.get('/referrals', auth, checkSellerRole, getSellerReferrals);
router.post('/generate-code', auth, checkSellerRole, generateSellerReferralCode);
router.get('/payments', auth, checkSellerRole, getSellerPayments);

module.exports = router; 