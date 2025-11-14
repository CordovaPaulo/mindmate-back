const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai');
const { authenticateToken } = require('../service/jwt')

router.post('/chat', authenticateToken(), aiController.chat);

module.exports = router;