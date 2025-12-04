-- MindMate Database Schema for Supabase PostgreSQL
-- Run these commands in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (for authentication and basic info)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('learner', 'mentor', 'admin')),
    alt_role VARCHAR(50) CHECK (alt_role IN ('learner', 'mentor', 'admin')),
    is_verified BOOLEAN DEFAULT FALSE,
    year_level VARCHAR(50),
    program VARCHAR(100),
    sex VARCHAR(20),
    phone_number VARCHAR(50),
    address TEXT,
    bio TEXT,
    experience TEXT,
    image TEXT,
    modality VARCHAR(50),
    style TEXT[], -- Array of teaching/learning styles
    availability TEXT[], -- Array of available days
    session_dur VARCHAR(50),
    proficiency VARCHAR(50),
    specialization TEXT[], -- Array of specializations
    archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Verification tokens table
CREATE TABLE IF NOT EXISTS verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_verification_tokens_token ON verification_tokens(token);
CREATE INDEX idx_verification_tokens_user_id ON verification_tokens(user_id);

-- Specializations table
CREATE TABLE IF NOT EXISTS specializations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    roadmap JSONB, -- Store roadmap as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subjects table
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    specialization VARCHAR(255) NOT NULL,
    difficulty JSONB, -- Store beginner/intermediate/advanced as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Preset schedules table
CREATE TABLE IF NOT EXISTS preset_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mentor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    mentor_name VARCHAR(255) NOT NULL,
    days TEXT[] NOT NULL, -- Array of days (monday, tuesday, etc.)
    time VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    specialization VARCHAR(255) NOT NULL,
    course VARCHAR(50) NOT NULL CHECK (course IN ('BSIT', 'BSCS', 'BSEMC')),
    participants TEXT[], -- Array of participant IDs (as strings for now)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_preset_schedules_mentor_id ON preset_schedules(mentor_id);
CREATE INDEX idx_preset_schedules_specialization ON preset_schedules(specialization);

-- Schedules table (for one-on-one sessions)
CREATE TABLE IF NOT EXISTS schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    learner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    mentor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time VARCHAR(50) NOT NULL,
    duration VARCHAR(50),
    subject VARCHAR(255),
    specialization VARCHAR(255),
    modality VARCHAR(50),
    style TEXT[],
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_schedules_learner_id ON schedules(learner_id);
CREATE INDEX idx_schedules_mentor_id ON schedules(mentor_id);
CREATE INDEX idx_schedules_status ON schedules(status);

-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    learner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    mentor_id UUID REFERENCES users(id),
    specialization VARCHAR(255) NOT NULL,
    skill VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT[],
    submission_url TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')),
    xp_reward INTEGER DEFAULT 0,
    feedback TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_challenges_learner_id ON challenges(learner_id);
CREATE INDEX idx_challenges_mentor_id ON challenges(mentor_id);
CREATE INDEX idx_challenges_status ON challenges(status);
CREATE INDEX idx_challenges_specialization ON challenges(specialization);

-- User skill progress table
CREATE TABLE IF NOT EXISTS user_skill_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    specialization VARCHAR(255) NOT NULL,
    skill VARCHAR(255) NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    challenges_completed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, specialization, skill)
);

CREATE INDEX idx_user_skill_progress_user_id ON user_skill_progress(user_id);
CREATE INDEX idx_user_skill_progress_specialization ON user_skill_progress(specialization);

-- User roadmap progress table
CREATE TABLE IF NOT EXISTS user_roadmap_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    specialization VARCHAR(255) NOT NULL,
    stage VARCHAR(255) NOT NULL,
    topics_completed TEXT[],
    total_topics INTEGER DEFAULT 0,
    completion_percentage DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, specialization, stage)
);

CREATE INDEX idx_user_roadmap_progress_user_id ON user_roadmap_progress(user_id);
CREATE INDEX idx_user_roadmap_progress_specialization ON user_roadmap_progress(specialization);

-- Badges table
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon TEXT,
    criteria JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User badges (junction table)
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user_id ON user_badges(user_id);

-- Ranks table
CREATE TABLE IF NOT EXISTS ranks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    min_xp INTEGER NOT NULL,
    icon TEXT,
    color VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages table (for chat)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_receiver_id ON messages(receiver_id);

-- Forum posts table
CREATE TABLE IF NOT EXISTS forum_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(255),
    tags TEXT[],
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_forum_posts_author_id ON forum_posts(author_id);
CREATE INDEX idx_forum_posts_category ON forum_posts(category);

-- Forum comments table
CREATE TABLE IF NOT EXISTS forum_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_forum_comments_post_id ON forum_comments(post_id);
CREATE INDEX idx_forum_comments_author_id ON forum_comments(author_id);

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
    learner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    mentor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_feedback_session_id ON feedback(session_id);
CREATE INDEX idx_feedback_learner_id ON feedback(learner_id);
CREATE INDEX idx_feedback_mentor_id ON feedback(mentor_id);

-- Whiteboard states table
CREATE TABLE IF NOT EXISTS whiteboard_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
    state JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_whiteboard_states_session_id ON whiteboard_states(session_id);

-- Jitsi meetings table
CREATE TABLE IF NOT EXISTS jitsi_meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_name VARCHAR(255) UNIQUE NOT NULL,
    schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
    participants TEXT[],
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_jitsi_meetings_room_name ON jitsi_meetings(room_name);
CREATE INDEX idx_jitsi_meetings_schedule_id ON jitsi_meetings(schedule_id);

-- Session analytics table
CREATE TABLE IF NOT EXISTS session_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
    duration_minutes INTEGER,
    topics_covered TEXT[],
    learner_engagement_score INTEGER CHECK (learner_engagement_score >= 1 AND learner_engagement_score <= 10),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_session_analytics_session_id ON session_analytics(session_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_specializations_updated_at BEFORE UPDATE ON specializations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_preset_schedules_updated_at BEFORE UPDATE ON preset_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_challenges_updated_at BEFORE UPDATE ON challenges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_skill_progress_updated_at BEFORE UPDATE ON user_skill_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_roadmap_progress_updated_at BEFORE UPDATE ON user_roadmap_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_forum_posts_updated_at BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_forum_comments_updated_at BEFORE UPDATE ON forum_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whiteboard_states_updated_at BEFORE UPDATE ON whiteboard_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE preset_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skill_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roadmap_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE jitsi_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_analytics ENABLE ROW LEVEL SECURITY;

-- Create policies (example - adjust based on your needs)
-- Allow service role to do everything
CREATE POLICY "Service role has full access" ON users FOR ALL USING (true);

-- You can add more specific policies for authenticated users
-- For example:
-- CREATE POLICY "Users can view their own data" ON users FOR SELECT USING (auth.uid() = id);
-- CREATE POLICY "Users can update their own data" ON users FOR UPDATE USING (auth.uid() = id);
