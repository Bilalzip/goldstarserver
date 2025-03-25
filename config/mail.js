const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
      user: "f5a5c863f4168b",
      pass: "b32f36b3bfae51"
    }
  });

module.exports = transporter; 