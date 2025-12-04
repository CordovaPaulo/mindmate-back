function fmtDate(d) {
  try { return new Date(d).toISOString().split('T')[0]; } catch { return d; }
}

function schedulePayload(schedule, mentor, learner) {
  return {
    id: schedule._id,
    date: fmtDate(schedule.date),
    time: schedule.time,
    location: schedule.location,
    subject: schedule.subject,
    mentor: {
      id: mentor?._id || schedule.mentor,
      name: mentor?.name || 'Unknown Mentor',
      program: mentor?.program || 'N/A',
      yearLevel: mentor?.yearLevel || 'N/A',
      image: mentor?.image || 'https://placehold.co/600x400'
    },
    learner: {
      id: learner?._id || schedule.learner,
      name: learner?.name || 'Unknown Learner',
      program: learner?.program || 'N/A',
      yearLevel: learner?.yearLevel || 'N/A',
      image: learner?.image || 'https://placehold.co/600x400'
    }
  };
}

// keep feedback payload same shape as DB docs returned by mentor.getFeedbacks
function feedbackPayload(feedback) {
  const payload = {
    _id: feedback._id,
    learner: String(feedback.learner),
    mentor: String(feedback.mentor),
    schedule: feedback.schedule ? String(feedback.schedule) : undefined,
    rating: feedback.rating,
    comments: feedback.comments,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt
  };
  
  // Include evaluation data if present
  if (feedback.evaluation) {
    payload.evaluation = {
      knowledge: feedback.evaluation.knowledge,
      pacing: feedback.evaluation.pacing,
      communication: feedback.evaluation.communication,
      engagement: feedback.evaluation.engagement,
      feedbackQuality: feedback.evaluation.feedbackQuality,
      professionalism: feedback.evaluation.professionalism,
      resources: feedback.evaluation.resources,
      accessibility: feedback.evaluation.accessibility,
      learningOutcomes: feedback.evaluation.learningOutcomes,
      whatHelped: feedback.evaluation.whatHelped,
      suggestions: feedback.evaluation.suggestions,
      categoryAverage: feedback.evaluation.categoryAverage
    };
  }
  
  return payload;
}

module.exports = { schedulePayload, feedbackPayload };