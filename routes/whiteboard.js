const express = require('express');
const router = express.Router();
const whiteboardController = require('../controllers/whiteboard');
const { authenticateToken } = require('../service/jwt');

// Online-only: get/create a static Excalidraw room for a schedule
router.get('/room/:scheduleId', authenticateToken(), whiteboardController.getOrCreateRoom);

module.exports = router;