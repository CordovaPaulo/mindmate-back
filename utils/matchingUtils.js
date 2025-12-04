/**
 * Mentor-Learner Matching Algorithm Utility
 * 
 * Enhanced matching system that considers:
 * 1. Specialization overlap (25%) - matches learner's chosen specializations with mentor's expertise
 * 2. Progress level alignment (15%) - intelligently matches learner's skill/roadmap progress with mentor proficiency
 * 3. Availability compatibility (20%) - overlapping schedule availability
 * 4. Modality preference (15%) - online, in-person, or hybrid session preference
 * 5. Academic program (10%) - BSIT, BSCS, or BSEMC alignment
 * 6. Teaching style (5%) - preferred teaching/learning styles
 * 7. Location proximity (5%) - for non-online sessions
 * 8. Mentor rating (5%) - quality indicator based on past feedback
 * 
 * Progress level matching logic:
 * - Perfect match (100%): mentor is one level above learner (e.g., intermediate mentor for beginner learner)
 * - Good match (70%): same level or two levels above
 * - Acceptable (50%): mentor much more advanced than learner
 * - Poor (20%): mentor below learner's level
 */

const { matchWeights } = require('../config/matchAlgo');

// simple helper for array intersection
function intersect(arr1 = [], arr2 = []) {
  return arr1.filter(item => Array.isArray(arr2) ? arr2.includes(item) : false);
}

// simple helper for address similarity (basic contains check)
function sameCity(addr1 = "", addr2 = "") {
  if (!addr1 || !addr2) return false;
  const part1 = String(addr1).split(",")[1]?.trim();
  const part2 = String(addr2).split(",")[1]?.trim();
  return part1 && part2 && part1 === part2;
}

// Map proficiency levels to numeric values for comparison
function proficiencyToLevel(proficiency) {
  const map = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
  return map[proficiency] || 1;
}

// Calculate progress level from learner's skill and roadmap progress
function calculateLearnerLevel(learnerProgress = {}) {
  // learnerProgress should contain average skill level and roadmap completion
  // Average skill level (1-5) and roadmap completion (0-100%)
  const avgSkillLevel = learnerProgress.avgSkillLevel || 1;
  const roadmapCompletion = learnerProgress.roadmapCompletion || 0;
  
  // Convert to 1-3 scale:
  // Beginner: skill level 1-2, or roadmap < 30%
  // Intermediate: skill level 3, or roadmap 30-70%
  // Advanced: skill level 4-5, or roadmap > 70%
  if (avgSkillLevel >= 4 || roadmapCompletion > 70) return 3; // advanced
  if (avgSkillLevel >= 3 || roadmapCompletion > 30) return 2; // intermediate
  return 1; // beginner
}

// main match scoring function
// learnerProgress: { avgSkillLevel, roadmapCompletion } - optional
function calculateMatchScore(learner = {}, mentor = {}, learnerProgress = null) {
  let score = 0;

  // ensure arrays/defaults
  const learnerSpecs = Array.isArray(learner.specialization) ? learner.specialization : [];
  const mentorSpecs = Array.isArray(mentor.specialization) ? mentor.specialization : [];
  const learnerAvail = Array.isArray(learner.availability) ? learner.availability : [];
  const mentorAvail = Array.isArray(mentor.availability) ? mentor.availability : [];
  const learnerStyle = Array.isArray(learner.style) ? learner.style : [];
  const mentorStyle = Array.isArray(mentor.style) ? mentor.style : [];

  // 1. SPECIALIZATION MATCH
  const sharedSpecs = intersect(learnerSpecs, mentorSpecs);
  if (learnerSpecs.length > 0) {
    const specScore = (sharedSpecs.length / learnerSpecs.length) * (matchWeights.specialization || 0) * 100;
    score += specScore;
  }

  // 2. PROGRESS LEVEL vs MENTOR PROFICIENCY
  // Match learner's level with mentor's proficiency
  // Best match: learner at beginner/intermediate matched with intermediate/advanced mentor
  if (learnerProgress && mentor.proficiency) {
    const learnerLevel = calculateLearnerLevel(learnerProgress);
    const mentorLevel = proficiencyToLevel(mentor.proficiency);
    
    // Calculate compatibility:
    // Ideal: mentor is 1 level above learner (mentorLevel = learnerLevel + 1)
    // Good: mentor is same level or 2 levels above
    // Poor: mentor is below learner's level
    let levelScore = 0;
    const levelDiff = mentorLevel - learnerLevel;
    
    if (levelDiff === 1) {
      // Perfect match: mentor one level above
      levelScore = 100;
    } else if (levelDiff === 0 || levelDiff === 2) {
      // Good match: same level or two levels above
      levelScore = 70;
    } else if (levelDiff > 2) {
      // Acceptable: mentor much more advanced
      levelScore = 50;
    } else {
      // Poor match: mentor below learner level
      levelScore = 20;
    }
    
    score += levelScore * (matchWeights.progressLevel || 0);
  }

  // 3. AVAILABILITY
  const sharedAvail = intersect(learnerAvail, mentorAvail);
  if (learnerAvail.length > 0) {
    const availabilityScore = (sharedAvail.length / learnerAvail.length) * (matchWeights.availability || 0) * 100;
    score += availabilityScore;
  }

  // 4. MODALITY
  if (learner.modality && mentor.modality) {
    if (learner.modality === mentor.modality) score += (matchWeights.modality || 0) * 100;
    else if (mentor.modality === "hybrid") score += (matchWeights.modality || 0) * 50;
  }

  // 5. PROGRAM
  if (learner.program && mentor.program && learner.program === mentor.program) {
    score += (matchWeights.program || 0) * 100;
  }

  // 6. STYLE
  const sharedStyle = intersect(learnerStyle, mentorStyle);
  const denom = Math.max(1, learnerStyle.length);
  const styleScore = (sharedStyle.length / denom) * (matchWeights.style || 0) * 100;
  score += styleScore;

  // 7. LOCATION (only if not online)
  if (learner.modality !== "online" && mentor.modality !== "online") {
    if (sameCity(learner.address, mentor.address)) score += (matchWeights.location || 0) * 100;
  }

  // 8. MENTOR RATING
  if (mentor.aveRating) score += ((Number(mentor.aveRating) || 0) / 5) * (matchWeights.rating || 0) * 100;

  return parseFloat(Number.isFinite(score) ? score.toFixed(2) : '0.00');
}

module.exports = calculateMatchScore;
