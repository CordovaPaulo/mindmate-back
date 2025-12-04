const mongoose = require('mongoose');
const { Schema } = mongoose;

const CompletedTopicSchema = new Schema({
  topic: { type: String, required: true },
  completedAt: { type: Date, default: Date.now },
  source: { type: String }, // e.g., 'manual', 'challenge', 'schedule'
  sourceId: { type: Schema.Types.ObjectId }
}, { _id: false });

const RoadmapStageProgressSchema = new Schema({
  stage: { type: String, required: true },
  completedTopics: { type: [CompletedTopicSchema], default: [] },
  isCompleted: { type: Boolean, default: false },
  completedAt: { type: Date }
}, { _id: false });

const UserRoadmapProgressSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  specialization: { type: String, required: true, index: true },
  stages: { type: [RoadmapStageProgressSchema], default: [] },
  overallCompletion: { type: Number, default: 0, min: 0, max: 100 }, // percentage
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'userRoadmapProgress'
});

// Compound index for quick lookups
UserRoadmapProgressSchema.index({ userId: 1, specialization: 1 }, { unique: true });

/**
 * Calculate overall completion percentage based on completed topics
 * @param {Array} roadmapDefinition - The roadmap from specialization model
 * @param {Array} userStages - The user's stage progress
 * @returns {Number} Percentage (0-100)
 */
UserRoadmapProgressSchema.statics.calculateCompletion = function(roadmapDefinition, userStages) {
  if (!Array.isArray(roadmapDefinition) || roadmapDefinition.length === 0) return 0;
  
  let totalTopics = 0;
  let completedTopics = 0;

  roadmapDefinition.forEach(stageDef => {
    const topics = stageDef.topics || [];
    totalTopics += topics.length;

    const userStage = userStages.find(s => s.stage === stageDef.stage);
    if (userStage) {
      completedTopics += (userStage.completedTopics || []).length;
    }
  });

  if (totalTopics === 0) return 0;
  return Math.round((completedTopics / totalTopics) * 100);
};

// Pre-save hook to update completion percentage
UserRoadmapProgressSchema.pre('save', async function(next) {
  try {
    // Fetch the specialization to get the roadmap definition
    const Specialization = mongoose.model('Specialization');
    const spec = await Specialization.findOne({ specialization: this.specialization }).lean();
    
    if (spec && spec.roadmap) {
      this.overallCompletion = this.constructor.calculateCompletion(spec.roadmap, this.stages);
      
      // Mark stages as completed if all topics are done
      this.stages.forEach(userStage => {
        const stageDef = spec.roadmap.find(s => s.stage === userStage.stage);
        if (stageDef) {
          const totalTopics = (stageDef.topics || []).length;
          const completedCount = (userStage.completedTopics || []).length;
          
          if (totalTopics > 0 && completedCount >= totalTopics && !userStage.isCompleted) {
            userStage.isCompleted = true;
            userStage.completedAt = new Date();
          } else if (completedCount < totalTopics && userStage.isCompleted) {
            // If somehow topics were removed, unmark as completed
            userStage.isCompleted = false;
            userStage.completedAt = null;
          }
        }
      });
    }
    
    this.lastUpdated = new Date();
    next();
  } catch (err) {
    console.error('Error in UserRoadmapProgress pre-save:', err);
    next(err);
  }
});

module.exports = mongoose.models.UserRoadmapProgress || mongoose.model('UserRoadmapProgress', UserRoadmapProgressSchema);
