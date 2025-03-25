const pool = require('../db/index');
const qr = require('qrcode');

exports.generateQrCode = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { type } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080'; // Default fallback

    // Get business info
    const businessResult = await pool.query(
      'SELECT business_name, id FROM businesses WHERE id = $1',
      [businessId]
    );

    if (!businessResult.rows[0]) {
      return res.status(404).json({ message: 'Business not found' });
    }

    const business = businessResult.rows[0];

    // Generate unique review URL
    const reviewUrl = `${frontendUrl}/review/${businessId}`;
    console.log('Generated review URL:', reviewUrl); // Debug log

    // Generate QR code
    const qrCodeData = await qr.toDataURL(reviewUrl);

    // Save QR code to database
    await pool.query(
      `INSERT INTO qr_codes (business_id, type, url)
       VALUES ($1, $2, $3)
       ON CONFLICT (business_id, type) 
       DO UPDATE SET url = $3, updated_at = CURRENT_TIMESTAMP`,
      [businessId, type, reviewUrl]
    );

    res.json({
      qrCode: qrCodeData,
      reviewUrl,
      businessName: business.business_name
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ message: 'Error generating QR code' });
  }
};

exports.getBusinessQrCodes = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const result = await pool.query(
      `SELECT qc.*, b.business_name 
       FROM qr_codes qc
       JOIN businesses b ON b.id = qc.business_id
       WHERE qc.business_id = $1`,
      [businessId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching QR codes:', error);
    res.status(500).json({ message: 'Error fetching QR codes' });
  }
}; 