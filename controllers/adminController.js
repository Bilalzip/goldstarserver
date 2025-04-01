const pool = require('../db/index');
const transporter = require('../config/mail');
const { formatCurrency } = require('../utils/formatters');


 const getBusinesses = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.id,
        b.business_name,
        b.owner_name,
        b.email,
        b.created_at,
        s.status as subscription_status,
        (
          SELECT p.created_at 
          FROM payments p 
          WHERE p.business_id = b.id 
          ORDER BY p.created_at DESC 
          LIMIT 1
        ) as last_payment_date,
        (
          SELECT p.amount 
          FROM payments p 
          WHERE p.business_id = b.id 
          ORDER BY p.created_at DESC 
          LIMIT 1
        ) as last_payment_amount
      FROM businesses b
      LEFT JOIN subscriptions s ON b.id = s.business_id
      WHERE b.is_admin = FALSE
      ORDER BY b.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching businesses:', error);
    res.status(500).json({ message: 'Failed to fetch businesses' });
  }
};

const getBusinessDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        b.*,
        s.status as subscription_status,
        s.current_period_end,
        COUNT(DISTINCT r.id) as total_referrals,
        COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END) as active_referrals
      FROM businesses b
      LEFT JOIN subscriptions s ON b.id = s.business_id
      LEFT JOIN referrals r ON b.id = r.referred_business_id
      WHERE b.id = $1
      GROUP BY b.id, s.status, s.current_period_end
    `, [id]);

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Business not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching business details:', error);
    res.status(500).json({ message: 'Error fetching business details' });
  }
};

const suspendBusiness = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Update subscription status
    await client.query(`
      UPDATE subscriptions 
      SET status = 'suspended', 
          updated_at = CURRENT_TIMESTAMP 
      WHERE business_id = $1
    `, [id]);
    
    // Send suspension notification
    const businessResult = await client.query(
      'SELECT email, business_name FROM businesses WHERE id = $1',
      [id]
    );

    await transporter.sendMail({
      from: '"The Gold Star" <noreply@mailtrap.io>',
      to: businessResult.rows[0].email,
      subject: "Account Suspended - Action Required",
      html: `
        <h1>Account Suspended</h1>
        <p>Your The Gold Star account has been suspended due to payment issues.</p>
        <p>Please contact support to resolve this issue.</p>
      `
    });

    await client.query('COMMIT');
    res.json({ message: 'Business suspended successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error suspending business:', error);
    res.status(500).json({ message: 'Error suspending business' });
  } finally {
    client.release();
  }
};

// Salespeople Controllers
const getSalespeople = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.id,
        b.business_name as name,
        COUNT(DISTINCT r.id) as total_referrals,
        COUNT(DISTINCT CASE WHEN s.status = 'active' THEN r.referred_business_id END) as active_referrals,
        COALESCE(SUM(re.amount), 0) as total_commission,
        MAX(re.created_at) as last_payout
      FROM businesses b
      LEFT JOIN referrals r ON b.id = r.referrer_id
      LEFT JOIN subscriptions s ON s.business_id = r.referred_business_id
      LEFT JOIN referral_earnings re ON re.seller_id = b.id
      WHERE b.is_salesperson = true
      GROUP BY b.id, b.business_name
      ORDER BY total_commission DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching salespeople:', error);
    res.status(500).json({ message: 'Error fetching salespeople' });
  }
};

const getSalespersonDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        b.*,
        COUNT(DISTINCT r.id) as total_referrals,
        COALESCE(SUM(c.amount), 0) as total_commission,
        COUNT(DISTINCT CASE WHEN r2.subscription_status = 'active' THEN r.id END) as active_referrals
      FROM businesses b
      LEFT JOIN referrals r ON b.id = r.referrer_id
      LEFT JOIN businesses r2 ON r.referred_business_id = r2.id
      LEFT JOIN commissions c ON r.id = c.referral_id
      WHERE b.id = $1 AND b.is_salesperson = true
      GROUP BY b.id
    `, [id]);

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Salesperson not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching salesperson details:', error);
    res.status(500).json({ message: 'Error fetching salesperson details' });
  }
};

// Financial Controllers
const getFinancialOverview = async (req, res) => {
  try {
    // Get overview stats
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(p.amount), 0) as total_revenue,
        COALESCE(SUM(re.amount), 0) as total_commissions,
        COUNT(DISTINCT CASE WHEN s.status = 'active' THEN b.id END) as active_businesses,
        COUNT(DISTINCT CASE WHEN b.is_salesperson THEN b.id END) as total_salespeople
      FROM businesses b
      LEFT JOIN subscriptions s ON b.id = s.business_id
      LEFT JOIN payments p ON b.id = p.business_id
      LEFT JOIN referral_earnings re ON b.id = re.seller_id
    `);

    // Generate last 12 months
    const monthlyData = await pool.query(`
      WITH RECURSIVE months AS (
        SELECT 
          DATE_TRUNC('month', CURRENT_DATE - INTERVAL '11 months') as month
        UNION ALL
        SELECT 
          DATE_TRUNC('month', month + INTERVAL '1 month')
        FROM months
        WHERE month < DATE_TRUNC('month', CURRENT_DATE)
      ),
      payment_data AS (
        SELECT 
          DATE_TRUNC('month', p.created_at) as month,
          COALESCE(SUM(p.amount), 0) as revenue
        FROM payments p
        WHERE p.created_at >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', p.created_at)
      ),
      commission_data AS (
        SELECT 
          DATE_TRUNC('month', re.created_at) as month,
          COALESCE(SUM(re.amount), 0) as commissions
        FROM referral_earnings re
        WHERE re.created_at >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', re.created_at)
      )
      SELECT 
        months.month,
        COALESCE(payment_data.revenue, 0) as revenue,
        COALESCE(commission_data.commissions, 0) as commissions
      FROM months
      LEFT JOIN payment_data ON months.month = payment_data.month
      LEFT JOIN commission_data ON months.month = commission_data.month
      ORDER BY months.month ASC
    `);

    res.json({
      overview: {
        total_revenue: parseFloat(result.rows[0].total_revenue).toFixed(2),
        total_commissions: parseFloat(result.rows[0].total_commissions).toFixed(2),
        active_businesses: parseInt(result.rows[0].active_businesses),
        total_salespeople: parseInt(result.rows[0].total_salespeople)
      },
      monthlyData: monthlyData.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue).toFixed(2),
        commissions: parseFloat(row.commissions).toFixed(2)
      }))
    });
  } catch (error) {
    console.error('Error fetching financial overview:', error);
    res.status(500).json({ message: 'Error fetching financial overview' });
  }
};

const getRevenueReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', p.created_at) as date,
        COUNT(DISTINCT p.id) as transactions,
        COALESCE(SUM(p.amount), 0) as revenue,
        COALESCE(SUM(c.amount), 0) as commissions,
        COALESCE(SUM(p.amount - COALESCE(c.amount, 0)), 0) as net_revenue
      FROM payments p
      LEFT JOIN commissions c ON p.id = c.payment_id
      WHERE p.created_at BETWEEN $1 AND $2
      GROUP BY date
      ORDER BY date
    `, [startDate, endDate]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching revenue report:', error);
    res.status(500).json({ message: 'Error fetching revenue report' });
  }
};

const getCommissionsReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await pool.query(`
      SELECT 
        b.business_name as salesperson,
        COUNT(DISTINCT r.id) as total_referrals,
        COUNT(DISTINCT CASE WHEN r2.subscription_status = 'active' THEN r.id END) as active_referrals,
        COALESCE(SUM(c.amount), 0) as total_commission
      FROM businesses b
      LEFT JOIN referrals r ON b.id = r.referrer_id
      LEFT JOIN businesses r2 ON r.referred_business_id = r2.id
      LEFT JOIN commissions c ON r.id = c.referral_id
      WHERE b.is_salesperson = true
        AND c.created_at BETWEEN $1 AND $2
      GROUP BY b.id, b.business_name
      ORDER BY total_commission DESC
    `, [startDate, endDate]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching commissions report:', error);
    res.status(500).json({ message: 'Error fetching commissions report' });
  }
};

const sendInvoice = async (req, res) => {
  const { id } = req.params;

  try {
    // Get business and latest payment details
    const result = await pool.query(`
      SELECT 
        b.business_name,
        b.email,
        b.address,
        s.status as subscription_status,
        p.amount,
        p.created_at as payment_date
      FROM businesses b
      LEFT JOIN subscriptions s ON b.id = s.business_id
      LEFT JOIN (
        SELECT DISTINCT ON (business_id) 
          business_id, 
          amount, 
          created_at
        FROM payments
        ORDER BY business_id, created_at DESC
      ) p ON b.id = p.business_id
      WHERE b.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Business not found' });
    }

    const business = result.rows[0];

    // Generate invoice HTML
    const invoiceHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Invoice for ${business.business_name}</h2>
        <p>Date: ${new Date().toLocaleDateString()}</p>
        <hr>
        <div style="margin: 20px 0;">
          <h3>Subscription Details:</h3>
          <p>Status: ${business.subscription_status || 'Inactive'}</p>
          <p>Amount: ${formatCurrency(business.amount || 0)}</p>
          <p>Last Payment: ${business.payment_date ? 
            new Date(business.payment_date).toLocaleDateString() : 'N/A'}</p>
        </div>
        <hr>
        <div style="margin: 20px 0;">
          <h3>Business Details:</h3>
          <p>Name: ${business.business_name}</p>
          <p>Address: ${business.address || 'Not provided'}</p>
        </div>
        <hr>
        <p style="color: #666; font-size: 14px;">Please process your payment to continue enjoying our services.</p>
        <p style="color: #666; font-size: 14px;">Thank you for your business!</p>
      </div>
    `;

    // Send email
    await transporter.sendMail({
      from: process.env.MAIL_FROM || '"The Gold Star" <noreply@reputationrocket.com>',
      to: business.email,
      subject: `Invoice for ${business.business_name}`,
      html: invoiceHtml
    });

    res.json({ message: 'Invoice sent successfully' });
  } catch (error) {
    console.error('Error sending invoice:', error);
    res.status(500).json({ message: 'Failed to send invoice' });
  }
};

const getSalespersonReferrals = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        r.id,
        b.business_name as referred_business,
        s.status as subscription_status,
        r.created_at as referral_date,
        re.amount as commission_amount,
        re.status as payment_status
      FROM referrals r
      JOIN businesses b ON r.referred_business_id = b.id
      LEFT JOIN subscriptions s ON s.business_id = b.id
      LEFT JOIN referral_earnings re ON re.seller_id = r.referrer_id 
        AND re.business_id = r.referred_business_id
      WHERE r.referrer_id = $1
      ORDER BY r.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching salesperson referrals:', error);
    res.status(500).json({ message: 'Error fetching salesperson referrals' });
  }
};

const getSalespersonPayments = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        re.id,
        re.amount,
        re.status,
        re.created_at as payment_date,
        b.business_name as referred_business
      FROM referral_earnings re
      JOIN businesses b ON b.id = re.business_id
      WHERE re.seller_id = $1
      ORDER BY re.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching salesperson payments:', error);
    res.status(500).json({ message: 'Error fetching salesperson payments' });
  }
};

const getBusinessDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        b.*,
        s.status as subscription_status,
        p.amount as last_payment_amount,
        p.created_at as last_payment_date,
        COUNT(DISTINCT r.id) as total_referrals,
        COUNT(DISTINCT CASE WHEN rs.status = 'active' THEN r.id END) as active_referrals
      FROM businesses b
      LEFT JOIN subscriptions s ON b.id = s.business_id
      LEFT JOIN (
        SELECT DISTINCT ON (business_id) 
          business_id, 
          amount, 
          created_at
        FROM payments
        ORDER BY business_id, created_at DESC
      ) p ON b.id = p.business_id
      LEFT JOIN referrals r ON b.id = r.referred_business_id
      LEFT JOIN subscriptions rs ON rs.business_id = r.referred_business_id
      WHERE b.id = $1
      GROUP BY b.id, s.status, p.amount, p.created_at
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Business not found' });
    }

    // Format the response
    const business = {
      ...result.rows[0],
      last_payment_amount: result.rows[0].last_payment_amount ? 
        parseFloat(result.rows[0].last_payment_amount) : null,
      total_referrals: parseInt(result.rows[0].total_referrals),
      active_referrals: parseInt(result.rows[0].active_referrals)
    };

    res.json(business);
  } catch (error) {
    console.error('Error fetching business details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const getBusinessStats = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        COALESCE(SUM(re.amount), 0) as total_earnings,
        COALESCE(SUM(CASE WHEN re.status = 'pending' THEN re.amount ELSE 0 END), 0) as pending_payments,
        COUNT(DISTINCT r.id) as successful_referrals,
        ROUND(
          CAST(COUNT(DISTINCT CASE WHEN s.status = 'active' THEN r.id END) AS DECIMAL) / 
          NULLIF(COUNT(DISTINCT r.id), 0) * 100,
          1
        ) as conversion_rate
      FROM businesses b
      LEFT JOIN referrals r ON b.id = r.referrer_id
      LEFT JOIN referral_earnings re ON b.id = re.seller_id
      LEFT JOIN subscriptions s ON r.referred_business_id = s.business_id
      WHERE b.id = $1
      GROUP BY b.id
    `, [id]);

    res.json(result.rows[0] || {
      total_earnings: 0,
      pending_payments: 0,
      successful_referrals: 0,
      conversion_rate: 0
    });
  } catch (error) {
    console.error('Error fetching business stats:', error);
    res.status(500).json({ message: 'Error fetching business stats' });
  }
};

module.exports = {
  getBusinesses,
  getBusinessDetail,
  suspendBusiness,
  getSalespeople,
  getSalespersonDetail,
  getFinancialOverview,
  getRevenueReport,
  getCommissionsReport,
  sendInvoice,
  getSalespersonReferrals,
  getSalespersonPayments,
  getBusinessDetails,
  getBusinessStats
}; 