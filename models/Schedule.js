const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
    learners: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Learner' }],
        required: true,
        validate: {
            validator: function (arr) {
                const sessionType = this.sessionType;
                if (!Array.isArray(arr)) return false;
                // one-on-one must have exactly one learner
                if (sessionType === 'one-on-one') {
                    return arr.length === 1;
                }
                // group sessions must have at least one learner and not exceed maxParticipants if set
                if (sessionType === 'group') {
                    if (arr.length < 1) return false;
                    const max = this.maxParticipants;
                    if (typeof max === 'number' && Number.isFinite(max)) {
                        return arr.length <= Number(max);
                    }
                    return true;
                }
                return arr.length >= 1;
            },
            message: props => {
                const st = props && props.instance && props.instance.sessionType;
                const inst = props && props.instance;
                if (st === 'one-on-one') return 'One-on-one sessions must have exactly one learner.';
                if (st === 'group') {
                    const max = inst && inst.maxParticipants;
                    if (typeof max === 'number' && Number.isFinite(max)) {
                        return `Group sessions must have between 1 and ${max} learners.`;
                    }
                    return 'Group sessions must have one or more learners.';
                }
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
    
    // Optional: group session fields
    groupName: { type: String },
    maxParticipants: { type: Number, min: 1 },
    offerId: { type: String }
    
}, { 
    timestamps: true,
    collection: 'schedules' 
});

module.exports = mongoose.model('Schedule', scheduleSchema);
