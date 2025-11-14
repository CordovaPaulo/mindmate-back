const mongoose = require('mongoose');
const { Types: { ObjectId } } = mongoose;

const Mentor = require('./Mentor');
const Schedule = require('./Schedule');
const Feedback = require('./feedback');
const Forum = require('./Forum');
const ForumComment = require('./ForumComment');
const ForumMetrics = require('./ForumMetrics');

/**
 * Seedable mentor badge catalog (static definitions used by UI and award logic).
 * Keep these keys stable.
 */
const BADGES = [
  {
    key: 'first_session',
    name: 'First Session',
    description: 'Completed your first mentoring session.',
    icon: '🎯',
    color: '#4F46E5',
    category: 'experience'
  },
  {
    key: 'ten_sessions',
    name: '10 Sessions',
    description: 'Completed 10 mentoring sessions.',
    icon: '🗓️',
    color: '#2563EB',
    category: 'experience'
  },
  {
    key: 'group_host',
    name: 'Group Host',
    description: 'Hosted 3+ group sessions.',
    icon: '👥',
    color: '#0EA5E9',
    category: 'experience'
  },
  {
    key: 'popular_mentor',
    name: 'Popular Mentor',
    description: 'Helped 10+ unique learners.',
    icon: '📈',
    color: '#10B981',
    category: 'engagement'
  },
  {
    key: 'five_star_mentor',
    name: '5-Star Mentor',
    description: 'Received 5 or more 5-star feedback ratings.',
    icon: '⭐',
    color: '#F59E0B',
    category: 'quality'
  },
  {
    key: 'rising_star',
    name: 'Rising Star',
    description: 'Average rating 4.5+ with at least 5 ratings.',
    icon: '🚀',
    color: '#F97316',
    category: 'quality'
  },
  {
    key: 'top_rated',
    name: 'Top Rated',
    description: 'Average rating 4.8+ with at least 20 ratings.',
    icon: '🏆',
    color: '#D97706',
    category: 'quality'
  },
  {
    key: 'forum_starter',
    name: 'Forum Starter',
    description: 'Created 5+ forum posts.',
    icon: '🗣️',
    color: '#8B5CF6',
    category: 'community'
  },
  {
    key: 'forum_helper',
    name: 'Forum Helper',
    description: 'Posted 10+ helpful comments.',
    icon: '💬',
    color: '#22C55E',
    category: 'community'
  },
  {
    key: 'forum_influencer',
    name: 'Forum Influencer',
    description: 'Accumulated 50+ upvotes across posts/comments.',
    icon: '📣',
    color: '#EC4899',
    category: 'community'
  },
  {
    key: 'verified_mentor',
    name: 'Verified Mentor',
    description: 'Verification approved by admins.',
    icon: '✅',
    color: '#14B8A6',
    category: 'trust'
  },
  {
    key: 'credentialed',
    name: 'Credentialed',
    description: 'Uploaded 3+ credentials or a credentials folder.',
    icon: '📂',
    color: '#64748B',
    category: 'trust'
  }
];

const BADGE_THRESHOLDS = [
  // sessions
  { key: 'first_session', all: [{ metric: 'sessionsCompleted', op: '>=', value: 1 }] },
  { key: 'ten_sessions', all: [{ metric: 'sessionsCompleted', op: '>=', value: 10 }] },
  { key: 'group_host', all: [{ metric: 'groupSessionsHosted', op: '>=', value: 3 }] },
  { key: 'popular_mentor', all: [{ metric: 'uniqueLearners', op: '>=', value: 10 }] },

  // feedback/ratings
  { key: 'five_star_mentor', all: [{ metric: 'fiveStarCount', op: '>=', value: 5 }] },
  {
    key: 'rising_star',
    all: [
      { metric: 'avgRating', op: '>=', value: 4.5 },
      { metric: 'ratingsCount', op: '>=', value: 5 }
    ]
  },
  {
    key: 'top_rated',
    all: [
      { metric: 'avgRating', op: '>=', value: 4.8 },
      { metric: 'ratingsCount', op: '>=', value: 20 }
    ]
  },

  // forum/community
  { key: 'forum_starter', all: [{ metric: 'forumPosts', op: '>=', value: 5 }] },
  { key: 'forum_helper', all: [{ metric: 'forumComments', op: '>=', value: 10 }] },
  { key: 'forum_influencer', all: [{ metric: 'forumUpvotes', op: '>=', value: 50 }] },

  // trust
  { key: 'verified_mentor', all: [{ metric: 'isVerified', op: '==', value: true }] },
  {
    key: 'credentialed',
    any: [
      { metric: 'credentialsCount', op: '>=', value: 1 },
      { metric: 'hasCredentialsFolder', op: '==', value: true }
    ]
  }
];

/**
 * Badge catalog schema (optional, for seeding/admin UI).
 */
const badgeDefinitionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    color: { type: String, default: '#64748B' },
    category: {
      type: String,
      enum: ['experience', 'quality', 'community', 'trust', 'engagement'],
      default: 'experience'
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const BadgeDefinition =
  mongoose.models.BadgeDefinition || mongoose.model('BadgeDefinition', badgeDefinitionSchema);

/**
 * MentorBadge: records which mentor has earned which badge (and when), one per pair.
 */
const mentorBadgeSchema = new mongoose.Schema(
  {
    mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true },
    badgeKey: { type: String, required: true, lowercase: true, trim: true },
    awardedAt: { type: Date, default: Date.now },
    // Optional snapshot of metrics when awarded (helps analytics/debugging).
    metricsSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

mentorBadgeSchema.index({ mentor: 1, badgeKey: 1 }, { unique: true });

const MentorBadge =
  mongoose.models.MentorBadge || mongoose.model('MentorBadge', mentorBadgeSchema);

/**
 * Compute metrics for a mentor across your existing collections.
 */
async function computeMentorMetrics(mentorId) {
  const id = typeof mentorId === 'string' ? new ObjectId(mentorId) : mentorId;

  // Load mentor to access userId and trust-related fields
  const mentorDoc = await Mentor.findById(id)
    .select('userId verified credentials credentialsFolderUrl')
    .lean();

  const userId = mentorDoc?.userId ? new ObjectId(mentorDoc.userId) : null;

  // Schedules: sessions, group sessions, unique learners
  const [sessionsCompleted, groupSessionsHosted, uniqueLearnersAgg] = await Promise.all([
    Schedule.countDocuments({ mentor: id }),
    Schedule.countDocuments({ mentor: id, sessionType: 'group' }),
    Schedule.aggregate([
      { $match: { mentor: id } },
      { $unwind: '$learners' },
      { $group: { _id: null, learners: { $addToSet: '$learners' } } },
      { $project: { _id: 0, count: { $size: '$learners' } } }
    ])]);

  const uniqueLearners = uniqueLearnersAgg?.[0]?.count || 0;

  // Feedback: ratings
  const ratingAgg = await Feedback.aggregate([
    { $match: { mentor: id } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        ratingsCount: { $sum: 1 },
        fiveStarCount: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
      }
    }
  ]);

  const avgRating = ratingAgg?.[0]?.avgRating || 0;
  const ratingsCount = ratingAgg?.[0]?.ratingsCount || 0;
  const fiveStarCount = ratingAgg?.[0]?.fiveStarCount || 0;

  // Forum/community: posts, comments, upvotes
  let forumPosts = 0;
  let forumComments = 0;
  let forumUpvotes = 0;

  if (userId) {
    const [postIds, commentIds] = await Promise.all([
      Forum.find({ author: userId }).select('_id').lean(),
      ForumComment.find({ author: userId }).select('_id').lean()
    ]);

    forumPosts = postIds.length;
    forumComments = commentIds.length;

    const postIdList = postIds.map(d => d._id);
    const commentIdList = commentIds.map(d => d._id);

    const [postMetricsAgg, commentMetricsAgg] = await Promise.all([
      postIdList.length
        ? ForumMetrics.aggregate([
            { $match: { onModel: 'Forum', target: { $in: postIdList } } },
            {
              $group: {
                _id: null,
                upvote: { $sum: '$upvote' },
                downvote: { $sum: '$downvote' },
                commentsCount: { $sum: '$commentsCount' }
              }
            }
          ])
        : Promise.resolve([]),
      commentIdList.length
        ? ForumMetrics.aggregate([
            { $match: { onModel: 'ForumComment', target: { $in: commentIdList } } },
            {
              $group: {
                _id: null,
                upvote: { $sum: '$upvote' },
                downvote: { $sum: '$downvote' },
                commentsCount: { $sum: '$commentsCount' }
              }
            }
          ])
        : Promise.resolve([])
    ]);

    const postUp = postMetricsAgg?.[0]?.upvote || 0;
    const commentUp = commentMetricsAgg?.[0]?.upvote || 0;
    forumUpvotes = postUp + commentUp;
  }

  // Trust / credentials
  const isVerified = !!mentorDoc?.verified;
  const credentialsCount = Array.isArray(mentorDoc?.credentials)
    ? mentorDoc.credentials.length
    : 0;
  const hasCredentialsFolder = !!mentorDoc?.credentialsFolderUrl;

  return {
    // sessions
    sessionsCompleted,
    groupSessionsHosted,
    uniqueLearners,
    // feedback
    avgRating: Number(avgRating.toFixed ? avgRating.toFixed(3) : avgRating),
    ratingsCount,
    fiveStarCount,
    // forum
    forumPosts,
    forumComments,
    forumUpvotes,
    // trust
    isVerified,
    credentialsCount,
    hasCredentialsFolder
  };
}

/**
 * Simple operator evaluator.
 */
const OPS = {
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b
};

/**
 * Decide which badges are currently achieved for a metrics snapshot.
 */
function evaluateBadgeKeys(metrics) {
  const achieved = [];

  for (const rule of BADGE_THRESHOLDS) {
    const allOk =
      !rule.all ||
      rule.all.every(cond => {
        const left = metrics[cond.metric];
        return OPS[cond.op]?.(left, cond.value);
      });

    const anyOk =
      !rule.any ||
      rule.any.some(cond => {
        const left = metrics[cond.metric];
        return OPS[cond.op]?.(left, cond.value);
      });

    if (allOk && anyOk) {
      achieved.push(rule.key);
    }
  }

  return achieved;
}

/**
 * Evaluate a mentor and return which badges they should earn now.
 */
async function evaluateMentorBadges(mentorId) {
  const metrics = await computeMentorMetrics(mentorId);
  const achievedKeys = evaluateBadgeKeys(metrics);
  return { achievedKeys, metrics };
}

/**
 * Persist newly earned badges for a mentor.
 * Returns { awarded: [{badgeKey, awardedAt}], alreadyHad: [badgeKey], metrics }
 */
async function awardMentorBadges(mentorId) {
  const { achievedKeys, metrics } = await evaluateMentorBadges(mentorId);

  const existing = await MentorBadge.find({
    mentor: mentorId,
    badgeKey: { $in: achievedKeys }
  })
    .select('badgeKey')
    .lean();

  const existingKeys = new Set(existing.map(d => d.badgeKey));
  const newKeys = achievedKeys.filter(k => !existingKeys.has(k));

  const now = new Date();
  const docs =
    newKeys.length > 0
      ? await MentorBadge.insertMany(
          newKeys.map(k => ({
            mentor: mentorId,
            badgeKey: k,
            awardedAt: now,
            metricsSnapshot: metrics
          })),
          { ordered: false }
        )
      : [];

  return {
    awarded: docs.map(d => ({ badgeKey: d.badgeKey, awardedAt: d.awardedAt })),
    alreadyHad: Array.from(existingKeys),
    metrics
  };
}

module.exports = {
  // models
  BadgeDefinition,
  MentorBadge,
  // static catalog + rules
  BADGES,
  BADGE_THRESHOLDS,
  // services
  computeMentorMetrics,
  evaluateMentorBadges,
  awardMentorBadges
};