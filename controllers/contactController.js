const transporter = require('../config/mail');

exports.sendContactEmail = async (req, res) => {
  try {
    const { name, email, phone, company, message } = req.body;

    await transporter.sendMail({
      from: '"The Gold Star Contact Form" <noreply@thegoldstar.ca>',
      to: "mohdbilalpersonal@gmail.com", // Your email address
      subject: "New Contact Form Submission",
      html: `
        <h1>New Contact Form Submission</h1>
        <h2>Contact Details:</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Company:</strong> ${company}</p>
        <h2>Message:</h2>
        <p>${message}</p>
      `
    });

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ success: false, message: 'Error sending email' });
  }
};