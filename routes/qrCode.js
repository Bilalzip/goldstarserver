const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  generateQrCode,
  getBusinessQrCodes,
  getReviewByUrlId,
} = require("../controllers/qrCodeController");

// Protected routes (require authentication)
router.get("/generate", auth, generateQrCode);
router.get("/business", auth, getBusinessQrCodes);

// Public route (no auth needed - used by customers scanning QR codes)
router.get("/review/:urlId", getReviewByUrlId);

module.exports = router;
