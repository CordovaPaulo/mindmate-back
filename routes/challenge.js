const express = require('express');
const router = express.Router();
const challengeController = require('../controllers/challenge');
const { authenticateToken } = require('../service/jwt');

router.post('/create', authenticateToken('mentor'), challengeController.createChallenge);
router.get('/list', authenticateToken(), challengeController.getAllOwnedChallenges);
router.get('/:id', authenticateToken(), challengeController.getOneChallenge);
router.get('/submissions/:id', authenticateToken('mentor'), challengeController.getSubmissionsForChallenge);
router.patch('/edit/:id', authenticateToken('mentor'), challengeController.updateChallenge);
router.delete('/delete/:id', authenticateToken('mentor'), challengeController.deleteChallenge);

router.post('/submission/approve/:id/:submissionId', authenticateToken('mentor'), challengeController.approveSubmission);
router.post('/submission/reject/:id/:submissionId', authenticateToken('mentor'), challengeController.rejectSubmission);

router.get('/all/challenges', authenticateToken('learner'), challengeController.getAvailableChallenges);
router.get('/one/:id', authenticateToken('learner'), challengeController.getChallengeDetails);
router.post('/submit/:id', authenticateToken('learner'), challengeController.submitChallenge);

module.exports = router;