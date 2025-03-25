const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  getDashboardStats, 
  updateBusinessProfile,
  getBusinessProfile,
  completeOnboarding,
  getPublicBusinessDetails,
  getBusinessReviews
} = require('../controllers/businessController');

router.get('/dashboard-stats', auth, getDashboardStats);
router.get('/reviews', auth, getBusinessReviews);
router.put('/profile', auth, updateBusinessProfile);
router.get('/profile', auth, getBusinessProfile);
router.post('/complete-onboarding', auth, completeOnboarding);
router.get('/:businessId/public', getPublicBusinessDetails);

module.exports = router; 