const express = require('express');
const router = express.Router();
const pusherController = require('../controllers/pusher');
const { authenticateToken } = require('../service/jwt');

router.post('/pusher/auth', authenticateToken(), pusherController.authenticatePusher);

module.exports = router;
