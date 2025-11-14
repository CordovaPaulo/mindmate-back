const jwt = require('jsonwebtoken');

function authenticateToken(requiredRole) {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = (req.cookies && req.cookies.MindMateToken) || (authHeader && authHeader.split(' ')[1]);
        if (!token) {
            return res.status(401).json({ error: 'No token provided (service/jwt.js)' });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({ error: 'Invalid or expired token (service/jwt.js)', message: err.message, token: token } );
            }
            // Check for required role if specified
            if (requiredRole && user.role !== requiredRole) {
                return res.status(403).json({ 
                    error: `Insufficient role (service/jwt.js). Required: ${requiredRole}, Received: ${user.role}` 
                });
            }

            if (user.role === 'mentor' && user.accountStatus === 'pending') {
                return res.status(403).json({ 
                    error: 'Mentor account is still pending approval (service/jwt.js).' 
                });
            }
            req.user = user; 
            next();
        });
    };
}

const getValuesFromToken = (req) => {
  try {
    const authHeader = req.headers['authorization'];
    // Use req.cookies.MindMateToken for Express
    const token = (req.cookies && req.cookies.MindMateToken) || (authHeader && authHeader.split(' ')[1]);
    if (!token) {
      console.log('No token found in authorization header or cookies');
      return null;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
};

module.exports = { authenticateToken, getValuesFromToken };