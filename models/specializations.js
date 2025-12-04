const mongoose = require('mongoose');
const { Schema } = mongoose;

const RoadmapStageSchema = new Schema({
    stage: { type: String, required: true, trim: true },
    topics: { type: [String], default: [] }
}, { _id: false });

const SpecializationSchema = new Schema({
    course: { type: String, required: true, trim: true },
    specialization: { type: String, required: true, trim: true, index: true, unique: true },
    skillmap: { type: [String], default: [] },
    roadmap: { type: [RoadmapStageSchema], default: [] }
}, {
    timestamps: true,
    collection: 'specializations'
});

module.exports = mongoose.models.Specialization || mongoose.model('Specialization', SpecializationSchema);