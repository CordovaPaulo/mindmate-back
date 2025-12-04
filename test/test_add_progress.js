#!/usr/bin/env node
const connectDB = require('../config/mongodb');
const { addProgress } = require('../service/progress');
const mongoose = require('mongoose');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  args.forEach(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  });
  return out;
}

function printUsageAndExit() {
  console.log('Usage: node backend/test/test_add_progress.js --userId=<id> --specialization=<spec> --skill=<skill> --delta=<number> [--source=...] [--sourceId=...] [--note=...]');
  console.log('\nExample (PowerShell):');
  console.log('$env:MONGODB_URI = "mongodb://localhost:27017/yourdb"; node backend/test/test_add_progress.js --userId=64a... --specialization=frontend-web --skill=react-basics --delta=100 --source=test --sourceId=test-1');
  process.exit(1);
}

async function main() {
  const params = parseArgs();
  const { userId, specialization, skill, delta, source, sourceId, note } = params;

  if (!userId || !specialization || !skill || typeof delta === 'undefined') {
    console.error('Missing required argument(s)');
    printUsageAndExit();
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI environment variable is not set.');
    console.error('Set it (PowerShell example):');
    console.error('$env:MONGODB_URI = "mongodb://localhost:27017/yourdb"');
    process.exit(1);
  }

  await connectDB();

  try {
    console.log('Calling addProgress with:', { userId, specialization, skill, delta, source, sourceId, note });
    const result = await addProgress({ userId, specialization, skill, delta: Number(delta), source, sourceId, note });
    console.log('addProgress returned:');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error while calling addProgress:');
    console.error(err && err.stack ? err.stack : err);
  } finally {
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(0);
  }
}

main();
