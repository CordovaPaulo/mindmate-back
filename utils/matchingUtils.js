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

// main match scoring function
function calculateMatchScore(learner = {}, mentor = {}) {
  let score = 0;

  // ensure arrays/defaults
  const learnerSubjects = Array.isArray(learner.subjects) ? learner.subjects : [];
  const mentorSubjects = Array.isArray(mentor.subjects) ? mentor.subjects : [];
  const learnerAvail = Array.isArray(learner.availability) ? learner.availability : [];
  const mentorAvail = Array.isArray(mentor.availability) ? mentor.availability : [];
  const learnerStyle = Array.isArray(learner.style) ? learner.style : [];
  const mentorStyle = Array.isArray(mentor.style) ? mentor.style : [];

  // 1. SUBJECTS
  const sharedSubjects = intersect(learnerSubjects, mentorSubjects);
  if (learnerSubjects.length > 0) {
    const subjectScore = (sharedSubjects.length / learnerSubjects.length) * (matchWeights.subjects || 0) * 100;
    score += subjectScore;
  }

  // 2. AVAILABILITY
  const sharedAvail = intersect(learnerAvail, mentorAvail);
  if (learnerAvail.length > 0) {
    const availabilityScore = (sharedAvail.length / learnerAvail.length) * (matchWeights.availability || 0) * 100;
    score += availabilityScore;
  }

  // 3. MODALITY
  if (learner.modality && mentor.modality) {
    if (learner.modality === mentor.modality) score += (matchWeights.modality || 0) * 100;
    else if (mentor.modality === "hybrid") score += (matchWeights.modality || 0) * 50;
  }

  // 4. PROGRAM
  if (learner.program && mentor.program && learner.program === mentor.program) {
    score += (matchWeights.program || 0) * 100;
  }

  // 5. STYLE
  const sharedStyle = intersect(learnerStyle, mentorStyle);
  const denom = Math.max(1, learnerStyle.length);
  const styleScore = (sharedStyle.length / denom) * (matchWeights.style || 0) * 100;
  score += styleScore;

  // 6. LOCATION (only if not online)
  if (learner.modality !== "online" && mentor.modality !== "online") {
    if (sameCity(learner.address, mentor.address)) score += (matchWeights.location || 0) * 100;
  }

  // 7. MENTOR RATING
  if (mentor.aveRating) score += ((Number(mentor.aveRating) || 0) / 5) * (matchWeights.rating || 0) * 100;

  return parseFloat(Number.isFinite(score) ? score.toFixed(2) : '0.00');
}

module.exports = calculateMatchScore;
