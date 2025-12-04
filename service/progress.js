const mongoose = require('mongoose');
const Specialization = require('../models/specializations');
const UserSkillProgress = require('../models/userSkillProgress');
const UserRoadmapProgress = require('../models/userRoadmapProgress');

/**
 * Add progress for a user's skill in a specialization.
 * @param {Object} params
 * @param {string|ObjectId} params.userId
 * @param {string} params.specialization
 * @param {string} params.skill
 * @param {number} params.delta
 * @param {string} [params.source]
 * @param {string|ObjectId} [params.sourceId]
 * @param {string} [params.note]
 */
async function addProgress({ userId, specialization, skill, delta, source, sourceId, note } = {}) {
  if (!userId) throw new Error('addProgress: "userId" is required');
  if (!specialization || typeof specialization !== 'string') throw new Error('addProgress: "specialization" is required and must be a string');
  if (!skill || typeof skill !== 'string') throw new Error('addProgress: "skill" is required and must be a string');
  if (typeof delta !== 'number' || !isFinite(delta)) throw new Error('addProgress: "delta" is required and must be a finite number');

  // normalize userId to ObjectId
  let userObjectId;
  // try to coerce userId to an ObjectId when possible, otherwise keep the original value
  if (mongoose.Types.ObjectId.isValid(userId)) {
    try {
      userObjectId = mongoose.Types.ObjectId(userId);
    } catch (err) {
      // fallback to original value if coercion unexpectedly fails
      userObjectId = userId;
    }
  } else {
    userObjectId = userId;
  }

  // ensure specialization exists
  const spec = await Specialization.findOne({ specialization }).lean().exec();
  if (!spec) {
    throw new Error(`addProgress: specialization "${specialization}" not found`);
  }

  if (!Array.isArray(spec.skillmap) || !spec.skillmap.includes(skill)) {
    console.warn(`addProgress: skill "${skill}" not found in specialization "${specialization}"`);
  }

  // find or create progress doc
  let usp = await UserSkillProgress.findOne({ userId: userObjectId, specialization, skill }).exec();
  if (!usp) {
    usp = new UserSkillProgress({ userId: userObjectId, specialization, skill, score: 0, history: [], lastUpdated: new Date() });
  }

  // append history entry
  const historyEntry = { delta, source: source || undefined, note: note || undefined, at: new Date() };
  if (typeof sourceId !== 'undefined' && sourceId !== null) historyEntry.sourceId = sourceId;

  usp.history = usp.history || [];
  usp.history.push(historyEntry);

  // update score (clamp to 0 minimum)
  const newScore = (typeof usp.score === 'number' ? usp.score : 0) + delta;
  usp.score = Math.max(0, newScore);

  // save (pre-save hook will compute level)
  const saved = await usp.save();
  return saved.toObject();
}

/**
 * Mark a roadmap topic as completed for a user
 * @param {Object} params
 * @param {string|ObjectId} params.userId
 * @param {string} params.specialization
 * @param {string} params.stage
 * @param {string} params.topic
 * @param {string} [params.source]
 * @param {string|ObjectId} [params.sourceId]
 */
async function markTopicCompleted({ userId, specialization, stage, topic, source, sourceId } = {}) {
  if (!userId) throw new Error('markTopicCompleted: "userId" is required');
  if (!specialization) throw new Error('markTopicCompleted: "specialization" is required');
  if (!stage) throw new Error('markTopicCompleted: "stage" is required');
  if (!topic) throw new Error('markTopicCompleted: "topic" is required');

  // Normalize userId
  let userObjectId;
  if (mongoose.Types.ObjectId.isValid(userId)) {
    try {
      userObjectId = mongoose.Types.ObjectId(userId);
    } catch (err) {
      userObjectId = userId;
    }
  } else {
    userObjectId = userId;
  }

  // Verify specialization exists and has this stage/topic
  const spec = await Specialization.findOne({ specialization }).lean().exec();
  if (!spec) {
    throw new Error(`markTopicCompleted: specialization "${specialization}" not found`);
  }

  const roadmapStage = (spec.roadmap || []).find(s => s.stage === stage);
  if (!roadmapStage) {
    throw new Error(`markTopicCompleted: stage "${stage}" not found in specialization "${specialization}"`);
  }

  if (!roadmapStage.topics || !roadmapStage.topics.includes(topic)) {
    console.warn(`markTopicCompleted: topic "${topic}" not found in stage "${stage}"`);
  }

  // Find or create roadmap progress
  let urp = await UserRoadmapProgress.findOne({ userId: userObjectId, specialization }).exec();
  if (!urp) {
    urp = new UserRoadmapProgress({ 
      userId: userObjectId, 
      specialization, 
      stages: []
    });
  }

  // Find or create stage progress
  let stageProgress = urp.stages.find(s => s.stage === stage);
  if (!stageProgress) {
    stageProgress = { stage, completedTopics: [], isCompleted: false };
    urp.stages.push(stageProgress);
  }

  // Check if topic already completed
  const alreadyCompleted = stageProgress.completedTopics.some(ct => ct.topic === topic);
  if (!alreadyCompleted) {
    const topicEntry = {
      topic,
      completedAt: new Date(),
      source: source || 'manual'
    };
    if (sourceId) topicEntry.sourceId = sourceId;
    
    stageProgress.completedTopics.push(topicEntry);
  }

  const saved = await urp.save();
  return saved.toObject();
}

/**
 * Get comprehensive progress insights for a user's specialization
 * @param {string|ObjectId} userId
 * @param {string} specialization
 * @returns {Object} Progress insights including completion percentages
 */
async function getProgressInsights(userId, specialization) {
  if (!userId) throw new Error('getProgressInsights: "userId" is required');
  if (!specialization) throw new Error('getProgressInsights: "specialization" is required');

  // Normalize userId
  let userObjectId;
  if (mongoose.Types.ObjectId.isValid(userId)) {
    try {
      userObjectId = mongoose.Types.ObjectId(userId);
    } catch (err) {
      userObjectId = userId;
    }
  } else {
    userObjectId = userId;
  }

  // Fetch specialization definition
  const spec = await Specialization.findOne({ specialization }).lean().exec();
  if (!spec) {
    throw new Error(`getProgressInsights: specialization "${specialization}" not found`);
  }

  // Fetch skill progress
  const skillProgresses = await UserSkillProgress.find({ 
    userId: userObjectId, 
    specialization 
  }).lean().exec();

  // Fetch roadmap progress
  const roadmapProgress = await UserRoadmapProgress.findOne({ 
    userId: userObjectId, 
    specialization 
  }).lean().exec();

  // Calculate skillmap completion
  const totalSkills = (spec.skillmap || []).length;
  const skillsWithProgress = skillProgresses.length;
  const MAX_LEVEL = 5; // Match UserSkillProgress.MAX_LEVEL
  const skillsMaxedOut = skillProgresses.filter(sp => sp.level >= MAX_LEVEL).length;
  const skillmapCompletion = totalSkills > 0 ? Math.round((skillsWithProgress / totalSkills) * 100) : 0;
  const skillmapMastery = totalSkills > 0 ? Math.round((skillsMaxedOut / totalSkills) * 100) : 0;

  // Calculate average skill level
  const totalLevels = skillProgresses.reduce((sum, sp) => sum + (sp.level || 1), 0);
  const avgSkillLevel = skillProgresses.length > 0 ? (totalLevels / skillProgresses.length).toFixed(2) : 0;

  // Roadmap insights
  const roadmapCompletion = roadmapProgress ? roadmapProgress.overallCompletion : 0;
  const totalStages = (spec.roadmap || []).length;
  const completedStages = roadmapProgress ? roadmapProgress.stages.filter(s => s.isCompleted).length : 0;

  // Overall completion (weighted: 60% skills, 40% roadmap)
  const overallCompletion = Math.round((skillmapCompletion * 0.6) + (roadmapCompletion * 0.4));

  return {
    specialization: spec.specialization,
    course: spec.course,
    skillmap: {
      total: totalSkills,
      withProgress: skillsWithProgress,
      maxedOut: skillsMaxedOut,
      completion: skillmapCompletion,
      mastery: skillmapMastery,
      averageLevel: parseFloat(avgSkillLevel)
    },
    roadmap: {
      totalStages,
      completedStages,
      completion: roadmapCompletion,
      stages: roadmapProgress ? roadmapProgress.stages : []
    },
    overall: {
      completion: overallCompletion
    },
    lastUpdated: roadmapProgress?.lastUpdated || skillProgresses[0]?.lastUpdated || null
  };
}

module.exports = { addProgress, markTopicCompleted, getProgressInsights };
