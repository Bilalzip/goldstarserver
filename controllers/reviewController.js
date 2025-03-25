const pool = require('../db/index');

exports.getReviews = async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { filter } = req.query;

    let query = `SELECT * FROM reviews WHERE business_id = $1`;
    
    if (filter === 'positive') {
      query += ` AND rating >= 4`;
    } else if (filter === 'negative') {
      query += ` AND rating < 4`;
    }
    
    query += ` ORDER BY created_at DESC`;

    const reviews = await pool.query(query, [businessId]);
    res.json(reviews.rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews' });
  }
};

exports.replyToReview = async (req, res) => {
  try {
    const { reviewId, reply } = req.body;
    const businessId = req.user.businessId;

    await pool.query(
      `UPDATE reviews 
       SET reply = $1, replied_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND business_id = $3`,
      [reply, reviewId, businessId]
    );

    res.json({ message: 'Reply added successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error adding reply' });
  }
};

exports.submitReview = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { businessId, rating, comment } = req.body;

    await client.query('BEGIN');

    // Insert review
    const reviewResult = await client.query(
      `INSERT INTO reviews (business_id, rating, comment)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [businessId, rating, comment]
    );

    // Get business Google review link
    const businessResult = await client.query(
      'SELECT google_review_link FROM businesses WHERE id = $1',
      [businessId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      reviewId: reviewResult.rows[0].id,
      googleReviewLink: businessResult.rows[0].google_review_link
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit review error:', error);
    res.status(500).json({ message: 'Error submitting review' });
  } finally {
    client.release();
  }
};

exports.submitSurvey = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { businessId, reviewId, improvementAreas, feedback } = req.body;

    await client.query('BEGIN');

    // Update review with survey data
    await client.query(
      `UPDATE reviews 
       SET improvement_areas = $1, 
           feedback = $2
       WHERE id = $3 AND business_id = $4`,
      [improvementAreas, feedback, reviewId, businessId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Survey submitted successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit survey error:', error);
    res.status(500).json({ message: 'Error submitting survey' });
  } finally {
    client.release();
  }
};