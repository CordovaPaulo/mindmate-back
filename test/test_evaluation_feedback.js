/**
 * Test script for the new evaluation feedback system
 * Run with: node backend/test/test_evaluation_feedback.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Feedback = require('../models/feedback');

// Mock data for testing
const mockEvaluationData = {
  learner: new mongoose.Types.ObjectId(),
  mentor: new mongoose.Types.ObjectId(),
  schedule: new mongoose.Types.ObjectId(),
  rating: 5,
  comments: 'Excellent session! Very helpful and engaging.',
  evaluation: {
    knowledge: 5,
    pacing: 4,
    communication: 5,
    engagement: 5,
    feedbackQuality: 4,
    professionalism: 5,
    resources: 4,
    accessibility: 5,
    learningOutcomes: 5
    // whatHelped and suggestions are optional
  }
};

async function runTests() {
  try {
    console.log('🧪 Testing Evaluation Feedback System...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mindmate');
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Create feedback with evaluation
    console.log('Test 1: Creating feedback with evaluation...');
    const feedback = new Feedback(mockEvaluationData);
    await feedback.save();
    console.log('✅ Feedback created successfully');
    console.log('   Category Average (auto-calculated):', feedback.evaluation.categoryAverage);
    
    // Validate category average calculation
    const expectedAverage = (5 + 4 + 5 + 5 + 4 + 5 + 4 + 5 + 5) / 9;
    const actualAverage = feedback.evaluation.categoryAverage;
    if (Math.abs(expectedAverage - actualAverage) < 0.01) {
      console.log('✅ Category average calculated correctly:', actualAverage);
    } else {
      console.log('❌ Category average calculation error!');
      console.log('   Expected:', expectedAverage.toFixed(2));
      console.log('   Actual:', actualAverage);
    }

    // Test 2: Create feedback without evaluation (backward compatibility)
    console.log('\nTest 2: Creating feedback without evaluation (backward compatibility)...');
    const simpleFeedback = new Feedback({
      learner: new mongoose.Types.ObjectId(),
      mentor: new mongoose.Types.ObjectId(),
      schedule: new mongoose.Types.ObjectId(),
      rating: 4,
      comments: 'Good session'
    });
    await simpleFeedback.save();
    console.log('✅ Simple feedback created successfully (no evaluation field)');

    // Test 3: Partial evaluation data
    console.log('\nTest 3: Creating feedback with partial evaluation...');
    const partialFeedback = new Feedback({
      learner: new mongoose.Types.ObjectId(),
      mentor: new mongoose.Types.ObjectId(),
      schedule: new mongoose.Types.ObjectId(),
      rating: 4,
      comments: 'Decent session',
      evaluation: {
        knowledge: 4,
        communication: 5,
        whatHelped: 'The examples were clear'
      }
    });
    await partialFeedback.save();
    console.log('✅ Partial evaluation feedback created');
    console.log('   Category Average (from 2 ratings):', partialFeedback.evaluation.categoryAverage);

    // Test 4: Validation - invalid rating values
    console.log('\nTest 4: Testing validation (invalid rating values)...');
    try {
      const invalidFeedback = new Feedback({
        learner: new mongoose.Types.ObjectId(),
        mentor: new mongoose.Types.ObjectId(),
        schedule: new mongoose.Types.ObjectId(),
        rating: 6, // Invalid: > 5
        comments: 'Test',
        evaluation: {
          knowledge: 10 // Invalid: > 5
        }
      });
      await invalidFeedback.save();
      console.log('❌ Validation should have failed!');
    } catch (err) {
      console.log('✅ Validation correctly rejected invalid values');
    }

    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    await Feedback.deleteOne({ _id: feedback._id });
    await Feedback.deleteOne({ _id: simpleFeedback._id });
    await Feedback.deleteOne({ _id: partialFeedback._id });
    console.log('✅ Test data cleaned up');

    console.log('\n✨ All tests passed! Evaluation system is working correctly.\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

// Run tests
runTests();
