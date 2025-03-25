const express = require('express');
const router = express.Router();
const { signup, login, updateBusinessProfile, completeOnboarding, verifyEmail, resendVerificationEmail, forgotPassword, resetPassword } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.post('/signup', signup);
router.post('/login', login);

// Protected routes - require authentication
router.put('/business-profile', authMiddleware, updateBusinessProfile);
router.post('/complete-onboarding', authMiddleware, completeOnboarding);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', authMiddleware, resendVerificationEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

module.exports = router; 