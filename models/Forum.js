const mongoose = require('mongoose');

const forumSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String },
    topics: { type: String, enum: ['General', 'Teaching Methods', 'Technology', 'Student Management', 'Curriculum'], default: 'General' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// reuse compiled model if present (prevents OverwriteModelError)
const Forum = mongoose.models.Forum || mongoose.model('Forum', forumSchema);
module.exports = Forum;