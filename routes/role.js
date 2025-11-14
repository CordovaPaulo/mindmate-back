const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../service/jwt');
const usersController = require('../controllers/role');

router.get('/', authenticateToken(), usersController.getRole);

module.exports = router;