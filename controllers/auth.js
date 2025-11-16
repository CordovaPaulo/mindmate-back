const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Learner = require('../models/Learner');
const Mentor = require('../models/Mentor');
const { getValuesFromToken } = require('../service/jwt');
const uploadController = require('./upload');
const cloudinary = require('../service/cloudinary');
const streamifier = require('streamifier');
const { setCookie } = require('./cookie');
const mailingController = require('./mailing');
const VerificationToken = require('../models/VerificationToken');
const crypto = require('crypto');
const Rank = require('../models/rank');
// const APP_BASE = (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/,'');
// const API_BASE = (process.env.BACKEND_URL || process.env.API_URL || 'http://localhost:5000').replace(/\/+$/,'');

// Helper: send role confirmation email with verify/unverify links
async function sendRoleConfirmationEmail({ id: uid, username, email }, role, roleDocId) {
  try {
    const ttlMs = 2 * 24 * 60 * 60 * 1000; // 2 days
    const expiresAt = new Date(Date.now() + ttlMs);

    const verifyJti = crypto.randomUUID();
    const unverifyJti = crypto.randomUUID();

    await VerificationToken.create([
      { jti: verifyJti, uid, role, roleId: roleDocId, type: 'role_verify', expiresAt },
      { jti: unverifyJti, uid, role, roleId: roleDocId, type: 'role_unverify', expiresAt }
    ]);

    const verifyToken = jwt.sign(
      { uid, role, roleId: roleDocId, type: 'role_verify', jti: verifyJti },
      process.env.JWT_SECRET,
      { expiresIn: '2d' }
    );
    const unverifyToken = jwt.sign(
      { uid, role, roleId: roleDocId, type: 'role_unverify', jti: unverifyJti },
      process.env.JWT_SECRET,
      { expiresIn: '2d' }
    );

    const API_BASE = process.env.BACKEND_URL || 'http://localhost:3001';

    const verifyUrl = `${API_BASE}/api/auth/role/verify?token=${encodeURIComponent(verifyToken)}`;
    const unverifyUrl = `${API_BASE}/api/auth/role/unverify?token=${encodeURIComponent(unverifyToken)}`;

    const subj = `Confirm your ${role === 'mentor' ? 'Mentor' : 'Learner'} account`;
    const text = `
Hi ${username},

You just created a ${role} profile on MindMate. Please confirm:

Verify: ${verifyUrl}
Do not verify: ${unverifyUrl}

If you didn't request this, you can ignore this email.

MindMate Team
`.trim();

    const brandPrimary = '#4F46E5';
    const html = `
<!doctype html>
<html>
  <body style="font-family:Arial,Helvetica,sans-serif;background:#F8FAFC;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
      <div style="height:6px;background:${brandPrimary}"></div>
      <div style="padding:20px 24px">
        <h2 style="margin:0 0 10px 0">Confirm your ${role === 'mentor' ? 'Mentor' : 'Learner'} account</h2>
        <p>Hi ${username},</p>
        <p>You created a ${role} profile on MindMate. Please confirm your account:</p>
        <p>
          <a href="${verifyUrl}" style="background:${brandPrimary};color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;margin-right:10px">Verify account</a>
          <a href="${unverifyUrl}" style="background:#E11D48;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block">Do not verify</a>
        </p>
        <p style="color:#475569;font-size:12px">If the buttons don't work, copy these links:</p>
        <p style="word-break:break-all;font-size:12px"><strong>Verify:</strong> ${verifyUrl}</p>
        <p style="word-break:break-all;font-size:12px"><strong>Do not verify:</strong> ${unverifyUrl}</p>
      </div>
    </div>
  </body>
</html>
`.trim();

    await mailingController.sendEmailNotification(email, subj, text, html);
  } catch (e) {
    console.error('[MAIL] Failed to send role confirmation email:', e.message);
  }
}


exports.learnerSignup = async (req, res) => {
  const decoded = getValuesFromToken(req);
  if (!decoded) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }

  let learnerImage = null;
  if (req.file) {
    try {
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'auto' },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          streamifier.createReadStream(buffer).pipe(stream);
        });
      };
      const uploadResult = await streamUpload(req.file.buffer);
      learnerImage = uploadResult.secure_url;
    } catch (err) {
      return res.status(500).json({ message: 'Image upload failed', code: 500 });
    }
  } else {
    learnerImage = req.body.image === null ? "null" : req.body.image;
  }

  const { 
    program,
    yearLevel,
    phoneNumber,
    bio,
    sex,
    goals,
    address,
    modality,
    subjects,
    availability,
    style,
    sessionDur
  } = req.body;

  // Parse arrays if sent as JSON strings
  const parsedSubjects = typeof subjects === 'string' ? JSON.parse(subjects) : subjects;
  const parsedAvailability = typeof availability === 'string' ? JSON.parse(availability) : availability;
  const parsedStyle = typeof style === 'string' ? JSON.parse(style) : style;

  // Check if learner already exists
  const existingLearner = await Learner.findOne({ userId: decoded.id });
  if (existingLearner) {
    return res.status(400).json({ message: 'Learner already exists', code: 400 });
  }

  // Validate required fields
  if (!decoded.id || !decoded.username || !decoded.email || !program || !yearLevel || !phoneNumber || !bio || !sex || !goals || !address || !modality || !parsedSubjects || !parsedAvailability || !parsedStyle || !sessionDur) {
    return res.status(400).json({ message: 'All fields are required', code: 400 });
  }

  // Validate field formats
  if (phoneNumber.length !== 11) {
    return res.status(400).json({ message: 'Phone number must be 11 digits', code: 400 });
  }
  if (bio.length < 10 || bio.length > 550) {
    return res.status(400).json({ message: 'Bio must be between 10 and 550 characters', code: 400 });
  }

  // Define valid enum values (from your Learner model)
  const validPrograms = ['BSIT', 'BSCS', 'BSEMC'];
  const validYearLevels = ['1st year', '2nd year', '3rd year', '4th year', 'graduate'];
  const validModalities = ['online', 'in-person', 'hybrid'];
  const validSessionDurations = ['1hr', '2hrs', '3hrs'];
  const validSexValues = ['male', 'female'];
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const validStyles = ['lecture-based', 'interactive-discussion', 'q-and-a-discussion', 'demonstrations', 'project-based', 'step-by-step-discussion'];

  // Validate enum values
  if (!validPrograms.includes(program)) {
    return res.status(400).json({ message: 'Invalid program', code: 400, validOptions: validPrograms });
  }
  if (!validYearLevels.includes(yearLevel)) {
    return res.status(400).json({ message: 'Invalid year level', code: 400, validOptions: validYearLevels });
  }
  if (!validModalities.includes(modality)) {
    return res.status(400).json({ message: 'Invalid modality', code: 400, validOptions: validModalities });
  }
  if (!validSessionDurations.includes(sessionDur)) {
    return res.status(400).json({ message: 'Invalid session duration', code: 400, validOptions: validSessionDurations });
  }
  if (!validSexValues.includes(sex)) {
    return res.status(400).json({ message: 'Invalid sex value', code: 400, validOptions: validSexValues });
  }

  // Validate arrays
  if (!Array.isArray(parsedSubjects) || parsedSubjects.length === 0) {
    return res.status(400).json({ message: 'Subjects must be a non-empty array', code: 400 });
  }
  if (!Array.isArray(parsedAvailability) || parsedAvailability.length === 0) {
    return res.status(400).json({ message: 'Availability must be a non-empty array', code: 400 });
  }
  if (!Array.isArray(parsedStyle) || parsedStyle.length === 0) {
    return res.status(400).json({ message: 'Style must be a non-empty array', code: 400 });
  }

  // Validate availability days
  for (const day of parsedAvailability) {
    if (!validDays.includes(day)) {
      return res.status(400).json({ message: `Invalid availability day: ${day}`, code: 400, validOptions: validDays });
    }
  }

  // Validate learning styles
  for (const style of parsedStyle) {
    if (!validStyles.includes(style)) {
      return res.status(400).json({ message: `Invalid learning style: ${style}`, code: 400, validOptions: validStyles });
    }
  }

  try {
    // Create learner document
    const learner = new Learner({
      userId: decoded.id,
      name: decoded.username,
      email: decoded.email,
      sex,
      program,
      yearLevel,
      phoneNumber,
      bio,
      goals,
      address,
      modality,
      subjects: parsedSubjects,
      availability: parsedAvailability,
      style: parsedStyle,
      sessionDur,
      image: learnerImage
    });

    // Update user role
    await User.updateOne({ _id: decoded.id }, { role: 'learner' });
    
    // Save learner
    await learner.save();

    // Send confirmation email (after role/profile is registered)
    sendRoleConfirmationEmail(
      { id: decoded.id, username: decoded.username, email: decoded.email },
      'learner',
      learner._id
    ).catch(() => {});
    
    return res.status(201).json({
      message: 'Learner created successfully',
      learner: {
        id: learner._id,
        name: learner.name,
        email: learner.email,
        role: 'learner'
      }
    });
  } catch (error) {
    console.error('Error saving learner:', error);
    return res.status(500).json({ message: 'Error creating learner', code: 500, error: error.message });
  }
};

exports.mentorSignup = async (req, res) => {
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.MindMateToken) {
    token = req.cookies.MindMateToken;
  }
  const decoded = token ? require('jsonwebtoken').verify(token, process.env.JWT_SECRET) : null;
  if (!decoded) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }

  let mentorImage = null;
  const imageFile =
    req.file // in case a different middleware calls .single('image')
    || (req.files && Array.isArray(req.files.image) && req.files.image[0]);
  if (imageFile) {
    try {
      const streamUpload = (buffer) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'auto' },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          streamifier.createReadStream(buffer).pipe(stream);
        });
      };
      const uploadResult = await streamUpload(imageFile.buffer);
      mentorImage = uploadResult.secure_url;
    } catch (err) {
      return res.status(500).json({ message: 'Image upload failed', code: 500 });
    }
  } else {
    mentorImage = req.body.image === null ? "null" : req.body.image;
  }

  // Handle credentials upload if files are present
  let credentialsFolderUrl = null;
  let credentialsUrls = [];
  if (req.files && Array.isArray(req.files.credentials) && req.files.credentials.length > 0) {
    try {
      const credsReq = {
        ...req,
        files: req.files.credentials,
        headers: req.headers
      };
      const credsRes = {
        data: null,
        status: function () { return this; },
        json: function (data) { this.data = data; return this; }
      };
      await uploadController.uploadMentorCredentials(credsReq, credsRes);

      if (credsRes.data) {
        credentialsFolderUrl = credsRes.data.folderUrl || credsRes.data.folderWebViewLink || null;
        if (credsRes.data.files && Array.isArray(credsRes.data.files)) {
          credentialsUrls = credsRes.data.files.map(f => f.webViewLink || f.webContentLink || f.url).filter(Boolean);
        }
      }
    } catch (err) {
      console.error('Error uploading mentor credentials:', err);
      return res.status(500).json({ message: 'Credentials upload failed', code: 500 });
    }
  }

  // Parse fields from req.body (FormData sends all as strings)
  const {
    sex, program, yearLevel, phoneNumber, bio, exp, address, modality,
    proficiency, subjects, availability, style, sessionDur
  } = req.body;

  // Parse arrays if sent as JSON strings
  const parsedSubjects = typeof subjects === 'string' ? JSON.parse(subjects) : subjects;
  const parsedAvailability = typeof availability === 'string' ? JSON.parse(availability) : availability;
  const parsedStyle = typeof style === 'string' ? JSON.parse(style) : style;

  // Validate required fields (add more as needed)
  if (!decoded.id || !decoded.username || !decoded.email || !sex || !program || !yearLevel || !phoneNumber || !bio || !exp || !address || !modality || !proficiency || !parsedSubjects || !parsedAvailability || !parsedStyle || !sessionDur) {
    return res.status(400).json({ message: 'All fields are required', code: 400 });
  }

  // Validate field formats
  if (phoneNumber.length !== 11) {
    return res.status(400).json({ message: 'Phone number must be 11 digits', code: 400 });
  }
  if (bio.length < 10 || bio.length > 550) {
    return res.status(400).json({ message: 'Bio must be between 10 and 550 characters', code: 400 });
  }

  // Define valid enum values (from your Mentor model)
  const validPrograms = ['BSIT', 'BSCS', 'BSEMC'];
  const validYearLevels = ['1st year', '2nd year', '3rd year', '4th year', 'graduate'];
  const validModalities = ['online', 'in-person', 'hybrid'];
  const validSessionDurations = ['1hr', '2hrs', '3hrs'];
  const validSexValues = ['male', 'female'];
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const validStyles = ['lecture-based', 'interactive-discussion', 'q-and-a-discussion', 'demonstrations', 'project-based', 'step-by-step-discussion'];

  // Validate enum values
  if (!validPrograms.includes(program)) {
    return res.status(400).json({ message: 'Invalid program', code: 400, validOptions: validPrograms });
  }
  if (!validYearLevels.includes(yearLevel)) {
    return res.status(400).json({ message: 'Invalid year level', code: 400, validOptions: validYearLevels });
  }
  if (!validModalities.includes(modality)) {
    return res.status(400).json({ message: 'Invalid modality', code: 400, validOptions: validModalities });
  }
  if (!validSessionDurations.includes(sessionDur)) {
    return res.status(400).json({ message: 'Invalid session duration', code: 400, validOptions: validSessionDurations });
  }
  if (!validSexValues.includes(sex)) {
    return res.status(400).json({ message: 'Invalid sex value', code: 400, validOptions: validSexValues });
  }

  // Validate arrays
  if (!Array.isArray(parsedSubjects) || parsedSubjects.length === 0) {
    return res.status(400).json({ message: 'Subjects must be a non-empty array', code: 400 });
  }
  if (!Array.isArray(parsedAvailability) || parsedAvailability.length === 0) {
    return res.status(400).json({ message: 'Availability must be a non-empty array', code: 400 });
  }
  if (!Array.isArray(parsedStyle) || parsedStyle.length === 0) {
    return res.status(400).json({ message: 'Style must be a non-empty array', code: 400 });
  }

  // Validate availability days
  for (const day of parsedAvailability) {
    if (!validDays.includes(day)) {
      return res.status(400).json({ message: `Invalid availability day: ${day}`, code: 400, validOptions: validDays });
    }
  }

  // Validate learning styles
  for (const style of parsedStyle) {
    if (!validStyles.includes(style)) {
      return res.status(400).json({ message: `Invalid learning style: ${style}`, code: 400, validOptions: validStyles });
    }
  }

  try {
    // Create mentor document
    const mentor = new Mentor({
      userId: decoded.id,
      name: decoded.username,
      email: decoded.email,
      sex,
      program,
      yearLevel,
      phoneNumber,
      bio,
      exp,
      address,
      modality,
      proficiency,
      subjects: parsedSubjects,
      availability: parsedAvailability,
      style: parsedStyle,
      sessionDur,
      image: mentorImage,
      credentials: credentialsUrls,
      credentialsFolderUrl: credentialsFolderUrl
    });

    const rank = new Rank({ learnerId: decoded.id });

    // Update user role
    await User.updateOne({ _id: decoded.id }, { role: 'mentor' });
    
    // Save mentor
    await mentor.save();
    await rank.save();

    // Send confirmation email (after role/profile is registered)
    sendRoleConfirmationEmail(
      { id: decoded.id, username: decoded.username, email: decoded.email },
      'mentor',
      mentor._id
    ).catch(() => {});
    
    return res.status(201).json(mentor);
  } catch (error) {
    console.error('Error saving mentor:', error);
    return res.status(500).json({ message: 'Error creating mentor', code: 500, error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('[LOGIN] body:', req.body);
    const { iniCred, password } = req.body;
    if (!iniCred || !password) {
      return res.status(400).json({ message: 'Missing credentials' });
    }

    const query = [
      { username: iniCred },
      { email: iniCred }
    ];
    if (/^\d{9}$/.test(iniCred)) {
      query.push({ email: { $regex: `^${iniCred}` } });
    }
    const user = await User.findOne({ $or: query });

    if (!user) {
      return res.status(401).json({ message: 'unknown user' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.role === 'mentor') {
      const mentor = await Mentor.findOne({ userId: user._id });
      if (mentor && mentor.accountStatus === 'pending') {
        return res.status(403).json({ message: 'Mentor account is still pending approval' });
      }
      if (mentor && mentor.accountStatus === 'rejected') {
        return res.status(403).json({ message: 'Mentor account has been rejected' });
      }
      if (mentor && mentor.verified === false) {
        return res.status(403).json({ message: 'Mentor account is not verified yet' });
      }
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'User account is suspended' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ message: 'User account is banned' });
    }

    if(user.role === 'learner'){
      const learner = await Learner.findOne({ userId: user._id });
      if(learner && learner.verified === false){
        return res.status(403).json({ message: 'Learner account is not verified yet' });
      }
    }

    const payload = { id: user._id, username: user.username, email: user.email, role: user.role, altRole: user.altRole, status: user.status };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('MindMateToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      path: '/',
      maxAge: parseInt(process.env.AUTH_COOKIE_MAX_AGE || `${7 * 24 * 60 * 60 * 1000}`, 10)
    });

    // Return token and role so the frontend can store the token and redirect by role
    return res.json({
      token,
      userRole: payload.role,
      user: payload
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({ message: 'Internal server error', detail: err.message });
  }
};

// Helper: escape regex
function escRegex(s = '') { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Helper: first 9 digits from the local-part of email
function firstNineDigitsFromEmail(email = '') {
  const local = (email || '').split('@')[0] || '';
  const digits = local.replace(/\D/g, '');
  return digits.slice(0, 9);
}

exports.forgotPassword = async (req, res) => {
  try {
    const { pre_cred, id, name, email, role } = req.body || {};

    // Require at least the pre_cred; the rest are mandatory for verification
    if (!pre_cred) {
      return res.status(400).json({ message: 'pre_cred is required', code: 400 });
    }
    const missing = ['id', 'name', 'email', 'role'].filter((k) => !req.body?.[k]);
    if (missing.length) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}`, code: 400 });
    }

    // Find user by:
    // - username equals pre_cred
    // - OR email equals pre_cred
    // - OR email starts with the 9-digit id (or pre_cred if it is 9 digits)
    const nineFromPreCred = /^\d{9}$/.test(pre_cred) ? pre_cred : null;
    const orTerms = [
      { username: pre_cred },
      { email: pre_cred }
    ];

    // If pre_cred looks like 9 digits, match emails that start with those digits
    if (nineFromPreCred) {
      orTerms.push({ email: { $regex: `^${escRegex(nineFromPreCred)}`, $options: 'i' } });
    }

    // Also allow matching the provided id (if 9 digits) against email prefix
    if (/^\d{9}$/.test(id)) {
      orTerms.push({ email: { $regex: `^${escRegex(id)}`, $options: 'i' } });
    }

    const user = await User.findOne({ $or: orTerms });

    // Always respond generically on failure to avoid enumeration
    if (!user) {
      return res.status(400).json({ message: 'Verification failed', code: 400 });
    }

    // Validate role
    if ((role || '').toLowerCase() !== (user.role || '').toLowerCase()) {
      return res.status(400).json({ message: 'Verification failed', code: 400 });
    }

    // Validate email
    if ((email || '').toLowerCase().trim() !== (user.email || '').toLowerCase().trim()) {
      return res.status(400).json({ message: 'Verification failed', code: 400 });
    }

    // Validate id against first 9 digits in user.email
    const expectedId = firstNineDigitsFromEmail(user.email);
    if (!expectedId || id !== expectedId) {
      return res.status(400).json({ message: 'Verification failed', code: 400 });
    }

    // Validate name against username or profile name
    let profileName = null;
    if (user.role === 'learner') {
      const learner = await Learner.findOne({ userId: user._id });
      profileName = learner?.name || null;
    } else if (user.role === 'mentor') {
      const mentor = await Mentor.findOne({ userId: user._id });
      profileName = mentor?.name || null;
    }
    const normalized = (v) => (v || '').toString().trim().toLowerCase();
    const nameOk = normalized(name) === normalized(user.username) || (profileName && normalized(name) === normalized(profileName));
    if (!nameOk) {
      return res.status(400).json({ message: 'Verification failed', code: 400 });
    }

    // If all checks pass, issue reset token and email the link
    const resetToken = jwt.sign(
      { id: user._id, type: 'password_reset' },
      process.env.RESET_TOKEN_SECRET || process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    const appBase =
      process.env.FRONTEND_URL ||
      process.env.APP_URL ||
      'http://localhost:3000';

    const resetLink = `${appBase.replace(/\/+$/, '')}/auth/reset-password/${encodeURIComponent(resetToken)}`;

    // Brand palette aligned to frontend (indigo + clean light UI)
    const brand = {
      name: process.env.APP_NAME || 'MindMate',
      url: appBase.replace(/\/+$/, ''),
      primary: '#4F46E5',      // indigo-600
      primaryDark: '#4338CA',  // indigo-700
      bg: '#F8FAFC',           // slate-50
      cardBg: '#FFFFFF',
      text: '#0F172A',         // slate-900
      muted: '#475569',        // slate-600
      border: '#E2E8F0'        // slate-200
    };
    const logoUrl = `${brand.url}/logo.png`;

    const subject = `${brand.name} • Password Reset Request`;

    const text = `
Hi ${user.username},

We received a request to reset your password. Use the link below to set a new password. This link expires in 30 minutes.

${resetLink}

If you did not request this, you can ignore this email.

${brand.name} Team
`.trim();

    const html = `
<!doctype html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${brand.name} • Reset your password</title>
</head>
<body style="margin:0;padding:0;background:${brand.bg};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${brand.cardBg};border:1px solid ${brand.border};border-radius:12px;box-shadow:0 10px 30px rgba(2,6,23,.06);overflow:hidden;">
          <tr>
            <td style="height:6px;background:${brand.primary};"></td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 0 24px;">
              <img src="${logoUrl}" width="64" height="64" alt="${brand.name} logo" style="display:block;margin:0 auto 8px;border-radius:12px;">
              <h1 style="margin:8px 0 0 0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:20px;line-height:28px;color:${brand.text};font-weight:700;">Reset your password</h1>
              <p style="margin:6px 0 0 0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:${brand.muted};">
                We received a request to reset your ${brand.name} password.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 24px 4px 24px;">
              <a href="${resetLink}"
                 style="background:${brand.primary};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;display:inline-block;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-weight:600;font-size:14px;">
                 Reset Password
              </a>
              <p style="margin:10px 0 0 0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${brand.muted};">
                This link expires in 30 minutes.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 20px 24px;">
              <p style="margin:0 0 6px 0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${brand.muted};">
                If the button doesn’t work, copy and paste this link into your browser:
              </p>
              <a href="${resetLink}" style="font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${brand.primaryDark};word-break:break-all;text-decoration:none;">
                ${resetLink}
              </a>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${brand.border};padding:16px 24px 20px 24px;">
              <p style="margin:0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${brand.muted};">
                Didn’t request this? You can safely ignore this email.
              </p>
              <p style="margin:8px 0 0 0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${brand.muted};">
                © ${new Date().getFullYear()} ${brand.name}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

    await mailingController.sendEmailNotification(user.email, subject, text, html);

    return res.status(200).json({ message: 'Password reset link sent if verification succeeded.', code: 200 });
  } catch (err) {
    console.error('[FORGOT PASSWORD VERIFY]', err);
    return res.status(500).json({ message: 'Internal server error', code: 500 });
  }
};

// Verify a reset token (optional helper for frontend)
exports.verifyResetToken = async (req, res) => {
  try {
    const token = req.query?.token || req.body?.token;
    if (!token) return res.status(400).json({ message: 'token is required', code: 400 });

    const payload = jwt.verify(token, process.env.RESET_TOKEN_SECRET || process.env.JWT_SECRET);
    if (payload?.type !== 'password_reset') {
      return res.status(400).json({ message: 'Invalid token type', code: 400 });
    }
    return res.status(200).json({ valid: true, userId: payload.id, code: 200 });
  } catch (err) {
    return res.status(400).json({ message: 'Invalid or expired token', code: 400 });
  }
};

// Reset password using a valid token
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body || {};
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'token, newPassword and confirmPassword are required', code: 400 });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match', code: 400 });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters', code: 400 });
    }

    const payload = jwt.verify(token, process.env.RESET_TOKEN_SECRET || process.env.JWT_SECRET);
    if (payload?.type !== 'password_reset') {
      return res.status(400).json({ message: 'Invalid token type', code: 400 });
    }

    const user = await User.findById(payload.id);
    if (!user) return res.status(404).json({ message: 'User not found', code: 404 });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    return res.status(200).json({ message: 'Password has been reset successfully', code: 200 });
  } catch (err) {
    console.error('[RESET PASSWORD]', err);
    return res.status(400).json({ message: 'Invalid or expired token', code: 400 });
  }
};

exports.logout = async (req, res) => {
  try {
    res.clearCookie('MindMateToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      path: '/'
    });
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('[LOGOUT ERROR]', error);
    return res.status(500).json({ message: 'Internal server error', detail: error.message });
  }
};

exports.learnerAltSignup = async (req, res) => {
  const decoded = getValuesFromToken(req);
  if (!decoded) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }

  let learnerImage = null;
  if (req.file) {
    try {
      const streamUpload = (buffer) => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => (result ? resolve(result) : reject(error))
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
      const uploadResult = await streamUpload(req.file.buffer);
      learnerImage = uploadResult.secure_url;
    } catch (err) {
      return res.status(500).json({ message: 'Image upload failed', code: 500 });
    }
  } else {
    learnerImage = req.body.image === null ? "null" : req.body.image;
  }

  const { 
    program,
    yearLevel,
    phoneNumber,
    bio,
    sex,
    goals,
    address,
    modality,
    subjects,
    availability,
    style,
    sessionDur
  } = req.body;

  const parsedSubjects = typeof subjects === 'string' ? JSON.parse(subjects) : subjects;
  const parsedAvailability = typeof availability === 'string' ? JSON.parse(availability) : availability;
  const parsedStyle = typeof style === 'string' ? JSON.parse(style) : style;

  const existingLearner = await Learner.findOne({ userId: decoded.id });
  if (existingLearner) {
    return res.status(400).json({ message: 'Learner already exists', code: 400 });
  }

  if (!decoded.id || !decoded.username || !decoded.email || !program || !yearLevel || !phoneNumber || !bio || !sex || !goals || !address || !modality || !parsedSubjects || !parsedAvailability || !parsedStyle || !sessionDur) {
    return res.status(400).json({ message: 'All fields are required', code: 400 });
  }

  if (phoneNumber.length !== 11) {
    return res.status(400).json({ message: 'Phone number must be 11 digits', code: 400 });
  }
  if (bio.length < 10 || bio.length > 550) {
    return res.status(400).json({ message: 'Bio must be between 10 and 550 characters', code: 400 });
  }

  const validPrograms = ['BSIT', 'BSCS', 'BSEMC'];
  const validYearLevels = ['1st year', '2nd year', '3rd year', '4th year', 'graduate'];
  const validModalities = ['online', 'in-person', 'hybrid'];
  const validSessionDurations = ['1hr', '2hrs', '3hrs'];
  const validSexValues = ['male', 'female'];
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const validStyles = ['lecture-based', 'interactive-discussion', 'q-and-a-discussion', 'demonstrations', 'project-based', 'step-by-step-discussion'];

  if (!validPrograms.includes(program)) {
    return res.status(400).json({ message: 'Invalid program', code: 400, validOptions: validPrograms });
  }
  if (!validYearLevels.includes(yearLevel)) {
    return res.status(400).json({ message: 'Invalid year level', code: 400, validOptions: validYearLevels });
  }
  if (!validModalities.includes(modality)) {
    return res.status(400).json({ message: 'Invalid modality', code: 400, validOptions: validModalities });
  }
  if (!validSessionDurations.includes(sessionDur)) {
    return res.status(400).json({ message: 'Invalid session duration', code: 400, validOptions: validSessionDurations });
  }
  if (!validSexValues.includes(sex)) {
    return res.status(400).json({ message: 'Invalid sex value', code: 400, validOptions: validSexValues });
  }

  if (!Array.isArray(parsedSubjects) || parsedSubjects.length === 0) {
    return res.status(400).json({ message: 'Subjects must be a non-empty array', code: 400 });
  }
  if (!Array.isArray(parsedAvailability) || parsedAvailability.length === 0) {
    return res.status(400).json({ message: 'Availability must be a non-empty array', code: 400 });
  }
  if (!Array.isArray(parsedStyle) || parsedStyle.length === 0) {
    return res.status(400).json({ message: 'Style must be a non-empty array', code: 400 });
  }

  for (const day of parsedAvailability) {
    if (!validDays.includes(day)) {
      return res.status(400).json({ message: `Invalid availability day: ${day}`, code: 400, validOptions: validDays });
    }
  }

  for (const style of parsedStyle) {
    if (!validStyles.includes(style)) {
      return res.status(400).json({ message: `Invalid learning style: ${style}`, code: 400, validOptions: validStyles });
    }
  }

  try {
    const learner = new Learner({
      userId: decoded.id,
      name: decoded.username,
      email: decoded.email,
      sex,
      program,
      yearLevel,
      phoneNumber,
      bio,
      goals,
      address,
      modality,
      subjects: parsedSubjects,
      availability: parsedAvailability,
      style: parsedStyle,
      sessionDur,
      image: learnerImage
    });

    // Set alt role
    await User.updateOne({ _id: decoded.id }, { altRole: 'learner' });

    await learner.save();

    sendRoleConfirmationEmail(
      { id: decoded.id, username: decoded.username, email: decoded.email },
      'learner',
      learner._id
    ).catch(() => {});

    return res.status(201).json({
      message: 'Learner (alt) created successfully',
      learner: {
        id: learner._id,
        name: learner.name,
        email: learner.email,
        altRole: 'learner'
      }
    });
  } catch (error) {
    console.error('Error saving learner (alt):', error);
    return res.status(500).json({ message: 'Error creating learner (alt)', code: 500, error: error.message });
  }
};

exports.mentorAltSignup = async (req, res) => {
  let token = null;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.MindMateToken) {
    token = req.cookies.MindMateToken;
  }
  const decoded = token ? require('jsonwebtoken').verify(token, process.env.JWT_SECRET) : null;
  if (!decoded) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }

  let mentorImage = null;
  const imageFile =
    req.file
    || (req.files && Array.isArray(req.files.image) && req.files.image[0]);
  if (imageFile) {
    try {
      const streamUpload = (buffer) => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => (result ? resolve(result) : reject(error))
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
      const uploadResult = await streamUpload(imageFile.buffer);
      mentorImage = uploadResult.secure_url;
    } catch (err) {
      return res.status(500).json({ message: 'Image upload failed', code: 500 });
    }
  } else {
    mentorImage = req.body.image === null ? "null" : req.body.image;
  }

  let credentialsFolderUrl = null;
  let credentialsUrls = [];
  if (req.files && Array.isArray(req.files.credentials) && req.files.credentials.length > 0) {
    try {
      const credsReq = { ...req, files: req.files.credentials, headers: req.headers };
      const credsRes = { data: null, status: function () { return this; }, json: function (data) { this.data = data; return this; } };
      await uploadController.uploadMentorCredentials(credsReq, credsRes);

      if (credsRes.data) {
        credentialsFolderUrl = credsRes.data.folderUrl || credsRes.data.folderWebViewLink || null;
        if (credsRes.data.files && Array.isArray(credsRes.data.files)) {
          credentialsUrls = credsRes.data.files.map(f => f.webViewLink || f.webContentLink || f.url).filter(Boolean);
        }
      }
    } catch (err) {
      console.error('Error uploading mentor credentials:', err);
      return res.status(500).json({ message: 'Credentials upload failed', code: 500 });
    }
  }

  const {
    sex, program, yearLevel, phoneNumber, bio, exp, address, modality,
    proficiency, subjects, availability, style, sessionDur
  } = req.body;

  const parsedSubjects = typeof subjects === 'string' ? JSON.parse(subjects) : subjects;
  const parsedAvailability = typeof availability === 'string' ? JSON.parse(availability) : availability;
  const parsedStyle = typeof style === 'string' ? JSON.parse(style) : style;

  if (!decoded.id || !decoded.username || !decoded.email || !sex || !program || !yearLevel || !phoneNumber || !bio || !exp || !address || !modality || !proficiency || !parsedSubjects || !parsedAvailability || !parsedStyle || !sessionDur) {
    return res.status(400).json({ message: 'All fields are required', code: 400 });
  }

  // Validate field formats
  if (phoneNumber.length !== 11) {
    return res.status(400).json({ message: 'Phone number must be 11 digits', code: 400 });
  }
  if (bio.length < 10 || bio.length > 550) {
    return res.status(400).json({ message: 'Bio must be between 10 and 550 characters', code: 400 });
  }

  const validPrograms = ['BSIT', 'BSCS', 'BSEMC'];
  const validYearLevels = ['1st year', '2nd year', '3rd year', '4th year', 'graduate'];
  const validModalities = ['online', 'in-person', 'hybrid'];
  const validSessionDurations = ['1hr', '2hrs', '3hrs'];
  const validSexValues = ['male', 'female'];
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const validStyles = ['lecture-based', 'interactive-discussion', 'q-and-a-discussion', 'demonstrations', 'project-based', 'step-by-step-discussion'];

  // Validate enum values
  if (!validPrograms.includes(program)) {
    return res.status(400).json({ message: 'Invalid program', code: 400, validOptions: validPrograms });
  }
  if (!validYearLevels.includes(yearLevel)) {
    return res.status(400).json({ message: 'Invalid year level', code: 400, validOptions: validYearLevels });
  }
  if (!validModalities.includes(modality)) {
    return res.status(400).json({ message: 'Invalid modality', code: 400, validOptions: validModalities });
  }
  if (!validSessionDurations.includes(sessionDur)) {
    return res.status(400).json({ message: 'Invalid session duration', code: 400, validOptions: validSessionDurations });
  }
  if (!validSexValues.includes(sex)) {
    return res.status(400).json({ message: 'Invalid sex value', code: 400, validOptions: validSexValues });
  }

  if (!Array.isArray(parsedSubjects) || parsedSubjects.length === 0) {
    return res.status(400).json({ message: 'Subjects must be a non-empty array', code: 400 });
  }
  if (!Array.isArray(parsedAvailability) || parsedAvailability.length === 0) {
    return res.status(400).json({ message: 'Availability must be a non-empty array', code: 400 });
  }
  if (!Array.isArray(parsedStyle) || parsedStyle.length === 0) {
    return res.status(400).json({ message: 'Style must be a non-empty array', code: 400 });
  }

  for (const day of parsedAvailability) {
    if (!validDays.includes(day)) {
      return res.status(400).json({ message: `Invalid availability day: ${day}`, code: 400, validOptions: validDays });
    }
  }

  for (const style of parsedStyle) {
    if (!validStyles.includes(style)) {
      return res.status(400).json({ message: `Invalid learning style: ${style}`, code: 400, validOptions: validStyles });
    }
  }

  try {
    const mentor = new Mentor({
      userId: decoded.id,
      name: decoded.username,
      email: decoded.email,
      sex,
      program,
      yearLevel,
      phoneNumber,
      bio,
      exp,
      address,
      modality,
      proficiency,
      subjects: parsedSubjects,
      availability: parsedAvailability,
      style: parsedStyle,
      sessionDur,
      image: mentorImage,
      credentials: credentialsUrls,
      credentialsFolderUrl: credentialsFolderUrl
    });

    // Set alt role
    await User.updateOne({ _id: decoded.id }, { altRole: 'mentor' });

    await mentor.save();

    sendRoleConfirmationEmail(
      { id: decoded.id, username: decoded.username, email: decoded.email },
      'mentor',
      mentor._id
    ).catch(() => {});

    return res.status(201).json({
      message: 'Mentor (alt) created successfully',
      mentor: {
        id: mentor._id,
        name: mentor.name,
        email: mentor.email,
        altRole: 'mentor'
      }
    });
  } catch (error) {
    console.error('Error saving mentor (alt):', error);
    return res.status(500).json({ message: 'Error creating mentor (alt)', code: 500, error: error.message });
  }
};

exports.switchRole = async (req, res) => {
  // accept either middleware user or token parsing
  const decoded = getValuesFromToken(req) || req.user;
  if (!decoded?.id) {
    return res.status(403).json({ message: 'Invalid token', code: 403 });
  }

  try {
    // only fetch fields we need
    const user = await User.findById(decoded.id).select('_id role altRole');
    if (!user) {
      return res.status(404).json({ message: 'User not found', code: 404 });
    }

    const currentRole = user.role || null;
    const newRole = user.altRole || null;

    if (!newRole) {
      return res.status(400).json({ message: 'No alternate role available to switch to', code: 400 });
    }

    // altRole can only be learner|mentor
    if (!['learner', 'mentor'].includes(newRole)) {
      return res.status(400).json({ message: 'Invalid alternate role value', code: 400 });
    }

    // If already same, nothing to do
    if (currentRole === newRole) {
      return res.status(200).json({ message: `Already on ${newRole}`, newRole });
    }

    // Ensure counterpart profile exists and is valid
    if (newRole === 'learner') {
      const hasLearner = await Learner.exists({ userId: user._id });
      if (!hasLearner) {
        return res.status(400).json({ message: 'No learner profile found for this user', code: 400 });
      }
    } else if (newRole === 'mentor') {
      const mentor = await Mentor.findOne({ userId: user._id }).select('accountStatus');
      if (!mentor) {
        return res.status(400).json({ message: 'No mentor profile found for this user', code: 400 });
      }
      if (mentor.accountStatus === 'pending') {
        return res.status(403).json({ message: 'Mentor account is still pending approval', code: 403 });
      }
      if (mentor.accountStatus === 'rejected') {
        return res.status(403).json({ message: 'Mentor account has been rejected', code: 403 });
      }
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { role: newRole, altRole: currentRole ?? null } }
    );

    // Invalidate session cookie so client must re-authenticate
    try {
      res.clearCookie('MindMateToken', {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      });
    } catch {}

    return res.status(200).json({ message: `Role switched to ${newRole}`, newRole });
  } catch (error) {
    console.error('Error switching role:', error);
    return res.status(500).json({ message: 'Error switching role', code: 500, error: error.message });
  }
};

// Verify via email link (no auth needed)
exports.verifyRoleFromLink = async (req, res) => {
  try {
    const { token } = req.query || {};
    if (!token) return res.status(400).send('Missing token');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload?.type !== 'role_verify' || !payload?.jti) return res.status(400).send('Invalid token');

    // Atomically mark token as used (one-time)
    const vt = await VerificationToken.findOneAndUpdate(
      { jti: payload.jti, type: 'role_verify', usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!vt) return res.status(400).send('Token already used or expired');

    const { uid, role, roleId } = payload;

    if (role === 'learner') {
      const doc = await Learner.findById(roleId);
      if (!doc || String(doc.userId) !== String(uid)) return res.status(404).send('Learner not found');
      await Learner.updateOne({ _id: roleId }, { $set: { verified: true } });
    } else if (role === 'mentor') {
      const doc = await Mentor.findById(roleId);
      if (!doc || String(doc.userId) !== String(uid)) return res.status(404).send('Mentor not found');
      await Mentor.updateOne({ _id: roleId }, { $set: { verified: true } });
    } else {
      return res.status(400).send('Invalid role');
    }

    return res.status(200).send('<h2>Account verified successfully.</h2>You can close this tab.');
  } catch (err) {
    console.error('[VERIFY ROLE LINK] ', err.message);
    return res.status(400).send('Invalid or expired token');
  }
};

// Do not verify via email link (no auth needed)
exports.unverifyRoleFromLink = async (req, res) => {
  try {
    const { token } = req.query || {};
    if (!token) return res.status(400).send('Missing token');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload?.type !== 'role_unverify' || !payload?.jti) return res.status(400).send('Invalid token');

    // Atomically mark token as used (one-time)
    const vt = await VerificationToken.findOneAndUpdate(
      { jti: payload.jti, type: 'role_unverify', usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!vt) return res.status(400).send('Token already used or expired');

    const { uid, role, roleId } = payload;

    if (role === 'learner') {
      const doc = await Learner.findById(roleId);
      if (!doc || String(doc.userId) !== String(uid)) return res.status(404).send('Learner not found');
      await Learner.updateOne({ _id: roleId }, { $set: { verified: false } });
      await Learner.deleteOne({ _id: roleId });
      await User.updateOne({ _id: uid }, { $set: { role: null } });
    } else if (role === 'mentor') {
      const doc = await Mentor.findById(roleId);
      if (!doc || String(doc.userId) !== String(uid)) return res.status(404).send('Mentor not found');
      await Mentor.updateOne({ _id: roleId }, { $set: { verified: false } });
      await Mentor.deleteOne({ _id: roleId });
      await User.updateOne({ _id: uid }, { $set: { role: null } });
    } else {
      return res.status(400).send('Invalid role');
    }

    return res.status(200).send('<h2>Account not verified and removed.</h2>You can close this tab.');
  } catch (err) {
    console.error('[UNVERIFY ROLE LINK] ', err.message);
    return res.status(400).send('Invalid or expired token');
  }
};