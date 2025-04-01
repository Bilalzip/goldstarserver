const pool = require('../db/index');
const { validateCouponCode } = require('../utils/validation');

const couponController = {
  // Validate and apply a coupon
  async validateCoupon(req, res) {
    const { code } = req.body;
    console.log(code)
    const businessId = req.user.businessId;
    
    console.log(businessId)
    
    try {
      // Check if coupon exists and is valid
      const couponResult = await pool.query(
        `SELECT c.*, 
          (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = c.id) as current_uses
         FROM coupons c 
         WHERE c.code = $1`,  // Remove conditions temporarily to see if coupon exists at all
        [code.toUpperCase()]
      );
      
      console.log('Searching for coupon:', code.toUpperCase());
      console.log('Found coupon:', couponResult.rows[0]);

      if (couponResult.rows.length === 0) {
        return res.status(404).json({ message: 'Invalid coupon code' });
      }
      
      const coupon = couponResult.rows[0];

      console.log("object", coupon)
      
      // Check if coupon has reached max uses
      if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
        return res.status(400).json({ message: 'Coupon has reached maximum uses' });
      }
      


      // Check if user has already used this coupon
      const redemptionCheck = await pool.query(
        'SELECT * FROM coupon_redemptions WHERE coupon_id = $1 AND business_id = $2',
        [coupon.id, businessId]
      );

      if (redemptionCheck.rows.length > 0) {
        return res.status(400).json({ message: 'You have already used this coupon' });
      }

      // If it's a trial coupon, update the business status immediately
      if (coupon.type === 'trial') {
        await pool.query(
          `UPDATE businesses 
           SET subscription_status = 'trial',
               trial_ends_at = CURRENT_TIMESTAMP + interval '1 day' * $1
           WHERE id = $2`,
          [coupon.value, businessId]
        );

        // Record the coupon redemption
        await pool.query(
          'INSERT INTO coupon_redemptions (coupon_id, business_id) VALUES ($1, $2)',
          [coupon.id, businessId]
        );

        // Update coupon usage count
        await pool.query(
          'UPDATE coupons SET times_used = times_used + 1 WHERE id = $1',
          [coupon.id]
        );

        return res.json({
          code: coupon.code,
          description: coupon.description,
          type: 'trial',
          value: coupon.value,
          redirect: true,
          subscriptionStatus: 'trial'
        });
      }
      console.log({
        code: coupon.code,
        description: coupon.description,
        type: coupon.type,
        value: coupon.value,
        redirect: false
      })
      // For non-trial coupons, return the discount info
      return res.json({
        code: coupon.code,
        description: coupon.description,
        type: coupon.type,
        value: coupon.value,
        redirect: false
      });
    
    } catch (error) {
      console.error('Error validating coupon:', error);
      return res.status(500).json({ message: 'Server error' });
    }
  },

  // Admin: Create a new coupon
  async createCoupon(req, res) {
    const { code, description, type, value, maxUses, expiresAt } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO coupons (code, description, type, value, max_uses, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [code.toUpperCase(), description, type, value, maxUses, expiresAt]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating coupon:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Admin: List all coupons
  async listCoupons(req, res) {
    try {
      const result = await pool.query(
        `SELECT c.*, 
          (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = c.id) as times_used
         FROM coupons c
         ORDER BY created_at DESC`
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Error listing coupons:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // Admin: Deactivate a coupon
  async deactivateCoupon(req, res) {
    const { id } = req.params;

    try {
      await pool.query(
        'UPDATE coupons SET is_active = false WHERE id = $1',
        [id]
      );

      res.json({ message: 'Coupon deactivated successfully' });
    } catch (error) {
      console.error('Error deactivating coupon:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};

module.exports = couponController; 