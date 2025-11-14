/**
 * Raw backfill: convert legacy fields to new shape and set sessionType = 'one-on-one'
 *
 * - learner      -> learners     (array of ObjectId)
 * - learnerName  -> learnerNames (array of string)
 * - sessionType  -> 'one-on-one' for migrated documents
 *
 * Runs updates directly against the collection to avoid Mongoose schema validation
 * that can prevent partially-populated documents from being saved.
 *
 * Run (from backend folder):
 *   node ./scripts/backfillSchedules.js
 *
 * Backup your DB before running.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set. Set it in backend/.env or environment variables.');
  process.exit(1);
}

async function run() {
  try {
    console.log('Connecting to', MONGO_URI);
    await mongoose.connect(MONGO_URI);

    const db = mongoose.connection.db;
    const coll = db.collection('schedules');
    const ObjectId = mongoose.Types.ObjectId;

    // Find documents that likely need migration:
    const cursor = coll.find({
      $or: [
        { learner: { $exists: true } },
        { learnerName: { $exists: true } },
        { sessionType: { $exists: false } },
        { sessionType: { $ne: 'one-on-one' } }
      ]
    });

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      processed++;

      try {
        const set = {};
        const unset = {};

        // 1) learner -> learners (array)
        if (doc.hasOwnProperty('learner')) {
          let entry = doc.learner;
          if (typeof entry === 'string' && ObjectId.isValid(entry)) entry = ObjectId(entry);
          set.learners = [entry];
          unset.learner = "";
        } else if (doc.hasOwnProperty('learners') && !Array.isArray(doc.learners)) {
          // wrap non-array value into array
          let entry = doc.learners;
          if (typeof entry === 'string' && ObjectId.isValid(entry)) entry = ObjectId(entry);
          set.learners = [entry];
        } else if (Array.isArray(doc.learners)) {
          // normalize string ids to ObjectId where possible
          const normalized = doc.learners.map(l => (typeof l === 'string' && ObjectId.isValid(l)) ? ObjectId(l) : l);
          if (JSON.stringify(normalized) !== JSON.stringify(doc.learners)) set.learners = normalized;
        }

        // 2) learnerName -> learnerNames (array)
        if (doc.hasOwnProperty('learnerName')) {
          set.learnerNames = [String(doc.learnerName)];
          unset.learnerName = "";
        } else if (doc.hasOwnProperty('learnerNames') && !Array.isArray(doc.learnerNames)) {
          set.learnerNames = [String(doc.learnerNames)];
        } else if (Array.isArray(doc.learnerNames)) {
          const normalizedNames = doc.learnerNames.map(n => n == null ? String(n) : String(n));
          if (JSON.stringify(normalizedNames) !== JSON.stringify(doc.learnerNames)) set.learnerNames = normalizedNames;
        }

        // 3) ensure sessionType is set to one-on-one
        if (doc.sessionType !== 'one-on-one') {
          set.sessionType = 'one-on-one';
        }

        // nothing to change -> skip
        if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
          skipped++;
          continue;
        }

        // perform direct update
        await coll.updateOne({ _id: doc._id }, { $set: set, $unset: unset });
        updated++;
        console.log(`Updated ${doc._id} -> set: ${Object.keys(set).join(',') || '-'} unset: ${Object.keys(unset).join(',') || '-'}`);
      } catch (err) {
        errors++;
        console.error(`Error processing ${doc._id}:`, err.message);
      }
    }

    console.log('Backfill finished:', { processed, updated, skipped, errors });
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error in backfill script:', err);
    process.exit(1);
  }
}

run();