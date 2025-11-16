const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const connectDB = require('./config/mongodb'); 

//router initialization
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const testRouter = require('./routes/test');
const learnerRoute = require('./routes/learner');
const mentorRoute = require('./routes/mentor');
const httpCookieRouter = require('./routes/httpCookie');
const messageRouter = require('./routes/message')
const adminRouter = require('./routes/admin');
const pusherRouter = require('./routes/pusher');
const forumRouter = require('./routes/forum');
const jitsiRouter = require('./routes/jitsi'); // NEW
const roleRouter = require('./routes/role');
const aiRouter = require('./routes/ai');

const app = express();

connectDB();

app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser()); 

// CORS configuration - MUST BE BEFORE ROUTES
app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// API Routes
app.use('/api', indexRouter);
app.use('/api/users', usersRouter);
app.use('/api/auth', authRouter);
app.use('/api/test', testRouter);
app.use('/api/learner', learnerRoute);
app.use('/api/mentor', mentorRoute);
app.use('/api/cookie', httpCookieRouter);
app.use('/api/message', messageRouter);
app.use('/api/admin', adminRouter);
app.use('/api/pusher', pusherRouter);
app.use('/api/forum', forumRouter);
app.use('/api/jitsi', jitsiRouter); // NEW
app.use('/api/role', roleRouter);
app.use('/ai', aiRouter);

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({ error: 'Not found (app.js)' });
});

// Error handler
app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
    });
});

module.exports = app;
