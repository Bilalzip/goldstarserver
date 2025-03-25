const pool = require('../db');

exports.getBankDetails = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    
    const result = await pool.query(
      `SELECT 
        account_holder_name as "accountHolderName",
        transit_number as "transitNumber",
        institution_number as "institutionNumber",
        account_number as "accountNumber",
        bank_name as "bankName",
        account_type as "accountType"
       FROM bank_details 
       WHERE business_id = $1`,
      [businessId]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching bank details:', error);
    res.status(500).json({ message: 'Failed to fetch bank details' });
  }
};

exports.updateBankDetails = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { 
      accountHolderName, 
      transitNumber,
      institutionNumber,
      accountNumber,
      bankName,
      accountType
    } = req.body;

    // Validate input
    if (!/^\d{5}$/.test(transitNumber)) {
      return res.status(400).json({ message: 'Transit number must be 5 digits' });
    }
    if (!/^\d{3}$/.test(institutionNumber)) {
      return res.status(400).json({ message: 'Institution number must be 3 digits' });
    }
    if (!/^\d{7,12}$/.test(accountNumber)) {
      return res.status(400).json({ message: 'Account number must be 7-12 digits' });
    }

    await pool.query(
      `INSERT INTO bank_details (
        business_id,
        account_holder_name,
        transit_number,
        institution_number,
        account_number,
        bank_name,
        account_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (business_id) 
      DO UPDATE SET 
        account_holder_name = EXCLUDED.account_holder_name,
        transit_number = EXCLUDED.transit_number,
        institution_number = EXCLUDED.institution_number,
        account_number = EXCLUDED.account_number,
        bank_name = EXCLUDED.bank_name,
        account_type = EXCLUDED.account_type,
        updated_at = CURRENT_TIMESTAMP`,
      [businessId, accountHolderName, transitNumber, institutionNumber, accountNumber, bankName, accountType]
    );

    res.json({ message: 'Bank details updated successfully' });
  } catch (error) {
    console.error('Error updating bank details:', error);
    res.status(500).json({ message: 'Failed to update bank details' });
  }
}; 