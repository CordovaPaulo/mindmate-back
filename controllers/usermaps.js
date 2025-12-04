const learner = require('../models/Learner');
const mentor = require('../models/Mentor');
const specialization = require('../models/specializations');
const UserSkillProgress = require('../models/userSkillProgress');
const UserRoadmapProgress = require('../models/userRoadmapProgress');
const mongoose = require('mongoose');
const progressService = require('../service/progress');
const { getValuesFromToken } = require('../service/jwt');

exports.getUserMaps = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    try {
        const userId = decoded.id;
        const userRole = decoded.role;

        if (userRole !== 'learner') {
            return res.status(403).json({ error: 'This feature is only available for learners' });
        }

        const userData = await learner.findOne({ userId: userId }).lean();
        if (!userData) {
            return res.status(404).json({ error: 'Learner profile not found' });
        }

        // Extract user's specializations (array of strings)
        const userSpecializations = userData.specialization || [];
        if (!Array.isArray(userSpecializations) || userSpecializations.length === 0) {
            return res.status(200).json({ specializations: [], message: 'No specializations found for this user' });
        }

        // Fetch only specializations that match the user's specialization array
        const specializations = await specialization.find({
            specialization: { $in: userSpecializations }
        }).lean();

        return res.status(200).json({ specializations: specializations });

    } catch (error) {
        console.error('Error fetching user maps:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getLearnerProgress = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    try {
        const userId = decoded.id;
        const userRole = decoded.role;

        if (userRole !== 'learner') {
            return res.status(403).json({ error: 'This feature is only available for learners' });
        }

        const userData = await learner.findOne({ userId: userId }).lean();
        if (!userData) {
            return res.status(404).json({ error: 'Learner profile not found' });
        }

        const userSpecializations = userData.specialization || [];
        if (!Array.isArray(userSpecializations) || userSpecializations.length === 0) {
            return res.status(200).json({ progress: [], message: 'No specializations found for this user' });
        }

        // fetch specialization documents that match the user's specialization strings
        const specs = await specialization.find({ specialization: { $in: userSpecializations } }).lean();

        // normalize userId for progress query (be robust to string/ObjectId)
        let uid;
        try {
            uid = mongoose.Types.ObjectId(userId);
        } catch (e) {
            uid = userId; // leave as-is if not convertible
        }

        // fetch all progress entries for this user across the specializations
        const progresses = await UserSkillProgress.find({ userId: uid, specialization: { $in: userSpecializations } }).lean();

        // build response per specialization, wiring skillmap entries to progress entries
        const result = specs.map(spec => {
            const skills = (spec.skillmap || []).slice();
            const skillsWithProgress = skills.map(skillName => {
                const p = progresses.find(pr => String(pr.specialization) === String(spec.specialization) && String(pr.skill) === String(skillName));
                return {
                    skill: skillName,
                    score: p ? p.score : 0,
                    level: p ? p.level : 1,
                    lastUpdated: p ? p.lastUpdated : null
                };
            });

            return {
                specialization: spec.specialization,
                skills: skillsWithProgress
            };
        });

        return res.status(200).json({ progress: result });

    } catch (error) {
        console.error('Error fetching learner progress:', error && (error.stack || error));
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.fetchSpecificSkillmap = async (req, res) => {
    // optional helper: fetch one specialization + progress for the learner
    const decoded = getValuesFromToken(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized: Invalid token' });

    try {
        const userId = decoded.id;
        const userRole = decoded.role;
        if (userRole !== 'learner') return res.status(403).json({ error: 'This feature is only available for learners' });

        const specName = req.params.specification || req.query.spec || req.body.spec;
        if (!specName) return res.status(400).json({ error: 'specialization name is required' });

        const spec = await specialization.findOne({ specialization: specName }).lean();
        if (!spec) return res.status(404).json({ error: 'Specialization not found' });

        let uid;
        try {
            uid = mongoose.Types.ObjectId(userId);
        } catch (e) {
            uid = userId;
        }
        const progresses = await UserSkillProgress.find({ userId: uid, specialization: specName }).lean();

        const skillsWithProgress = (spec.skillmap || []).map(skillName => {
            const p = progresses.find(pr => pr.skill === skillName);
            return {
                skill: skillName,
                score: p ? p.score : 0,
                level: p ? p.level : 1,
                lastUpdated: p ? p.lastUpdated : null
            };
        });

        return res.status(200).json({ specialization: spec.specialization, course: spec.course, roadmap: spec.roadmap || [], skills: skillsWithProgress });
    } catch (err) {
        console.error('Error in fetchSpecificSkillmap:', err && (err.stack || err));
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// POST /maps/progress/update
exports.updateLearnerProgress = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized: Invalid token' });

    try {
        const userId = decoded.id;
        const userRole = decoded.role;
        if (userRole !== 'learner') return res.status(403).json({ error: 'This feature is only available for learners' });

        const { specialization, skill, delta, source, sourceId, note } = req.body || {};
        if (!specialization || !skill || typeof delta === 'undefined') {
            return res.status(400).json({ error: 'specialization, skill and delta are required in body' });
        }

        const updated = await progressService.addProgress({ userId, specialization, skill, delta: Number(delta), source, sourceId, note });
        return res.status(200).json({ updated });
    } catch (err) {
        console.error('updateLearnerProgress error:', err && (err.stack || err));
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// GET /maps/insights/:specialization - Get detailed progress insights
exports.getSpecializationInsights = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized: Invalid token' });

    try {
        const userId = decoded.id;
        const userRole = decoded.role;
        if (userRole !== 'learner') return res.status(403).json({ error: 'This feature is only available for learners' });

        const specName = req.params.specialization;
        if (!specName) return res.status(400).json({ error: 'specialization parameter is required' });

        const insights = await progressService.getProgressInsights(userId, specName);
        return res.status(200).json(insights);
    } catch (err) {
        console.error('getSpecializationInsights error:', err && (err.stack || err));
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// POST /maps/roadmap/complete-topic - Mark a roadmap topic as completed
exports.completeRoadmapTopic = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized: Invalid token' });

    try {
        const userId = decoded.id;
        const userRole = decoded.role;
        if (userRole !== 'learner') return res.status(403).json({ error: 'This feature is only available for learners' });

        const { specialization, stage, topic, source, sourceId } = req.body || {};
        if (!specialization || !stage || !topic) {
            return res.status(400).json({ error: 'specialization, stage, and topic are required in body' });
        }

        const updated = await progressService.markTopicCompleted({ 
            userId, 
            specialization, 
            stage, 
            topic, 
            source, 
            sourceId 
        });
        return res.status(200).json({ success: true, roadmapProgress: updated });
    } catch (err) {
        console.error('completeRoadmapTopic error:', err && (err.stack || err));
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
};

// GET /maps/roadmap/:specialization - Get roadmap progress for a specialization
exports.getRoadmapProgress = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded) return res.status(401).json({ error: 'Unauthorized: Invalid token' });

    try {
        const userId = decoded.id;
        const userRole = decoded.role;
        if (userRole !== 'learner') return res.status(403).json({ error: 'This feature is only available for learners' });

        const specName = req.params.specialization;
        if (!specName) return res.status(400).json({ error: 'specialization parameter is required' });

        // Normalize userId
        let uid;
        try {
            uid = mongoose.Types.ObjectId(userId);
        } catch (e) {
            uid = userId;
        }

        // Fetch specialization
        const spec = await specialization.findOne({ specialization: specName }).lean();
        if (!spec) return res.status(404).json({ error: 'Specialization not found' });

        // Fetch roadmap progress
        const roadmapProgress = await UserRoadmapProgress.findOne({ 
            userId: uid, 
            specialization: specName 
        }).lean();

        // Build response with roadmap definition and user progress
        const stages = (spec.roadmap || []).map(stageDef => {
            const userStage = roadmapProgress?.stages.find(s => s.stage === stageDef.stage);
            
            return {
                stage: stageDef.stage,
                topics: (stageDef.topics || []).map(topicName => {
                    const completedTopic = userStage?.completedTopics.find(ct => ct.topic === topicName);
                    return {
                        name: topicName,
                        completed: !!completedTopic,
                        completedAt: completedTopic?.completedAt || null,
                        source: completedTopic?.source || null
                    };
                }),
                isCompleted: userStage?.isCompleted || false,
                completedAt: userStage?.completedAt || null,
                progress: {
                    completed: userStage?.completedTopics.length || 0,
                    total: (stageDef.topics || []).length
                }
            };
        });

        const totalTopics = stages.reduce((sum, s) => sum + s.progress.total, 0);
        const completedTopics = stages.reduce((sum, s) => sum + s.progress.completed, 0);
        const overallCompletion = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

        return res.status(200).json({
            specialization: spec.specialization,
            course: spec.course,
            stages,
            completion: overallCompletion,
            lastUpdated: roadmapProgress?.lastUpdated || null
        });
    } catch (err) {
        console.error('getRoadmapProgress error:', err && (err.stack || err));
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
};