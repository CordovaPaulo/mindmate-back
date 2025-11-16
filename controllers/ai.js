const mongoose = require('mongoose');
const { generateAIResponse } = require('../service/ai');
const Schedule = require('../models/Schedule');
const { getValuesFromToken } = require('../service/jwt'); 
const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');

async function chatAssist(req, res) {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = decoded.id;
    const mode = 'assist';

    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'message is required' });
        }

        const systemInstruction =
            'You are MindMate AI Study Assistant. Be concise, friendly, and helpful. ' +
            'Capabilities: (1) brief Q&A about platform usage, (2) answer study questions to the best of your ability. ' +
            'Avoid making up data. If uncertain, ask a clarifying question.';

        const context = 
            'You are MindMate\'s AI Study Assistant. Answer questions about the platform and general study help briefly.';

        const result = await generateAIResponse({ 
          system: systemInstruction,
          user: message,
          context
        });

        const reply = typeof result === 'string' ? result : result?.answer || 'Sorry, I had trouble responding.';
        return res.json({ reply, mode });
    } catch (error) {
        console.error('[AI] chatAssist error:', error);
        const statusCode = error.status || 500;
        return res.status(statusCode).json({ 
            error: statusCode === 429 ? 'AI service quota exceeded. Please try again later.' : 'Internal Server Error'
        });
    }
}

async function chatSummarize(req, res) {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = decoded.id;
    const mode = 'summary';
    
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'message is required for summarization' });
        }

        const systemInstruction =
            'You are MindMate AI Study Assistant. Be concise, friendly, and helpful. ' +
            'Your task is to summarize lesson text concisely for quick review. ' +
            'Avoid making up data. If uncertain, ask a clarifying question.';

        const context = 'Task: Summarize the user-provided lesson text concisely for quick review.';

        const result = await generateAIResponse({ 
          system: systemInstruction,
          user: message,
          context
        });

        const reply = typeof result === 'string' ? result : result?.answer || 'Sorry, I had trouble responding.';
        return res.json({ reply, mode });
    } catch (error) {
        console.error('[AI] chatSummarize error:', error);
        const statusCode = error.status || 500;
        return res.status(statusCode).json({ 
            error: statusCode === 429 ? 'AI service quota exceeded. Please try again later.' : 'Internal Server Error'
        });
    }
}

async function getUpcomingSchedulesForUser(userId, dateRange = null) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return [];

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  try {
    // Find if user is a learner or mentor (or both)
    const learner = await Learner.findOne({
      $or: [{ _id: userId }, { userId: userId }]
    });
    
    const mentor = await Mentor.findOne({
      $or: [{ _id: userId }, { userId: userId }]
    });

    if (!learner && !mentor) {
      console.warn('[AI] User not found as learner or mentor:', userId);
      return [];
    }

    // Build participation filter based on user role
    let participationFilter = {};
    
    if (learner && mentor) {
      // User is both learner and mentor
      participationFilter = {
        $or: [
          { learners: { $in: [learner._id, learner.userId].filter(Boolean) } },
          { mentor: mentor._id },
          { mentor: mentor.userId }
        ]
      };
    } else if (learner) {
      // User is only a learner
      participationFilter = {
        learners: { $in: [learner._id, learner.userId].filter(Boolean) }
      };
    } else if (mentor) {
      // User is only a mentor
      participationFilter = {
        $or: [
          { mentor: mentor._id },
          { mentor: mentor.userId }
        ]
      };
    }

    // Build time filter
    let timeFilter = {};
    if (dateRange) {
      // Specific date range requested
      timeFilter = {
        date: { $gte: dateRange.start, $lte: dateRange.end }
      };
    } else {
      // All upcoming (no specific range)
      timeFilter = {
        date: { $gte: now }
      };
    }

    // Fetch schedules
    const schedules = await Schedule.find({
      ...participationFilter,
      ...timeFilter
    })
      .sort({ date: 1, time: 1 })
      .limit(dateRange ? 50 : 20)
      .lean();

    console.log(`[AI] Found ${schedules.length} schedules for user ${userId}`);

    // Transform to readable format
    const upcoming = [];
    
    for (const s of schedules) {
      const schedDate = new Date(s.date);
      schedDate.setHours(0, 0, 0, 0);

      // Skip if in the past (additional safety check)
      if (!dateRange && schedDate < now) continue;

      // Resolve mentor details
      let mentorDetails = null;
      if (s.mentor) {
        mentorDetails = await Mentor.findOne({
          $or: [{ _id: s.mentor }, { userId: s.mentor }]
        }).select('name program yearLevel').lean();
      }

      // Resolve learner details (first learner for display)
      let learnerDetails = null;
      if (Array.isArray(s.learners) && s.learners.length > 0) {
        learnerDetails = await Learner.findOne({
          $or: [{ _id: s.learners[0] }, { userId: s.learners[0] }]
        }).select('name program yearLevel').lean();
      }

      // Build human-readable schedule entry
      const scheduleEntry = {
        id: String(s._id),
        title: s.subject || 'Tutoring Session',
        subject: s.subject,
        date: schedDate.toISOString().split('T')[0],
        time: s.time,
        startTime: `${schedDate.toISOString().split('T')[0]} ${s.time}`,
        location: s.location,
        sessionType: s.sessionType || 'one-on-one',
        
        // Mentor info
        mentorName: s.mentorName || mentorDetails?.name || 'Unknown Mentor',
        mentorProgram: mentorDetails?.program,
        mentorYear: mentorDetails?.yearLevel,
        
        // Learner info (for one-on-one or first learner in group)
        learnerName: (Array.isArray(s.learnerNames) && s.learnerNames.length > 0) 
          ? s.learnerNames[0] 
          : learnerDetails?.name || 'Unknown Learner',
        learnerProgram: learnerDetails?.program,
        learnerYear: learnerDetails?.yearLevel,
        
        // Group session info
        ...(s.sessionType === 'group' && {
          groupName: s.groupName,
          participantCount: Array.isArray(s.learners) ? s.learners.length : 0,
          maxParticipants: s.maxParticipants,
          allLearnerNames: s.learnerNames || []
        })
      };

      upcoming.push(scheduleEntry);
    }

    return upcoming;
  } catch (error) {
    console.error('[AI] Error fetching schedules:', error);
    return [];
  }
}

async function chatSchedule(req, res) {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = decoded.id;
    const mode = 'schedule';
    
    try {
        const { message } = req.body;

        // Detect intent to extract date range using node-nlp
        let dateRange = null;
        let detectedIntent = 'schedule.view';
        
        try {
            const { NlpManager } = require('node-nlp');
            const tempNlp = new NlpManager({ languages: ['en'] });
            const response = await tempNlp.process('en', message || 'show schedule');
            if (response.intent && response.intent.startsWith('schedule.')) {
                detectedIntent = response.intent;
                const { extractDateRange } = require('../service/ai');
                dateRange = extractDateRange(response.intent, message);
            }
        } catch (nlpErr) {
            console.warn('[AI] NLP intent detection failed, using default:', nlpErr.message);
        }
        
        // Fetch user's upcoming schedules with optional date filter
        const list = await getUpcomingSchedulesForUser(userId, dateRange);
        
        let context = '';
        if (!list.length) {
            context = dateRange 
                ? 'No sessions found for the requested time period.'
                : 'No upcoming sessions found.';
        } else {
            // Determine user role for proper context formatting
            const learnerDoc = await Learner.findOne({
                $or: [{ _id: userId }, { userId: userId }]
            });
            
            const mentorDoc = await Mentor.findOne({
                $or: [{ _id: userId }, { userId: userId }]
            });

            const isLearner = !!learnerDoc;
            const isMentor = !!mentorDoc;
            
            // Format schedules in a readable way
            const formattedEntries = list.map((s, i) => {
                const dateStr = new Date(s.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
                
                let entry = `${i + 1}. ${s.subject}`;
                entry += `\n   📅 ${dateStr} at ${s.time}`;
                entry += `\n   📍 ${s.location}`;
                
                if (s.sessionType === 'group') {
                    entry += `\n   👥 Group session: ${s.groupName || 'Unnamed group'}`;
                    entry += ` (${s.participantCount}${s.maxParticipants ? `/${s.maxParticipants}` : ''} participants)`;
                    
                    // Show mentor or first participant depending on role
                    if (isLearner) {
                        entry += `\n   👤 Mentor: ${s.mentorName}`;
                    } else {
                        entry += `\n   👥 Participants: ${s.allLearnerNames?.slice(0, 3).join(', ')}${s.participantCount > 3 ? '...' : ''}`;
                    }
                } else {
                    // One-on-one session
                    if (isLearner && !isMentor) {
                        // Pure learner: show mentor
                        entry += `\n   👤 Mentor: ${s.mentorName}`;
                    } else if (isMentor && !isLearner) {
                        // Pure mentor: show learner
                        entry += `\n   👤 Learner: ${s.learnerName}`;
                    } else {
                        // Both roles: show both
                        entry += `\n   👤 Mentor: ${s.mentorName}`;
                        entry += `\n   👤 Learner: ${s.learnerName}`;
                    }
                }
                
                return entry;
            });
            
            context = formattedEntries.join('\n\n');
        }

        const systemInstruction =
            'You are MindMate AI Study Assistant. Be concise, friendly, and helpful. ' +
            'Your task is to help users with their schedule information. ' +
            'Present the schedule details clearly as provided in the context. ' +
            'If asked about specific dates, mention them naturally in your response. ' +
            'Avoid making up data. If uncertain, ask a clarifying question.';

        const prompt = message || 'Show me my upcoming sessions.';

        const result = await generateAIResponse({ 
            system: systemInstruction,
            user: prompt,
            context,
            intent: detectedIntent
        });

        return res.json({ reply: result.answer, mode });
    } catch (error) {
        console.error('[AI] chatSchedule error:', error);
        const statusCode = error.status || 500;
        return res.status(statusCode).json({ 
            error: statusCode === 429 ? 'AI service quota exceeded. Please try again later.' : 'Internal Server Error'
        });
    }
}

async function chatMotivate(req, res) {
    const decoded = getValuesFromToken(req);
    if (!decoded) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = decoded.id;
    const mode = 'motivation';
    
    try {
        const systemInstruction =
            'You are MindMate AI Study Assistant. Be concise, friendly, and helpful. ' +
            'Your task is to provide motivational support for students. ' +
            'Keep messages positive, specific, and encouraging.';

        const context = 'Task: Provide a short, positive, specific motivational message for studying.';
        
        const prompt = 'Please send a short motivational note.';

        const result = await generateAIResponse({ 
          system: systemInstruction,
          user: prompt,
          context
        });

        const reply = typeof result === 'string' ? result : result?.answer || 'Sorry, I had trouble responding.';
        return res.json({ reply, mode });
    } catch (error) {
        console.error('[AI] chatMotivate error:', error);
        const statusCode = error.status || 500;
        return res.status(statusCode).json({ 
            error: statusCode === 429 ? 'AI service quota exceeded. Please try again later.' : 'Internal Server Error'
        });
    }
}

exports.chat = async function chat(req, res) {
    const { mode } = req.body || {};
    switch (mode) {
      case 'assist':
        return chatAssist(req, res);
      case 'summary':
        return chatSummarize(req, res);
      case 'schedule':
        return chatSchedule(req, res);
      case 'motivation':
        return chatMotivate(req, res);
      default:
        return res.status(400).json({ error: 'Invalid mode' });
    }
}