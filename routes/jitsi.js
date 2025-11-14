const express = require('express');
const router = express.Router();
const jitsiController = require('../controllers/jitsi');

// Get or create Jitsi session for a schedule
router.get('/session/:scheduleId', jitsiController.getOrCreateSession);

// End Jitsi session
router.post('/session/:scheduleId/end', jitsiController.endSession);

// Get session history
router.get('/history', jitsiController.getSessionHistory);

module.exports = router;