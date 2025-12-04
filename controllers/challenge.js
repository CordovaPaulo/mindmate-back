const { getValuesFromToken } = require('../service/jwt');
const Challenge = require('../models/challenge');
const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');
const PresetSchedule = require('../models/presetSched');
const progressService = require('../service/progress');
const Specialization = require('../models/specializations');

// ==================== MENTOR FUNCTIONS ====================

// Create challenge
exports.createChallenge = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const { title, description, requirements, difficulty, xpReward, specialization, skill } = req.body;

        if (!title || !description) {
            return res.status(400).json({ message: 'Title and description are required', code: 400 });
        }

        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        if (mentor.accountStatus !== 'accepted') {
            return res.status(403).json({ message: 'Mentor account must be approved', code: 403 });
        }

        const challenge = new Challenge({
            title,
            description,
            requirements: requirements || [],
            mentor: mentor._id,
            mentorName: mentor.name,
            difficulty: difficulty || 'beginner',
            xpReward: xpReward || 50,
            specialization: specialization || undefined,
            skill: skill || undefined
        });

        await challenge.save();

        return res.status(201).json({ message: 'Challenge created', challenge, code: 201 });
    } catch (error) {
        console.error('createChallenge error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// Get all owned challenges
exports.getAllOwnedChallenges = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        const challenges = await Challenge.find({ mentor: mentor._id }).sort({ createdAt: -1 });

        const challengesWithStats = challenges.map(c => ({
            ...c.toObject(),
            totalSubmissions: c.submissions.length,
            pendingSubmissions: c.submissions.filter(s => s.status === 'pending').length,
            approvedSubmissions: c.submissions.filter(s => s.status === 'approved').length
        }));

        return res.status(200).json({ challenges: challengesWithStats, count: challenges.length, code: 200 });
    } catch (error) {
        console.error('getOwnedChallenges error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// Get one owned challenge
exports.getOneChallenge = async (req, res) => {
    const decoded = getValuesFromToken(req);
    const { id } = req.params;
    
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ message: 'Challenge not found', code: 404 });
        }

        if (String(challenge.mentor) !== String(mentor._id)) {
            return res.status(403).json({ message: 'Not authorized', code: 403 });
        }

        return res.status(200).json({ challenge, code: 200 });
    } catch (error) {
        console.error('getOneChallenge error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// Update owned challenge
exports.updateChallenge = async (req, res) => {
    const decoded = getValuesFromToken(req);
    const { id } = req.params;
    
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ message: 'Challenge not found', code: 404 });
        }

        if (String(challenge.mentor) !== String(mentor._id)) {
            return res.status(403).json({ message: 'Not authorized', code: 403 });
        }

        const { title, description, requirements, difficulty, xpReward, isActive, specialization, skill } = req.body;

        if (title) challenge.title = title;
        if (description) challenge.description = description;
        if (requirements) challenge.requirements = requirements;
        if (difficulty) challenge.difficulty = difficulty;
        if (xpReward !== undefined) challenge.xpReward = xpReward;
        if (isActive !== undefined) challenge.isActive = isActive;
        if (specialization !== undefined) challenge.specialization = specialization;
        if (skill !== undefined) challenge.skill = skill;

        await challenge.save();

        return res.status(200).json({ message: 'Challenge updated', challenge, code: 200 });
    } catch (error) {
        console.error('updateChallenge error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// Delete owned challenge
exports.deleteChallenge = async (req, res) => {
    const decoded = getValuesFromToken(req);
    const { id } = req.params;
    
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ message: 'Challenge not found', code: 404 });
        }

        if (String(challenge.mentor) !== String(mentor._id)) {
            return res.status(403).json({ message: 'Not authorized', code: 403 });
        }

        await challenge.deleteOne();

        return res.status(200).json({ message: 'Challenge deleted', code: 200 });
    } catch (error) {
        console.error('deleteChallenge error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// get submissions for a challenge
exports.getSubmissionsForChallenge = async (req, res) => {
    const decoded = getValuesFromToken(req);
    const { id } = req.params;
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ message: 'Challenge not found', code: 404 });
        }

        if (String(challenge.mentor) !== String(mentor._id)) {
            return res.status(403).json({ message: 'Not authorized', code: 403 });
        }

        if (!challenge.submissions || challenge.submissions.length === 0) {
            return res.status(200).json({ message: 'No submissions found', submissions: [], code: 200 });
        }

        return res.status(200).json({ submissions: challenge.submissions, code: 200 });
    } catch (error) {
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }
    }
}

// Approve challenge submission
exports.approveSubmission = async (req, res) => {
    const decoded = getValuesFromToken(req);
    const { id, submissionId } = req.params;
    const { feedback } = req.body;
    
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ message: 'Challenge not found', code: 404 });
        }

        if (String(challenge.mentor) !== String(mentor._id)) {
            return res.status(403).json({ message: 'Not authorized', code: 403 });
        }

        const submission = challenge.submissions.id(submissionId);
        if (!submission) {
            return res.status(404).json({ message: 'Submission not found', code: 404 });
        }

        submission.status = 'approved';
        submission.feedback = feedback || 'Approved';
        submission.reviewedAt = new Date();
        submission.reviewedBy = mentor._id;

        await challenge.save();

        // Update learner's skill progress for approved challenge
        try {
          // If challenge has specialization and skill defined, use them directly
          if (challenge.specialization && challenge.skill) {
            const xpReward = challenge.xpReward || 50;
            const learnerId = submission.learner;
            
            await progressService.addProgress({
              userId: learnerId,
              specialization: challenge.specialization,
              skill: challenge.skill,
              delta: xpReward,
              source: 'challenge_approved',
              sourceId: challenge._id,
              note: `Challenge approved: ${challenge.title}`
            });
            console.log(`[Progress] Updated skill "${challenge.skill}" for learner ${learnerId} (+${xpReward} XP from challenge)`);
            
            // Also try to mark roadmap topic as completed if challenge title/description matches a topic
            try {
              const spec = await Specialization.findOne({ specialization: challenge.specialization }).lean();
              if (spec && spec.roadmap) {
                const challengeText = `${challenge.title} ${challenge.description}`.toLowerCase();
                
                // Search through roadmap stages for matching topics
                for (const stageDef of spec.roadmap) {
                  const matchingTopic = (stageDef.topics || []).find(topic => {
                    const topicLower = topic.toLowerCase();
                    return challengeText.includes(topicLower) || topicLower.includes(challenge.skill.toLowerCase());
                  });
                  
                  if (matchingTopic) {
                    await progressService.markTopicCompleted({
                      userId: learnerId,
                      specialization: challenge.specialization,
                      stage: stageDef.stage,
                      topic: matchingTopic,
                      source: 'challenge_approved',
                      sourceId: challenge._id
                    });
                    console.log(`[Roadmap] Marked topic "${matchingTopic}" complete in stage "${stageDef.stage}"`);
                    break; // Only mark first matching topic
                  }
                }
              }
            } catch (roadmapErr) {
              console.error('Error marking roadmap topic complete:', roadmapErr);
            }
          } else {
            // Fallback: try to auto-match if specialization/skill not set on challenge
            const learner = await Learner.findById(submission.learner);
            if (learner) {
              const learnerSpecs = Array.isArray(learner.specialization) ? learner.specialization : [];
              if (learnerSpecs.length > 0) {
                // Find preset schedules connecting this learner and mentor to get specialization
                const presetSched = await PresetSchedule.findOne({
                  mentor: challenge.mentor,
                  participants: { $in: [String(learner._id)] }
                }).lean();

                if (presetSched && presetSched.specialization) {
                  // Fetch the specialization document
                  const spec = await Specialization.findOne({ 
                    specialization: presetSched.specialization 
                  }).lean();

                  if (spec && spec.skillmap) {
                    // Try to match challenge title/description to a skill in the skillmap
                    const skillmap = spec.skillmap || [];
                    const challengeText = `${challenge.title} ${challenge.description}`.toLowerCase();
                    
                    // Check if any skill name appears within the challenge title or description
                    const matchingSkill = skillmap.find(skill => {
                      const skillLower = String(skill).toLowerCase();
                      return challengeText.includes(skillLower);
                    });

                    if (matchingSkill) {
                      // Award XP based on difficulty
                      const xpReward = challenge.xpReward || 50;
                      await progressService.addProgress({
                        userId: learner._id,
                        specialization: spec.specialization,
                        skill: matchingSkill,
                        delta: xpReward,
                        source: 'challenge_approved',
                        sourceId: challenge._id,
                        note: `Challenge approved: ${challenge.title}`
                      });
                      console.log(`[Progress] Updated skill "${matchingSkill}" for learner ${learner._id} (+${xpReward} XP from challenge)`);
                    } else {
                      console.log(`[Progress] No matching skill found for challenge "${challenge.title}" in specialization "${spec.specialization}"`);
                    }
                  }
                } else {
                  console.log(`[Progress] No preset schedule or specialization found for learner ${learner._id} with mentor ${challenge.mentor}`);
                }
              } else {
                console.log(`[Progress] Learner ${learner._id} has no specializations set`);
              }
            } else {
              console.log(`[Progress] Learner not found for submission ${submission._id}`);
            }
          }
        } catch (progressErr) {
          console.error('Error updating learner skill progress on challenge approval:', progressErr);
          console.error('Progress error stack:', progressErr.stack);
        }

        return res.status(200).json({ message: 'Submission approved', submission, code: 200 });
    } catch (error) {
        console.error('approveSubmission error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// Reject challenge submission
exports.rejectSubmission = async (req, res) => {
    const decoded = getValuesFromToken(req);
    const { id, submissionId } = req.params;
    const { feedback } = req.body;
    
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ message: 'Challenge not found', code: 404 });
        }

        if (String(challenge.mentor) !== String(mentor._id)) {
            return res.status(403).json({ message: 'Not authorized', code: 403 });
        }

        const submission = challenge.submissions.id(submissionId);
        if (!submission) {
            return res.status(404).json({ message: 'Submission not found', code: 404 });
        }

        submission.status = 'rejected';
        submission.feedback = feedback || 'Needs improvement';
        submission.reviewedAt = new Date();
        submission.reviewedBy = mentor._id;

        await challenge.save();

        return res.status(200).json({ message: 'Submission rejected', submission, code: 200 });
    } catch (error) {
        console.error('rejectSubmission error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// ==================== LEARNER FUNCTIONS ====================

// Get all available challenges
exports.getAvailableChallenges = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const learner = await Learner.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!learner) {
            return res.status(404).json({ message: 'Learner not found', code: 404 });
        }

        // Find all preset schedules learner is enrolled in
        const enrolledSchedules = await PresetSchedule.find({
            participants: { $in: [String(learner._id)] }
        });

        if (enrolledSchedules.length === 0) {
            return res.status(200).json({ 
                message: 'No enrolled schedules',
                challenges: [],
                code: 200 
            });
        }

        // Get unique mentor IDs
        const mentorIds = [...new Set(enrolledSchedules.map(s => String(s.mentor)))];

        // Get all active challenges from these mentors
        const challenges = await Challenge.find({
            mentor: { $in: mentorIds },
            isActive: true
        }).select('-submissions').sort({ createdAt: -1 });

        // Add learner's submission status (need to fetch with submissions to check)
        const challengesWithSubmissions = await Challenge.find({
            mentor: { $in: mentorIds },
            isActive: true
        }).sort({ createdAt: -1 });

        const challengesWithStatus = challengesWithSubmissions.map(c => {
            const learnerSubmission = c.submissions.find(s => String(s.learner) === String(learner._id));
            return {
                _id: c._id,
                title: c.title,
                description: c.description,
                mentorName: c.mentorName,
                difficulty: c.difficulty,
                xpReward: c.xpReward,
                requirements: c.requirements,
                specialization: c.specialization,
                skill: c.skill,
                hasSubmitted: !!learnerSubmission,
                submissionStatus: learnerSubmission ? learnerSubmission.status : null,
                mySubmission: learnerSubmission ? {
                    _id: learnerSubmission._id,
                    submittedAt: learnerSubmission.submittedAt,
                    status: learnerSubmission.status,
                    feedback: learnerSubmission.feedback,
                    reviewedAt: learnerSubmission.reviewedAt
                } : null,
                createdAt: c.createdAt
            };
        });

        return res.status(200).json({ 
            challenges: challengesWithStatus,
            totalCount: challenges.length,
            code: 200 
        });
    } catch (error) {
        console.error('getAvailableChallenges error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// Get challenge details
exports.getChallengeDetails = async (req, res) => {
    const decoded = getValuesFromToken(req);
    const { id } = req.params;
    
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const learner = await Learner.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!learner) {
            return res.status(404).json({ message: 'Learner not found', code: 404 });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ message: 'Challenge not found', code: 404 });
        }

        // Check if learner is enrolled with this mentor
        const enrolledWithMentor = await PresetSchedule.exists({
            mentor: challenge.mentor,
            participants: { $in: [String(learner._id)] }
        });

        if (!enrolledWithMentor) {
            return res.status(403).json({ 
                message: 'You must be enrolled in a preset schedule with this mentor', 
                code: 403 
            });
        }

        const learnerSubmission = challenge.submissions.find(s => String(s.learner) === String(learner._id));

        const challengeData = {
            _id: challenge._id,
            title: challenge.title,
            description: challenge.description,
            mentorName: challenge.mentorName,
            difficulty: challenge.difficulty,
            xpReward: challenge.xpReward,
            requirements: challenge.requirements,
            specialization: challenge.specialization,
            skill: challenge.skill,
            isActive: challenge.isActive,
            createdAt: challenge.createdAt,
            hasSubmitted: !!learnerSubmission,
            submissionStatus: learnerSubmission ? learnerSubmission.status : null,
            mySubmission: learnerSubmission ? {
                _id: learnerSubmission._id,
                submittedAt: learnerSubmission.submittedAt,
                status: learnerSubmission.status,
                feedback: learnerSubmission.feedback,
                reviewedAt: learnerSubmission.reviewedAt,
                submissionUrl: learnerSubmission.submissionUrl,
                submissionText: learnerSubmission.submissionText
            } : null
        };

        return res.status(200).json({ challenge: challengeData, code: 200 });
    } catch (error) {
        console.error('getChallengeDetails error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

// Submit challenge
exports.submitChallenge = async (req, res) => {
    const decoded = getValuesFromToken(req);
    const { id } = req.params;
    const { submissionUrl, submissionText } = req.body;
    
    if (!decoded?.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const learner = await Learner.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!learner) {
            return res.status(404).json({ message: 'Learner not found', code: 404 });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ message: 'Challenge not found', code: 404 });
        }

        if (!challenge.isActive) {
            return res.status(400).json({ message: 'Challenge is not active', code: 400 });
        }

        // Check if learner is enrolled with this mentor
        const enrolledWithMentor = await PresetSchedule.exists({
            mentor: challenge.mentor,
            participants: { $in: [String(learner._id)] }
        });

        if (!enrolledWithMentor) {
            return res.status(403).json({ 
                message: 'You must be enrolled in a preset schedule with this mentor', 
                code: 403 
            });
        }

        // Check if already submitted
        const existingSubmission = challenge.submissions.find(s => String(s.learner) === String(learner._id));
        if (existingSubmission) {
            return res.status(400).json({ message: 'You have already submitted this challenge', code: 400 });
        }

        if (!submissionUrl && !submissionText) {
            return res.status(400).json({ message: 'Either submissionUrl or submissionText is required', code: 400 });
        }

        challenge.submissions.push({
            learner: learner._id,
            learnerName: learner.name,
            submissionUrl,
            submissionText,
            status: 'pending'
        });

        await challenge.save();

        const newSubmission = challenge.submissions[challenge.submissions.length - 1];

        return res.status(201).json({ 
            message: 'Challenge submitted successfully',
            submission: newSubmission,
            code: 201 
        });
    } catch (error) {
        console.error('submitChallenge error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};