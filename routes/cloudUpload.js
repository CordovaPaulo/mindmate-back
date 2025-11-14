const express = require('express');
const router = express.Router();

const cloudUploadController = require('../controllers/cloudUpload');

// Upload to Cloudinary
router.post('/cloudinary', upload.single('image'), cloudUploadController.uploadToCloudinary);

// Upload to Google Drive
// router.post('/drive', upload.single('file'), cloudUploadController.uploadToDrive);

module.exports = router;
