const mailing = require('../service/mailing');
const User = require('../models/user');
const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');
const Schedule = require('../models/Schedule');

// helpers: resolve by _id or userId
async function findLearnerByAny(id) {
  let learner = await Learner.findById(id);
  if (!learner) learner = await Learner.findOne({ userId: id });
  return learner;
}
async function findMentorByAny(id) {
  let mentor = await Mentor.findById(id);
  if (!mentor) mentor = await Mentor.findOne({ userId: id });
  return mentor;
}
async function findUserEmailById(id) {
  const user = await User.findById(id);
  return user?.email || null;
}

exports.sendEmailNotification = async (to, subject, text, html = undefined) => {
  const startTime = Date.now();
  let timeoutId; // Track timeout
  
  try {
    // console.log(`[MAILING] Starting email notification process...`);
    // console.log(`[MAILING] To: ${to}`);
    // console.log(`[MAILING] Subject: ${subject}`);

    if (!to) {
      throw new Error('Recipient email address is required');
    }

    const from = process.env.BREVO_FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
    if (!from) {
      throw new Error('Sender email address (BREVO_FROM_EMAIL or EMAIL_FROM) must be set in environment variables');
    }

    // console.log(`[MAILING] From: ${from}`);
    // console.log(`[MAILING] Initiating Brevo API request...`);

    // Set up timeout warning (but don't block the request)
    timeoutId = setTimeout(() => {
      console.warn(`⚠️ [MAILING TIMEOUT WARNING] Email to ${to} is taking longer than 60 seconds`);
    }, 60000);

    const info = await mailing.sendMail({
      from,
      to,
      subject,
      text,
      html
    });

    // Clear timeout since email succeeded
    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    // console.log(`✅ [MAILING SUCCESS] Email sent successfully in ${duration}ms`);
    // console.log(`[MAILING] Message ID: ${info.messageId || 'N/A'}`);
    // console.log(`[MAILING] Response: ${info.response || '250 OK'}`);

    return info;
  } catch (error) {
    // Clear timeout on error too
    if (timeoutId) clearTimeout(timeoutId);
    
    const duration = Date.now() - startTime;
    
    // Detect specific error types
    let errorType = 'Unknown error';
    if (error.code === 'ETIMEDOUT') {
      errorType = 'Connection timeout - Brevo API unreachable or network issue';
    } else if (error.code === 'ECONNREFUSED') {
      errorType = 'Connection refused - Brevo API server refusing connections';
    } else if (error.code === 'EAUTH' || error.message?.includes('authentication')) {
      errorType = 'Authentication failed - Check BREVO_API_KEY';
    } else if (error.message?.includes('timeout')) {
      errorType = 'Request timeout - Brevo API took too long to respond';
    } else if (error.message?.includes('Brevo API error')) {
      errorType = 'Brevo API error - Check API key and sender email';
    }

    console.error(`❌ [MAILING FAILED] Error sending email after ${duration}ms:`, {
      errorMessage: error.message,
      errorType: errorType,
      errorCode: error.code,
      recipient: to,
      subject: subject,
      stack: error.stack
    });

    throw error;
  }
};

// 1) Reminder to learner
exports.sendScheduleReminder = async (scheduleId, mentorId) => {
  try {
    console.log(`[MAILING] Attempting to send schedule reminder for schedule: ${scheduleId}, mentor: ${mentorId}`);
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      const errMsg = `[MAILING ERROR] Schedule not found with ID: ${scheduleId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const learner = await findLearnerByAny(schedule.learner);
    if (!learner) {
      const errMsg = `[MAILING ERROR] Learner not found with ID: ${schedule.learner}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const learnerEmail = await findUserEmailById(learner.userId);
    if (!learnerEmail) {
      const errMsg = `[MAILING ERROR] Learner email not found for user ID: ${learner.userId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const mentor = await findMentorByAny(mentorId);
    if (!mentor) {
      const errMsg = `[MAILING ERROR] Mentor not found with ID: ${mentorId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const subject = `Reminder: Upcoming Study Session with ${mentor.name}`;
    const text = `
Dear ${learner.name},

This is a friendly reminder about your upcoming study session:

Subject: ${schedule.subject}
Mentor: ${mentor.name}
Date: ${new Date(schedule.date).toLocaleDateString()}
Time: ${schedule.time}
Location: ${schedule.location}

Best regards,
MindMate Team
    `.trim();

    console.log(`[MAILING] Sending reminder email to: ${learnerEmail}`);
    const result = await this.sendEmailNotification(learnerEmail, subject, text);
    console.log(`[MAILING SUCCESS] Schedule reminder sent successfully to ${learnerEmail}`);
    return result;
  } catch (error) {
    console.error(`[MAILING CRITICAL ERROR] Failed to send schedule reminder for schedule ${scheduleId}:`, {
      error: error.message,
      stack: error.stack,
      scheduleId,
      mentorId
    });
    throw error;
  }
};

// 2) Cancellation (mentor -> learner)
exports.sendCancellationByMentor = async (scheduleId, mentorId, reason = '') => {
  try {
    console.log(`[MAILING] Attempting to send cancellation by mentor for schedule: ${scheduleId}, mentor: ${mentorId}`);
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      const errMsg = `[MAILING ERROR] Schedule not found with ID: ${scheduleId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const learner = await findLearnerByAny(schedule.learner);
    if (!learner) {
      const errMsg = `[MAILING ERROR] Learner not found with ID: ${schedule.learner}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const learnerEmail = await findUserEmailById(learner.userId);
    if (!learnerEmail) {
      const errMsg = `[MAILING ERROR] Learner email not found for user ID: ${learner.userId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const mentor = await findMentorByAny(mentorId);
    if (!mentor) {
      const errMsg = `[MAILING ERROR] Mentor not found with ID: ${mentorId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const subject = `Session Cancelled: ${schedule.subject} on ${new Date(schedule.date).toLocaleDateString()}`;
    const text = `
Dear ${learner.name},

Your study session has been cancelled by your mentor.

Subject: ${schedule.subject}
Mentor: ${mentor.name}
Original Date: ${new Date(schedule.date).toLocaleDateString()}
Original Time: ${schedule.time}
Location: ${schedule.location}
${reason ? `Reason: ${reason}` : ''}

Best regards,
MindMate Team
    `.trim();

    console.log(`[MAILING] Sending cancellation email to: ${learnerEmail}`);
    const result = await this.sendEmailNotification(learnerEmail, subject, text);
    console.log(`[MAILING SUCCESS] Cancellation email sent successfully to ${learnerEmail}`);
    return result;
  } catch (error) {
    console.error(`[MAILING CRITICAL ERROR] Failed to send cancellation by mentor for schedule ${scheduleId}:`, {
      error: error.message,
      stack: error.stack,
      scheduleId,
      mentorId,
      reason
    });
    throw error;
  }
};

// 3) Cancellation (learner -> mentor)
exports.sendCancellationByLearner = async (scheduleId, learnerId, reason = '') => {
  try {
    console.log(`[MAILING] Attempting to send cancellation by learner for schedule: ${scheduleId}, learner: ${learnerId}`);
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      const errMsg = `[MAILING ERROR] Schedule not found with ID: ${scheduleId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const learner = await findLearnerByAny(learnerId);
    if (!learner) {
      const errMsg = `[MAILING ERROR] Learner not found with ID: ${learnerId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const mentor = await findMentorByAny(schedule.mentor);
    if (!mentor) {
      const errMsg = `[MAILING ERROR] Mentor not found with ID: ${schedule.mentor}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const mentorEmail = await findUserEmailById(mentor.userId);
    if (!mentorEmail) {
      const errMsg = `[MAILING ERROR] Mentor email not found for user ID: ${mentor.userId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const subject = `Session Cancelled: ${schedule.subject} on ${new Date(schedule.date).toLocaleDateString()}`;
    const text = `
Dear ${mentor.name},

Your student has cancelled the upcoming study session.

Subject: ${schedule.subject}
Student: ${learner.name}
Original Date: ${new Date(schedule.date).toLocaleDateString()}
Original Time: ${schedule.time}
Location: ${schedule.location}
${reason ? `Reason: ${reason}` : ''}

Best regards,
MindMate Team
    `.trim();

    console.log(`[MAILING] Sending cancellation email to: ${mentorEmail}`);
    const result = await this.sendEmailNotification(mentorEmail, subject, text);
    console.log(`[MAILING SUCCESS] Cancellation email sent successfully to ${mentorEmail}`);
    return result;
  } catch (error) {
    console.error(`[MAILING CRITICAL ERROR] Failed to send cancellation by learner for schedule ${scheduleId}:`, {
      error: error.message,
      stack: error.stack,
      scheduleId,
      learnerId,
      reason
    });
    throw error;
  }
};

// 4) Reschedule (mentor -> learner)
exports.sendRescheduleByMentor = async (scheduleId, mentorId, newDate, newTime, newLocation = null) => {
  try {
    console.log(`[MAILING] Attempting to send reschedule by mentor for schedule: ${scheduleId}, mentor: ${mentorId}`);
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      const errMsg = `[MAILING ERROR] Schedule not found with ID: ${scheduleId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const learner = await findLearnerByAny(schedule.learner);
    if (!learner) {
      const errMsg = `[MAILING ERROR] Learner not found with ID: ${schedule.learner}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const learnerEmail = await findUserEmailById(learner.userId);
    if (!learnerEmail) {
      const errMsg = `[MAILING ERROR] Learner email not found for user ID: ${learner.userId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const mentor = await findMentorByAny(mentorId);
    if (!mentor) {
      const errMsg = `[MAILING ERROR] Mentor not found with ID: ${mentorId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const subject = `Session Rescheduled: ${schedule.subject}`;
    const text = `
Dear ${learner.name},

Your mentor has rescheduled your study session.

Previous:
Date: ${new Date(schedule.date).toLocaleDateString()}
Time: ${schedule.time}
Location: ${schedule.location}

New:
Date: ${new Date(newDate).toLocaleDateString()}
Time: ${newTime}
Location: ${newLocation || schedule.location}

Best regards,
MindMate Team
    `.trim();

    console.log(`[MAILING] Sending reschedule email to: ${learnerEmail}`);
    const result = await this.sendEmailNotification(learnerEmail, subject, text);
    console.log(`[MAILING SUCCESS] Reschedule email sent successfully to ${learnerEmail}`);
    return result;
  } catch (error) {
    console.error(`[MAILING CRITICAL ERROR] Failed to send reschedule by mentor for schedule ${scheduleId}:`, {
      error: error.message,
      stack: error.stack,
      scheduleId,
      mentorId,
      newDate,
      newTime,
      newLocation
    });
    throw error;
  }
};

// 5) Reschedule (learner -> mentor)
exports.sendRescheduleByLearner = async (scheduleId, learnerId, newDate, newTime, newLocation = null) => {
  try {
    console.log(`[MAILING] Attempting to send reschedule by learner for schedule: ${scheduleId}, learner: ${learnerId}`);
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      const errMsg = `[MAILING ERROR] Schedule not found with ID: ${scheduleId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const learner = await findLearnerByAny(learnerId);
    if (!learner) {
      const errMsg = `[MAILING ERROR] Learner not found with ID: ${learnerId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const mentor = await findMentorByAny(schedule.mentor);
    if (!mentor) {
      const errMsg = `[MAILING ERROR] Mentor not found with ID: ${schedule.mentor}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const mentorEmail = await findUserEmailById(mentor.userId);
    if (!mentorEmail) {
      const errMsg = `[MAILING ERROR] Mentor email not found for user ID: ${mentor.userId}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }

    const subject = `Reschedule Request: ${schedule.subject}`;
    const text = `
Dear ${mentor.name},

Your student has requested to reschedule.

Current:
Date: ${new Date(schedule.date).toLocaleDateString()}
Time: ${schedule.time}
Location: ${schedule.location}

Proposed:
Date: ${new Date(newDate).toLocaleDateString()}
Time: ${newTime}
Location: ${newLocation || schedule.location}

Best regards,
MindMate Team
    `.trim();

    console.log(`[MAILING] Sending reschedule request email to: ${mentorEmail}`);
    const result = await this.sendEmailNotification(mentorEmail, subject, text);
    console.log(`[MAILING SUCCESS] Reschedule request email sent successfully to ${mentorEmail}`);
    return result;
  } catch (error) {
    console.error(`[MAILING CRITICAL ERROR] Failed to send reschedule by learner for schedule ${scheduleId}:`, {
      error: error.message,
      stack: error.stack,
      scheduleId,
      learnerId,
      newDate,
      newTime,
      newLocation
    });
    throw error;
  }
};