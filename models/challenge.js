const mongoose = require('mongoose');

const challengeSubmissionSchema = new mongoose.Schema({
    learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
    learnerName: { type: String, required: true },
    submittedAt: { type: Date, default: Date.now },
    submissionUrl: { type: String },
    submissionText: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    feedback: { type: String },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor' }
});

const challengeSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
    mentorName: { type: String, required: true },
    
    // Specialization and skill tracking
    specialization: { type: String },
    skill: { type: String },
    
    // Optional fields
    requirements: { type: [String], default: [] },
    difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    xpReward: { type: Number, default: 50 },
    isActive: { type: Boolean, default: true },
    
    // Submissions
    submissions: [challengeSubmissionSchema]
}, { 
    timestamps: true,
    collection: 'challenges' 
});

module.exports = mongoose.model('Challenge', challengeSchema);