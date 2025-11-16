const nodemailer = require('nodemailer');

const mailing = nodemailer.createTransport({
  host: 'smtp.gmail.com', 
  port: 465,
  secure: true, 
  auth: {
    user: process.env.EMAIL_USER, // your email
    pass: process.env.EMAIL_PASS  // your email password or app password
  }
});

module.exports = mailing;