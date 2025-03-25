const pool = require('../db');

async function updateReferralStatuses() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update status to active for businesses that have completed onboarding
    await client.query(`
      UPDATE referrals r
      SET status = 'active'
      FROM businesses b
      WHERE r.referred_business_id = b.id
      AND b.onboarding_completed = true
      AND r.status = 'pending'
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating referral statuses:', error);
  } finally {
    client.release();
  }
}

module.exports = { updateReferralStatuses }; 