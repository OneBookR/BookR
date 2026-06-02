const express = require('express');
const router = express.Router();
const passport = require('passport');

// ...existing code...

router.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true,
    // Ingen "remember me"
}));

// ...existing code...

module.exports = router;