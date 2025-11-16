const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');
const Schedule = require('../models/Schedule');
const { getValuesFromToken } = require('../service/jwt');

module.exports.fetchMentorDashboard = async (req, res) => {
    try {
        const decoded = getValuesFromToken(req);
        if (!decoded || !decoded.id) return res.status(401).json({ message: 'Invalid or missing token' });

        const mentor = await Mentor.findOne({ userId: decoded.id });
        if (!mentor) return res.status(404).json({ message: 'User not found' });

        const roleId = mentor._id;

        const [ totalSessions, oneOnOneSessions, groupSessions ] = await Promise.all([
            Schedule.countDocuments({ mentor: roleId }),
            Schedule.countDocuments({ mentor: roleId, sessionType: 'one-on-one' }),
            Schedule.countDocuments({ mentor: roleId, sessionType: 'group' })
        ]);

        const topSubjects = await Schedule.aggregate([
            { $match: { mentor: roleId } },
            { $group: { _id: '$subject', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $project: { subject: '$_id', count: 1, _id: 0 } }
        ]);

        const topStyles = await Schedule.aggregate([
            { $match: { mentor: roleId } },
            { $unwind: { path: '$learners', preserveNullAndEmptyArrays: false } },
            { $lookup: {
                from: 'learners',
                localField: 'learners',
                foreignField: '_id',
                as: 'learnerDoc'
            }},
            { $unwind: { path: '$learnerDoc', preserveNullAndEmptyArrays: false } },
            { $unwind: { path: '$learnerDoc.style', preserveNullAndEmptyArrays: false } },
            { $group: { _id: '$learnerDoc.style', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $project: { style: '$_id', count: 1, _id: 0 } }
        ]);

        const schedulesAgg = await Schedule.aggregate([
            { $match: { mentor: roleId } },
            { $sort: { date: -1 } },
            { $limit: 6 },
            { $lookup: {
                from: 'learners',
                localField: 'learners',
                foreignField: '_id',
                as: 'learnersDocs'
            }},
            { $project: {
                date: 1,
                time: 1,
                subject: 1,
                sessionType: 1,
                learnerNames: 1,
                learnersDocs: 1
            }}
        ]);

        const now = new Date();
        const durationMap = { '1hr': '60 min', '2hrs': '120 min', '3hrs': '180 min' };

        const schedules = schedulesAgg.map(s => {
            const date = s.date;
            const subject = s.subject || 'Unknown';

            let namesArray = [];
            if (Array.isArray(s.learnersDocs) && s.learnersDocs.length) {
                namesArray = s.learnersDocs.map(l => l.name || 'Unknown');
            } else if (Array.isArray(s.learnerNames) && s.learnerNames.length) {
                namesArray = s.learnerNames.slice();
            }

            const firstLearnerDur = Array.isArray(s.learnersDocs) && s.learnersDocs[0] ? s.learnersDocs[0].sessionDur : null;
            const rawDur = firstLearnerDur || mentor.sessionDur || null;
            const duration = rawDur ? (durationMap[rawDur] || rawDur) : 'N/A';

            const type = s.sessionType || 'N/A';

            let styles = [];
            if (Array.isArray(s.learnersDocs) && s.learnersDocs.length) {
                s.learnersDocs.forEach(ld => {
                    if (Array.isArray(ld.style) && ld.style.length) {
                        styles.push(...ld.style);
                    }
                });
            }
            styles = Array.from(new Set(styles)); // dedupe

            const status = (date instanceof Date && date < now) ? 'COMPLETED' : 'SCHEDULED';

            return {
                id: s._id,
                date,
                subject,
                learners: namesArray,        // always an array
                duration,
                type,
                learningStyle: styles,       // array (may be empty)
                status
            };
        });

        return res.status(200).json({
            data: {
                aveRating: mentor.aveRating || 0,
                totalSessions,
                oneOnOneSessions,
                groupSessions,
                topSubjects,
                topStyles,
                schedules
            }
        });
    } catch (err) {
        console.error('Error fetching mentor dashboard:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
