const Jitsi = require('../models/jitsi');
const Schedule = require('../models/Schedule');
const Mentor = require('../models/Mentor');
const Learner = require('../models/Learner');
const { getValuesFromToken } = require('../service/jwt');

// Configuration - using free meet.jit.si (no JWT)
const JITSI_DOMAIN = process.env.JITSI_DOMAIN || 'meet.jit.si';

// Helper: check if location indicates online session
function isOnlineSession(location) {
  if (!location) return false;
  const loc = String(location).toLowerCase().trim();
  return loc === 'online' || loc.includes('online');
}

// Helper: check if user can join this session
async function canUserJoinSession(scheduleId, userId) {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) return { allowed: false, reason: 'Schedule not found' };
  
  if (!isOnlineSession(schedule.location)) {
    return { allowed: false, reason: 'Schedule is not an online session' };
  }
  
  const mentor = await Mentor.findOne({ 
    $or: [{ _id: userId }, { userId: userId }] 
  });
  if (mentor) {
    const isMentor = String(schedule.mentor) === String(mentor._id) || 
                     String(schedule.mentor) === String(mentor.userId);
    if (isMentor) {
      return { allowed: true, role: 'mentor', mentor, schedule };
    }
  }
  
  const learner = await Learner.findOne({ 
    $or: [{ _id: userId }, { userId: userId }] 
  });
  if (learner) {
    const isParticipant = Array.isArray(schedule.learners) && schedule.learners.some(
      l => String(l) === String(learner._id) || String(l) === String(learner.userId)
    );
    if (isParticipant) {
      return { allowed: true, role: 'learner', learner, schedule };
    }
  }
  
  return { allowed: false, reason: 'Not authorized for this session' };
}

// GET /api/jitsi/session/:scheduleId - Get or create Jitsi session
exports.getOrCreateSession = async (req, res) => {
  const { scheduleId } = req.params;
  const decoded = getValuesFromToken(req);
  
  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  
  try {
    const authCheck = await canUserJoinSession(scheduleId, decoded.id);
    if (!authCheck.allowed) {
      return res.status(403).json({ 
        message: authCheck.reason || 'Not authorized', 
        code: 403 
      });
    }
    
    const { schedule, role, mentor, learner } = authCheck;
    
    if (!isOnlineSession(schedule.location)) {
      return res.status(400).json({ 
        message: `Session modality is ${schedule.location}. Jitsi only available for online sessions.`, 
        code: 400 
      });
    }
    
    // Check if session time is valid (within ±15min window)
    const now = new Date();
    const sessionDateTime = new Date(schedule.date);
    const [hours, minutes] = schedule.time.split(':');
    sessionDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    const timeDiff = Math.abs(now - sessionDateTime) / 60000;
    if (timeDiff > 15) {
      return res.status(403).json({ 
        message: 'Session not active yet. Join within 15 minutes of scheduled time.', 
        scheduledTime: sessionDateTime.toISOString(),
        currentTime: now.toISOString(),
        code: 403 
      });
    }
    
    let jitsiSession = await Jitsi.findOne({ scheduleId: schedule._id });
    
    if (!jitsiSession) {
      const roomName = await Jitsi.generateRoomName(schedule._id);
      jitsiSession = new Jitsi({
        scheduleId: schedule._id,
        roomName,
        subject: schedule.subject,
        mentorId: schedule.mentor,
        learnerIds: schedule.learners,
        isActive: false
      });
      
      jitsiSession.meetingUrl = jitsiSession.buildMeetingUrl(JITSI_DOMAIN);
      await jitsiSession.save();
      
      schedule.jitsiSessionId = jitsiSession._id;
      await schedule.save();
    }
    
    if (!jitsiSession.isActive) {
      jitsiSession.isActive = true;
      jitsiSession.startedAt = new Date();
      await jitsiSession.save();
    }
    
    const userName = role === 'mentor' 
      ? (mentor?.name || 'Mentor') 
      : (learner?.name || 'Learner');
    
    const isModerator = role === 'mentor';
    
    // Return session details WITHOUT JWT
    return res.status(200).json({
      jitsiSession: {
        id: jitsiSession._id,
        roomName: jitsiSession.roomName,
        meetingUrl: jitsiSession.meetingUrl,
        subject: jitsiSession.subject,
        isActive: jitsiSession.isActive,
        startedAt: jitsiSession.startedAt,
        jwt: null // NO JWT for free meet.jit.si
      },
      schedule: {
        id: schedule._id,
        date: schedule.date,
        time: schedule.time,
        subject: schedule.subject,
        location: schedule.location,
        sessionType: schedule.sessionType
      },
      userRole: role,
      userName,
      isModerator,
      mentorJoinedFirst: jitsiSession.startedAt && role === 'mentor', // Track if mentor joined first
      code: 200
    });
    
  } catch (error) {
    console.error('getOrCreateSession error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

// POST /api/jitsi/session/:scheduleId/end - End Jitsi session
exports.endSession = async (req, res) => {
  const { scheduleId } = req.params;
  const decoded = getValuesFromToken(req);
  
  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  
  try {
    const authCheck = await canUserJoinSession(scheduleId, decoded.id);
    if (!authCheck.allowed) {
      return res.status(403).json({ 
        message: authCheck.reason || 'Not authorized', 
        code: 403 
      });
    }
    
    const jitsiSession = await Jitsi.findOne({ scheduleId });
    if (!jitsiSession) {
      return res.status(404).json({ message: 'Jitsi session not found', code: 404 });
    }
    
    jitsiSession.isActive = false;
    jitsiSession.endedAt = new Date();
    await jitsiSession.save();
    
    return res.status(200).json({ 
      message: 'Session ended', 
      jitsiSession,
      code: 200 
    });
    
  } catch (error) {
    console.error('endSession error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

// GET /api/jitsi/history - Get user's past Jitsi sessions
exports.getSessionHistory = async (req, res) => {
  const decoded = getValuesFromToken(req);
  
  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  
  try {
    const mentor = await Mentor.findOne({ 
      $or: [{ _id: decoded.id }, { userId: decoded.id }] 
    });
    const learner = await Learner.findOne({ 
      $or: [{ _id: decoded.id }, { userId: decoded.id }] 
    });
    
    let query = {};
    if (mentor) {
      query.mentorId = mentor._id;
    } else if (learner) {
      query.learnerIds = learner._id;
    } else {
      return res.status(404).json({ message: 'User not found', code: 404 });
    }
    
    const sessions = await Jitsi.find(query)
      .populate('scheduleId')
      .sort({ createdAt: -1 })
      .limit(50);
    
    return res.status(200).json({ sessions, code: 200 });
    
  } catch (error) {
    console.error('getSessionHistory error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

module.exports = exports;