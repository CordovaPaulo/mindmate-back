const mongoose = require('mongoose');

const presetScheduleSchema = new mongoose.Schema({
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor' },
    mentorName: { type: String, required: true },
    days: { type: [String], enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], required: true },
    time: { type: String, required: true },
    subject: { type: String, required: true },
    specialization: { type: String, required: true },
    course: { type: String, enum: ['BSIT', 'BSCS', 'BSEMC'], required: true },
    participants: { type:[String], default: [] },
    // sessionType: { type: String, default: 'group', required: true },
}, { 
    timestamps: true,
    collection: 'preset-schedules' 
});

module.exports = mongoose.model('preset-sched', presetScheduleSchema);
