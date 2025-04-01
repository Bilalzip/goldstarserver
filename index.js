const express = require('express');
const cors = require('cors');
const pool = require('./db/index');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const businessRoutes = require('./routes/business');
const reviewRoutes = require('./routes/reviews');
const qrCodeRoutes = require('./routes/qrCode');
const referralRoutes = require('./routes/referral');
const paymentRoutes = require('./routes/payment');
const { handleWebhook } = require('./controllers/paymentController');
const bankDetailsRoutes = require('./routes/bankDetails');
const adminRoutes = require('./routes/admin');
const couponRoutes = require('./routes/coupon');

const app = express();

// IMPORTANT: Webhook route must be before cors() and express.json()
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleWebhook
);

// Regular middleware for other routes
app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/business', businessRoutes);
app.use('/reviews', reviewRoutes);
app.use('/api/qr-code', qrCodeRoutes);
app.use('/referral', referralRoutes);
app.use('/payment', paymentRoutes);
app.use('/bank-details', bankDetailsRoutes);
app.use('/auth/admin', adminRoutes);
app.use('/auth/coupons', couponRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
