const jwt = require('jsonwebtoken');

// const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'token';
// const COOKIE_MAX_AGE = parseInt(process.env.AUTH_COOKIE_MAX_AGE || `${7 * 24 * 60 * 60 * 1000}`, 10); // ms

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  };
}

// Read and verify auth cookie, return decoded user payload
exports.getCookie = async (req, res) => {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'No auth cookie' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({
      user: {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
      },
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired auth cookie' });
  }
};

// Clear the auth cookie (logout)
exports.clearCookie = (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ ok: true });
};