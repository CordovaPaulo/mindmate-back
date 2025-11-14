const mongoose = require('mongoose');
require('dotenv').config();

const Learner = require('../models/Learner');
const Rank = require('../models/rank');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yourdbname';

async function main() {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const learners = await Learner.find({}, '_id name').lean();
    let created = 0, skipped = 0, errors = 0;

    for (const learner of learners) {
        try {
            const exists = await Rank.findOne({ learnerId: learner._id }).lean();
            if (exists) {
                skipped++;
                continue;
            }

            const rankDoc = new Rank({ learnerId: learner._id });
            await rankDoc.save();
            created++;
            console.log(`Created rank for learner ${learner._id} (${learner.name || 'no-name'})`);
        } catch (err) {
            errors++;
            console.error(`Error processing learner ${learner._id}:`, err.message);
        }
    }

    console.log(`Finished. Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    mongoose.disconnect().finally(() => process.exit(1));
});