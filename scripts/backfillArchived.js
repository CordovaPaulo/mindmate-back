const mongoose = require('mongoose');
const Forum = require('../models/Forum');
const ForumComment = require('../models/ForumComment');

async function backfillArchived() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://MindMate_db_user:MindMate_123@mindmate.ebijfx0.mongodb.net/MindMate?retryWrites=true&w=majority&appName=MindMate');
        console.log('Connected to MongoDB');

        // Update Forum documents
        const forumResult = await Forum.updateMany(
            { archived: { $exists: false } },
            { $set: { archived: false } }
        );
        console.log(`Updated ${forumResult.modifiedCount} Forum documents`);

        // Update ForumComment documents
        const commentResult = await ForumComment.updateMany(
            { archived: { $exists: false } },
            { $set: { archived: false } }
        );
        console.log(`Updated ${commentResult.modifiedCount} ForumComment documents`);

        console.log('Backfill completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during backfill:', error);
        process.exit(1);
    }
}

// Run the backfill
backfillArchived();