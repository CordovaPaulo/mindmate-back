const express = require('express');   
const router = express.Router();
const mentorController = require('../controllers/mentor');
const jwtService = require('../service/jwt');
const uploadController = require('../controllers/upload');
const { multerUploadsMultiple } = require('../service/multer');
const analyticsController = require('../controllers/session-analytics');

// Mentor Analytics Dashboard
router.get('/session/analytics', jwtService.authenticateToken('mentor'), analyticsController.fetchMentorDashboard);

// POST routes
router.post('/schedule/:id', jwtService.authenticateToken('mentor'), mentorController.setSchedule);
router.post('/cancel-sched/:id', jwtService.authenticateToken('mentor'), mentorController.cancelSched);
router.post('/resched-sched/:id', jwtService.authenticateToken('mentor'), mentorController.reschedSched);
router.post('/remind-sched/:id', jwtService.authenticateToken('mentor'), mentorController.sendReminder);
router.post('/files/upload', jwtService.authenticateToken('mentor'), multerUploadsMultiple, uploadController.uploadLearningMaterials);
router.post('/send-offer/:learnerId', jwtService.authenticateToken('mentor'), mentorController.sendOffer);
router.post('/send-offer/group/:learnerId', jwtService.authenticateToken('mentor'), mentorController.sendGroupSessionOffer);
router.post('/send-existing-offer/group/:learnerId/:sessionId', jwtService.authenticateToken('mentor'), mentorController.sendExistingGroupSessionOffer);

// GET routes
router.get('/profile', jwtService.authenticateToken('mentor'), mentorController.getProfileInfo);
router.get('/schedules', jwtService.authenticateToken('mentor'), mentorController.getSchedules);
router.get('/learners', jwtService.authenticateToken('mentor'), mentorController.getAllLearners);
router.get('/learners/:id', jwtService.authenticateToken('mentor'), mentorController.getLearnerById);
router.get('/feedbacks', jwtService.authenticateToken('mentor'), mentorController.getFeedbacks);
router.get('/feedbacks/reviewer/:id', jwtService.authenticateToken('mentor'), mentorController.getReviewer);
router.get('/files', jwtService.authenticateToken('mentor'), mentorController.getLearningMaterialsList);
router.get('/files/:fileId', jwtService.authenticateToken('mentor'), mentorController.getLearningMaterial);
router.get('/schedules/group', jwtService.authenticateToken('mentor'), mentorController.getGroupSessions)


// DELETE routes
router.delete('/files/:fileId', jwtService.authenticateToken('mentor'), mentorController.deleteLearningMaterial);

// PATCH routes
router.patch('/profile/edit', jwtService.authenticateToken('mentor'), mentorController.editProfile);

module.exports = router;
