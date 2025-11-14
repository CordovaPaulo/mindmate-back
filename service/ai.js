const { GoogleGenerativeAI } = require('@google/generative-ai');
const { NlpManager } = require('node-nlp');

const {
  AI_MODEL = 'gemini-1.5-flash',
  AI_MAX_TOKENS = '1024',
  AI_TEMPERATURE = '0.7',
  GOOGLE_API_KEY,
} = process.env;

if (!GOOGLE_API_KEY) {
  console.warn('[AI] GOOGLE_API_KEY is not configured.');
}

// Initialize NLP Manager (fallback)
const nlpManager = new NlpManager({ languages: ['en'], forceNER: true });

// Train the NLP model with extensive intents
function trainFallbackNLP() {
  // ==================== SCHEDULE QUERIES ====================
  // General schedule viewing
  nlpManager.addDocument('en', 'show my schedule', 'schedule.view');
  nlpManager.addDocument('en', 'what are my upcoming sessions', 'schedule.view');
  nlpManager.addDocument('en', 'do i have any sessions', 'schedule.view');
  nlpManager.addDocument('en', 'my sessions', 'schedule.view');
  nlpManager.addDocument('en', 'upcoming classes', 'schedule.view');
  nlpManager.addDocument('en', 'what sessions do i have', 'schedule.view');
  nlpManager.addDocument('en', 'show me my classes', 'schedule.view');
  nlpManager.addDocument('en', 'list my sessions', 'schedule.view');
  nlpManager.addDocument('en', 'view schedule', 'schedule.view');
  nlpManager.addDocument('en', 'check my schedule', 'schedule.view');
  nlpManager.addDocument('en', 'when is my next session', 'schedule.view');
  nlpManager.addDocument('en', 'what do i have scheduled', 'schedule.view');

  // Today's schedule
  nlpManager.addDocument('en', 'what do i have today', 'schedule.today');
  nlpManager.addDocument('en', 'today\'s schedule', 'schedule.today');
  nlpManager.addDocument('en', 'sessions today', 'schedule.today');
  nlpManager.addDocument('en', 'do i have class today', 'schedule.today');
  nlpManager.addDocument('en', 'what are my classes today', 'schedule.today');
  nlpManager.addDocument('en', 'show today', 'schedule.today');

  // Tomorrow's schedule
  nlpManager.addDocument('en', 'what do i have tomorrow', 'schedule.tomorrow');
  nlpManager.addDocument('en', 'tomorrow\'s schedule', 'schedule.tomorrow');
  nlpManager.addDocument('en', 'sessions tomorrow', 'schedule.tomorrow');
  nlpManager.addDocument('en', 'do i have class tomorrow', 'schedule.tomorrow');
  nlpManager.addDocument('en', 'what are my classes tomorrow', 'schedule.tomorrow');

  // This week's schedule
  nlpManager.addDocument('en', 'what do i have this week', 'schedule.week');
  nlpManager.addDocument('en', 'this week\'s schedule', 'schedule.week');
  nlpManager.addDocument('en', 'sessions this week', 'schedule.week');
  nlpManager.addDocument('en', 'show me this week', 'schedule.week');
  nlpManager.addDocument('en', 'weekly schedule', 'schedule.week');
  nlpManager.addDocument('en', 'what\'s scheduled for this week', 'schedule.week');

  // Next week's schedule
  nlpManager.addDocument('en', 'what do i have next week', 'schedule.nextweek');
  nlpManager.addDocument('en', 'next week\'s schedule', 'schedule.nextweek');
  nlpManager.addDocument('en', 'sessions next week', 'schedule.nextweek');
  nlpManager.addDocument('en', 'show me next week', 'schedule.nextweek');

  // ==================== MOTIVATION ====================
  nlpManager.addDocument('en', 'motivate me', 'motivation.request');
  nlpManager.addDocument('en', 'i need motivation', 'motivation.request');
  nlpManager.addDocument('en', 'encourage me', 'motivation.request');
  nlpManager.addDocument('en', 'give me motivation', 'motivation.request');
  nlpManager.addDocument('en', 'i feel down', 'motivation.request');
  nlpManager.addDocument('en', 'i need encouragement', 'motivation.request');
  nlpManager.addDocument('en', 'boost my morale', 'motivation.request');
  nlpManager.addDocument('en', 'cheer me up', 'motivation.request');
  nlpManager.addDocument('en', 'inspire me', 'motivation.request');
  nlpManager.addDocument('en', 'i\'m feeling unmotivated', 'motivation.request');
  nlpManager.addDocument('en', 'pump me up', 'motivation.request');

  // ==================== SUMMARY ====================
  nlpManager.addDocument('en', 'summarize this', 'summary.request');
  nlpManager.addDocument('en', 'can you summarize', 'summary.request');
  nlpManager.addDocument('en', 'make a summary', 'summary.request');
  nlpManager.addDocument('en', 'give me a summary', 'summary.request');
  nlpManager.addDocument('en', 'tldr', 'summary.request');
  nlpManager.addDocument('en', 'condense this', 'summary.request');
  nlpManager.addDocument('en', 'shorten this text', 'summary.request');
  nlpManager.addDocument('en', 'brief summary', 'summary.request');
  nlpManager.addDocument('en', 'quick summary', 'summary.request');

  // ==================== PLATFORM HELP ====================
  nlpManager.addDocument('en', 'how does this work', 'help.platform');
  nlpManager.addDocument('en', 'what is mindmate', 'help.platform');
  nlpManager.addDocument('en', 'how do i use this', 'help.platform');
  nlpManager.addDocument('en', 'help', 'help.platform');
  nlpManager.addDocument('en', 'what can you do', 'help.platform');
  nlpManager.addDocument('en', 'explain mindmate', 'help.platform');
  nlpManager.addDocument('en', 'how does mindmate work', 'help.platform');
  nlpManager.addDocument('en', 'what features do you have', 'help.platform');
  nlpManager.addDocument('en', 'tell me about mindmate', 'help.platform');
  nlpManager.addDocument('en', 'what is this platform', 'help.platform');

  // How to schedule
  nlpManager.addDocument('en', 'how do i schedule a session', 'help.schedule');
  nlpManager.addDocument('en', 'how to book a tutor', 'help.schedule');
  nlpManager.addDocument('en', 'how do i book a session', 'help.schedule');
  nlpManager.addDocument('en', 'schedule a meeting', 'help.schedule');
  nlpManager.addDocument('en', 'how to schedule', 'help.schedule');
  nlpManager.addDocument('en', 'book a session', 'help.schedule');

  // Finding mentors
  nlpManager.addDocument('en', 'how do i find a mentor', 'help.mentor');
  nlpManager.addDocument('en', 'find a tutor', 'help.mentor');
  nlpManager.addDocument('en', 'get a mentor', 'help.mentor');
  nlpManager.addDocument('en', 'search for mentors', 'help.mentor');
  nlpManager.addDocument('en', 'how to find tutors', 'help.mentor');

  // Study tips
  nlpManager.addDocument('en', 'how can i study better', 'help.study');
  nlpManager.addDocument('en', 'study tips', 'help.study');
  nlpManager.addDocument('en', 'how to study effectively', 'help.study');
  nlpManager.addDocument('en', 'improve my studying', 'help.study');
  nlpManager.addDocument('en', 'study advice', 'help.study');

  // Greeting
  nlpManager.addDocument('en', 'hello', 'greeting');
  nlpManager.addDocument('en', 'hi', 'greeting');
  nlpManager.addDocument('en', 'hey', 'greeting');
  nlpManager.addDocument('en', 'good morning', 'greeting');
  nlpManager.addDocument('en', 'good afternoon', 'greeting');
  nlpManager.addDocument('en', 'good evening', 'greeting');

  // Gratitude
  nlpManager.addDocument('en', 'thank you', 'gratitude');
  nlpManager.addDocument('en', 'thanks', 'gratitude');
  nlpManager.addDocument('en', 'appreciate it', 'gratitude');
  nlpManager.addDocument('en', 'thanks a lot', 'gratitude');

  // ==================== RESPONSES ====================
  
  // Schedule responses
  nlpManager.addAnswer('en', 'schedule.view', 'Here are all your upcoming sessions:\n{{context}}');
  nlpManager.addAnswer('en', 'schedule.today', 'Here are your sessions for today:\n{{context}}');
  nlpManager.addAnswer('en', 'schedule.tomorrow', 'Here are your sessions for tomorrow:\n{{context}}');
  nlpManager.addAnswer('en', 'schedule.week', 'Here are your sessions for this week:\n{{context}}');
  nlpManager.addAnswer('en', 'schedule.nextweek', 'Here are your sessions for next week:\n{{context}}');
  
  // Motivation responses
  nlpManager.addAnswer('en', 'motivation.request', '🌟 You\'ve got this! Every small step forward is progress. Keep pushing!');
  nlpManager.addAnswer('en', 'motivation.request', '💪 Keep going! Your dedication will pay off. Believe in your journey!');
  nlpManager.addAnswer('en', 'motivation.request', '✨ Believe in yourself - you\'re capable of amazing things! Don\'t give up!');
  nlpManager.addAnswer('en', 'motivation.request', '🎯 Focus on progress, not perfection. You\'re doing great! Stay consistent!');
  nlpManager.addAnswer('en', 'motivation.request', '🚀 Your hard work today is building your future tomorrow. Keep it up!');
  nlpManager.addAnswer('en', 'motivation.request', '💡 Every expert was once a beginner. You\'re on the right path!');
  nlpManager.addAnswer('en', 'motivation.request', '🌱 Growth happens outside your comfort zone. You\'re growing right now!');
  
  // Summary response
  nlpManager.addAnswer('en', 'summary.request', 'I\'d be happy to summarize text for you! Please provide the lesson or article text you\'d like me to condense into key points.');
  
  // Help responses
  nlpManager.addAnswer('en', 'help.platform', 'MindMate is your peer tutoring platform! You can:\n• Schedule 1-on-1 or group sessions with mentors\n• Join study groups\n• Get AI study assistance\n• Track your progress\n\nWhat would you like to know more about?');
  
  nlpManager.addAnswer('en', 'help.schedule', 'To schedule a session:\n1. Browse available mentors in your subject area\n2. Check their availability calendar\n3. Click "Book Session" and select a time slot\n4. Confirm your booking\n\nYou\'ll receive a confirmation email with session details!');
  
  nlpManager.addAnswer('en', 'help.mentor', 'To find a mentor:\n1. Go to "Find a Mentor" in the main menu\n2. Filter by subject, availability, or rating\n3. View mentor profiles and reviews\n4. Select a mentor and book your session\n\nYou can also search for specific topics or skills!');
  
  nlpManager.addAnswer('en', 'help.study', 'Here are some effective study tips:\n• Use spaced repetition for better retention\n• Take regular breaks (Pomodoro technique)\n• Teach concepts to others to reinforce learning\n• Practice active recall instead of passive reading\n• Join study groups for collaborative learning\n\nWould you like tips on a specific subject?');
  
  // Greeting response
  nlpManager.addAnswer('en', 'greeting', 'Hello! I\'m MindMate AI Assistant. How can I help you with your studies today?');
  
  // Gratitude response
  nlpManager.addAnswer('en', 'gratitude', 'You\'re welcome! Happy to help. Feel free to ask if you need anything else!');

  nlpManager.train();
  console.log('[AI] Fallback NLP trained successfully with enhanced intents');
}

// Train on startup
trainFallbackNLP();

function getModel() {
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY || '');
  return genAI.getGenerativeModel({
    model: AI_MODEL,
    generationConfig: {
      maxOutputTokens: Number(AI_MAX_TOKENS),
      temperature: Number(AI_TEMPERATURE),
    },
  });
}

/**
 * Extract date range from user query
 */
function extractDateRange(intent, userQuery) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  switch (intent) {
    case 'schedule.today': {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      return { start: now, end: endOfDay };
    }
    
    case 'schedule.tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);
      return { start: tomorrow, end: endOfTomorrow };
    }
    
    case 'schedule.week': {
      // This week (from today to Sunday)
      const endOfWeek = new Date(now);
      const daysUntilSunday = 7 - endOfWeek.getDay();
      endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
      endOfWeek.setHours(23, 59, 59, 999);
      return { start: now, end: endOfWeek };
    }
    
    case 'schedule.nextweek': {
      // Next week (Monday to Sunday of next week)
      const nextMonday = new Date(now);
      const daysUntilNextMonday = (8 - nextMonday.getDay()) % 7 || 7;
      nextMonday.setDate(nextMonday.getDate() + daysUntilNextMonday);
      
      const nextSunday = new Date(nextMonday);
      nextSunday.setDate(nextSunday.getDate() + 6);
      nextSunday.setHours(23, 59, 59, 999);
      
      return { start: nextMonday, end: nextSunday };
    }
    
    default:
      // No date filter - return all upcoming
      return null;
  }
}

/**
 * Fallback NLP processing
 */
async function generateWithFallback({ user, context, intent }) {
  const response = await nlpManager.process('en', user);
  
  if (response.intent !== 'None' && response.score > 0.5) {
    let answer = response.answer || response.answers?.[0] || '';
    
    // Inject context for schedule queries
    if (response.intent.startsWith('schedule.') && context) {
      if (context.includes('No upcoming sessions')) {
        answer = context;
      } else {
        answer = answer.replace('{{context}}', context);
      }
    }
    
    // Return intent for date filtering
    return { answer, intent: response.intent };
  }

  // Generic fallback if no intent matched
  return {
    answer: 'I\'m currently running in limited mode. I can help with:\n' +
           '• Viewing your schedule ("show my schedule", "what\'s today", "this week")\n' +
           '• Study motivation ("motivate me")\n' +
           '• Text summarization ("summarize this")\n' +
           '• Platform guidance ("how does this work")\n' +
           '• Study tips ("how can I study better")\n\n' +
           'What would you like to know?',
    intent: 'None'
  };
}

/**
 * Generate an AI response with automatic fallback
 */
async function generateAIResponse({ system, user, context, intent }) {
  try {
    console.log('[AI] Attempting Gemini...');
    const model = getModel();

    const parts = [
      { text: (system || '') + '\n\n' },
      context ? { text: `Context:\n${context}\n\n` } : null,
      { text: `User:\n${user}\n\nAssistant:` },
    ].filter(Boolean);

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const text = result?.response?.text?.() || '';
    console.log('[AI] Success with Gemini');
    return { answer: text.trim(), intent: intent || 'gemini' };
  } catch (error) {
    console.warn('[AI] Gemini failed, using NLP fallback:', error.status || error.message);
    
    try {
      const fallbackResult = await generateWithFallback({ user, context, intent });
      console.log('[AI] Success with NLP fallback');
      return fallbackResult;
    } catch (fallbackError) {
      console.error('[AI] Fallback failed:', fallbackError.message);
      return {
        answer: 'I\'m having trouble right now. Please try again in a moment.',
        intent: 'error'
      };
    }
  }
}

module.exports = { generateAIResponse, extractDateRange };