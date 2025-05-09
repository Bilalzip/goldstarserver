const { pool } = require("../db/index");

exports.getDashboardStats = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    // Get review stats
    const reviewStats = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive,
        COUNT(CASE WHEN rating < 4 THEN 1 END) as negative,
        ROUND(AVG(rating)::numeric, 1) as average_rating
       FROM reviews 
       WHERE business_id = $1`,
      [businessId]
    );

    // Get recent activity with customer names
    const recentActivity = await pool.query(
      `SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        r.customer_name
       FROM reviews r
       WHERE r.business_id = $1 
       ORDER BY r.created_at DESC 
       LIMIT 5`,
      [businessId]
    );

    res.json({
      stats: {
        ...reviewStats.rows[0],
        total: parseInt(reviewStats.rows[0].total),
        positive: parseInt(reviewStats.rows[0].positive || 0),
        negative: parseInt(reviewStats.rows[0].negative || 0),
      },
      recentActivity: recentActivity.rows,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ message: "Error fetching dashboard data" });
  }
};

exports.updateBusinessProfile = async (req, res) => {
  const client = await pool.connect();

  try {
    const businessId = req.user.businessId;
    const { businessName, ownerName, phone, address, googleReviewLink } =
      req.body;

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE businesses 
       SET business_name = $1, 
           owner_name = $2, 
           phone = $3, 
           address = $4, 
           google_review_link = $5,
           onboarding_completed = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [businessName, ownerName, phone, address, googleReviewLink, businessId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      business: {
        ...result.rows[0],
        onboarding_completed: true,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Error updating profile" });
  } finally {
    client.release();
  }
};

exports.completeOnboarding = async (req, res) => {
  const client = await pool.connect();

  try {
    const businessId = req.user.businessId;
    const paymentMethod = req.body.paymentMethod || "credit_card"; // Default value

    await client.query("BEGIN");

    // Update business onboarding status
    await client.query(
      `UPDATE businesses 
       SET onboarding_completed = true 
       WHERE id = $1`,
      [businessId]
    );

    // Create subscription
    await client.query(
      `INSERT INTO subscriptions (business_id, payment_method, status)
       VALUES ($1, $2, 'active')`,
      [businessId, paymentMethod]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Onboarding completed successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Complete onboarding error:", error);
    res.status(500).json({ message: "Error completing onboarding" });
  } finally {
    client.release();
  }
};

exports.getBusinessProfile = async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const result = await pool.query(
      `SELECT 
        business_name,
        owner_name,
        email,
        phone,
        address,
        google_review_link
       FROM businesses 
       WHERE id = $1`,
      [businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching business profile:", error);
    res.status(500).json({ message: "Error fetching business profile" });
  }
};

exports.getPublicBusinessDetails = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Get business with subscription status and end date
    const result = await pool.query(
      `SELECT b.business_name, b.google_review_link, b.subscription_status, 
              s.current_period_end
       FROM businesses b
       LEFT JOIN subscriptions s ON s.business_id = b.id
       WHERE b.id = $1`,
      [businessId]
    );

    // Check if business exists
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Business not found" });
    }

    const business = result.rows[0];
    const now = new Date();

    // Check if subscription is "cancelling" and period has ended
    if (
      business.subscription_status === "cancelling" &&
      business.current_period_end &&
      new Date(business.current_period_end) < now
    ) {
      // Update both businesses and users tables
      await pool.query(
        "UPDATE businesses SET subscription_status = 'pending' WHERE id = $1",
        [businessId]
      );

      await pool.query(
        "UPDATE users SET subscription_status = 'pending' WHERE business_id = $1",
        [businessId]
      );

      // Update the status in our local result
      business.subscription_status = "pending";
    }

    // Return "Business not found" if subscription status is pending
    if (business.subscription_status === "pending") {
      return res.status(404).json({ message: "Business not found" });
    }

    // Return only the necessary public details
    res.json({
      business_name: business.business_name,
      google_review_link: business.google_review_link,
    });
  } catch (error) {
    console.error("Error fetching business details:", error);
    res.status(500).json({ message: "Error fetching business details" });
  }
};

exports.getBusinessReviews = async (req, res) => {
  console.log("Getting business reviews");
  console.log("User from token:", req.user);

  try {
    const businessId = req.user.businessId;
    console.log("Business ID:", businessId);

    const result = await pool.query(
      `SELECT 
        r.id,
        r.customer_name,
        r.rating,
        r.comment,
        r.created_at,
        r.improvement_areas,
        r.feedback,
        r.source
       FROM reviews r
       WHERE r.business_id = $1 
       ORDER BY r.created_at DESC`,
      [businessId]
    );

    console.log("Query result:", result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Error fetching reviews" });
  }
};
