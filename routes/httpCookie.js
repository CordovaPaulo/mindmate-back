const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getCookie, clearCookie } = require('../controllers/cookie');

router.get('/session', getCookie);
router.post('/logout', clearCookie);

module.exports = router;