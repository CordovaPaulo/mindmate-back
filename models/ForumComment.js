const mongoose = require('mongoose');

const forumCommentSchema = new mongoose.Schema({
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
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String },
    archived: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const ForumComment = mongoose.model('ForumComment', forumCommentSchema);
module.exports = ForumComment;