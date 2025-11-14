const mongoose = require('mongoose');

const RANKS = [
  'Beginner III', 'Beginner II', 'Beginner I',
  'Intermediate III', 'Intermediate II', 'Intermediate I',
  'Advanced IV', 'Advanced III', 'Advanced II', 'Advanced I',
  'Expert V', 'Expert IV', 'Expert III', 'Expert II', 'Expert I',
  'Professional'
];

const THRESHOLDS = {
  'Beginner III': 5,
  'Beginner II': 7,
  'Beginner I': 8,
  'Intermediate III': 8,
  'Intermediate II': 10,
  'Intermediate I': 12,
  'Advanced IV': 8,
  'Advanced III': 8,
  'Advanced II': 10,
  'Advanced I': 13,
  'Expert V': 8,
  'Expert IV': 8,
  'Expert III': 10,
  'Expert II': 12,
  'Expert I': 15,
  'Professional': Infinity
};

const rankSchema = new mongoose.Schema({
    learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'learners', required: true, unique: true },
    totalSessions: { type: Number, default: 0 },
    progress: { type: Number, default: 0 }, 
    rank: { type: String, enum: RANKS, default: 'Beginner III' }
}, { collection: 'ranks' });

// virtual: how many sessions are required to reach the next rank from current rank
rankSchema.virtual('requiredSessions').get(function() {
  return THRESHOLDS[this.rank] === Infinity ? null : THRESHOLDS[this.rank];
});

// instance method: add sessions, update progress/total and promote rank when needed
rankSchema.methods.addSessions = async function(count = 1) {
  if (!Number.isInteger(count) || count <= 0) count = 1;
  this.totalSessions += count;
  this.progress += count;

  // try to promote while enough progress and not at top rank
  let currentThreshold = THRESHOLDS[this.rank] || Infinity;
  while (this.progress >= currentThreshold && this.rank !== 'Professional') {
    this.progress -= currentThreshold;
    const idx = RANKS.indexOf(this.rank);
    if (idx === -1 || idx === RANKS.length - 1) break;
    this.rank = RANKS[idx + 1];
    currentThreshold = THRESHOLDS[this.rank] || Infinity;
  }

  return this.save();
};

const Rank = mongoose.model('rank', rankSchema);

module.exports = Rank;