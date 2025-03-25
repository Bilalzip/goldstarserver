const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getReferralDashboard, generateReferralCode } = require('../controllers/referralController');

// Define routes
router.get('/dashboard', auth, getReferralDashboard);
router.post('/generate-code', auth, generateReferralCode);
router.get('/test', (req, res) => {
  console.log('Referral test route hit');
  res.json({ message: 'Referral routes are working' });
});

module.exports = router; 