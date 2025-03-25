const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const couponController = require('../controllers/couponController');

// Public routes
router.post('/validate', auth, couponController.validateCoupon);

// Admin routes (if needed)
router.post('/create', auth, couponController.createCoupon);
router.get('/list', auth, couponController.listCoupons);
router.put('/:id/deactivate', auth, couponController.deactivateCoupon);

module.exports = router; 