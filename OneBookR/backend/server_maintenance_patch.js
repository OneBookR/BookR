// Lägg till dessa rader efter rad 35 (efter resend-konfigurationen):

// Maintenance mode - omdirigera till väntelistan
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
console.log('Maintenance mode:', MAINTENANCE_MODE ? 'ON (redirecting to waitlist)' : 'OFF (full app available)');

// Middleware för maintenance mode (lägg till efter bodyParser men före routes)
app.use((req, res, next) => {
  if (MAINTENANCE_MODE) {
    // Tillåt dessa sidor även i maintenance mode
    const allowedPaths = [
      '/waitlist',
      '/admin/waitlist', 
      '/api/waitlist',
      '/api/waitlist/count',
      '/api/waitlist/admin',
      '/api/waitlist/share',
      '/api/waitlist/referrer',
      '/api/user',
      '/api/user/optional'
    ];
    
    // Tillåt statiska filer (CSS, JS, bilder)
    if (req.path.includes('.') || allowedPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    // Omdirigera alla andra requests till väntelistan
    return res.redirect('/waitlist');
  }
  
  next();
});