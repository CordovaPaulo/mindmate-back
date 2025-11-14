const mongoose = require('mongoose');

const jitsiSchema = new mongoose.Schema({
  scheduleId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Schedule', 
    required: true,
    unique: true
  },
  roomName: { 
    type: String, 
    required: true,
    unique: true,
    index: true
  },
  subject: { type: String },
  
  mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor' },
  learnerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Learner' }],
  
  isActive: { type: Boolean, default: false },
  startedAt: { type: Date },
  endedAt: { type: Date },
  
  jwtToken: { type: String },
  meetingUrl: { type: String },
  
  recordingId: { type: String },
  recordingUrl: { type: String },
  
}, { 
  timestamps: true,
  collection: 'jitsi_sessions' 
});

// Helper method to generate room name (async because of dynamic import)
jitsiSchema.statics.generateRoomName = async function(scheduleId) {
  const { v4: uuidv4 } = await import('uuid');
  return `session-${scheduleId}-${uuidv4().slice(0, 8)}`;
};

// Helper to build meeting URL
jitsiSchema.methods.buildMeetingUrl = function(domain = 'meet.jit.si') {
  return `https://${domain}/${this.roomName}`;
};

module.exports = mongoose.model('Jitsi', jitsiSchema);