const mongoose = require('mongoose');
const path = require('path');

// Load env if present
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const User = require('../models/User');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ipt-finalproject';

  await mongoose.connect(uri);

  // Add altRole only where it's missing
  const res = await User.updateMany(
    { altRole: { $exists: false } },
    { $set: { altRole: null } }
  );

  const matched = res.matchedCount ?? res.n;
  const modified = res.modifiedCount ?? res.nModified;
  console.log(`Matched: ${matched}, Modified: ${modified}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});