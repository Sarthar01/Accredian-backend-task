require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const { google } = require('googleapis');

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 5000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Use helmet to set appropriate security headers
app.use(helmet());

// Adjust CSP to allow fonts from Google Fonts
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      connectSrc: ["'self'"], // Adjust based on your needs
      imgSrc: ["'self'", "data:"], // Adjust based on your needs
      // Add other directives as needed
    },
  })
);

// Serve a simple message or static file at the root URL
app.get('/', (req, res) => {
  res.send('Welcome to the Referral App');
});

// Endpoint to save referral data
app.post('/submit-referral', async (req, res) => {
  const { name, city, email, number } = req.body;

  // Validate the mobile number
  if (!Number.isInteger(number) || number < 1000000000 || number > 9999999999) {
    return res.status(400).json({ message: 'Invalid mobile number' });
  }

  try {
    // Create a new referral entry
    const newReferral = await prisma.referral.create({
      data: { name, city, email, number: BigInt(number), },
    });

    // Convert BigInt to string for JSON response
    newReferral.number = newReferral.number.toString();

    // Send referral email
    await sendReferralEmail(name, email);

    res.status(201).json({ message: 'Referral submitted successfully', referral: newReferral });
  } catch (error) {
    console.error('Error saving referral:', error);
    res.status(500).json({ message: 'Failed to submit referral' });
  }
});

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'  // Redirect URL
);
oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// Function to send referral email
const sendReferralEmail = async (name, email) => {
  try {
    const accessToken = await oAuth2Client.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Referral Confirmation',
      text: `Hi ${name},\n\nThank you for submitting a referral! We will process it shortly.\n\nBest regards,\nReferral Team`,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Referral email sent successfully', result);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
