const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message');
const jwtService = require('../service/jwt');

// send message
router.post('/send', jwtService.authenticateToken(), messageController.sendMessage);

// get conversation with a user
router.get('/convo/:withId', jwtService.authenticateToken(), messageController.getConversation);

// mark read
router.put('/read/:withId', jwtService.authenticateToken(), messageController.markRead);

module.exports = router;