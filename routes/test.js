var express = require('express');
var router = express.Router();
const testController = require('../controllers/test');
const testEmailController = require('../controllers/test-email');
const testSupabaseController = require('../controllers/test-supabase');
const { authenticateToken } = require('../service/jwt');
const uploadController = require('../controllers/upload');
const { multerUploads, multerUploadsMultiple } = require('../service/multer');

router.post('/upload/pfp', multerUploads, uploadController.upToCloudinary);
router.post('/upload/credentials', multerUploadsMultiple, uploadController.uploadMentorCredentials);
router.post('/upload/learning-materials', multerUploadsMultiple, uploadController.uploadLearningMaterials);

// Test email endpoint - GET /api/test/email?to=recipient@example.com
router.get('/email', testEmailController.testEmail);

// Supabase test endpoints
router.get('/supabase', testSupabaseController.testSupabaseConnection);
router.get('/supabase/students/:id', testSupabaseController.getStudentById);
router.get('/supabase/students/program/:program', testSupabaseController.getStudentsByProgram);
router.get('/supabase/students/search', testSupabaseController.searchStudents);
router.get('/supabase/students/active', testSupabaseController.getActiveStudents);

module.exports = router;