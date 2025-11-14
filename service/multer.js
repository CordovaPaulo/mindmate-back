const multer = require('multer');

// memory storage keeps buffer in req.files[*].buffer
const storage = multer.memoryStorage();

const multerUploads = multer({ storage }).single('image');
// NEW: accept multiple files from field name "files"
const multerUploadsMultiple = multer({ storage }).array('files', 20);

const mentorSignup = multer({ storage }).fields([
    { name: 'image', maxCount: 1 },
    { name: 'credentials', maxCount: 10 }
]);

module.exports = { multerUploads, multerUploadsMultiple, mentorSignup };