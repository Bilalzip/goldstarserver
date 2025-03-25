const pool = require('../db/index');

module.exports = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT is_admin FROM businesses WHERE id = $1',
      [req.user.businessId]
    );

    if (!result.rows[0]?.is_admin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ message: 'Authentication error' });
  }
}; 