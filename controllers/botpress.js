const { getValuesFromToken } = require('../service/jwt');
const Schedule = require('../models/Schedule');
const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');
const { generateAIResponse } = require('../service/ai');

/**
 * Helper function to get upcoming schedules for a user
 */
async function getUpcomingSchedulesForUser(userId, dateRange = null) {
    const now = new Date();
    let query = {
        $or: [
            { learnerId: userId },
            { mentorId: userId }
        ],
        date: { $gte: now }
    };

    if (dateRange) {
        query.date = {
            $gte: dateRange.start,
            $lte: dateRange.end
        };
    }

    const schedules = await Schedule.find(query)
        .sort({ date: 1, time: 1 })
        .limit(10)
        .lean();

    return schedules;
}

/**
 * Format schedules for Botpress response
 */
function formatSchedulesForBotpress(schedules, userId) {
    if (!schedules || schedules.length === 0) {
        return 'You have no upcoming sessions scheduled.';
    }

    const formattedEntries = schedules.map((s, i) => {
        const dateStr = new Date(s.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });

        const isLearner = s.learnerId && s.learnerId.toString() === userId.toString();
        
        let entry = `${i + 1}. **${s.subject}** on ${dateStr} at ${s.time}`;
        
        if (s.sessionType === 'group') {
            entry += ` (Group Session)`;
        } else {
            if (isLearner && s.mentorName) {
                entry += ` with ${s.mentorName}`;
            } else if (!isLearner && s.learnerName) {
                entry += ` with ${s.learnerName}`;
            }
        }
        
        return entry;
    });

    return `Here are your upcoming sessions:\n\n${formattedEntries.join('\n')}`;
}

/**
 * Endpoint: Get user's schedule
 * Called by Botpress workflow
 */
exports.getSchedule = async (req, res) => {
    try {
        console.log('[Botpress] ===== Schedule Request Started =====');
        console.log('[Botpress] Headers:', JSON.stringify(req.headers, null, 2));
        console.log('[Botpress] Body:', JSON.stringify(req.body, null, 2));
        
        const decoded = getValuesFromToken(req);
        if (!decoded) {
            console.error('[Botpress] Authentication failed - no valid token');
            return res.status(401).json({ 
                error: 'Unauthorized',
                scheduleText: '⚠️ Authentication failed. Please log in again.'
            });
        }

        const userId = decoded.id;
        const { message } = req.body;

        console.log('[Botpress] Schedule request from user:', userId);
        console.log('[Botpress] User message:', message);

        // Fetch upcoming schedules
        const schedules = await getUpcomingSchedulesForUser(userId);
        console.log('[Botpress] Found schedules:', schedules.length);
        
        // Format the response
        const scheduleText = formatSchedulesForBotpress(schedules, userId);
        console.log('[Botpress] Formatted response length:', scheduleText.length);

        // Return in format Botpress expects
        const response = {
            scheduleText: scheduleText,
            count: schedules.length
        };
        
        console.log('[Botpress] Sending response:', JSON.stringify(response, null, 2));
        console.log('[Botpress] ===== Schedule Request Completed =====');
        
        return res.status(200).json(response);

    } catch (error) {
        console.error('[Botpress] ===== Schedule Request Failed =====');
        console.error('[Botpress] Error:', error);
        console.error('[Botpress] Error stack:', error.stack);
        
        return res.status(500).json({ 
            error: 'Failed to fetch schedule',
            scheduleText: 'Sorry, I couldn\'t fetch your schedule at this time. Please try again later.',
            details: error.message
        });
    }
};

/**
 * Endpoint: Summarize text
 * Called by Botpress workflow
 */
exports.summarizeText = async (req, res) => {
    try {
        console.log('[Botpress] ===== Summarize Request Started =====');
        console.log('[Botpress] Headers:', JSON.stringify(req.headers, null, 2));
        console.log('[Botpress] Body:', JSON.stringify(req.body, null, 2));
        
        const decoded = getValuesFromToken(req);
        if (!decoded) {
            console.error('[Botpress] Authentication failed - no valid token');
            return res.status(401).json({ 
                error: 'Unauthorized',
                summary: '⚠️ Authentication failed. Please log in again.'
            });
        }

        const { text } = req.body;

        if (!text || text.trim().length === 0) {
            console.warn('[Botpress] No text provided in request');
            return res.status(400).json({ 
                error: 'No text provided',
                summary: 'Please provide text to summarize.'
            });
        }

        console.log('[Botpress] Summarization request, text length:', text.length);

        // Use existing AI service to generate summary
        const systemInstruction = 
            'You are MindMate AI Assistant. Summarize the provided text concisely for quick review. ' +
            'Keep it brief and highlight the main points. Use bullet points if appropriate.';

        const context = 'Task: Summarize the user-provided lesson text concisely for quick review.';

        const result = await generateAIResponse({
            system: systemInstruction,
            user: text,
            context
        });

        const summary = result.answer || 'Sorry, I couldn\'t generate a summary.';
        console.log('[Botpress] Summary generated, length:', summary.length);

        const response = {
            summary: summary
        };
        
        console.log('[Botpress] ===== Summarize Request Completed =====');
        return res.status(200).json(response);

    } catch (error) {
        console.error('[Botpress] ===== Summarize Request Failed =====');
        console.error('[Botpress] Error:', error);
        console.error('[Botpress] Error stack:', error.stack);
        
        const statusCode = error.status || 500;
        return res.status(statusCode).json({ 
            error: statusCode === 429 ? 'AI service quota exceeded. Please try again later.' : 'Failed to summarize',
            summary: 'Sorry, I couldn\'t summarize that text. Please try again later.',
            details: error.message
        });
    }
};

/**
 * Health check endpoint
 */
exports.healthCheck = async (req, res) => {
    return res.json({ 
        status: 'ok',
        service: 'botpress-api',
        timestamp: new Date().toISOString()
    });
};
