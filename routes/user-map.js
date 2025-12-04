const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../service/jwt');
const usersController = require('../controllers/role');
const usermapsController = require('../controllers/usermaps');

//learner access only

// Skillmap routes
router.get('/maps', authenticateToken('learner'), usermapsController.getUserMaps);
router.get('/maps/progress', authenticateToken('learner'), usermapsController.getLearnerProgress);
router.get('/maps/skillmap/:specification', authenticateToken('learner'), usermapsController.fetchSpecificSkillmap); // Backward compatibility
router.post('/maps/progress/update', authenticateToken('learner'), usermapsController.updateLearnerProgress);

// Roadmap routes
router.get('/maps/roadmap/:specialization', authenticateToken('learner'), usermapsController.getRoadmapProgress);
router.post('/maps/roadmap/complete-topic', authenticateToken('learner'), usermapsController.completeRoadmapTopic);

// Progress insights
router.get('/maps/insights/:specialization', authenticateToken('learner'), usermapsController.getSpecializationInsights);

module.exports = router;