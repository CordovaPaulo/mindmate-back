const mongoose = require('mongoose');

const mentorSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    sex: { type: String, required: true, enum: ['male', 'female'] },
    program: { type: String, required: true, enum: ['BSIT', 'BSCS', 'BSEMC']},
    yearLevel: { type: String, required: true, enum: ['1st year', '2nd year', '3rd year', '4th year', 'graduate'] },
    phoneNumber: { type: String, required: true, length: 11 },
    bio: { type: String, required: true },
    exp: { type: String, required: true },
    address: { type: String, required: true },
    modality: { type: String, required: true, enum: ['online', 'in-person', 'hybrid'] },
    proficiency: { type: String, required: true, enum: ['beginner', 'intermediate', 'advanced'] },
    subjects: { type: [String], required: true },
    availability: { type: [String], required: true, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
    style: { type: [String], required: true, enum: ['lecture-based', 'interactive-discussion', 'q-and-a-discussion', 'demonstrations', 'project-based', 'step-by-step-discussion'] },
    sessionDur: { type: String, required: true, enum: ['1hr', '2hrs', '3hrs'] },
    accountStatus: { type: String, default: 'pending', enum: ['accepted', 'pending', 'rejected'] },
    image: { type: String, default:null },
    aveRating: { type: Number, default: 0 },
    credentials: { type: [String], default: []  },
    credentialsFolderUrl: { type: String, default: null },
    verified: { type: Boolean, default: false },
}, { collection: 'mentors' });

const Mentor = mongoose.model('Mentors', mentorSchema);

module.exports = Mentor;