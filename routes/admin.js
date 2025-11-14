const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin');
const { authenticateToken } = require('../service/jwt');

router.get('/learners', authenticateToken('admin'), adminController.getAllLearners);
router.get('/mentors', authenticateToken('admin'), adminController.getAllMentors);
router.get('/learners/:learnerId', authenticateToken('admin'), adminController.getOneLearner);
router.get('/mentors/:mentorId', authenticateToken('admin'), adminController.getOneMentor);
router.get('/stats', authenticateToken('admin'), adminController.getStats);
router.get('/profile', authenticateToken('admin'), adminController.getProfile);
router.get('/mentors/credentials/:mentorId', authenticateToken('admin'), adminController.getMentorCredentials);

router.patch('/mentor/status/approve/:mentorId', authenticateToken('admin'), adminController.approveMentor);
router.patch('/mentor/status/reject/:mentorId', authenticateToken('admin'), adminController.rejectMentor);
router.patch('/user/status/suspend/:userId', authenticateToken('admin'), adminController.suspendAccount);
router.patch('/user/status/ban/:userId', authenticateToken('admin'), adminController.banAccount);
router.patch('/user/status/activate/:userId', authenticateToken('admin'), adminController.activateAccount);

module.exports = router;