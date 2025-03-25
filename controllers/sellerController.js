const pool = require('../db/index');

exports.getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.user.id;
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT r.id) as total_referrals,
        COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END) as active_referrals,
        COALESCE(SUM(re.amount), 0) as total_earnings,
        COALESCE(SUM(CASE 
          WHEN re.status = 'pending' 
          THEN re.amount 
          ELSE 0 
        END), 0) as pending_earnings
      FROM referrals r
      LEFT JOIN referral_earnings re ON re.referral_id = r.id
      WHERE r.seller_id = $1
    `, [sellerId]);

    // Calculate next payout date (1st of next month)
    const today = new Date();
    const nextPayoutDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    res.json({
      stats: {
        totalReferrals: parseInt(statsResult.rows[0]?.total_referrals || '0'),
        activeReferrals: parseInt(statsResult.rows[0]?.active_referrals || '0'),
        totalEarnings: parseFloat(statsResult.rows[0]?.total_earnings || '0'),
        nextPayout: {
          amount: parseFloat(statsResult.rows[0]?.pending_earnings || '0'),
          date: nextPayoutDate
        }
      }
    });
  } catch (error) {
    console.error('Error fetching seller dashboard:', error);
    res.status(500).json({ message: 'Failed to load dashboard data' });
  }
};

exports.getSellerReferrals = async (req, res) => {
  try {
    const sellerId = req.user.id;
    
    const referrals = await pool.query(`
      SELECT 
        r.id,
        b.business_name,
        b.email,
        b.onboarding_completed,
        s.status as subscription_status,
        r.created_at,
        COALESCE(SUM(re.amount), 0) as total_earnings
      FROM referrals r
      LEFT JOIN businesses b ON b.id = r.referred_business_id
      LEFT JOIN subscriptions s ON s.business_id = b.id
      LEFT JOIN referral_earnings re ON re.referral_id = r.id
      WHERE r.seller_id = $1
      GROUP BY r.id, b.business_name, b.email, b.onboarding_completed, 
               s.status, r.created_at
      ORDER BY r.created_at DESC
    `, [sellerId]);

    res.json(referrals.rows.map(row => ({
      id: row.id,
      businessName: row.business_name,
      email: row.email,
      status: determineReferralStatus(row),
      joinDate: row.created_at,
      earnings: parseFloat(row.total_earnings)
    })));
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ message: 'Failed to load referrals' });
  }
};

exports.generateSellerReferralCode = async (req, res) => {
  try {
    const sellerId = req.user.id;
    
    const existing = await pool.query(
      'SELECT referral_code FROM sellers WHERE id = $1',
      [sellerId]
    );

    if (existing.rows[0]?.referral_code) {
      return res.json({ referralCode: existing.rows[0].referral_code });
    }

    const referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    await pool.query(
      'UPDATE sellers SET referral_code = $1 WHERE id = $2',
      [referralCode, sellerId]
    );

    res.json({ referralCode });
  } catch (error) {
    console.error('Error generating referral code:', error);
    res.status(500).json({ message: 'Failed to generate referral code' });
  }
};

exports.getSellerPayments = async (req, res) => {
  try {
    const sellerId = req.user.id;
    
    const payments = await pool.query(`
      SELECT 
        re.id,
        re.amount,
        re.status,
        re.created_at,
        b.business_name
      FROM referral_earnings re
      JOIN referrals r ON r.id = re.referral_id
      JOIN businesses b ON b.id = r.referred_business_id
      WHERE r.seller_id = $1
      ORDER BY re.created_at DESC
    `, [sellerId]);

    res.json(payments.rows.map(row => ({
      id: row.id,
      amount: parseFloat(row.amount),
      status: row.status,
      date: row.created_at,
      businessName: row.business_name
    })));
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Failed to load payments' });
  }
};

function determineReferralStatus(referral) {
  if (!referral.onboarding_completed) {
    return 'pending_onboarding';
  }
  if (referral.subscription_status !== 'active') {
    return 'pending_subscription';
  }
  return 'active';
} 