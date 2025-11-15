const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');
const User = require('../models/user');
const Schedule = require('../models/Schedule');
const Feedback = require('../models/feedback');
const { getValuesFromToken } = require('../service/jwt');
const { uploadFile } = require('../service/drive');
const stream = require('stream');
const mailingController = require('./mailing'); // added
const uploadController = require('./upload');   // already present
const pusher = require('../service/pusher');
const { schedulePayload } = require('../utils/realtimePayload');
const Rank = require('../models/rank');
const Badge = require('../models/badges');

// Safe helper to resolve mentor and call awardMentorBadges without relying on userData variable
async function safeAwardMentorBadgesByUserId(userOrMentorId) {
  try {
    if (!userOrMentorId) return null;
    // Try to find mentor either by _id or userId
    const mentor = await Mentor.findOne({
      $or: [{ _id: userOrMentorId }, { userId: userOrMentorId }]
    }).select('_id');
    if (!mentor) return null;
    return await Badge.awardMentorBadges(mentor._id);
  } catch (err) {
    console.error('Error awarding badges:', err);
    return null;
  }
}

function bufferToStream(buffer) {
  const pass = new stream.PassThrough();
  pass.end(buffer);
  return pass;
}

// Parse a date-only string into a Date at local midnight.
// Supports 'YYYY-MM-DD' and 'MM/DD/YYYY'.
function parseDateOnly(input) {
  if (!input) return null;
  if (input instanceof Date && !isNaN(input)) {
    const d = new Date(input);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof input === 'string') {
    let d = new Date(input);
    if (isNaN(d)) {
      // try MM/DD/YYYY
      const m = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const mm = Number(m[1]) - 1;
        const dd = Number(m[2]);
        const yyyy = Number(m[3]);
        d = new Date(yyyy, mm, dd);
      }
    }
    if (isNaN(d)) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

exports.getAllLearners = async (req, res) => {
  try {
    const learners = await Learner.find();
    if (learners.length === 0) {
      return res.status(404).json({ message: 'No learners found', code: 404 });
    }
    res.status(200).json(learners.map(learner => ({
        id: learner._id,
      name: learner.name,
      program: learner.program,
      yearLevel: learner.yearLevel,
      image: learner.image,
    })));
  } catch (error) {
    res.status(500).json({ message: 'Server error', code: 500 });
  }
};

exports.getLearnerById = async (req, res) => {
  const { id } = req.params;
  try {
    const learner = await Learner.findOne({ _id: id });
    if (!learner) {
      return res.status(404).json({ message: 'Learner not found', code: 404 });
    }
    const rank = await Rank.findOne({ learnerId: learner._id }).select('rank');
    res.status(200).json({ learner, rank });
  } catch (error) {
    res.status(500).json({ message: 'Server error', code: 500 });
  }
};

exports.setSchedule = async (req, res) => {
    const { id } = req.params;
    const { date, time, location, subject } = req.body;

    const decoded = getValuesFromToken(req);

    const learner = await Learner.findById(id);

    if(!learner){
      return res.status(404).json({message: 'Learner not found', code: 404})
    }
    if (!decoded || !decoded.id) {
      return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    if (!decoded.id || !date || !time || !location || !subject) {
        return res.status(400).json({ message: 'All fields are required', code: 400 });
    }

    if (time < '08:00' || time > '20:00') {
        return res.status(400).json({ message: 'Time must be between 08:00 and 20:00', code: 400 });
    }

    // filepath: c:\Users\new_u\OneDrive\Desktop\IPT-FinalProject\backend\controllers\mentor.js
    const schedDate = parseDateOnly(date);
    if (!schedDate) {
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY', code: 400 });
    }
    const today = new Date();
    today.setHours(0,0,0,0);
    if (schedDate < today) {
        return res.status(400).json({ message: 'Date must be in the future', code: 400 });
    }

    try {
        const schedule = new Schedule({
            learner: learner.userId,
            mentor: decoded.id,
            date: schedDate,
            time,
            location,
            subject
        });
        await schedule.save();

        // Notify learner via Pusher
        try {
          const mentorDoc = await Mentor.findById(schedule.mentor);
          const learnerDoc = await Learner.findById(schedule.learner);
          const channelName = `private-user-${String(learnerDoc.userId)}`;
          const payload = schedulePayload(schedule, mentorDoc, learnerDoc);
          console.log('[Pusher] mentor->learner new-schedule ->', channelName);
          await pusher.trigger(channelName, 'new-schedule', payload);
        } catch (emitErr) {
          console.error('Pusher emit error (mentor.setSchedule):', emitErr);
        }

        // Safe award badges
        await safeAwardMentorBadgesByUserId(schedule.mentor);

        res.status(201).json(schedule);
    } catch (error) {
        res.status(500).json({ message: 'Server error', code: 500 });
    }
};

exports.getFeedbacks = async (req, res) => {
    const decoded = getValuesFromToken(req);

    if(!decoded || !decoded.id){
      return res.status(403).json({message: 'Invalid token', code: 403})
    }

    const mentor = await Mentor.findOne({userId: decoded.id});

    if(!mentor){
      return res.status(404).json({message: 'Mentor not found', code: 404})
    }

    try {
      const feedbacks = await Feedback.find({ mentor: mentor._id });
    //   if(feedbacks.length === 0){
    //     return res.status(404).json({message: 'No feedbacks found', code: 404})
    //   }

      // Safe award badges
      await safeAwardMentorBadgesByUserId(mentor._id);

      res.status(200).json(feedbacks);
    } catch (error) {
      res.status(500).json({message: 'Server error', code: 500})
    }
}

exports.cancelSched = async (req, res) => {
    const { id } = req.params;
    const decoded = getValuesFromToken(req);
   const { reason = '' } = req.body; // optional reason from client

    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    if (!id) {
        return res.status(400).json({ message: 'Schedule id is required', code: 400 });
    }

    try {
        const schedule = await Schedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Schedule not found', code: 404 });
        }

        // Find mentor to verify authorization
        const mentor = await Mentor.findOne({
            $or: [
                { _id: decoded.id },
                { userId: decoded.id }
            ]
        });

        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        // Check if this mentor is involved in the schedule
        const schedMentorId = String(schedule.mentor);
        const mentorId = String(mentor._id);

        if (mentorId !== schedMentorId) {
            return res.status(403).json({ message: 'Not authorized to cancel this schedule', code: 403 });
        }

        const mailResult = await mailingController.sendCancellationByMentor(id, mentor._id || decoded.id, reason);
        
        if (!mailResult) {
            console.log('Error sending cancellation email (mentor):', mailResult);
        }

        // Delete the schedule
        const scheduleFound = await Schedule.findByIdAndDelete(id);

        if (!scheduleFound) {
            return res.status(404).json({ message: 'Schedule not found or already deleted', code: 404 });
        }

        // Notify the learner if socket.io is available (optional)
        try {
            const io = req.app && req.app.get('io');
            if (io) {
                const learnerId = String(schedule.learner);
                io.to(learnerId).emit('scheduleCanceled', {
                    scheduleId: id,
                    canceledBy: mentorId,
                    date: schedule.date,
                    time: schedule.time,
                    subject: schedule.subject,
                });
            }
        } catch (emitErr) {
            // Do not fail the request if emit fails
            console.error('Socket emit error (cancelSched):', emitErr);
        }

        // Notify learner via Pusher
        try {
          const mentorDoc = await Mentor.findById(schedule.mentor);
          const learnerDoc = await Learner.findById(schedule.learner);
          const channelName = `private-user-${String(learnerDoc.userId)}`;
          const payload = schedulePayload(schedule, mentorDoc, learnerDoc);
          console.log('[Pusher] mentor->learner schedule-cancelled ->', channelName);
          await pusher.trigger(channelName, 'schedule-cancelled', payload);
        } catch (emitErr) {
          console.error('Pusher emit error (mentor.cancelSched):', emitErr);
        }

        // Safe award badges
        await safeAwardMentorBadgesByUserId(mentor._id);

        res.status(200).json({ message: 'Schedule canceled', mailing: mailResult, code: 200 });
    } catch (error) {
        res.status(500).json({ message: error.message, code: 500 });
    }
}

exports.reschedSched = async (req, res) => {
    const { id } = req.params;
    const { date, time, location, subject } = req.body;
    const decoded = getValuesFromToken(req);

    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    if (!id) {
        return res.status(400).json({ message: 'Schedule id is required', code: 400 });
    }

    if (!date && !time && !location && !subject) {
        return res.status(400).json({ message: 'At least one field (date, time, location, subject) is required to reschedule', code: 400 });
    }

    try {
        const schedule = await Schedule.findById(id);
        if (!schedule) {
            return res.status(404).json({ message: 'Schedule not found', code: 404 });
        }

        // Find mentor to verify authorization
        const mentor = await Mentor.findOne({
            $or: [
                { _id: decoded.id },
                { userId: decoded.id }
            ]
        });

        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', code: 404 });
        }

        // Check if this mentor is involved in the schedule
        const schedMentorId = String(schedule.mentor);
        const mentorId = String(mentor._id);

        if (mentorId !== schedMentorId) {
            return res.status(403).json({ message: 'Not authorized to reschedule this schedule', code: 403 });
        }

        // Validate time and date if provided
        if (time && (time < '08:00' || time > '20:00')) {
            return res.status(400).json({ message: 'Time must be between 08:00 and 20:00', code: 400 });
        }

        let newDateOnly = null;
        if (date) {
            newDateOnly = parseDateOnly(date);
            if (!newDateOnly) {
                return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY', code: 400 });
            }
            const today = new Date();
            today.setHours(0,0,0,0);
            if (newDateOnly < today) {
                return res.status(400).json({ message: 'Date must be in the future', code: 400 });
            }
        }

        // Keep old values for notification
        const oldValues = {
            date: schedule.date,
            time: schedule.time,
            location: schedule.location,
            subject: schedule.subject
        };

        // Apply updates
        if (newDateOnly) schedule.date = newDateOnly;
        if (time) schedule.time = time;
        if (location) schedule.location = location;
        if (subject) schedule.subject = subject;

        await schedule.save();

        // Notify the learner if socket.io is available (optional)
        try {
            const io = req.app && req.app.get('io');
            if (io) {
                const learnerId = String(schedule.learner);
                io.to(learnerId).emit('scheduleRescheduled', {
                    scheduleId: id,
                    rescheduledBy: mentorId,
                    old: {
                        date: oldValues.date,
                        time: oldValues.time,
                        location: oldValues.location,
                        subject: oldValues.subject
                    },
                    updated: {
                        date: schedule.date,
                        time: schedule.time,
                        location: schedule.location,
                        subject: schedule.subject
                    }
                });
            }
        } catch (emitErr) {
            console.error('Socket emit error (reschedSched):', emitErr);
        }

        // send reschedule email to learner
       try {
         await mailingController.sendRescheduleByMentor(
           id,
           mentor._id || decoded.id,
           schedule.date,
           schedule.time,
           schedule.location
         );
       } catch (mailErr) {
         console.error('Error sending reschedule email (mentor):', mailErr);
       }

        // Notify learner via Pusher
        try {
          const mentorDoc = await Mentor.findById(schedule.mentor);
          const learnerDoc = await Learner.findById(schedule.learner);
          const channelName = `private-user-${String(learnerDoc.userId)}`;
          const payload = schedulePayload(schedule, mentorDoc, learnerDoc);
          console.log('[Pusher] mentor->learner schedule-rescheduled ->', channelName);
          await pusher.trigger(channelName, 'schedule-rescheduled', payload);
        } catch (emitErr) {
          console.error('Pusher emit error (mentor.reschedSched):', emitErr);
        }

        // Safe award badges
        await safeAwardMentorBadgesByUserId(mentor._id);

        res.status(200).json({ message: 'Schedule rescheduled', schedule, code: 200 });
    } catch (error) {
        console.error('reschedSched error:', error);
        res.status(500).json({ message: error.message, code: 500 });
    }
}

exports.getSchedules = async (req, res) => {
    const decoded = getValuesFromToken(req);

    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }
    try {
        // Find mentor by either _id or userId
        const mentor = await Mentor.findOne({
            $or: [
                { _id: decoded.id },
                { userId: decoded.id }
            ]
        });

        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found', mentor: mentor, code: 404 });
        }

        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Retrieve all schedules for this mentor
        const schedules = await Schedule.find({
            $or: [
                { mentor: mentor._id },
                { mentor: mentor.userId }
            ]
        });

        console.log('Found schedules for mentor:', schedules.length);

        // Split schedules and transform them (only today and upcoming)
        const todaySchedule = [];
        const upcomingSchedule = [];

        for (const schedule of schedules) {
            const schedDate = new Date(schedule.date);
            schedDate.setHours(0, 0, 0, 0);
            
            console.log('Processing schedule:', schedule._id);
            console.log('Mentor ID:', schedule.mentor);
            console.log('Learner ID:', schedule.learner);
            
            // Try different approaches to find mentor and learner
            let schedMentor = await Mentor.findById(schedule.mentor);
            if (!schedMentor) {
                schedMentor = await Mentor.findOne({ userId: schedule.mentor });
            }
            if (!schedMentor) {
                schedMentor = await Mentor.findOne({ _id: schedule.mentor });
            }
            
            let learner = await Learner.findById(schedule.learner);
            if (!learner) {
                learner = await Learner.findOne({ userId: schedule.learner });
            }
            if (!learner) {
                learner = await Learner.findOne({ _id: schedule.learner });
            }
            
            console.log('Found mentor:', schedMentor?.name || 'Not found');
            console.log('Found learner:', learner?.name || 'Not found');
            
            // Skip past schedules for mentor (no schedForReview)
            if (schedDate < today) {
                continue;
            }

            // Simplified response payload with only required information
            const transformedSchedule = {
                // Schedule information
                id: schedule._id,
                date: schedDate.toISOString().split('T')[0],
                time: schedule.time,
                location: schedule.location,
                subject: schedule.subject,
                
                // Mentor information (include id)
                mentor: {
                    id: schedMentor?._id || schedule.mentor,
                    name: schedMentor?.name || 'Unknown Mentor',
                    program: schedMentor?.program || 'N/A',
                    yearLevel: schedMentor?.yearLevel || 'N/A',
                    image: schedMentor?.image || 'https://placehold.co/600x400'
                },
                
                // Learner information (name, program, year level)
                learner: {
                    id: learner?._id || schedule.learner, // Added learner id for consistency
                    name: learner?.name || 'Unknown Learner',
                    program: learner?.program || 'N/A',
                    yearLevel: learner?.yearLevel || 'N/A',
                    image: learner?.image || 'https://placehold.co/600x400'
                }
            };
            
            if (schedDate.getTime() === today.getTime()) {
                todaySchedule.push(transformedSchedule);
            } else if (schedDate > today) {
                upcomingSchedule.push(transformedSchedule);
            }
        }

        // Safe award badges
        await safeAwardMentorBadgesByUserId(mentor._id);

        res.status(200).json({
            todaySchedule,
            upcomingSchedule
        });
    } catch (error) {
        console.error('Error in getSchedules (mentor):', error);
        res.status(500).json({ message: error.message, code: 500 });
    }
}

exports.getProfileInfo = async (req, res) => {
    const decoded = getValuesFromToken(req);
    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    console.log('Decoded token info:', decoded);
    try {
        // load mentor + role
        const userData = await Mentor.findOne({ userId: decoded.id }).lean();
        const roleData = await User.findById(decoded.id).select('role altRole').lean();

        if (!userData || !roleData) {
            return res.status(404).json({ message: "Mentor account does not exist", token: decoded, code: 404 });
        }

        // ensure badges are up-to-date (best-effort)
        await safeAwardMentorBadgesByUserId(userData._id);

        // fetch persisted mentor badges
        const earned = await Badge.MentorBadge.find({ mentor: userData._id }).sort({ awardedAt: -1 }).lean();

        // resolve definitions from static catalog when available
        const defs = (Badge.BADGES || []).reduce((m, d) => {
          m[d.key] = d;
          return m;
        }, {});

        const badges = earned.map(b => ({
          badgeKey: b.badgeKey,
          awardedAt: b.awardedAt,
          definition: defs[b.badgeKey] || null
        }));

        res.status(200).json({ userData, roleData, badges });
    } catch (error) {
        res.status(500).json({ message: error.message, code: 500 });
    }
}

exports.getReviewer = async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ message: 'Learner id is null', code: 400 });
    }
    const decoded = getValuesFromToken(req);
    if (!decoded || !decoded.id) {
        return res.status(403).json({ message: 'Invalid token', code: 403 });
    }

    try {
        const learner = await Learner.findOne({ $or: [ {userId: id, }, {_id: id} ] });
        if (!learner) {
            return res.status(404).json({ message: 'Learner not found', code: 404 });
        }

        // Safe award badges
        await safeAwardMentorBadgesByUserId(decoded.id);

        // Return the actual learner data that the frontend needs
        res.status(200).json({ 
            name: learner.name,
            course: learner.program,
            year: learner.yearLevel,
            image: learner.image || ''
        });
    } catch (error) {
        console.error('Error in getReviewer:', error);
        res.status(500).json({ message: error.message, code: 500 });
    }
}

// optional endpoint: mentor sends a manual reminder for a schedule
exports.sendReminder = async (req, res) => {
  const { id } = req.params; // schedule id
  const decoded = getValuesFromToken(req);
  if (!decoded || !decoded.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  try {
    // verify mentor
    const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
    if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });
    await mailingController.sendScheduleReminder(id, mentor._id || decoded.id);

    // Safe award badges
    await safeAwardMentorBadgesByUserId(mentor._id);

    res.status(200).json({ message: 'Reminder sent', code: 200 });
  } catch (error) {
    console.error('Error sending reminder (mentor):', error);
    res.status(500).json({ message: error.message, code: 500 });
  }
}

// View/preview a learning material
exports.getLearningMaterial = async (req, res) => {
  const { fileId } = req.params;
  const decoded = getValuesFromToken(req);
  if (!decoded?.id) return res.status(403).json({ message: 'Invalid token', code: 403 });

  try {
    const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
    if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });
    if (!fileId) return res.status(400).json({ message: 'fileId is required', code: 400 });

    const meta = await uploadController.getDriveFileMetadata(fileId);

    // Safe award badges
    await safeAwardMentorBadgesByUserId(mentor._id);

    return res.status(200).json(meta);
  } catch (error) {
    console.error('getLearningMaterial error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

// Delete a learning material
exports.deleteLearningMaterial = async (req, res) => {
  const { fileId } = req.params;
  const decoded = getValuesFromToken(req);
  if (!decoded?.id) return res.status(403).json({ message: 'Invalid token', code: 403 });

  try {
    const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
    if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });
    if (!fileId) return res.status(400).json({ message: 'fileId is required', code: 400 });

    await uploadController.deleteDriveFile(fileId);

    // Safe award badges
    await safeAwardMentorBadgesByUserId(mentor._id);

    return res.status(200).json({ message: 'File deleted', id: fileId, code: 200 });
  } catch (error) {
    console.error('deleteLearningMaterial error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

// Fetch all learning materials for the authenticated mentor
exports.getLearningMaterialsList = async (req, res) => {
  const decoded = getValuesFromToken(req);
  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  try {
    const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
    if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });

    const username = decoded.username;
    if (!username) return res.status(400).json({ message: 'Username missing in token', code: 400 });

    const data = await uploadController.listDriveFilesForUser(username, 'learning_materials');
    return res.status(200).json({
      folderId: data.folderId,
      folderPath: data.folderPath,
      files: data.files,
    });
  } catch (error) {
    console.error('getLearningMaterialsList error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

exports.sendOffer = async (req, res) => {
    const { learnerId } = req.params;
    const decoded = getValuesFromToken(req);
    if (!decoded?.id) return res.status(403).json({ message: 'Invalid token', code: 403 });

    const { date, time, location, subject, message } = req.body;

    if ( !date || !time || !location || !subject ) {
        return res.status(400).json({ message: 'learnerId, date, time, location, subject are required', code: 400 });
    }

    try {
        // verify mentor
        const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
        if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });

        // fetch learner
        let learner = await Learner.findById(learnerId);
        if (!learner) learner = await Learner.findOne({ _id: learnerId });
        if (!learner) return res.status(404).json({ message: 'Learner not found', learner: learnerId, code: 404 });

        // resolve recipient email
        let toEmail = learner.email;
        if (!toEmail && learner.userId) {
        const u = await User.findById(learner.userId);
        toEmail = u?.email || null;
        }
        if (!toEmail) return res.status(400).json({ message: 'Learner email not found', code: 400 });

        // build accept offer link (tokenized payload in query)
        const apiBase = process.env.BACKEND_URL;
        const offerPayload = {
        offerId: Date.now().toString(), // simple unique id; replace with DB id if you persist offers
        mentorId: String(mentor._id),
        learnerId: String(learner._id),
        date,
        time,
        location,
        subject
        };
        const token = Buffer.from(JSON.stringify(offerPayload)).toString('base64url');
        const acceptLink = `${apiBase}/api/learner/offers/accept?token=${token}`;

        // email contents
        const emailSubject = `Offer: ${subject} with ${mentor.name}`;
        const emailText = `
    Hello ${learner.name},

    ${mentor.name} has sent you an offer for a study session.

    Details:
    - Subject: ${subject}
    - Date: ${new Date(date).toLocaleDateString()}
    - Time: ${time}
    - Location: ${location}
    ${message ? `\nMessage from mentor:\n${message}\n` : ''}

    Accept the offer:
    ${acceptLink}

    If you did not expect this email, you can ignore it.

    Best regards,
    MindMate Team
        `.trim();

        const emailHtml = `
    <p>Hello ${learner.name},</p>
    <p><strong>${mentor.name}</strong> has sent you an offer for a study session.</p>
    <ul>
    <li><strong>Subject:</strong> ${subject}</li>
    <li><strong>Date:</strong> ${new Date(date).toLocaleDateString()}</li>
    <li><strong>Time:</strong> ${time}</li>
    <li><strong>Location:</strong> ${location}</li>
    </ul>
    ${message ? `<p><strong>Message from mentor:</strong><br/>${message.replace(/\n/g, '<br/>')}</p>` : ''}
    <p>
    <a href="${acceptLink}" style="background:#1a73e8;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;">
        Accept Offer
    </a>
    </p>
    <p>If you did not expect this email, you can ignore it.</p>
    <p>Best regards,<br/>MindMate Team</p>
    `.trim();

        const mailResult = await mailingController.sendEmailNotification(
        toEmail,
        emailSubject,
        emailText,
        emailHtml
        );

        if (!mailResult) {
        return res.status(500).json({ message: 'Failed to send offer email', code: 500 });
        }

        // Safe award badges
        await safeAwardMentorBadgesByUserId(mentor._id);

        return res.status(200).json({
        message: 'Offer email sent',
        acceptLink, // included for testing; remove in production if not needed
        code: 200
        });
    } catch (error) {
        console.error('sendOffer error:', error);
        return res.status(500).json({ message: error.message, code: 500 });
    }
};

exports.uploadFiles = async (req, res) => {
  try {
    const decoded = getValuesFromToken(req);
    if (!decoded?.id) return res.status(401).json({ message: 'Unauthorized', code: 401 });

    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'mentor') {
      return res.status(403).json({ message: 'Only mentors can upload files', code: 403 });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ message: 'No files provided.', code: 400 });
    }

    const folderPath = `learning_materials/${user.username}`;
    const results = [];
    for (const f of files) {
      const uploaded = await uploadFile(
        bufferToStream(f.buffer),
        f.originalname,
        f.mimetype,
        folderPath
      );
      results.push({
        id: uploaded.id,
        name: uploaded.name || f.originalname,
        mimeType: uploaded.mimeType || f.mimetype,
        size: uploaded.size,
        webViewLink: uploaded.webViewLink,
        webContentLink: uploaded.webContentLink,
        createdTime: uploaded.createdTime,
      });
    }

    // Safe award badges
    await safeAwardMentorBadgesByUserId(decoded.id);

    return res.status(201).json({ message: 'Files uploaded successfully', files: results, code: 201 });
  } catch (err) {
    console.error('[mentor.uploadFiles]', err);
    return res.status(500).json({ message: 'Failed to upload files', code: 500 });
  }
};

exports.sendGroupSessionOffer = async (req, res) => {
  const { learnerId } = req.params;
  const { date, time, location, subject, message, groupName, maxParticipants } = req.body;

  if (!learnerId) return res.status(400).json({ message: 'learnerId param is required', code: 400 });

  const decoded = getValuesFromToken(req);
  if (!decoded?.id) return res.status(403).json({ message: 'Invalid token', code: 403 });

  if (!date || !time || !location || !subject) {
    return res.status(400).json({ message: 'date, time, location and subject are required', code: 400 });
  }

  try {
    const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
    if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });

    // fetch learner
    let learner = await Learner.findById(learnerId);
    if (!learner) learner = await Learner.findOne({ _id: learnerId });
    if (!learner) return res.status(404).json({ message: 'Learner not found', code: 404 });

    // resolve recipient email
    let toEmail = learner.email;
    if (!toEmail && learner.userId) {
      const u = await User.findById(learner.userId);
      toEmail = u?.email || null;
    }
    if (!toEmail) return res.status(400).json({ message: 'Learner email not found', code: 400 });

    const appBase = process.env.FRONTEND_URL;
    // explicitly mark this offer as a group offer (sessionType = 'group')
    const offerPayload = {
      // hyphenated id helps earlier heuristics detect group offers; also include explicit sessionType
      offerId: `${Date.now().toString()}-${Math.random().toString(36).slice(2,8)}`,
      sessionType: 'group',
      mentorId: String(mentor._id),
      learnerId: String(learner._id),
      date,
      time,
      location,
      subject,
      groupName: groupName || null,
      maxParticipants: maxParticipants || null,
      createdAt: new Date().toISOString()
    };
    const token = Buffer.from(JSON.stringify(offerPayload)).toString('base64url');
    const acceptLink = `${appBase}/api/learner/offers/accept?token=${token}`;

    const prettyDate = new Date(date).toLocaleDateString();
    const emailSubject = `Group Offer: ${subject} - ${groupName ? groupName : 'Group Study Session'}`;
    const emailText = `
Hello ${learner.name},

${mentor.name} has invited you to a group study session${groupName ? `: "${groupName}"` : ''}.

Details:
- Subject: ${subject}
- Date: ${prettyDate}
- Time: ${time}
- Location: ${location}
${maxParticipants ? `- Max participants: ${maxParticipants}\n` : ''}
${message ? `\nMessage from mentor:\n${message}\n` : ''}

To accept this group offer, open the link below:
${acceptLink}

If you do not wish to join, you can ignore this email.

Best regards,
MindMate Team
    `.trim();

    const emailHtml = `
<p>Hello ${learner.name},</p>
<p><strong>${mentor.name}</strong> has invited you to a group study session${groupName ? `: "<em>${groupName}</em>"` : ''}.</p>
<ul>
  <li><strong>Subject:</strong> ${subject}</li>
  <li><strong>Date:</strong> ${prettyDate}</li>
  <li><strong>Time:</strong> ${time}</li>
  <li><strong>Location:</strong> ${location}</li>
  ${maxParticipants ? `<li><strong>Max participants:</strong> ${maxParticipants}</li>` : ''}
</ul>
${message ? `<p><strong>Message from mentor:</strong><br/>${message.replace(/\n/g, '<br/>')}</p>` : ''}
<p>
  <a href="${acceptLink}" style="background:#1a73e8;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;">
    Accept Group Offer
  </a>
</p>
<p>If you did not expect this email, you can ignore it.</p>
<p>Best regards,<br/>MindMate Team</p>
    `.trim();

    const mailResult = await mailingController.sendEmailNotification(
      toEmail,
      emailSubject,
      emailText,
      emailHtml
    );

    if (!mailResult) {
      return res.status(500).json({ message: 'Failed to send offer email', code: 500 });
    }

    // notify via pusher if learner has a linked userId
    try {
      if (learner.userId) {
        const channelName = `private-user-${String(learner.userId)}`;
        await pusher.trigger(channelName, 'group-offer', {
          offerId: offerPayload.offerId,
          sessionType: 'group',
          mentor: { id: String(mentor._id), name: mentor.name },
          subject,
          date,
          time,
          location,
          groupName: groupName || null,
          maxParticipants: maxParticipants || null
        });
      }
    } catch (pushErr) {
      console.error('Pusher emit error (sendGroupSessionOffer):', pushErr);
    }

    // Safe award badges
    await safeAwardMentorBadgesByUserId(mentor._id);

    return res.status(200).json({
      message: 'Group offer sent',
      acceptLink, // included for testing; remove in production if sensitive
      code: 200
    });
  } catch (error) {
    console.error('sendGroupSessionOffer error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

exports.sendExistingGroupSessionOffer = async (req, res) => {
  const { learnerId, sessionId } = req.params;
  const decoded = getValuesFromToken(req);
  if (!decoded?.id) return res.status(403).json({ message: 'Invalid token', code: 403 });

  if (!learnerId || !sessionId) {
    return res.status(400).json({ message: 'learnerId and sessionId params are required', code: 400 });
  }

  try {
    const mentor = await Mentor.findOne({ $or: [{ _id: decoded.id }, { userId: decoded.id }] });
    if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });

    const session = await Schedule.findById(sessionId);
    if (!session || session.sessionType !== 'group') {
      return res.status(404).json({ message: 'Group session not found', code: 404 });
    }

    // ensure mentor owns the session
    if (String(session.mentor) !== String(mentor._id)) {
      return res.status(403).json({ message: 'Not authorized to modify this session', code: 403 });
    }

    // resolve learner document (allow either _id or userId)
    let learner = await Learner.findOne({ $or: [{ _id: learnerId }, { userId: learnerId }] });
    if (!learner) return res.status(404).json({ message: 'Learner not found', code: 404 });

    // resolve recipient email
    let toEmail = learner.email;
    if (!toEmail && learner.userId) {
      const u = await User.findById(learner.userId);
      toEmail = u?.email || null;
    }
    if (!toEmail) return res.status(400).json({ message: 'Learner email not found', code: 400 });

    // build an offer payload that points to the existing schedule (learner must accept)
    const offerPayload = {
      offerId: `${Date.now().toString()}-${Math.random().toString(36).slice(2,8)}`,
      sessionType: 'group',
      mentorId: String(mentor._id),
      learnerId: String(learner._id),
      scheduleId: String(session._id),
      scheduleOfferId: session.offerId ? String(session.offerId) : String(session._id),
      date: session.date instanceof Date ? session.date.toISOString().split('T')[0] : String(session.date),
      time: session.time,
      location: session.location,
      subject: session.subject,
      groupName: session.groupName || null,
      maxParticipants: session.maxParticipants || null,
      currentParticipants: Array.isArray(session.learners) ? session.learners.length : 0,
      createdAt: new Date().toISOString()
    };

    const token = Buffer.from(JSON.stringify(offerPayload)).toString('base64url');
    const apiBase = process.env.BACKEND_URL;
    const acceptLink = `${apiBase}/api/learner/offers/accept?token=${token}`;

    const prettyDate = new Date(offerPayload.date).toLocaleDateString();
    const emailSubject = `Group Invite: ${offerPayload.subject} - ${offerPayload.groupName || 'Group Study Session'}`;
    const emailText = `
Hello ${learner.name},

${mentor.name} has invited you to join an existing group session${offerPayload.groupName ? `: "${offerPayload.groupName}"` : ''}.

Details:
- Subject: ${offerPayload.subject}
- Date: ${prettyDate}
- Time: ${offerPayload.time}
- Location: ${offerPayload.location}
- Current participants: ${offerPayload.currentParticipants}
${offerPayload.maxParticipants ? `- Max participants: ${offerPayload.maxParticipants}\n` : ''}
${req.body?.message ? `\nMessage from mentor:\n${req.body.message}\n` : ''}

To accept this invite and join the session, open the link below:
${acceptLink}

If you do not wish to join, you can ignore this email.

Best regards,
MindMate Team
    `.trim();

    const emailHtml = `
<p>Hello ${learner.name},</p>
<p><strong>${mentor.name}</strong> has invited you to join a group session${offerPayload.groupName ? `: "<em>${offerPayload.groupName}</em>"` : ''}.</p>
<ul>
  <li><strong>Subject:</strong> ${offerPayload.subject}</li>
  <li><strong>Date:</strong> ${prettyDate}</li>
  <li><strong>Time:</strong> ${offerPayload.time}</li>
  <li><strong>Location:</strong> ${offerPayload.location}</li>
  <li><strong>Current participants:</strong> ${offerPayload.currentParticipants}</li>
  ${offerPayload.maxParticipants ? `<li><strong>Max participants:</strong> ${offerPayload.maxParticipants}</li>` : ''}
</ul>
${req.body?.message ? `<p><strong>Message from mentor:</strong><br/>${req.body.message.replace(/\n/g, '<br/>')}</p>` : ''}
<p>
  <a href="${acceptLink}" style="background:#1a73e8;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block;">
    Accept Invite
  </a>
</p>
<p>If you did not expect this email, you can ignore it.</p>
<p>Best regards,<br/>MindMate Team</p>
    `.trim();

    const mailResult = await mailingController.sendEmailNotification(
      toEmail,
      emailSubject,
      emailText,
      emailHtml
    );

    if (!mailResult) {
      return res.status(500).json({ message: 'Failed to send invite email', code: 500 });
    }

    // send pusher event to learner (best-effort)
    try {
      if (learner.userId) {
        const channelName = `private-user-${String(learner.userId)}`;
        await pusher.trigger(channelName, 'group-offer', {
          offerId: offerPayload.offerId,
          scheduleId: offerPayload.scheduleId,
          sessionType: 'group',
          mentor: { id: String(mentor._id), name: mentor.name },
          subject: offerPayload.subject,
          date: offerPayload.date,
          time: offerPayload.time,
          location: offerPayload.location,
          groupName: offerPayload.groupName,
          maxParticipants: offerPayload.maxParticipants,
          currentParticipants: offerPayload.currentParticipants,
          acceptLink
        });
      }
    } catch (pushErr) {
      console.error('Pusher emit error (sendExistingGroupSessionOffer):', pushErr);
    }

    // Safe award badges
    await safeAwardMentorBadgesByUserId(mentor._id);

    return res.status(200).json({
      message: 'Invite sent to learner for existing group session',
      acceptLink,
      scheduleId: offerPayload.scheduleId,
      code: 200
    });
  } catch (error) {
    console.error('sendExistingGroupSessionOffer error:', error);
    return res.status(500).json({ message: error.message, code: 500 });
  }
};

exports.getGroupSessions = async (req, res) => {
  const decoded = getValuesFromToken(req);
  if (!decoded || !decoded.id) {
      return res.status(403).json({ message: 'Invalid token', code: 403 });
  }
  try {
      // Find mentor by either _id or userId
      const mentor = await Mentor.findOne({
          $or: [
              { _id: decoded.id },
              { userId: decoded.id }
          ]
      });
      if (!mentor) return res.status(404).json({ message: 'Mentor not found', code: 404 });

      // Fetch group sessions for the mentor
      const groupSessions = await Schedule.find({ mentorId: mentor._id, sessionType: 'group' });

      // Safe award badges
      await safeAwardMentorBadgesByUserId(mentor._id);

      return res.status(200).json({ message: 'Group sessions fetched', groupSessions, code: 200 });
  } catch (error) {
      console.error('getGroupSessions error:', error);
      return res.status(500).json({ message: error.message, code: 500 });
  }
}