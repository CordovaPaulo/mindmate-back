const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
   learner: { type: mongoose.Schema.Types.ObjectId, ref: 'Learner', required: true },
   mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
   schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule', required: true },
   rating: { type: Number, min: 1, max: 5, required: true },
   comments: { type: String, required: true },
   
   // Structured evaluation data
   evaluation: {
      // Category ratings (1-5 scale)
      knowledge: { type: Number, min: 1, max: 5 },
      pacing: { type: Number, min: 1, max: 5 },
      communication: { type: Number, min: 1, max: 5 },
      engagement: { type: Number, min: 1, max: 5 },
      feedbackQuality: { type: Number, min: 1, max: 5 },
      professionalism: { type: Number, min: 1, max: 5 },
      resources: { type: Number, min: 1, max: 5 },
      accessibility: { type: Number, min: 1, max: 5 },
      learningOutcomes: { type: Number, min: 1, max: 5 },
      
      // Open-ended responses
      whatHelped: { type: String, default: '' },
      suggestions: { type: String, default: '' },
      
      // Computed average from categories (optional, for quick analytics)
      categoryAverage: { type: Number, min: 1, max: 5 }
   }
}, {
   timestamps: true
});

// Pre-save hook to calculate category average if evaluation exists
feedbackSchema.pre('save', function(next) {
   if (this.evaluation) {
      const categories = ['knowledge', 'pacing', 'communication', 'engagement', 
                         'feedbackQuality', 'professionalism', 'resources', 
                         'accessibility', 'learningOutcomes'];
      
      const validRatings = categories
         .map(cat => this.evaluation[cat])
         .filter(val => typeof val === 'number' && val >= 1 && val <= 5);
      
      if (validRatings.length > 0) {
         const sum = validRatings.reduce((acc, val) => acc + val, 0);
         this.evaluation.categoryAverage = Number((sum / validRatings.length).toFixed(2));
      }
   }
   next();
});

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;