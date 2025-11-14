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
  try {
    if (!to) throw new Error('Recipient email address is required');
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const info = await mailing.sendMail({
      from,
      to,
      subject,
      text,
      ...(html ? { html } : {})
    });
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    return null;
  }
};

// 1) Reminder to learner
exports.sendScheduleReminder = async (scheduleId, mentorId) => {
  try {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const learner = await findLearnerByAny(schedule.learner);
    if (!learner) throw new Error('Learner not found');

    const learnerEmail = await findUserEmailById(learner.userId);
    if (!learnerEmail) throw new Error('Learner user not found');

    const mentor = await findMentorByAny(mentorId);
    if (!mentor) throw new Error('Mentor not found');

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

    return await this.sendEmailNotification(learnerEmail, subject, text);
  } catch (error) {
    console.error('Error sending schedule reminder:', error);
    return null;
  }
};

// 2) Cancellation (mentor -> learner)
exports.sendCancellationByMentor = async (scheduleId, mentorId, reason = '') => {
  try {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const learner = await findLearnerByAny(schedule.learner);
    if (!learner) throw new Error('Learner not found');

    const learnerEmail = await findUserEmailById(learner.userId);
    if (!learnerEmail) throw new Error('Learner user not found');

    const mentor = await findMentorByAny(mentorId);
    if (!mentor) throw new Error('Mentor not found');

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

    return await this.sendEmailNotification(learnerEmail, subject, text);
  } catch (error) {
    console.error('Error sending cancellation notification by mentor:', error);
    return null;
  }
};

// 3) Cancellation (learner -> mentor)
exports.sendCancellationByLearner = async (scheduleId, learnerId, reason = '') => {
  try {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const learner = await findLearnerByAny(learnerId);
    if (!learner) throw new Error('Learner not found');

    const mentor = await findMentorByAny(schedule.mentor);
    if (!mentor) throw new Error('Mentor not found');

    const mentorEmail = await findUserEmailById(mentor.userId);
    if (!mentorEmail) throw new Error('Mentor user not found');

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

    return await this.sendEmailNotification(mentorEmail, subject, text);
  } catch (error) {
    console.error('Error sending cancellation notification by learner:', error);
    return null;
  }
};

// 4) Reschedule (mentor -> learner)
exports.sendRescheduleByMentor = async (scheduleId, mentorId, newDate, newTime, newLocation = null) => {
  try {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const learner = await findLearnerByAny(schedule.learner);
    if (!learner) throw new Error('Learner not found');

    const learnerEmail = await findUserEmailById(learner.userId);
    if (!learnerEmail) throw new Error('Learner user not found');

    const mentor = await findMentorByAny(mentorId);
    if (!mentor) throw new Error('Mentor not found');

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

    return await this.sendEmailNotification(learnerEmail, subject, text);
  } catch (error) {
    console.error('Error sending reschedule notification by mentor:', error);
    return null;
  }
};

// 5) Reschedule (learner -> mentor)
exports.sendRescheduleByLearner = async (scheduleId, learnerId, newDate, newTime, newLocation = null) => {
  try {
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

    const learner = await findLearnerByAny(learnerId);
    if (!learner) throw new Error('Learner not found');

    const mentor = await findMentorByAny(schedule.mentor);
    if (!mentor) throw new Error('Mentor not found');

    const mentorEmail = await findUserEmailById(mentor.userId);
    if (!mentorEmail) throw new Error('Mentor user not found');

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

    return await this.sendEmailNotification(mentorEmail, subject, text);
  } catch (error) {
    console.error('Error sending reschedule notification by learner:', error);
    return null;
  }
};