const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getReviews, replyToReview, submitReview, submitSurvey } = require('../controllers/reviewController');

router.get('/', auth, getReviews);
router.post('/:reviewId/reply', auth, replyToReview);
router.post('/submit', submitReview);
router.post('/survey', submitSurvey);

module.exports = router; 