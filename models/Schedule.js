const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
    learners: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Learner' }],
        required: true,
        validate: {
            validator: function (arr) {
                const sessionType = this.sessionType;
                if (!Array.isArray(arr)) return false;
                if (sessionType === 'one-on-one') {
                    return arr.length === 1;
                } else if (sessionType === 'group') {
                    return arr.length >= 1;
                }
                return arr.length >= 1;
            },
            message: props => {
                const st = props && props.instance && props.instance.sessionType;
                if (st === 'one-on-one') return 'One-on-one sessions must have exactly one learner.';
                if (st === 'group') return 'Group sessions must have one or more learners.';
                return 'At least one learner is required.';
            }
        }
    },
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor' },
    mentorName: { type: String, required: true },
    learnerNames: { type: [String], required: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    location: { type: String, required: true }, // 'online' or physical location
    subject: { type: String, required: true },
    sessionType: { type: String, enum: ['one-on-one', 'group'], required: true },
    
    // NEW: reference to Jitsi session (if location is 'online')
    jitsiSessionId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Jitsi' 
    },
    
    // // Optional: group session fields
    // groupName: { type: String },
    // maxParticipants: { type: Number },
    // offerId: { type: String }
    
}, { 
    timestamps: true,
    collection: 'schedules' 
});

module.exports = mongoose.model('Schedule', scheduleSchema);
