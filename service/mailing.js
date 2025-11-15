const nodemailer = require('nodemailer');

const mailing = nodemailer.createTransport({
  host: 'smtp.gmail.com', 
  port: 587, // ✅ Use TLS port instead of SSL
  secure: false, // ✅ Use STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  // ✅ Add timeout configurations
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,   // 10 seconds
  socketTimeout: 15000,      // 15 seconds
  // ✅ Add pool configuration for better performance
  pool: true,
  maxConnections: 5,
  maxMessages: 100
});

// ✅ Verify connection on startup
mailing.verify((error, success) => {
  if (error) {
    console.error('SMTP connection error:', error);
  } else {
    console.log('✅ SMTP server is ready to send emails');
  }
});

module.exports = mailing;