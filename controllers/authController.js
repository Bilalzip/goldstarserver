const {pool} = require('../db/index');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const transporter = require('../config/mail');

// Basic signup - only email and password
exports.signup = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      businessName,
      ownerName,
      email,
      password,
      phone,
      address,
      googleReviewLink,
      isSalesperson,
      referralCode
    } = req.body;
    // Check if referral code exists
    let referrerId = null;
    if (referralCode) {
      const referrerResult = await client.query(
        'SELECT id FROM businesses WHERE referral_code = $1',
        [referralCode]
      );
      
      if (referrerResult.rows[0]) {
        referrerId = referrerResult.rows[0].id;
      }
    }
    
    // Create the business account
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await client.query(
      `INSERT INTO businesses (
        business_name, owner_name, email, password, phone, 
        address, google_review_link, is_salesperson, subscription_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING id, email, is_salesperson, subscription_status`,
      [
        businessName,
        ownerName,
        email,
        hashedPassword,
        phone,
        address,
        googleReviewLink,
        isSalesperson,
        'pending'
      ]
    );

    const newBusinessId = result.rows[0].id;

    // Create referral record if code was valid
    if (referrerId) {
      await client.query(
        `INSERT INTO referrals (referrer_id, referred_business_id) 
         VALUES ($1, $2)`,
        [referrerId, newBusinessId]
      );
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

    // Save verification token
    await client.query(
      `INSERT INTO verification_tokens (
        business_id, 
        token, 
        type, 
        expires_at
      ) VALUES ($1, $2, $3, $4)`,
      [newBusinessId, verificationToken, 'email', expiresAt]
    );

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  const emailSend =  await transporter.sendMail({
      from: '"The Gold Star" <noreply@thegoldstar.ca>',
      to: email,
      subject: "Verify your email address",
      html: `
        <h1>Welcome to Reputation Rocket!</h1>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}" style="
          background-color: #4F46E5;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          display: inline-block;
          margin: 16px 0;
        ">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      `
    });
    

    await client.query('COMMIT');

    const token = jwt.sign(
      { 
        businessId: result.rows[0].id, 
        email: result.rows[0].email,
        isSalesperson: result.rows[0].is_salesperson 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        isSalesperson: result.rows[0].is_salesperson,
        onboarding_completed: false,
        emailVerified: false,
        subscriptionStatus: 'pending'
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    
    if (error.message === 'EMAIL_EXISTS') {
      return res.status(409).json({ 
        message: 'This email is already registered. Please use a different email or login to your existing account.' 
      });
    }
    
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Error during signup' });
  } finally {
    client.release();
  }
};

// Complete business profile during onboarding
exports.updateBusinessProfile = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const businessId = req.user.businessId; // From auth middleware
    const {
      businessName,
      ownerName,
      phone,
      address,
      googleReviewLink,
      referralCode
    } = req.body;

    const result = await client.query(
      `UPDATE businesses 
       SET business_name = $1,
           owner_name = $2,
           phone = $3,
           address = $4,
           google_review_link = $5,
           referral_code = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [businessName, ownerName, phone, address, googleReviewLink, referralCode, businessId]
    );

    res.json({
      success: true,
      business: result.rows[0]
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Error updating profile' });
  } finally {
    client.release();
  }
};

// Complete onboarding
exports.completeOnboarding = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const businessId = req.user.businessId;
    const { 
      businessName,
      ownerName,
      phone,
      address,
      googleReviewLink
    } = req.body;

    await client.query('BEGIN');

    // Update business profile with onboarding data and preserve is_salesperson
    const result = await client.query(
      `UPDATE businesses 
       SET business_name = $1,
           owner_name = $2,
           phone = $3,
           address = $4,
           google_review_link = $5,
           onboarding_completed = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, email, business_name, is_salesperson, onboarding_completed, subscription_status`,
      [businessName, ownerName, phone, address, googleReviewLink, businessId]
    );
    
    await client.query('COMMIT');
    

    console.log("user",    {
      id: result.rows[0].id,
      email: result.rows[0].email,
      businessName: result.rows[0].business_name,
      isSalesperson: result.rows[0].is_salesperson,
      onboarding_completed: true,
      subscriptionStatus: result.rows[0].subscription_status
    })
    
    // Include isSalesperson in the response
    res.json({
      success: true,
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        businessName: result.rows[0].business_name,
        isSalesperson: result.rows[0].is_salesperson,
        onboarding_completed: true,
        subscriptionStatus: result.rows[0].subscription_status
      }
    });
  
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Complete onboarding error:', error);
    res.status(500).json({ message: 'Error completing onboarding' });
  } finally {
    client.release();
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log(email)

    // Update the query to include subscription_status
    const result = await pool.query(
      'SELECT id, email, business_name, password, onboarding_completed, is_salesperson, is_admin, subscription_status FROM businesses WHERE email = $1',
      [email]
    );
    
    const business = result.rows[0];
    console.log("business", business)
    if (!business) {
      return res.status(401).json({ message: 'Invalid Email or Password' });
    }
    
    console.log("ad", business)

    console.log(" is_admin:", business.is_admin,
    )
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, business.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid Password or Email' });
    }

    // Include isSalesperson in the token
    const token = jwt.sign(
      { 
        businessId: business.id, 
        email: business.email,
        isSalesperson: business.is_salesperson ,
        is_admin: business.is_admin,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: business.id,
        email: business.email,
        businessName: business.business_name,
        isSalesperson: business.is_salesperson,
        is_admin: business.is_admin,
        onboarding_completed: business.onboarding_completed,
        subscriptionStatus: business.subscription_status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
};

// Add new endpoint to verify email
exports.verifyEmail = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { token } = req.params;

    await client.query('BEGIN');

    // Find the verification token
    const tokenResult = await client.query(
      `SELECT business_id, expires_at 
       FROM verification_tokens 
       WHERE token = $1 AND type = 'email'`,
      [token]
    );

    if (!tokenResult.rows[0]) {
      return res.status(400).json({ message: 'Invalid verification token' });
    }

    const { business_id, expires_at } = tokenResult.rows[0];

    // Check if token has expired
    if (new Date() > new Date(expires_at)) {
      return res.status(400).json({ message: 'Verification token has expired' });
    }

    // Update business email_verified status
    await client.query(
      'UPDATE businesses SET email_verified = true WHERE id = $1',
      [business_id]
    );

    // Delete the used token
    await client.query(
      'DELETE FROM verification_tokens WHERE token = $1',
      [token]
    );

    await client.query('COMMIT');

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Email verification error:', error);
    res.status(500).json({ message: 'Error verifying email' });
  } finally {
    client.release();
  }
};

// Add endpoint to resend verification email
exports.resendVerificationEmail = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const businessId = req.user.businessId;

    console.log("businessId", businessId)

    // Get business email
    const businessResult = await client.query(
      'SELECT email, email_verified FROM businesses WHERE id = $1',
      [businessId]
    );
    
    if (!businessResult.rows[0]) {
      return res.status(404).json({ message: 'Business not found' });
    }

    if (businessResult.rows[0].email_verified) {
      return res.status(400).json({ message: 'Email already verified' });
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    await client.query('BEGIN');

    // Delete any existing email verification tokens
    await client.query(
      `DELETE FROM verification_tokens 
       WHERE business_id = $1 AND type = 'email'`,
      [businessId]
    );

    // Save new verification token
    await client.query(
      `INSERT INTO verification_tokens (
        business_id, token, type, expires_at
      ) VALUES ($1, $2, $3, $4)`,
      [businessId, verificationToken, 'email', expiresAt]
    );

    // Send new verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await transporter.sendMail({
      from: '"The Gold Star" <noreply@thegoldstar.ca>',
      to: businessResult.rows[0].email,
      subject: "Verify your email address",
      html: `
        <h1>Verify your email address</h1>
        <p>Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}" style="
          background-color: #4F46E5;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          display: inline-block;
          margin: 16px 0;
        ">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
      `
    });

    await client.query('COMMIT');

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error sending verification email:', error);
    res.status(500).json({ message: 'Error sending verification email' });
  } finally {
    client.release();
  }
};

exports.forgotPassword = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { email } = req.body;
    
    // Check if business exists
    const businessResult = await client.query(
      'SELECT id FROM businesses WHERE email = $1',
      [email]
    );

    if (!businessResult.rows[0]) {
      // For security, still return success even if email doesn't exist
      return res.json({ message: 'If an account exists, password reset instructions have been sent' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

    await client.query('BEGIN');

    // Delete any existing reset tokens for this business
    await client.query(
      `DELETE FROM verification_tokens 
       WHERE business_id = $1 AND type = 'password_reset'`,
      [businessResult.rows[0].id]
    );

    // Save new reset token
    await client.query(
      `INSERT INTO verification_tokens (
        business_id, token, type, expires_at
      ) VALUES ($1, $2, $3, $4)`,
      [businessResult.rows[0].id, resetToken, 'password_reset', expiresAt]
    );

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      from: '"The Gold Star" <noreply@thegoldstar.ca>',
      to: email,
      subject: "Reset Your Password",
      html: `
        <h1>Reset Your Password</h1>
        <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
        <a href="${resetUrl}" style="
          background-color: #4F46E5;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          display: inline-block;
          margin: 16px 0;
        ">Reset Password</a>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    await client.query('COMMIT');

    res.json({ message: 'Password reset instructions sent to your email' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error processing request' });
  } finally {
    client.release();
  }
};

exports.resetPassword = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { token } = req.params;
    const { password } = req.body;

    await client.query('BEGIN');

    // Find the reset token
    const tokenResult = await client.query(
      `SELECT business_id, expires_at 
       FROM verification_tokens 
       WHERE token = $1 AND type = 'password_reset'`,
      [token]
    );

    if (!tokenResult.rows[0]) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const { business_id, expires_at } = tokenResult.rows[0];

    // Check if token has expired
    if (new Date() > new Date(expires_at)) {
      return res.status(400).json({ message: 'Reset token has expired' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    await client.query(
      'UPDATE businesses SET password = $1 WHERE id = $2',
      [hashedPassword, business_id]
    );

    // Delete the used token
    await client.query(
      'DELETE FROM verification_tokens WHERE token = $1',
      [token]
    );

    await client.query('COMMIT');

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  } finally {
    client.release();
  }
}; 
