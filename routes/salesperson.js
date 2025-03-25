const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  getSalespersonStats, 
  getSalespersonReferrals, 
  getReferralLink 
} = require('../controllers/salespersonController');

router.get('/stats', auth, getSalespersonStats);
router.get('/referrals', auth, getSalespersonReferrals);
router.get('/referral-link', auth, getReferralLink);

module.exports = router; 