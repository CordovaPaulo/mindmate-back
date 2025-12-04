const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');
const User = require('../models/user');
const Schedule = require('../models/Schedule');
const Feedback = require('../models/feedback');
const { getValuesFromToken } = require('../service/jwt');
const mailingController = require('./mailing');
const pusher = require('../service/pusher');
const { schedulePayload, feedbackPayload } = require('../utils/realtimePayload');
const uploadController = require('./upload');
const calculateMatchScore = require('../utils/matchingUtils');
const Rank = require('../models/rank'); // <-- added
const Badge = require('../models/badges'); // added
const presetSched = require('../models/presetSched');
const progressService = require('../service/progress');
const Specialization = require('../models/specializations');

// Safe helper to resolve mentor and call awardMentorBadges without relying on userData variable
async function safeAwardMentorBadgesByUserId(userOrMentorId) {
  try {
    if (!userOrMentorId) return null;
    const mentor = await Mentor.findOne({
      $or: [{ _id: userOrMentorId }, { userId: userOrMentorId }]
    }).select('_id');
    if (!mentor) return null;
    return await Badge.awardMentorBadges(mentor._id);
  } catch (err) {
    console.error('Error awarding badges (learner controller):', err);
    return null;
  }
}

exports.getAllMentors = async (req, res) => {
  const decoded = getValuesFromToken(req);
  if (!decoded || !decoded.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  
  try {
    const mentors = await Mentor.find();
    if (!mentors || mentors.length === 0) {
      return res.status(404).json({ message: 'No mentors found', code: 404 });
    }

    const learner = await Learner.findOne({
      $or: [
        { _id: decoded.id },
        { userId: decoded.id }
      ]
    });
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found', code: 404 });
    }

    // Calculate learner progress for matching algorithm
    let learnerProgress = null;
    try {
      const UserSkillProgress = require('../models/userSkillProgress');
      const UserRoadmapProgress = require('../models/userRoadmapProgress');
      
      // Get all skill progress for this learner across their specializations
      const skillProgresses = await UserSkillProgress.find({
        userId: decoded.id,
        specialization: { $in: learner.specialization || [] }
      }).lean();
      
      // Calculate average skill level
      let avgSkillLevel = 1;
      if (skillProgresses && skillProgresses.length > 0) {
        const totalLevel = skillProgresses.reduce((sum, sp) => sum + (sp.level || 1), 0);
        avgSkillLevel = totalLevel / skillProgresses.length;
      }
      
      // Get roadmap progress for learner's specializations
      const roadmapProgresses = await UserRoadmapProgress.find({
        userId: decoded.id,
        specialization: { $in: learner.specialization || [] }
      }).lean();
      
      // Calculate average roadmap completion
      let roadmapCompletion = 0;
      if (roadmapProgresses && roadmapProgresses.length > 0) {
        const totalCompletion = roadmapProgresses.reduce((sum, rp) => sum + (rp.overallCompletion || 0), 0);
        roadmapCompletion = totalCompletion / roadmapProgresses.length;
      }
      
      learnerProgress = { avgSkillLevel, roadmapCompletion };
    } catch (progressErr) {
      console.error('Error calculating learner progress:', progressErr);
      // Continue without progress data
    }

    // dynamic import of ESM util (works in CommonJS file inside async function)
    let matchScores = null
    try {
      const mod = calculateMatchScore
      matchScores = mod && mod.calculateMatchScore;
    } catch (impErr) {
      console.error('Could not import matchingUtils:', impErr);
    }

    // If utility not available, fallback to returning basic mentor list
    if (typeof calculateMatchScore !== 'function') {
      console.warn('calculateMatchScore not available — returning unscored mentor list as fallback');
      return res.status(200).json(mentors.map(mentor => ({
        id: mentor._id,
        name: mentor.name,
        program: mentor.program,
        yearLevel: mentor.yearLevel,
        aveRating: mentor.aveRating,
        image: mentor.image,
        proficiency: mentor.proficiency,
        matchScore: null
      })));
    }

    // Score each mentor (guard against any runtime error from the scorer)
    const scored = mentors.map(m => {
      let score = 0;
      try {
        score = calculateMatchScore(learner, m, learnerProgress) ?? 0;
      } catch (scoreErr) {
        console.error('Error calculating score for mentor', String(m._id), scoreErr);
        score = 0;
      }
      return { mentor: m, score: Number.isFinite(score) ? score : 0 };
    });

    // Filter to only matching mentors (score > 0) and sort by descending score
    let matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    // Fallback: if no matches, return top mentors by score (even if 0) to avoid empty result
    if (matched.length === 0) {
      matched = scored.sort((a, b) => b.score - a.score).slice(0, 10);
    }

    // Map to response payload
    const response = matched.map(({ mentor, score }) => ({
      id: mentor._id,
      name: mentor.name,
      program: mentor.program,
      yearLevel: mentor.yearLevel,
      aveRating: mentor.aveRating,
      image: mentor.image,
      proficiency: mentor.proficiency,
      matchScore: parseFloat((score || 0).toFixed(2))
    }));

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Server error', code: 500 });
  }
};

exports.getMentorById = async (req, res) => {
  const { id } = req.params;
  try {
    const mentor = await Mentor.findOne({ _id: id }).select('-subjects');
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found', code: 404 });
    }

    // Ensure badges are up-to-date (best-effort)
    try {
      await safeAwardMentorBadgesByUserId(mentor._id);
    } catch (awardErr) {
      console.error('Error awarding badges (getMentorById):', awardErr);
    }

    // Fetch persisted badges for this mentor
    const earned = await Badge.MentorBadge.find({ mentor: mentor._id }).sort({ awardedAt: -1 }).lean();

    // Resolve definitions from static catalog when available
    const defs = (Badge.BADGES || []).reduce((m, d) => {
      m[d.key] = d;
      return m;
    }, {});

    const badges = earned.map(b => ({
      badgeKey: b.badgeKey,
      awardedAt: b.awardedAt,
      definition: defs[b.badgeKey] || null
    }));

    // Fetch preset schedules created by this mentor
    const presetSchedules = await presetSched.find({ mentor: mentor._id }).lean();

    res.status(200).json({ mentor, badges, presetSchedules });
  } catch (error) {
    console.error('getMentorById error:', error);
    res.status(500).json({ message: 'Server error', code: 500 });
  }
};

exports.setSchedule = async (req, res) => {
    const { id } = req.params; // mentor ID
    const { date, time, location, subject } = req.body;
    
    const decoded = getValuesFromToken(req);

    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    if (!date || !time || !location || !subject) {
        return res.status(400).json({ message: 'All fields are required', code: 400 });
    }

    try {
        const mentor = await Mentor.findById(id);
        const learner = await Learner.findOne({
            $or: [
                { _id: decoded.id },
                { userId: decoded.id }
            ]
        });

        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        if (!learner) {
            return res.status(404).json({ message: 'Learner not found', code: 404 });
        }

        const scheduleDate = new Date(date);
        if (Number.isNaN(scheduleDate.getTime())) {
          return res.status(400).json({ message: 'Invalid date', code: 400 });
        }

        const sessionType = 'one-on-one';
        const mentorName = mentor.name;
        const learnerName = learner.name;

        const existing = await Schedule.findOne({
          learners: learner._id,
          mentor: mentor._id,
          date: scheduleDate,
          time
        });
        if (existing) {
          return res.status(409).json({ message: 'Schedule already exists for this slot', schedule: existing, code: 409 });
        }

        const schedule = new Schedule({
            learners: [learner._id],
            learnerNames: [learnerName],
            mentor: mentor._id,
            mentorName: mentorName,
            date: scheduleDate,
            time,
            location,
            subject,
            sessionType
        });

        await schedule.save();

        // NEW: If location is 'online', create Jitsi session
        const isOnline = String(location).toLowerCase().trim() === 'online' || 
                        String(location).toLowerCase().includes('online');
        
        if (isOnline) {
          const Jitsi = require('../models/jitsi'); // make sure path is correct
          const roomName = await Jitsi.generateRoomName(schedule._id); // ADD await
          const jitsiSession = new Jitsi({
            scheduleId: schedule._id,
            roomName,
            subject: schedule.subject,
            mentorId: mentor._id,
            learnerIds: [learner._id],
            isActive: false
          });
          const domain = process.env.JITSI_DOMAIN || 'meet.jit.si';
          jitsiSession.meetingUrl = jitsiSession.buildMeetingUrl(domain);
          await jitsiSession.save();
          
          schedule.jitsiSessionId = jitsiSession._id;
          await schedule.save();
        }

        // Notify mentor via Pusher
        try {
          const mentorChannelId = String(mentor.userId);
          const channelName = `private-user-${mentorChannelId}`;
          const eventName = 'new-schedule';

          const payload = schedulePayload(schedule, mentor, learner);
          console.log('[Pusher] triggering', { channelName, eventName, payload });
          await pusher.trigger(channelName, eventName, payload);
        } catch (emitErr) {
          console.error('Pusher emit error (learner.setSchedule):', emitErr);
        }

        await safeAwardMentorBadgesByUserId(mentor._id);

        res.status(201).json(schedule);
    } catch (error) {
        res.status(500).json({ message: error.message, code: 500 });
    }
}

exports.setFeedback = async (req, res) => {
    const { id } = req.params;
    const { rating, comments, evaluation } = req.body;
    const decoded = getValuesFromToken(req);

    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    if (!rating || !comments ) {
        return res.status(400).json({ message: 'All fields are required', code: 400 });
    }

    try {
        // find authenticated learner
        const learnerDoc = await Learner.findOne({
            $or: [
                { _id: decoded.id },
                { userId: decoded.id }
            ]
        });
        if (!learnerDoc) {
            return res.status(404).json({ message: 'Learner not found', code: 404 });
        }

        // find schedule and guard if missing
        const sched = await Schedule.findById(id);
        if (!sched) {
            return res.status(404).json({ message: 'Schedule not found', code: 404 });
        }

        // find mentor referenced by schedule and guard if missing
        let mentor = await Mentor.findById(sched.mentor);
        if (!mentor) {
            mentor = await Mentor.findOne({ userId: sched.mentor });
        }
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        // Validate evaluation data if provided
        let evaluationData = null;
        if (evaluation && typeof evaluation === 'object') {
            const validCategories = ['knowledge', 'pacing', 'communication', 'engagement', 
                                    'feedbackQuality', 'professionalism', 'resources', 
                                    'accessibility', 'learningOutcomes'];
            
            evaluationData = {};
            
            // Validate numeric ratings (1-5)
            for (const cat of validCategories) {
                if (evaluation[cat] !== undefined) {
                    const val = Number(evaluation[cat]);
                    if (Number.isNaN(val) || val < 1 || val > 5) {
                        return res.status(400).json({ 
                            message: `Invalid ${cat} rating. Must be between 1 and 5.`, 
                            code: 400 
                        });
                    }
                    evaluationData[cat] = val;
                }
            }
            
            // Store open-ended responses
            if (evaluation.whatHelped !== undefined) {
                evaluationData.whatHelped = String(evaluation.whatHelped).trim();
            }
            if (evaluation.suggestions !== undefined) {
                evaluationData.suggestions = String(evaluation.suggestions).trim();
            }
        }

        // create feedback
        const feedback = new Feedback({
            learner: learnerDoc._id,
            mentor: sched.mentor,
            schedule: sched._id,
            rating,
            comments,
            evaluation: evaluationData
        });

        // Calculate mentor rating based on evaluation if available, else use simple rating
        let effectiveRating = rating;
        if (evaluationData && evaluationData.categoryAverage) {
            effectiveRating = evaluationData.categoryAverage;
        }
        
        const newRating = mentor.aveRating ? (mentor.aveRating + effectiveRating) / 2 : effectiveRating;
        mentor.aveRating = newRating;

        await feedback.save();
        await mentor.save();
        // Award badges for mentor after receiving feedback
        await safeAwardMentorBadgesByUserId(mentor._id);

        // update learner rank ONLY if the schedule subject is listed in learner.subjects
        try {
          const learnerSubjects = Array.isArray(learnerDoc.subjects)
            ? learnerDoc.subjects.map(s => String(s).trim().toLowerCase())
            : [];
          const scheduleSubject = String(sched.subject || '').trim().toLowerCase();

          if (scheduleSubject && learnerSubjects.includes(scheduleSubject)) {
            let rankDoc = await Rank.findOne({ learnerId: learnerDoc._id });
            if (!rankDoc) {
              rankDoc = new Rank({ learnerId: learnerDoc._id });
            }
            // increment by 1 session for this qualifying feedback schedule
            await rankDoc.addSessions(1);
          }
        } catch (rankErr) {
          console.error('Error updating learner rank:', rankErr);
        }

        // Update skill progress for completed schedule
        try {
          const learnerSpecs = Array.isArray(learnerDoc.specialization) ? learnerDoc.specialization : [];
          if (learnerSpecs.length > 0 && sched.subject) {
            // Fetch specializations that match learner's specializations
            const specs = await Specialization.find({ specialization: { $in: learnerSpecs } }).lean();
            
            const subjectLower = String(sched.subject).toLowerCase();
            
            // Try to find if any skill name is included in the schedule subject
            for (const spec of specs) {
              const skillmap = spec.skillmap || [];
              // Check if any skill name appears within the subject (e.g., "JavaScript" in "Advanced JavaScript")
              const matchingSkill = skillmap.find(skill => {
                const skillLower = String(skill).toLowerCase();
                // Check if skill is contained in subject name
                return subjectLower.includes(skillLower);
              });
              
              if (matchingSkill) {
                // Award progress for completing this schedule
                await progressService.addProgress({
                  userId: learnerDoc._id,
                  specialization: spec.specialization,
                  skill: matchingSkill,
                  delta: 100, // Base XP for completing a schedule
                  source: 'schedule_completion',
                  sourceId: sched._id,
                  note: `Completed schedule: ${sched.subject} on ${sched.date}`
                });
                console.log(`[Progress] Updated skill "${matchingSkill}" for learner ${learnerDoc._id} (+100 XP)`);
              }
            }
          }
        } catch (progressErr) {
          console.error('Error updating learner skill progress:', progressErr);
        }

        // Pusher: notify new feedback
        try {
          const mentorDoc = await Mentor.findById(feedback.mentor || id);
          const channelName = `private-user-${String(mentorDoc.userId)}`;
          const fbPayload = feedbackPayload(feedback);
          console.log('[Pusher] new-feedback ->', channelName);
          await pusher.trigger(channelName, 'new-feedback', fbPayload);
        } catch (emitErr) {
          console.error('Pusher emit error (learner.setFeedback):', emitErr);
        }
        return res.status(201).json(feedback);
    } catch (error) {
        console.error('setFeedback error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
}

exports.getSchedules = async (req, res) => {
    const decoded = getValuesFromToken(req);

    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }
    try {
        // Find learner by either _id or userId
        const learner = await Learner.findOne({
            $or: [
                { _id: decoded.id },
                { userId: decoded.id }
            ]
        });

        if (!learner) {
            return res.status(404).json({ message: 'Learner not found', code: 404 });
        }

        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Retrieve all schedules that include this learner (learners is now an array)
        // Don't use mongoose.populate here — if model registration order is problematic
        // populate() can throw MissingSchemaError. Resolve mentor/learners manually below.
        const schedules = await Schedule.find({
            learners: learner._id
        });

        console.log('Found schedules:', schedules.length);

        // Split schedules and transform them
        const todaySchedule = [];
        const upcomingSchedule = [];
        const schedForReview = [];

        for (const schedule of schedules) {
            const schedDate = new Date(schedule.date);
            schedDate.setHours(0, 0, 0, 0);
            
            console.log('Processing schedule:', schedule._id);
            console.log('Mentor ID:', schedule.mentor?._id || schedule.mentor);
            console.log('Learners:', Array.isArray(schedule.learners) ? schedule.learners.map(l => String(l._id || l)).join(',') : schedule.learners);

            // Resolve mentor (populated if available)
            let mentor = schedule.mentor;
            const mentordeets = await Mentor.findById(schedule.mentor);
            if (mentor || mentor._id || !mentordeets) {
                if (!mentordeets) mentordeets = await Mentor.findOne({ userId: schedule.mentor });
            }
            
            let schedLearner = null;
            if (Array.isArray(schedule.learners) && schedule.learners.length > 0) {
                const first = schedule.learners[0];
                schedLearner = await Learner.findById(first);
                if (!schedLearner) schedLearner = await Learner.findOne({ userId: first });
            } else {
                if (Array.isArray(schedule.learnerNames) && schedule.learnerNames.length > 0) {
                    schedLearner = { name: schedule.learnerNames[0], program: 'N/A', yearLevel: 'N/A', image: 'https://placehold.co/600x400', _id: null };
                }
            }

            console.log('Found mentor:', mentor?.name || 'Not found');
            console.log('Found learner:', schedLearner?.name || 'Not found');

            const transformedSchedule = {
                id: schedule._id,
                date: schedDate.toISOString().split('T')[0],
                time: schedule.time,
                location: schedule.location,
                subject: schedule.subject,
                
                // Mentor information (include id)
                mentor: {
                    id: mentordeets?._id || schedule.mentor, // populated or raw id
                    name: mentordeets?.name || 'Unknown Mentor',
                    program: mentordeets?.program || 'N/A',
                    yearLevel: mentordeets?.yearLevel || 'N/A',
                    image: mentordeets?.image || 'https://placehold.co/600x400'
                },
                
                // Learner information (name, program, year level)
                learner: {
                    id: schedLearner?._id || null,
                    name: schedLearner?.name || (Array.isArray(schedule.learnerNames) ? schedule.learnerNames[0] : 'Unknown Learner'),
                    program: schedLearner?.program || 'N/A',
                    yearLevel: schedLearner?.yearLevel || 'N/A',
                    image: schedLearner?.image || 'https://placehold.co/600x400'
                }
            };
            
            if (schedDate.getTime() === today.getTime()) {
                todaySchedule.push(transformedSchedule);
            } else if (schedDate > today) {
                upcomingSchedule.push(transformedSchedule);
            } else if (schedDate < today) {
                schedForReview.push(transformedSchedule);
            }
        }

        res.status(200).json({
            todaySchedule,
            upcomingSchedule,
            schedForReview
        });
    } catch (error) {
        console.error('Error in getSchedules:', error);
        res.status(500).json({ message: error.message, code: 500 });
    }
}

exports.getProfileInfo = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const userData = await Learner.findOne({userId: decoded.id});
        const roleData = await User.findOne({ _id: decoded.id }).select('role altRole');
        const rankDoc = await Rank.findOne({ learnerId: userData?.id }).select('progress rank');

        if(!userData || !roleData) {
            return res.status(404).json({ message: "User Account is none existent", code: 404});
        }

        let rankData = null;
        if (rankDoc) {
          const requiredSessions = rankDoc.requiredSessions ?? null; // null if at top rank
          const sessionsToNextRank = requiredSessions == null
            ? null
            : Math.max(requiredSessions - (rankDoc.progress || 0), 0);

          rankData = {
            rank: rankDoc.rank,
            progress: rankDoc.progress,
            requiredSessions,
            sessionsToNextRank
          };
        }

        res.status(200).json({userData, roleData, rankData});
    } catch (error) {
        res.status(500).json({ message: error.message, code: 500 });
    }
}

// PATCH endpoints

// exports.editProfile = async (req, res) => {
//     const decoded = getValuesFromToken(req);
//     if (!decoded || !decoded.id) {
//         return res.status(403).json({ message: 'Invalid token', code: 403 });
//     }

//     // Fields allowed to update in Learner
//     const learnerUpdates = {};
//     const allowedLearnerFields = [
//         'name', 'age', 'phoneNumber', 'bio', 'address', 'modality',
//         'subjects', 'availability', 'style', 'sessionDur', 'image'
//     ];
//     allowedLearnerFields.forEach(field => {
//         if (req.body[field] !== undefined) learnerUpdates[field] = req.body[field];
//     });

//     try {
//         // Update Learner object
//         const learner = await Learner.findOneAndUpdate(
//             { $or: [{ _id: decoded.id }, { userId: decoded.id }] },
//             { $set: learnerUpdates },
//             { new: true }
//         );
//         if (!learner) {
//             return res.status(404).json({ message: 'Learner not found', code: 404 });
//         }

//         res.status(200).json({ learner});
//     } catch (error) {
//         res.status(500).json({ message: error.message, code: 500 });
//     }
// }

exports.cancelSched = async (req, res) => {
  const { id } = req.params;
  const decoded = getValuesFromToken(req);
  const { reason = '' } = req.body;

  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  if (!id) {
    return res.status(400).json({ message: 'Schedule id is required', code: 400 });
  }

  try {
    // find learner from token
    const learner = await Learner.findOne({
      $or: [{ _id: decoded.id }, { userId: decoded.id }]
    });
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found', code: 404 });
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found', code: 404 });
    }

    // authorize: schedule must include this learner in the learners array
    const learnerId = String(learner._id);
    const learnerUserId = String(learner.userId);
    const isInSchedule = schedule.learners && Array.isArray(schedule.learners) &&
      schedule.learners.some(l => String(l) === learnerId || String(l) === learnerUserId);

    if (!isInSchedule) {
      return res.status(403).json({ message: 'Not authorized to cancel this schedule', code: 403 });
    }

    // delete (or update status if you prefer soft delete)
    await Schedule.findByIdAndDelete(id);

    // optional socket emit
    try {
      const io = req.app?.get && req.app.get('io');
      if (io) {
        io.to(String(schedule.mentor)).emit('scheduleCanceled', {
          scheduleId: id,
          canceledBy: String(learner._id),
          date: schedule.date,
          time: schedule.time,
          subject: schedule.subject
        });
      }
    } catch (emitErr) {
      console.error('Socket emit error (learner.cancelSched):', emitErr);
    }

    // send email to mentor
    try {
      await mailingController.sendCancellationByLearner(id, String(learner._id), reason);
    } catch (mailErr) {
      console.error('Error sending cancellation email (learner):', mailErr);
    }

    // Pusher: notify schedule cancellation
    try {
      const mentorDoc = await Mentor.findById(schedule.mentor);
      const learnerDoc = await Learner.findById(schedule.learner);
      const channelName = `private-user-${String(mentorDoc.userId)}`;
      const payload = schedulePayload(schedule, mentorDoc, learnerDoc);
      console.log('[Pusher] schedule-cancelled ->', channelName);
      await pusher.trigger(channelName, 'schedule-cancelled', payload);
    } catch (emitErr) {
      console.error('Pusher emit error (learner.cancelSched):', emitErr);
    }

    // Award badges for mentor (best-effort) after cancel
    await safeAwardMentorBadgesByUserId(schedule.mentor);

    return res.status(200).json({ message: 'Schedule canceled', code: 200 });
  } catch (error) {
    console.error('cancelSched error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

exports.reschedSched = async (req, res) => {
  const { id } = req.params;
  const { date, time, location, subject } = req.body;
  const decoded = getValuesFromToken(req);

  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  if (!id) {
    return res.status(400).json({ message: 'Schedule id is required', code: 400 });
  }
  if (!date && !time && !location && !subject) {
    return res.status(400).json({ message: 'Provide at least one of date, time, location, subject', code: 400 });
  }

  try {
    // find learner from token
    const learner = await Learner.findOne({
      $or: [{ _id: decoded.id }, { userId: decoded.id }]
    });
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found', code: 404 });
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found', code: 404 });
    }

    // authorize: schedule must include this learner in the learners array
    const learnerId = String(learner._id);
    const learnerUserId = String(learner.userId);
    const isInSchedule = schedule.learners && Array.isArray(schedule.learners) &&
      schedule.learners.some(l => String(l) === learnerId || String(l) === learnerUserId);

    if (!isInSchedule) {
      return res.status(403).json({ message: 'Not authorized to reschedule this schedule', code: 403 });
    }

    // validations (simple examples)
    if (time && (time < '06:00' || time > '22:00')) {
      return res.status(400).json({ message: 'Time must be between 06:00 and 22:00', code: 400 });
    }
    if (date) {
      const today = new Date(); today.setHours(0,0,0,0);
      const newDate = new Date(date); newDate.setHours(0,0,0,0);
      if (newDate < today) {
        return res.status(400).json({ message: 'Date must be today or later', code: 400 });
      }
    }

    const oldValues = {
      date: schedule.date,
      time: schedule.time,
      location: schedule.location,
      subject: schedule.subject
    };

    if (date) schedule.date = new Date(date);
    if (time) schedule.time = time;
    if (location) schedule.location = location;
    if (subject) schedule.subject = subject;

    await schedule.save();

    // optional socket emit
    try {
      const mentorDoc = await Mentor.findById(schedule.mentor);
      const learnerDoc = await Learner.findById(schedule.learner);
      const channelName = `private-user-${String(mentorDoc.userId)}`;
      const payload = schedulePayload(schedule, mentorDoc, learnerDoc);
      console.log('[Pusher] schedule-rescheduled ->', channelName);
      await pusher.trigger(channelName, 'schedule-rescheduled', payload);
    } catch (emitErr) {
      console.error('Pusher emit error (learner.reschedSched):', emitErr);
    }

    // Award badges for mentor (best-effort)
    await safeAwardMentorBadgesByUserId(schedule.mentor);

    // email mentor
    try {
      await mailingController.sendRescheduleByLearner(
        id,
        String(learner._id),
        schedule.date,
        schedule.time,
        schedule.location
      );
    } catch (mailErr) {
      console.error('Error sending reschedule email (learner):', mailErr);
    }
    return res.status(200).json({ message: 'Schedule rescheduled', schedule, code: 200 });
  } catch (error) {
    console.error('reschedSched error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

exports.getFeedbacks = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }
    try {
        const learner = await Learner.findOne({
            $or: [
                { _id: decoded.id },
                { userId: decoded.id }
            ]
        });
        if (!learner) {
            return res.status(404).json({ message: 'Learner not found', code: 404 });
        }

        const feedbacks = await Feedback.find({ learner: learner._id });

        if (feedbacks.length === 0) {
            return res.status(404).json({ message: 'No feedbacks found', code: 404 });
        }
        res.status(200).json(feedbacks);
    } catch (error) {
        console.error('Error fetching feedbacks:', error);
        res.status(500).json({ message: 'Internal server error', code: 500 });
    }
}

exports.acceptOffer = async (req, res) => {
  try {
    // 1) Read offer token from query or body (sendOffer builds base64url JSON token)
    const token = req.query?.token || req.body?.token;
    if (!token) {
      return res.status(400).json({ message: 'token is required', code: 400 });
    }

    // 2) Decode token (base64url -> JSON)
    let payload;
    try {
      const json = Buffer.from(token, 'base64url').toString('utf8');
      payload = JSON.parse(json);
    } catch {
      return res.status(400).json({ message: 'Invalid offer token', code: 400 });
    }

    const required = ['mentorId', 'learnerId', 'date', 'time', 'location', 'subject'];
    const missing = required.filter(k => !payload[k]);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields in token: ${missing.join(', ')}`, code: 400 });
    }

    // 3) If Authorization header is present, ensure it matches the token's learnerId. If not present, continue.
    const maybeDecoded = (() => {
      try { return getValuesFromToken(req); } catch { return null; }
    })();
    if (maybeDecoded?.id) {
      // Resolve the authenticated learner and compare
      const authLearner = await Learner.findOne({ $or: [{ _id: maybeDecoded.id }, { userId: maybeDecoded.id }] });
      if (authLearner && String(authLearner._id) !== String(payload.learnerId)) {
        return res.status(403).json({ message: 'Offer not intended for this learner', code: 403 });
      }
    }

    // 4) Load entities referenced by the token
    let learner = await Learner.findById(payload.learnerId);
    if (!learner) learner = await Learner.findOne({ userId: payload.learnerId });
    if (!learner) return res.status(404).json({ message: 'Learner not found', code: 404 });

    let mentor = await Mentor.findById(payload.mentorId);
    if (!mentor) mentor = await Mentor.findOne({ userId: payload.mentorId });
    if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });

    // determine if this is a group offer (explicit sessionType preferred)
    const isGroupOffer = !!(payload.sessionType === 'group' || payload.groupName || payload.maxParticipants || (payload.offerId && payload.offerId.toString().includes('-')) || payload.scheduleId);

    // 5) Basic validations matching your other endpoints
    const scheduleDate = new Date(payload.date);
    if (Number.isNaN(scheduleDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date', code: 400 });
    }
    if (payload.time < '06:00' || payload.time > '22:00') {
      return res.status(400).json({ message: 'Time must be between 06:00 and 22:00', code: 400 });
    }

    if (isGroupOffer) {
      // Validate incoming maxParticipants if provided
      if (payload.maxParticipants !== undefined && payload.maxParticipants !== null) {
        const mp = Number(payload.maxParticipants);
        if (!Number.isFinite(mp) || mp < 1) {
          return res.status(400).json({ message: 'Invalid maxParticipants value in offer', code: 400 });
        }
      }
      // If payload references a specific scheduleId, join that schedule directly
      if (payload.scheduleId) {
        const groupSchedule = await Schedule.findById(payload.scheduleId);
        if (!groupSchedule) return res.status(404).json({ message: 'Referenced group session not found', code: 404 });
        if (groupSchedule.sessionType !== 'group') return res.status(400).json({ message: 'Referenced schedule is not a group session', code: 400 });
        if (String(groupSchedule.mentor) !== String(mentor._id)) return res.status(403).json({ message: 'Not authorized for this schedule', code: 403 });

        // check if learner already joined
        const alreadyJoined = Array.isArray(groupSchedule.learners) && groupSchedule.learners.some(l => String(l) === String(learner._id));
        if (alreadyJoined) {
          return res.status(409).json({ message: 'You already joined this group session', schedule: groupSchedule, code: 409 });
        }

        // enforce maxParticipants if present on schedule or payload (explicit null check)
        const maxFromSchedule = (groupSchedule.maxParticipants !== undefined && groupSchedule.maxParticipants !== null) ? Number(groupSchedule.maxParticipants) : null;
        const max = (maxFromSchedule !== null && Number.isFinite(maxFromSchedule)) ? maxFromSchedule : (payload.maxParticipants !== undefined && payload.maxParticipants !== null ? Number(payload.maxParticipants) : null);
        if (max !== null && Array.isArray(groupSchedule.learners) && groupSchedule.learners.length >= Number(max)) {
          return res.status(409).json({ message: 'Group session is full', code: 409 });
        }

        groupSchedule.learners = groupSchedule.learners || [];
        groupSchedule.learnerNames = groupSchedule.learnerNames || [];
        groupSchedule.learners.push(learner._id);
        groupSchedule.learnerNames.push(learner.name);
        await groupSchedule.save();

        // Notify mentor & pusher (best-effort)
        try {
          const mentorUser = mentor.userId ? await User.findById(mentor.userId) : null;
          const mentorEmail = mentorUser?.email || mentor.email;
          if (mentorEmail) {
            await mailingController.sendEmailNotification(
              mentorEmail,
              `Group invite accepted: ${groupSchedule.subject}`,
              `Hello ${mentor.name},

${learner.name} joined your group session "${groupSchedule.groupName || 'Group Study Session'}".

Details:
- Subject: ${groupSchedule.subject}
- Date: ${new Date(groupSchedule.date).toLocaleDateString()}
- Time: ${groupSchedule.time}
- Location: ${groupSchedule.location}

Best regards,
MindMate Team`
            );
          }
        } catch (mailErr) {
          console.error('acceptOffer (group via scheduleId) notify mentor error:', mailErr);
        }

        try {
          const mentorDoc = await Mentor.findById(groupSchedule.mentor);
          const learnerDoc = await Learner.findById(learner._id);
          const channelName = `private-user-${String(mentorDoc.userId)}`;
          const payloadData = schedulePayload(groupSchedule, mentorDoc, learnerDoc);
          await pusher.trigger(channelName, 'group-join', payloadData);
        } catch (emitErr) {
          console.error('Pusher emit error (learner.acceptOffer group join - scheduleId):', emitErr);
        }

        // Award badges for mentor (best-effort)
        await safeAwardMentorBadgesByUserId(mentor._id);

        return res.status(200).json({ message: 'Joined group session', schedule: groupSchedule, code: 200 });
      }

      // fallback: existing behavior - find by mentor/date/time/subject
      let groupSchedule = await Schedule.findOne({
        mentor: mentor._id,
        date: scheduleDate,
        time: payload.time,
        subject: payload.subject,
        sessionType: 'group'
      });

      if (groupSchedule) {
        // check if learner already joined
        const alreadyJoined = Array.isArray(groupSchedule.learners) && groupSchedule.learners.some(l => String(l) === String(learner._id));
        if (alreadyJoined) {
          return res.status(409).json({ message: 'You already joined this group session', schedule: groupSchedule, code: 409 });
        }

        // enforce maxParticipants if present on schedule or payload (explicit null check)
        const maxFromSchedule = (groupSchedule.maxParticipants !== undefined && groupSchedule.maxParticipants !== null) ? Number(groupSchedule.maxParticipants) : null;
        const max = (maxFromSchedule !== null && Number.isFinite(maxFromSchedule)) ? maxFromSchedule : (payload.maxParticipants !== undefined && payload.maxParticipants !== null ? Number(payload.maxParticipants) : null);
        if (max !== null && Array.isArray(groupSchedule.learners) && groupSchedule.learners.length >= Number(max)) {
          return res.status(409).json({ message: 'Group session is full', code: 409 });
        }

        // add learner to group
        groupSchedule.learners = groupSchedule.learners || [];
        groupSchedule.learnerNames = groupSchedule.learnerNames || [];
        groupSchedule.learners.push(learner._id);
        groupSchedule.learnerNames.push(learner.name);
        await groupSchedule.save();

        // Notify mentor & pusher (best-effort)
        try {
          const mentorUser = mentor.userId ? await User.findById(mentor.userId) : null;
          const mentorEmail = mentorUser?.email || mentor.email;
          if (mentorEmail) {
            await mailingController.sendEmailNotification(
              mentorEmail,
              `Group offer accepted: ${payload.subject}`,
              `Hello ${mentor.name},

${learner.name} joined your group session "${payload.groupName || groupSchedule.groupName || 'Group Study Session'}".

Details:
- Subject: ${payload.subject}
- Date: ${scheduleDate.toLocaleDateString()}
- Time: ${payload.time}
- Location: ${payload.location}

Best regards,
MindMate Team`
            );
          }
        } catch (mailErr) {
          console.error('acceptOffer (group) notify mentor error:', mailErr);
        }

        try {
          const mentorDoc = await Mentor.findById(groupSchedule.mentor);
          const learnerDoc = await Learner.findById(learner._id);
          const channelName = `private-user-${String(mentorDoc.userId)}`;
          const payloadData = schedulePayload(groupSchedule, mentorDoc, learnerDoc);
          await pusher.trigger(channelName, 'group-join', payloadData);
        } catch (emitErr) {
          console.error('Pusher emit error (learner.acceptOffer group join):', emitErr);
        }

        // Award badges for mentor (best-effort)
        await safeAwardMentorBadgesByUserId(mentor._id);

        return res.status(200).json({ message: 'Joined group session', schedule: groupSchedule, code: 200 });
      } else {
        // No existing group schedule: create one with this first learner (existing behavior)
        const newGroup = new Schedule({
          learners: [learner._id],
          learnerNames: [learner.name],
          mentor: mentor._id,
          mentorName: mentor.name,
          date: scheduleDate,
          time: payload.time,
          location: payload.location,
          subject: payload.subject,
          sessionType: 'group',
          groupName: payload.groupName || null,
          maxParticipants: payload.maxParticipants || null,
          offerId: payload.offerId || null
        });
        await newGroup.save();

        // Notify mentor & pusher (best-effort)
        try {
          const mentorUser = mentor.userId ? await User.findById(mentor.userId) : null;
          const mentorEmail = mentorUser?.email || mentor.email;
          if (mentorEmail) {
            await mailingController.sendEmailNotification(
              mentorEmail,
              `Group offer accepted: ${payload.subject}`,
              `Hello ${mentor.name},

${learner.name} accepted your group session offer.

Details:
- Subject: ${payload.subject}
- Date: ${scheduleDate.toLocaleDateString()}
- Time: ${payload.time}
- Location: ${payload.location}

Best regards,
MindMate Team`
            );
          }
        } catch (mailErr) {
          console.error('acceptOffer (group) notify mentor error:', mailErr);
        }

        try {
          const mentorDoc = await Mentor.findById(newGroup.mentor);
          const learnerDoc = await Learner.findById(learner._id);
          const channelName = `private-user-${String(mentorDoc.userId)}`;
          const payloadData = schedulePayload(newGroup, mentorDoc, learnerDoc);
          await pusher.trigger(channelName, 'new-schedule', payloadData);
        } catch (emitErr) {
          console.error('Pusher emit error (learner.acceptOffer new group):', emitErr);
        }

        // Award badges for mentor (best-effort)
        await safeAwardMentorBadgesByUserId(mentor._id);

        return res.status(201).json({ message: 'Group session created and joined', schedule: newGroup, code: 201 });
      }
    } else {
      // existing one-on-one flow unchanged...
      // Prevent duplicates (same mentor/learner/date/time)
      const existing = await Schedule.findOne({
        learners: learner._id,
        mentor: mentor._id,
        date: scheduleDate,
        time: payload.time
      });
      if (existing) {
        return res.status(409).json({ message: 'Schedule already exists for this slot', schedule: existing, code: 409 });
      }

      // Create the schedule using arrays and sessionType
      const schedule = new Schedule({
        learners: [learner._id],
        learnerNames: [learner.name],
        mentor: mentor._id,
        mentorName: mentor.name,
        date: scheduleDate,
        time: payload.time,
        location: payload.location,
        subject: payload.subject,
        sessionType: 'one-on-one'
      });
      await schedule.save();

      // NEW: If location is 'online', create Jitsi session
      const isOnline = String(payload.location).toLowerCase().trim() === 'online' || 
                      String(payload.location).toLowerCase().includes('online');
      
      if (isOnline) {
        const Jitsi = require('../models/jitsi');
        const roomName = await Jitsi.generateRoomName(schedule._id);
        const jitsiSession = new Jitsi({
          scheduleId: schedule._id,
          roomName,
          subject: schedule.subject,
          mentorId: mentor._id,
          learnerIds: [learner._id],
          isActive: false
        });
        const domain = process.env.JITSI_DOMAIN || 'meet.jit.si';
        jitsiSession.meetingUrl = jitsiSession.buildMeetingUrl(domain);
        await jitsiSession.save();
        
        schedule.jitsiSessionId = jitsiSession._id;
        await schedule.save();
      }

      // 7) Notify mentor (best-effort)
      try {
        const mentorUser = mentor.userId ? await User.findById(mentor.userId) : null;
        const mentorEmail = mentorUser?.email || mentor.email;
        if (mentorEmail) {
          await mailingController.sendEmailNotification(
            mentorEmail,
            `Offer accepted: ${payload.subject}`,
            `Hello ${mentor.name},

${learner.name} accepted your offer.

Details:
- Subject: ${payload.subject}
- Date: ${scheduleDate.toLocaleDateString()}
- Time: ${payload.time}
- Location: ${payload.location}

Best regards,
MindMate Team`
          );
        }
      } catch (mailErr) {
        console.error('acceptOffer notify mentor error:', mailErr);
      }

      // Pusher: notify offer acceptance
      try {
        const mentorDoc = await Mentor.findById(schedule.mentor);
        const learnerDoc = await Learner.findById(schedule.learners[0]);
        const channelName = `private-user-${String(mentorDoc.userId)}`;
        const payloadData = schedulePayload(schedule, mentorDoc, learnerDoc);
        console.log('[Pusher] offer accepted -> new-schedule ->', channelName);
        await pusher.trigger(channelName, 'new-schedule', payloadData);
      } catch (emitErr) {
        console.error('Pusher emit error (learner.acceptOffer):', emitErr);
      }

      // Award badges for mentor (best-effort)
      await safeAwardMentorBadgesByUserId(mentor._id);

      return res.status(201).json({ message: 'Offer accepted. Schedule created.', schedule, code: 201 });
    }
  } catch (error) {
    console.error('acceptOffer error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

exports.getMentorLearningMaterials = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: 'Mentor id is required', code: 400 });
  }

  try {
    // Resolve mentor by either _id or userId to be flexible
    const mentor = await Mentor.findOne({ $or: [{ _id: id }, { userId: id }] });
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found', code: 404 });
    }

    // Need the username used for Drive folder naming (uploads use User.username)
    let user = null;
    if (mentor.userId) {
      user = await User.findOne({ _id: mentor.userId }).select('username');
    }

    const username = user?.username;
    if (!username) {
      return res.status(404).json({ message: 'Associated user (for mentor) not found or missing username', code: 404 });
    }

    // Delegate to upload controller helper which lists files under learning_materials/{username}
    const data = await uploadController.listDriveFilesForUser(username, 'learning_materials');

    const files = (data.files || []).map(f => ({
      id: f.id || f.fileId || null,
      file_name: f.name || f.fileName || null,
      file_id: f.id || f.fileId || null,
      webViewLink: f.webViewLink || null,
      webContentLink: f.webContentLink || null,
      size: f.size || null,
      md5Checksum: f.md5Checksum || null,
      owner_id: String(mentor._id)
    }));

    return res.status(200).json({
      folderId: data.folderId || null,
      folderPath: data.folderPath || null,
      files
    });
  } catch (error) {
    console.error('getMentorLearningMaterials error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

exports.editProfile = async (req, res) => {
  const decoded = getValuesFromToken(req);

  if (!decoded || !decoded.id) {
      return res.status(403).json({ message: 'Invalid token', code: 403 });
  }

  try {
      // Find the learner first to ensure they exist
      const existingLearner = await Learner.findOne({
          $or: [{ _id: decoded.id }, { userId: decoded.id }]
      });

      if (!existingLearner) {
          return res.status(404).json({ message: 'Learner not found', code: 404 });
      }

      // Define allowed fields (excluding image, createdAt, verified, userId, _id)
      const allowedFields = [
          'sex', 'program', 'yearLevel', 
          'phoneNumber', 'bio', 'goals', 'address', 
          'modality', 'subjects', 'availability', 'style', 'sessionDur'
      ];

      const updates = {};
      const errors = [];

      for (const field of allowedFields) {
          if (req.body[field] !== undefined) {
              const value = req.body[field];

              switch (field) {
                  case 'sex':
                      if (!['male', 'female'].includes(value)) {
                          errors.push('Sex must be either "male" or "female"');
                      } else {
                          updates.sex = value;
                      }
                      break;

                  case 'program':
                      if (!['BSIT', 'BSCS', 'BSEMC'].includes(value)) {
                          errors.push('Program must be one of: BSIT, BSCS, BSEMC');
                      } else {
                          updates.program = value;
                      }
                      break;

                  case 'yearLevel':
                      if (!['1st year', '2nd year', '3rd year', '4th year', 'graduate'].includes(value)) {
                          errors.push('Year level must be one of: 1st year, 2nd year, 3rd year, 4th year, graduate');
                      } else {
                          updates.yearLevel = value;
                      }
                      break;

                  case 'phoneNumber':
                      const phoneRegex = /^\d{11}$/;
                      if (typeof value !== 'string' || !phoneRegex.test(value)) {
                          errors.push('Phone number must be exactly 11 digits');
                      } else {
                          updates.phoneNumber = value;
                      }
                      break;

                  case 'bio':
                  case 'goals':
                  case 'address':
                      if (typeof value !== 'string' || value.trim().length === 0) {
                          errors.push(`${field.charAt(0).toUpperCase() + field.slice(1)} must be a non-empty string`);
                      } else {
                          updates[field] = value.trim();
                      }
                      break;

                  case 'modality':
                      if (!['online', 'in-person', 'hybrid'].includes(value)) {
                          errors.push('Modality must be one of: online, in-person, hybrid');
                      } else {
                          updates.modality = value;
                      }
                      break;

                  case 'subjects':
                      if (!Array.isArray(value) || value.length === 0) {
                          errors.push('Subjects must be a non-empty array');
                      } else if (!value.every(s => typeof s === 'string' && s.trim().length > 0)) {
                          errors.push('All subjects must be non-empty strings');
                      } else {
                          updates.subjects = value.map(s => s.trim());
                      }
                      break;

                  case 'availability':
                      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                      if (!Array.isArray(value) || value.length === 0) {
                          errors.push('Availability must be a non-empty array');
                      } else if (!value.every(day => validDays.includes(day))) {
                          errors.push('All availability days must be valid weekdays (monday-sunday)');
                      } else {
                          updates.availability = value;
                      }
                      break;

                  case 'style':
                      const validStyles = ['lecture-based', 'interactive-discussion', 'q-and-a-discussion', 
                                          'demonstrations', 'project-based', 'step-by-step-discussion'];
                      if (!Array.isArray(value) || value.length === 0) {
                          errors.push('Style must be a non-empty array');
                      } else if (!value.every(s => validStyles.includes(s))) {
                          errors.push('All learning styles must be valid options');
                      } else {
                          updates.style = value;
                      }
                      break;

                  case 'sessionDur':
                      if (!['1hr', '2hrs', '3hrs'].includes(value)) {
                          errors.push('Session duration must be one of: 1hr, 2hrs, 3hrs');
                      } else {
                          updates.sessionDur = value;
                      }
                      break;
              }
          }
      }

      // Return validation errors if any
      if (errors.length > 0) {
          return res.status(400).json({ 
              message: 'Validation failed', 
              errors, 
              code: 400 
          });
      }

      // Check if there are any fields to update
      if (Object.keys(updates).length === 0) {
          return res.status(400).json({ 
              message: 'No valid fields provided for update', 
              code: 400 
          });
      }

      // Perform the update
      const learner = await Learner.findOneAndUpdate(
          { $or: [{ _id: decoded.id }, { userId: decoded.id }] },
          { $set: updates },
          { new: true, runValidators: true }
      );

      if (!learner) {
          return res.status(404).json({ message: 'Learner not found', code: 404 });
      }

      return res.status(200).json({ 
          message: 'Profile updated successfully', 
          learner, 
          code: 200 
      });
  } catch (error) {
      console.error('editProfile error:', error);
      
      // Handle mongoose validation errors
      if (error.name === 'ValidationError') {
          const validationErrors = Object.values(error.errors).map(err => err.message);
          return res.status(400).json({ 
              message: 'Validation failed', 
              errors: validationErrors, 
              code: 400 
          });
      }
      
      return res.status(500).json({ message: 'Internal server error', code: 500 });
  }
}

// exports.getPresetSchedules = async (req, res) => {
//   const decoded = getValuesFromToken(req);
//   const { mentid } = req.params;
//   if (!decoded?.id) {
//     return res.status(403).json({ message: 'Invalid token', code: 403 });
//   }

//   try {
//     const learner = await Learner.findOne({
//       $or: [{ _id: decoded.id }, { userId: decoded.id }]
//     });

//     if (!learner) {
//       return res.status(404).json({ message: 'Learner not found', code: 404 });
//     }

//     const scheds = await presetSched.find({
//       mentor: mentid,
//       course: learner.program,
//       specialization: { $in: learner.specialization || [] }
//     }).lean();
    
//     return res.status(200).json({ schedules: scheds, code: 200 });
//   } catch (error) {
//     console.error('getPresetSchedules error:', error);
//     return res.status(500).json({ message: error.message, code: 500 });
//   }
// }

exports.joinPresetSchedule = async (req, res) => {
  const { presetId } = req.params;
  const decoded = getValuesFromToken(req);
  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }

  try {
    const sched = await presetSched.findOne({_id: presetId});
    if (!sched) {
      return res.status(404).json({ message: 'Preset schedule not found', code: 404 });
    }

    const learner = await Learner.findOne({
      $or: [{ _id: decoded.id }, { userId: decoded.id }]
    });
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found', code: 404 });
    }

    // Validate learner's specialization matches preset schedule's specialization
    if (!learner.specialization || !learner.specialization.includes(sched.specialization)) {
      return res.status(403).json({ 
        message: `You can only join preset schedules matching your specializations. This schedule requires: ${sched.specialization}`, 
        code: 403 
      });
    }

    // Validate learner's course matches preset schedule's course
    if (learner.program !== sched.course) {
      return res.status(403).json({ 
        message: `You can only join preset schedules matching your program. This schedule is for: ${sched.course}`, 
        code: 403 
      });
    }

    // check if learner already joined
    const alreadyJoined = Array.isArray(sched.participants) && sched.participants.some(l => String(l) === String(learner._id));
    if (alreadyJoined) {
      return res.status(409).json({ message: 'You already joined this preset schedule', schedule: sched, code: 409 });
    }

    sched.participants = sched.participants || [];
    sched.participants.push(learner._id);
    await sched.save();

    return res.status(200).json({ message: 'Successfully joined preset schedule', schedule: sched, code: 200 });

  } catch (error) {
    console.error('joinPresetSchedule error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
}

exports.quitPresetSchedule = async (req, res) => {
  const { presetId } = req.params;
  const decoded = getValuesFromToken(req);
  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }

  try {
    const sched = await presetSched.findOne({_id: presetId});
    if (!sched) {
      return res.status(404).json({ message: 'Preset schedule not found', code: 404 });
    }
    const learner = await Learner.findOne({
      $or: [{ _id: decoded.id }, { userId: decoded.id }]
    });

    if (!learner) {
      return res.status(404).json({ message: 'Learner not found', code: 404 });
    }

    // check if learner is in participants
    const index = Array.isArray(sched.participants) ? sched.participants.findIndex(l => String(l) === String(learner._id)) : -1;
    if (index === -1) {
      return res.status(409).json({ message: 'You are not part of this preset schedule', schedule: sched, code: 409 });
    }

    sched.participants.splice(index, 1);
    await sched.save();
    return res.status(200).json({ message: 'Successfully quit preset schedule', schedule: sched, code: 200 });
  } catch (error) {
    console.error('quitPresetSchedule error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
}

exports.getSubjectsBySpecializations = async (req, res) => {
  try {
    const { specializations } = req.query;
    
    if (!specializations) {
      return res.status(400).json({ message: 'Specializations parameter is required', code: 400 });
    }

    // Parse specializations (can be comma-separated string or JSON array)
    let specializationList;
    if (typeof specializations === 'string') {
      try {
        specializationList = JSON.parse(specializations);
      } catch {
        specializationList = specializations.split(',').map(s => s.trim());
      }
    } else {
      specializationList = specializations;
    }

    if (!Array.isArray(specializationList) || specializationList.length === 0) {
      return res.status(400).json({ message: 'Invalid specializations format', code: 400 });
    }

    const Subject = require('../models/Subject');
    
    // Find all subjects matching the specializations
    const subjects = await Subject.find({
      specialization: { $in: specializationList }
    }).lean();

    return res.status(200).json({ subjects });
  } catch (error) {
    console.error('getSubjectsBySpecializations error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
}