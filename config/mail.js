const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: "live.smtp.mailtrap.io",
    port: 2525,
    auth: {
      user: "api",
      pass: "3389d1154589d289dc7e3b366f1beeda"
    }
  });

module.exports = transporter; 