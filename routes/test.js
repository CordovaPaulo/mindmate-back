var express = require('express');
var router = express.Router();
const testController = require('../controllers/test');
const { authenticateToken } = require('../service/jwt');
const uploadController = require('../controllers/upload');
const { multerUploads, multerUploadsMultiple } = require('../service/multer');

router.post('/upload/pfp', multerUploads, uploadController.upToCloudinary);
router.post('/upload/credentials', multerUploadsMultiple, uploadController.uploadMentorCredentials);
router.post('/upload/learning-materials', multerUploadsMultiple, uploadController.uploadLearningMaterials);
module.exports = router;