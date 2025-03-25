const nodemailer = require('nodemailer');
require('dotenv').config();

// Create Nodemailer transporter with Mailtrap
const transporter = nodemailer.createTransport({
  host: process.env.MAILTRAP_HOST,
  port: process.env.MAILTRAP_PORT,
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASS
  }
});

// Email templates
const emailTemplates = {
  verifyEmail: (verificationLink, name) => ({
    subject: 'Verify your Reputation Rocket account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333; text-align: center;">Welcome to Reputation Rocket!</h1>
        <p>Hello ${name},</p>
        <p>Thank you for signing up. Please verify your email address to get started.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `
  }),

  resetPassword: (resetLink, name) => ({
    subject: 'Reset your password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333; text-align: center;">Password Reset Request</h1>
        <p>Hello ${name},</p>
        <p>You recently requested to reset your password. Click the button below to reset it:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" 
             style="background-color: #4F46E5; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `
  })
};

// Send email function
const sendEmail = async (to, template, data = {}) => {
  try {
    const templateConfig = emailTemplates[template](data.link, data.name);

    const info = await transporter.sendMail({
      from: '"Reputation Rocket" <noreply@reputationrocket.com>',
      to,
      subject: templateConfig.subject,
      html: templateConfig.html
    });

    console.log('Message sent: %s', info.messageId);
    // Mailtrap preview URL
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

// Test the email configuration
const testEmailConfig = async () => {
  try {
    await transporter.verify();
    console.log('Email configuration is valid');
  } catch (error) {
    console.error('Email configuration error:', error);
  }
};

module.exports = { sendEmail, testEmailConfig }; 