const pool = require('../db');
const { generateRandomCode } = require('../utils/helpers');

exports.getReferralDashboard = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    console.log('Fetching dashboard for business:', businessId);

    // Get referral stats with corrected column names
    const statsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT r.id) as total_referrals,
        COUNT(DISTINCT CASE WHEN s.status = 'active' THEN r.id END) as active_referrals,
        COALESCE(SUM(re.amount), 0) as total_earnings
      FROM referrals r
      LEFT JOIN businesses b ON b.id = r.referred_business_id
      LEFT JOIN subscriptions s ON s.business_id = r.referred_business_id
      LEFT JOIN referral_earnings re ON re.business_id = r.referred_business_id 
        AND re.seller_id = r.referrer_id
      WHERE r.referrer_id = $1
      GROUP BY r.referrer_id
    `, [businessId]);
    
    // Get detailed referral information
    const referralsResult = await pool.query(`
      SELECT 
        r.id,
        r.referred_business_id,
        b.business_name as referred_business,
        b.email as referred_email,
        CASE 
          WHEN s.status = 'active' THEN 'active'
          WHEN b.onboarding_completed THEN 'pending_subscription'
          ELSE 'pending_onboarding'
        END as status,
        r.created_at,
        COALESCE(re.amount, 0) as earnings,
        b.onboarding_completed,
        s.status as subscription_status
      FROM referrals r
      LEFT JOIN businesses b ON b.id = r.referred_business_id
      LEFT JOIN subscriptions s ON s.business_id = r.referred_business_id
      LEFT JOIN referral_earnings re ON re.business_id = r.referred_business_id 
        AND re.seller_id = r.referrer_id
      WHERE r.referrer_id = $1
      ORDER BY r.created_at DESC
    `, [businessId]);

    console.log('Stats result:', statsResult.rows[0]);
    console.log('Referrals result:', referralsResult.rows);

    res.json({
      stats: {
        totalReferrals: parseInt(statsResult.rows[0]?.total_referrals || '0'),
        activeReferrals: parseInt(statsResult.rows[0]?.active_referrals || '0'),
        totalEarnings: parseFloat(statsResult.rows[0]?.total_earnings || '0')
      },
      referrals: referralsResult.rows.map(row => ({
        id: row.id,
        referredBusinessId: row.referred_business_id,
        businessName: row.referred_business,
        email: row.referred_email,
        status: row.status,
        createdAt: row.created_at,
        earnings: parseFloat(row.earnings || '0'),
        onboardingCompleted: row.onboarding_completed,
        subscriptionStatus: row.subscription_status
      }))
    });

  } catch (error) {
    console.error('Error fetching referral dashboard:', error.message);
    console.error('Error details:', error);
    res.status(500).json({ message: 'Failed to load referral data' });
  }
};

// Helper function to determine referral status
function determineReferralStatus(referral) {
  if (!referral.onboarding_completed) {
    return 'pending_onboarding';
  }
  if (referral.subscription_status !== 'active') {
    return 'pending_subscription';
  }
  return 'active';
}

exports.generateReferralCode = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    console.log('Generating code for business:', businessId);

    // Check if business already has a referral code
    const existing = await pool.query(
      'SELECT referral_code FROM businesses WHERE id = $1',
      [businessId]
    );

    if (existing.rows[0]?.referral_code) {
      console.log('Existing referral code found:', existing.rows[0].referral_code);
      return res.json({ referralCode: existing.rows[0].referral_code });
    }

    // Generate new unique referral code
    const referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    await pool.query(
      'UPDATE businesses SET referral_code = $1 WHERE id = $2',
      [referralCode, businessId]
    );

    console.log('Generated new referral code:', referralCode);
    res.json({ referralCode });
  } catch (error) {
    console.error('Error generating referral code:', error);
    res.status(500).json({ message: 'Failed to generate referral code' });
  }
};

// Called when a referred business makes a payment
exports.recordReferralEarning = async (businessId, paymentAmount) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find the referral record
    const referralResult = await client.query(
      'SELECT id, referrer_id FROM referrals WHERE referred_business_id = $1 AND status = $2',
      [businessId, 'active']
    );

    if (referralResult.rows.length > 0) {
      const referralId = referralResult.rows[0].id;
      const commissionAmount = paymentAmount * 0.20; // 20% commission

      // Record the earning
      await client.query(
        `INSERT INTO referral_earnings (referral_id, amount, month) 
         VALUES ($1, $2, DATE_TRUNC('month', CURRENT_DATE))`,
        [referralId, commissionAmount]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording referral earning:', error);
  } finally {
    client.release();
  }
}; 