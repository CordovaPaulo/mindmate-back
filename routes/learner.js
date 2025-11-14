const express = require('express');
const router = express.Router();
const learnerController = require('../controllers/learner');
const jwtService = require('../service/jwt');
const analyticsController = require('../controllers/session-analytics');

// POST routes
router.post('/schedule/:id', jwtService.authenticateToken('learner'), learnerController.setSchedule);
router.post('/feedback/:id', jwtService.authenticateToken('learner'), learnerController.setFeedback);
router.post('/cancel-sched/:id', jwtService.authenticateToken('learner'), learnerController.cancelSched);
router.post('/resched-sched/:id', jwtService.authenticateToken('learner'), learnerController.reschedSched);

// GET routes
router.get('/profile', jwtService.authenticateToken('learner'), learnerController.getProfileInfo);
router.get('/mentors', jwtService.authenticateToken('learner'), learnerController.getAllMentors);
router.get('/mentors/:id', jwtService.authenticateToken('learner'), learnerController.getMentorById);
router.get('/schedules', jwtService.authenticateToken('learner'), learnerController.getSchedules);
router.get('/feedback-given', jwtService.authenticateToken('learner'), learnerController.getFeedbacks);
router.get('/learning-mats/:id', jwtService.authenticateToken('learner'), learnerController.getMentorLearningMaterials);

// Accept offer — support both GET (token in query) and POST (token in body)
router.get('/offers/accept', learnerController.acceptOffer);
router.post('/offers/accept', learnerController.acceptOffer);

// PATCH routes
router.patch('/profile/edit', jwtService.authenticateToken('learner'), learnerController.editProfile);

router.get('/analytics', jwtService.authenticateToken('learner'), analyticsController.fetchLearnerDashboard);

module.exports = router;