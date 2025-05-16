const pool = require("../db/index");
const qr = require("qrcode");

// Helper function to generate a random URL ID (15 chars)
const generateRandomUrlId = () => {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 15; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

exports.generateQrCode = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { type } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080"; // Default fallback

    // Get business info
    const businessResult = await pool.query(
      "SELECT business_name, id FROM businesses WHERE id = $1",
      [businessId]
    );

    if (!businessResult.rows[0]) {
      return res.status(404).json({ message: "Business not found" });
    }

    const business = businessResult.rows[0];

    // Check if a QR code already exists for this business and type
    const existingQrResult = await pool.query(
      "SELECT url_id FROM qr_codes WHERE business_id = $1 AND type = $2",
      [businessId, type]
    );

    // Use existing url_id or generate a new one
    let urlId;
    if (existingQrResult.rows[0] && existingQrResult.rows[0].url_id) {
      urlId = existingQrResult.rows[0].url_id;
    } else {
      urlId = generateRandomUrlId();
    }

    // Generate unique review URL using the secure urlId instead of businessId
    const reviewUrl = `${frontendUrl}/review/${urlId}`;
    console.log("Generated secure review URL:", reviewUrl); // Debug log

    // Generate QR code
    const qrCodeData = await qr.toDataURL(reviewUrl);

    // Save QR code to database with url_id
    await pool.query(
      `INSERT INTO qr_codes (business_id, type, url_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (business_id, type) 
       DO UPDATE SET url_id = $3, updated_at = CURRENT_TIMESTAMP`,
      [businessId, type, urlId]
    );

    res.json({
      qrCode: qrCodeData,
      reviewUrl,
      businessName: business.business_name,
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).json({ message: "Error generating QR code" });
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

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
    const qrCodes = result.rows.map((qr) => {
      return {
        ...qr,
        reviewUrl: `${frontendUrl}/review/${qr.url_id}`,
      };
    });

    res.json(qrCodes);
  } catch (error) {
    console.error("Error fetching QR codes:", error);
    res.status(500).json({ message: "Error fetching QR codes" });
  }
};

// New endpoint to handle review requests with the url_id
exports.getReviewByUrlId = async (req, res) => {
  try {
    const { urlId } = req.params;

    // Find the business associated with this URL ID
    const qrResult = await pool.query(
      `SELECT qc.business_id, b.business_name , b.google_review_link
       FROM qr_codes qc
       JOIN businesses b ON b.id = qc.business_id
       WHERE qc.url_id = $1`,
      [urlId]
    );

    if (!qrResult.rows[0]) {
      return res.status(404).json({ message: "Review page not found" });
    }

    const businessId = qrResult.rows[0].business_id;

    // Return the business info or whatever else you need for the review page
    res.json({
      businessId,
      businessName: qrResult.rows[0].business_name,
      // Add any other data needed for the review page
    });
  } catch (error) {
    console.error("Error fetching review page:", error);
    res.status(500).json({ message: "Error fetching review page" });
  }
};
