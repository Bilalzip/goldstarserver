const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createCheckoutSession,
  startTrial,
  getSubscriptionStatus,
  cancelSubscription,
  createUpdateSession
} = require('../controllers/paymentController');

// Create Stripe checkout session
router.post('/create-checkout-session', auth, createCheckoutSession);

router.post('/start-trial', auth, startTrial);
router.get('/subscription-status', auth, getSubscriptionStatus);
router.post('/cancel-subscription', auth, cancelSubscription);
router.post('/create-update-session', auth, createUpdateSession);

module.exports = router; 