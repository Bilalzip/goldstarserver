const jwt = require("jsonwebtoken");
const pool = require("../db/index");

module.exports = async (req, res, next) => {
  try {
    console.log("Auth Middleware - Headers:", req.headers);
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded token:", decoded);

    // Get business details from database
    const result = await pool.query(
      "SELECT id, email, business_name, is_salesperson, is_admin, subscription_status, onboarding_completed FROM businesses WHERE id = $1",
      [decoded.businessId]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ message: "Invalid business account" });
    }

    // Set user object with all necessary fields
    req.user = {
      ...decoded,
      businessId: result.rows[0].id,
      email: result.rows[0].email,
      businessName: result.rows[0].business_name,
      isSalesperson: result.rows[0].is_salesperson,
      isAdmin: result.rows[0].is_admin,
      subscriptionStatus: result.rows[0].subscription_status,
      onboarding_completed: result.rows[0].onboarding_completed,
    };

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};
