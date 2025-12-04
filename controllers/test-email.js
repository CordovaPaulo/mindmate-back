// Test email endpoint to diagnose Brevo issues
const mailingController = require('./mailing');

exports.testEmail = async (req, res) => {
  try {
    const { to } = req.query;
    
    if (!to) {
      return res.status(400).json({ 
        message: 'Please provide recipient email as query param: ?to=email@example.com',
        code: 400 
      });
    }

    console.log('====== BREVO EMAIL TEST ======');
    console.log('Recipient:', to);
    console.log('Sender:', process.env.BREVO_FROM_EMAIL);
    console.log('API Key exists:', !!process.env.BREVO_API_KEY);
    console.log('==============================');

    const subject = 'MindMate Email Test - ' + new Date().toLocaleString();
    const text = `
This is a test email from MindMate backend.

If you receive this, your Brevo configuration is working correctly!

Sent at: ${new Date().toISOString()}
Recipient: ${to}
Sender: ${process.env.BREVO_FROM_EMAIL}

Test Details:
- API Key configured: ${process.env.BREVO_API_KEY ? 'Yes' : 'No'}
- Environment: ${process.env.NODE_ENV || 'development'}
`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
    .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 12px; border-radius: 4px; margin: 15px 0; }
    .info { background: #e7f3ff; border: 1px solid #b3d9ff; color: #004085; padding: 8px; border-radius: 4px; margin: 8px 0; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>✅ MindMate Email Test</h2>
    </div>
    <div class="content">
      <div class="success">
        <strong>Success!</strong> If you're reading this, your Brevo email configuration is working correctly.
      </div>
      
      <h3>Test Information:</h3>
      <div class="info"><strong>Sent at:</strong> ${new Date().toLocaleString()}</div>
      <div class="info"><strong>Recipient:</strong> ${to}</div>
      <div class="info"><strong>Sender:</strong> ${process.env.BREVO_FROM_EMAIL}</div>
      <div class="info"><strong>API Key:</strong> ${process.env.BREVO_API_KEY ? 'Configured ✓' : 'Missing ✗'}</div>
      <div class="info"><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</div>
      
      <p style="margin-top: 20px;">
        <strong>What to check if you see this in spam:</strong>
      </p>
      <ul>
        <li>Mark this email as "Not Spam" in your email client</li>
        <li>Add ${process.env.BREVO_FROM_EMAIL} to your contacts</li>
        <li>Check Brevo sender reputation in your Brevo dashboard</li>
      </ul>
      
      <p style="margin-top: 20px; color: #666; font-size: 12px;">
        This is an automated test email from MindMate Backend.
      </p>
    </div>
  </div>
</body>
</html>
`;

    console.log('\n[TEST-EMAIL] Attempting to send test email...');
    
    const result = await mailingController.sendEmailNotification(to, subject, text, html);
    
    console.log('\n[TEST-EMAIL] Email sent successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('==============================\n');

    return res.status(200).json({
      success: true,
      message: 'Test email sent successfully! Check your inbox (and spam folder).',
      result: {
        messageId: result.messageId,
        to: to,
        from: process.env.BREVO_FROM_EMAIL,
        subject: subject,
        timestamp: new Date().toISOString()
      },
      tips: [
        'Check your spam/junk folder',
        'Wait 1-2 minutes for email delivery',
        'Verify the recipient email is correct',
        'Check Brevo dashboard for delivery status: https://app.brevo.com/log'
      ]
    });
  } catch (error) {
    console.error('\n[TEST-EMAIL] Failed to send test email!');
    console.error('Error:', error.message);
    console.error('Full error:', error);
    console.log('==============================\n');

    return res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message,
      troubleshooting: [
        'Check BREVO_API_KEY in .env file',
        'Verify sender email in Brevo dashboard',
        'Check Brevo account is active (not suspended)',
        'Verify you haven\'t exceeded daily limit (300 emails/day for free tier)',
        'Visit Brevo dashboard: https://app.brevo.com'
      ]
    });
  }
};
