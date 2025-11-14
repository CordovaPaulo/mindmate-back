const mongoose = require('mongoose');

const forumMetricsSchema = new mongoose.Schema({
    target: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'onModel',
        required: true
    },
    onModel: {
        type: String,
        required: true,
        enum: ['Forum', 'ForumComment']
    },
    upvote: { type: Number, default: 0 },
    downvote: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 }
}, { timestamps: true });

// ensure one metrics doc per target
forumMetricsSchema.index({ target: 1, onModel: 1 }, { unique: true });

const ForumMetrics = mongoose.model('ForumMetrics', forumMetricsSchema);
module.exports = ForumMetrics;
