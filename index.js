const express = require('express');
const cors = require('cors');
const db = require('./db'); // Make sure this path is correct
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

// Signup endpoint
// app.post('/api/signup', async (req, res) => {
//   const client = await db.pool.connect();
  
//   try {
//     await client.query('BEGIN');
    
//     const {
//       businessName,
//       ownerName,
//       email,
//       phone,
//       address,
//       googleReviewLink,
//       referralCode,
//       paymentMethod
//     } = req.body;

//     console.log('Received data:', req.body);
    
//     // Insert business data
//     const businessResult = await client.query(
//       `INSERT INTO businesses (
//         business_name, owner_name, email, phone, address, 
//         google_review_link, referral_code
//       ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
//       [businessName, ownerName, email, phone, address, googleReviewLink, referralCode]
//     );

//     const businessId = businessResult.rows[0].id;

//     // Create subscription
//     await client.query(
//       `INSERT INTO subscriptions (business_id, payment_method, status)
//        VALUES ($1, $2, $3)`,
//       [businessId, paymentMethod, 'active']
//     );

//     await client.query('COMMIT');

//     // Generate JWT token
//     const token = jwt.sign(
//       { businessId, email },
//       process.env.JWT_SECRET || 'fallback_secret',
//       { expiresIn: '24h' }
//     );

//     res.json({
//       success: true,
//       token,
//       businessId
//     });

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('Signup error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error creating account',
//       error: error.message // Add this for debugging
//     });
//   } finally {
//     client.release();
//   }
// });

// Routes
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
