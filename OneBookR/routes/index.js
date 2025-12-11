const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// Exempel på route där inbjudan sker
router.post('/invite', async (req, res) => {
    // ...existing code för att skapa inbjudan...
    const { invitedUserEmail, invitedUserName, groupId, inviterName } = req.body;
    const groupLink = `https://bookr.example.com/group/${groupId}`;

    // Skicka mejl
    const transporter = nodemailer.createTransport({
        // ...din SMTP-konfiguration...
    });

    await transporter.sendMail({
        from: '"BookR" <no-reply@bookr.example.com>',
        to: invitedUserEmail,
        subject: 'Inbjudan till BookR',
        text: `Hej ${invitedUserName} vill jämföra sina kalender med dig - ${groupLink}`
    });

    // ...existing code...
    res.redirect('/somewhere');
});

module.exports = router;