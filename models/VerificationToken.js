const mongoose = require('mongoose');

const verificationTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true, index: true },
  uid: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'users' },
  role: { type: String, enum: ['learner', 'mentor'], required: true },
  roleId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { type: String, enum: ['role_verify', 'role_unverify'], required: true },
  usedAt: { type: Date, default: null, index: true },
  expiresAt: { type: Date, required: true},
  createdAt: { type: Date, default: Date.now }
});

// Optional TTL index: document expires automatically after expiresAt
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('VerificationToken', verificationTokenSchema);