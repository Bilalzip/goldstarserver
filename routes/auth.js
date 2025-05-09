// routes/auth.js
const express = require("express");
const router = express.Router();
const {
  signup,
  login,
  updateBusinessProfile,
  completeOnboarding,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

router.post("/signup", signup);
router.post("/login", login);

// Protected routes - require authentication
router.put("/business-profile", authMiddleware, updateBusinessProfile);
router.post("/complete-onboarding", authMiddleware, completeOnboarding);
router.get("/verify-email/:token", verifyEmail);
router.post("/resend-verification", authMiddleware, resendVerificationEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// Add a new route to get current user data
router.get("/me", authMiddleware, (req, res) => {
  res.json({
    id: req.user.businessId,
    email: req.user.email,
    businessName: req.user.businessName,
    isSalesperson: req.user.isSalesperson,
    isAdmin: req.user.isAdmin,
    subscriptionStatus: req.user.subscriptionStatus,
  });
});

module.exports = router;
