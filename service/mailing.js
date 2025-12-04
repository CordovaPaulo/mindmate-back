const SibApiV3Sdk = require('@getbrevo/brevo');

// Initialize Brevo
if (!process.env.BREVO_API_KEY) {
  console.error('❌ [BREVO ERROR] BREVO_API_KEY environment variable is not set');
  console.error('   Sign up at https://brevo.com to get your API key');
} else {
  console.log('✅ [BREVO] Initialized successfully');
  console.log('✅ [BREVO] Free tier: 300 emails/day');
}

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
apiInstance.setApiKey(
  SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, 
  process.env.BREVO_API_KEY
);

// ✅ Can use ANY email address, including Gmail (no domain verification required)
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'gccoed@gmail.com';

/**
 * Send email using Brevo
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 */
const sendEmail = async (to, subject, html) => {
  try {
    console.log(`📧 [BREVO] Attempting to send email...`);
    console.log(`   To: ${to}`);
    console.log(`   From: ${FROM_EMAIL}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   API Key configured: ${process.env.BREVO_API_KEY ? 'Yes (hidden)' : 'No - MISSING!'}`);
    
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = { 
      name: 'Gordon College MindMate',
      email: FROM_EMAIL 
    };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;

    console.log(`   Calling Brevo API...`);
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);

    console.log(`✅ [BREVO SUCCESS] Email queued for delivery!`);
    console.log(`   Message ID: ${data.messageId || data.body?.messageId || 'N/A'}`);
    console.log(`   Check recipient spam/junk folder if not in inbox`);

    // Return data with proper structure
    return {
      messageId: data.messageId || data.body?.messageId,
      ...data
    };
  } catch (error) {
    console.error('❌ [BREVO ERROR] Failed to send email:', {
      error: error.message,
      errorBody: error.response?.body,
      statusCode: error.response?.status,
      to: to,
      subject: subject
    });
    throw error;
  }
};

// ✅ Wrapper to maintain compatibility with existing nodemailer interface
// This allows your existing controllers to work without changes
const mailing = {
  sendMail: async (mailOptions) => {
    try {
      // Extract values from mailOptions (nodemailer format)
      const to = mailOptions.to;
      const subject = mailOptions.subject;
      const html = mailOptions.html || `<p>${(mailOptions.text || '').replace(/\n/g, '<br>')}</p>`;

      console.log(`[BREVO] Processing email request...`);
      console.log(`   To: ${to}`);
      console.log(`   From: ${FROM_EMAIL}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   Has HTML content: ${!!mailOptions.html}`);
      console.log(`   Has text content: ${!!mailOptions.text}`);
      
      // Call the main sendEmail function
      const data = await sendEmail(to, subject, html);
      
      // Return nodemailer-compatible response
      return {
        messageId: data.messageId,
        response: '250 OK',
        accepted: [to],
        rejected: []
      };
    } catch (error) {
      console.error('❌ [BREVO ERROR] sendMail wrapper failed:', {
        error: error.message,
        errorBody: error.response?.body,
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      throw error;
  }
  }
};

// Export both the compatibility wrapper and the direct function
module.exports = mailing;
module.exports.sendEmail = sendEmail;
module.exports.FROM_EMAIL = FROM_EMAIL;