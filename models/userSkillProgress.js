const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProgressHistorySchema = new Schema({
  delta: { type: Number, required: true },
  source: { type: String },
  note: { type: String },
  at: { type: Date, default: Date.now }
}, { _id: false });

const UserSkillProgressSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  specialization: { type: String, required: true, index: true },
  skill: { type: String, required: true },
  score: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  history: { type: [ProgressHistorySchema], default: [] },
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'userSkillProgress'
});

UserSkillProgressSchema.index({ userId: 1, specialization: 1, skill: 1 }, { unique: true });

// Progress/leveling configuration
const MAX_LEVEL = 5;
const BASE_XP = 1000; // reference XP for first level-up
const MULTIPLIER = 2; // exponential multiplier per level (2 gives thresholds: 0,1000,3000,7000,15000)

/**
 * Compute the cumulative XP required to reach a given level (1-based).
 * Level 1 requires 0. To reach level N (N>1) cumulative XP = BASE_XP * (MULTIPLIER^(N-1) - 1)
 */
function cumulativeXpForLevel(n) {
  if (n <= 1) return 0;
  return BASE_XP * (Math.pow(MULTIPLIER, n - 1) - 1);
}

/**
 * Compute level from total score using exponential thresholds.
 * Returns an integer in [1, MAX_LEVEL].
 */
function computeLevelFromScore(score) {
  if (!score || score <= 0) return 1;
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    const threshold = cumulativeXpForLevel(lvl);
    if (score >= threshold) {
      return Math.min(lvl, MAX_LEVEL);
    }
  }
  return 1;
}

// expose as schema static for reuse
UserSkillProgressSchema.statics.MAX_LEVEL = MAX_LEVEL;
UserSkillProgressSchema.statics.BASE_XP = BASE_XP;
UserSkillProgressSchema.statics.MULTIPLIER = MULTIPLIER;
UserSkillProgressSchema.statics.cumulativeXpForLevel = cumulativeXpForLevel;
UserSkillProgressSchema.statics.computeLevelFromScore = computeLevelFromScore;

// ensure level is kept consistent with score before save
UserSkillProgressSchema.pre('save', function (next) {
  try {
    if (this.score == null || this.score < 0) this.score = 0;
    this.level = computeLevelFromScore(this.score);
    if (this.level > MAX_LEVEL) this.level = MAX_LEVEL;
    this.lastUpdated = new Date();
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.models.UserSkillProgress || mongoose.model('UserSkillProgress', UserSkillProgressSchema);
