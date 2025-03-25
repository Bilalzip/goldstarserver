const pool = require('../db/index');

exports.getSalespersonStats = async (req, res) => {
  try {
    const salespersonId = req.user.id;

    // Get overall stats
    const statsResult = await pool.query(`
      SELECT 
        COALESCE(SUM(commission_amount), 0) as total_commission,
        COUNT(DISTINCT CASE WHEN b.subscription_status = 'active' THEN r.id END) as active_referrals,
        COALESCE(SUM(CASE 
          WHEN b.subscription_status = 'active' 
          AND r.commission_paid = false 
          THEN (b.subscription_amount * 0.20) 
          ELSE 0 
        END), 0) as next_payout_amount
      FROM referrals r
      LEFT JOIN businesses b ON b.id = r.referred_business_id
      WHERE r.salesperson_id = $1
    `, [salespersonId]);

    // Get next payout date (assuming monthly payouts)
    const nextPayoutDate = new Date();
    nextPayoutDate.setDate(1); // First day of next month
    nextPayoutDate.setMonth(nextPayoutDate.getMonth() + 1);

    res.json({
      totalCommission: parseFloat(statsResult.rows[0].total_commission),
      activeReferrals: parseInt(statsResult.rows[0].active_referrals),
      nextPayoutDate: nextPayoutDate.toISOString(),
      nextPayoutAmount: parseFloat(statsResult.rows[0].next_payout_amount)
    });
  } catch (error) {
    console.error('Error fetching salesperson stats:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
};

exports.getSalespersonReferrals = async (req, res) => {
  try {
    const salespersonId = req.user.id;

    const referrals = await pool.query(`
      SELECT 
        r.id,
        b.business_name,
        b.owner_name,
        b.subscription_status as status,
        b.created_at as join_date,
        p.created_at as last_payment,
        COALESCE(SUM(p.amount * 0.20), 0) as commission
      FROM referrals r
      JOIN businesses b ON b.id = r.referred_business_id
      LEFT JOIN payments p ON p.business_id = b.id
      WHERE r.salesperson_id = $1
      GROUP BY r.id, b.business_name, b.owner_name, b.subscription_status, b.created_at, p.created_at
      ORDER BY b.created_at DESC
    `, [salespersonId]);

    res.json(referrals.rows);
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ message: 'Failed to fetch referrals' });
  }
};

exports.getReferralLink = async (req, res) => {
  try {
    const salespersonId = req.user.id;

    // Get or generate referral code
    const codeResult = await pool.query(
      'SELECT referral_code FROM salespeople WHERE id = $1',
      [salespersonId]
    );

    let referralCode = codeResult.rows[0]?.referral_code;

    if (!referralCode) {
      referralCode = generateReferralCode();
      await pool.query(
        'UPDATE salespeople SET referral_code = $1 WHERE id = $2',
        [referralCode, salespersonId]
      );
    }

    const link = `${process.env.FRONTEND_URL}/signup?ref=${referralCode}`;
    res.json({ link });
  } catch (error) {
    console.error('Error getting referral link:', error);
    res.status(500).json({ message: 'Failed to get referral link' });
  }
}; 