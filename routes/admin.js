const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// All routes require both authentication and admin privileges
router.use(authMiddleware); // First check if user is authenticated
router.use(adminAuth); // Then check if user is admin

// Business Management
router.get('/businesses', adminController.getBusinesses);
router.get('/businesses/:id', adminController.getBusinessDetails);
router.post('/businesses/:id/suspend', adminController.suspendBusiness);
router.post('/businesses/:id/send-invoice', adminController.sendInvoice);
router.get('/businesses/:id/stats', adminController.getBusinessStats);

// Sales Associates
router.get('/salespeople', adminController.getSalespeople);
router.get('/salespeople/:id', adminController.getSalespersonDetail);
router.get('/salespeople/:id/referrals', adminController.getSalespersonReferrals);
router.get('/salespeople/:id/payments', adminController.getSalespersonPayments);

// Financial Overview
router.get('/financial/overview', adminController.getFinancialOverview);
router.get('/financial/revenue', adminController.getRevenueReport);
router.get('/financial/commissions', adminController.getCommissionsReport);

module.exports = router; 