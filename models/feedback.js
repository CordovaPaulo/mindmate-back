const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
   learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
   mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
   schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule', required: true },
   rating: { type: Number, min: 1, max: 5, required: true },
   comments: { type: String, required: true }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;