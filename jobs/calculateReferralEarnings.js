const pool = require('../db/index');

async function calculateMonthlyReferralEarnings() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get all active referrals
    const referrals = await client.query(`
      SELECT r.id, r.referrer_id, r.referred_business_id, s.amount
      FROM referrals r
      JOIN subscriptions s ON s.business_id = r.referred_business_id
      WHERE r.status = 'active'
    `);

    for (const referral of referrals.rows) {
      const commissionAmount = referral.amount * 0.20; // 20% commission
      
      // Record the earning
      await client.query(
        `INSERT INTO referral_earnings (referral_id, amount)
         VALUES ($1, $2)`,
        [referral.id, commissionAmount]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error calculating referral earnings:', error);
  } finally {
    client.release();
  }
}

module.exports = { calculateMonthlyReferralEarnings }; 