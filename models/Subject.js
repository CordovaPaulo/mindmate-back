const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  course: {
    type: String,
    required: true,
    trim: true
  },
  specialization: {
    type: String,
    required: true,
    trim: true
  },
  difficulty: {
    beginner: [{
      type: String,
      trim: true
    }],
    intermediate: [{
      type: String,
      trim: true
    }],
    advanced: [{
      type: String,
      trim: true
    }]
  }
}, {
  timestamps: true
});

// Index for efficient querying
subjectSchema.index({ course: 1, specialization: 1 });

const Subject = mongoose.model('Subject', subjectSchema);

module.exports = Subject;
