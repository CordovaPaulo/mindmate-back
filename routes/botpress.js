const express = require('express');
const router = express.Router();
const botpressController = require('../controllers/botpress');
const { authenticateToken } = require('../service/jwt');

// Health check endpoint (public)
router.get('/health', botpressController.healthCheck);

// Protected endpoints - require authentication
router.post('/get-schedule', botpressController.getSchedule);
router.post('/summarize', botpressController.summarizeText);

module.exports = router;
