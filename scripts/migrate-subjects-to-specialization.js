const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const argv = require('minimist')(process.argv.slice(2));
const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');
const Specialization = require('../models/specializations');

const uri = argv.uri || process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error('Mongo URI required. Set MONGODB_URI in backend/.env or pass --uri "<uri>"');
  process.exit(1);
}

const MAX_SPECIALIZATIONS = 2;

function normalizeSubjects(subjects) {
  if (!subjects) return [];
  if (Array.isArray(subjects)) return subjects.map(s => String(s).trim()).filter(Boolean);
  if (typeof subjects === 'string') {
    // try JSON parse for stringified arrays
    try {
      const parsed = JSON.parse(subjects);
      if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean);
    } catch (e) { /* ignore */ }
    // fallback comma-split
    return subjects.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

async function migrateModel(Model, name) {
  console.log(`[migrate] starting ${name}`);
  const cursor = Model.find({}).cursor();
  let processed = 0, updated = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    processed++;
    const subjectsRaw = doc.subjects ?? doc.subject ?? null;
    const subjects = normalizeSubjects(subjectsRaw);
    let assigned = [];

    if (subjects.length) {
      // match existing specializations under the same program (preserve order, limit)
      const matches = await Specialization.find({
        course: doc.program,
        specialization: { $in: subjects }
      }).lean();
      assigned = matches.map(m => m.specialization).slice(0, MAX_SPECIALIZATIONS);
    }

    if (!assigned.length) {
      // fallback: assign first up to MAX_SPECIALIZATIONS specializations for the user's program
      const all = await Specialization.find({ course: doc.program }).lean();
      assigned = all.map(m => m.specialization).slice(0, MAX_SPECIALIZATIONS);
    } else if (assigned.length < MAX_SPECIALIZATIONS) {
      // try to fill remaining slots from available specializations for the program
      const needed = MAX_SPECIALIZATIONS - assigned.length;
      const additional = await Specialization.find({
        course: doc.program,
        specialization: { $nin: assigned }
      }).limit(needed).lean();
      assigned = assigned.concat(additional.map(a => a.specialization)).slice(0, MAX_SPECIALIZATIONS);
    }

    // final ensure unique strings
    assigned = Array.from(new Set(assigned.map(s => String(s).trim()).filter(Boolean)));

    // update: set specialization (array of up to MAX_SPECIALIZATIONS) and remove subjects/subject
    await Model.updateOne(
      { _id: doc._id },
      { $set: { specialization: assigned }, $unset: { subjects: "", subject: "" } }
    );
    updated++;
  }
  console.log(`[migrate] ${name} processed=${processed} updated=${updated}`);
}

async function main() {
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await migrateModel(Learner, 'Learner');
    await migrateModel(Mentor, 'Mentor');
    console.log('[migrate] completed successfully');
  } catch (err) {
    console.error('[migrate] error', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();