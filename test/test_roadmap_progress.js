/**
 * Test file for roadmap progress functionality
 * Run with: node test/test_roadmap_progress.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/mongodb');
const progressService = require('../service/progress');
const Specialization = require('../models/specializations');
const UserRoadmapProgress = require('../models/userRoadmapProgress');
const UserSkillProgress = require('../models/userSkillProgress');

async function runTests() {
  console.log('🧪 Starting Roadmap Progress Tests...\n');

  try {
    // Connect to database
    await connectDB();
    console.log('✅ Database connected\n');

    // Test user ID (replace with actual user ID from your database)
    const testUserId = new mongoose.Types.ObjectId();
    const testSpec = 'Web Development';

    console.log('📋 Test Configuration:');
    console.log(`   User ID: ${testUserId}`);
    console.log(`   Specialization: ${testSpec}\n`);

    // Test 1: Check if specialization exists
    console.log('Test 1: Fetching specialization...');
    const spec = await Specialization.findOne({ specialization: testSpec }).lean();
    if (!spec) {
      console.log('⚠️  Specialization not found. Please create one first.');
      console.log('   You can use MongoDB Compass or create via admin panel.');
      return;
    }
    console.log(`✅ Found specialization: ${spec.specialization}`);
    console.log(`   Course: ${spec.course}`);
    console.log(`   Skills: ${(spec.skillmap || []).length}`);
    console.log(`   Roadmap Stages: ${(spec.roadmap || []).length}\n`);

    // Test 2: Mark a topic as completed
    if (spec.roadmap && spec.roadmap.length > 0) {
      const firstStage = spec.roadmap[0];
      if (firstStage.topics && firstStage.topics.length > 0) {
        console.log('Test 2: Marking topic as completed...');
        const firstTopic = firstStage.topics[0];
        
        const result = await progressService.markTopicCompleted({
          userId: testUserId,
          specialization: testSpec,
          stage: firstStage.stage,
          topic: firstTopic,
          source: 'test',
          sourceId: new mongoose.Types.ObjectId()
        });

        console.log(`✅ Topic marked as completed`);
        console.log(`   Stage: ${firstStage.stage}`);
        console.log(`   Topic: ${firstTopic}`);
        console.log(`   Overall Completion: ${result.overallCompletion}%\n`);
      } else {
        console.log('⚠️  No topics in first stage. Skipping test 2.\n');
      }
    } else {
      console.log('⚠️  No roadmap stages found. Skipping test 2.\n');
    }

    // Test 3: Add skill progress
    if (spec.skillmap && spec.skillmap.length > 0) {
      console.log('Test 3: Adding skill progress...');
      const firstSkill = spec.skillmap[0];
      
      const skillResult = await progressService.addProgress({
        userId: testUserId,
        specialization: testSpec,
        skill: firstSkill,
        delta: 500,
        source: 'test',
        note: 'Test skill progress'
      });

      console.log(`✅ Skill progress added`);
      console.log(`   Skill: ${firstSkill}`);
      console.log(`   Score: ${skillResult.score}`);
      console.log(`   Level: ${skillResult.level}\n`);
    } else {
      console.log('⚠️  No skills in skillmap. Skipping test 3.\n');
    }

    // Test 4: Get progress insights
    console.log('Test 4: Fetching progress insights...');
    const insights = await progressService.getProgressInsights(testUserId, testSpec);
    
    console.log(`✅ Progress insights retrieved`);
    console.log(`   Overall Completion: ${insights.overall.completion}%`);
    console.log(`   Skillmap:`);
    console.log(`      - Total Skills: ${insights.skillmap.total}`);
    console.log(`      - Skills with Progress: ${insights.skillmap.withProgress}`);
    console.log(`      - Completion: ${insights.skillmap.completion}%`);
    console.log(`      - Mastery: ${insights.skillmap.mastery}%`);
    console.log(`      - Average Level: ${insights.skillmap.averageLevel}`);
    console.log(`   Roadmap:`);
    console.log(`      - Total Stages: ${insights.roadmap.totalStages}`);
    console.log(`      - Completed Stages: ${insights.roadmap.completedStages}`);
    console.log(`      - Completion: ${insights.roadmap.completion}%\n`);

    // Test 5: Verify database records
    console.log('Test 5: Verifying database records...');
    const roadmapProgress = await UserRoadmapProgress.findOne({ 
      userId: testUserId, 
      specialization: testSpec 
    }).lean();

    const skillProgress = await UserSkillProgress.find({ 
      userId: testUserId, 
      specialization: testSpec 
    }).lean();

    if (roadmapProgress) {
      console.log(`✅ UserRoadmapProgress record exists`);
      console.log(`   Stages tracked: ${roadmapProgress.stages.length}`);
      console.log(`   Overall completion: ${roadmapProgress.overallCompletion}%`);
    } else {
      console.log(`⚠️  No UserRoadmapProgress record found`);
    }

    if (skillProgress.length > 0) {
      console.log(`✅ UserSkillProgress records exist (${skillProgress.length})`);
    } else {
      console.log(`⚠️  No UserSkillProgress records found`);
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('\n🧹 Cleaning up test data...');
    
    // Clean up test data
    await UserRoadmapProgress.deleteMany({ userId: testUserId });
    await UserSkillProgress.deleteMany({ userId: testUserId });
    
    console.log('✅ Test data cleaned up\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Database connection closed');
    process.exit(0);
  }
}

// Run tests
runTests();
