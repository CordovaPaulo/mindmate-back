const nodemailer = require('nodemailer');

const HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const PORT = Number(process.env.EMAIL_PORT || 465);
const SECURE = PORT === 465 || process.env.EMAIL_SECURE === 'true';

const transporter = nodemailer.createTransport({
  host: HOST,
  port: PORT,
  secure: SECURE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  pool: true,                 // Reuse connections
  maxConnections: 5,          // Max concurrent connections
  maxMessages: 100,           // Max messages per connection
  connectionTimeout: 100000,   // 60s - increased for slow networks
  greetingTimeout: 100000,     // 30s
  socketTimeout: 100000,       // 60s - increased for Render
  tls: {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  }
});

// Verify on startup (logs will show in Render dashboard)
transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP verify failed:', {
      message: err.message,
      code: err.code,
      host: HOST,
      port: PORT,
      secure: SECURE,
      hasUser: !!process.env.EMAIL_USER,
      hasPass: !!process.env.EMAIL_PASS
    });
  } else {
    console.log('✅ SMTP ready:', { host: HOST, port: PORT, secure: SECURE });
  }
});

// Wrapper with detailed error logging
async function sendMail(mailOptions) {
  const startTime = Date.now();
  try {
    const info = await transporter.sendMail(mailOptions);
    const duration = Date.now() - startTime;
    console.log(`✅ Email sent in ${duration}ms:`, {
      messageId: info.messageId,
      to: mailOptions.to,
      subject: mailOptions.subject
    });
    return info;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`❌ Email failed after ${duration}ms:`, {
      message: err.message,
      code: err.code,
      command: err.command,
      to: mailOptions.to,
      subject: mailOptions.subject
    });
    throw err;
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  transporter.close();
  console.log('SMTP transporter closed');
});

module.exports = {
  transporter,
  sendMail
};