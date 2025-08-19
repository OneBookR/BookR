// Lägg till denna endpoint i server.js för att uppfylla GDPR

// Radera all användardata
app.delete('/api/user/delete-data', (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email krävs' });
  }
  
  // Radera från grupper
  Object.keys(groups).forEach(groupId => {
    const group = groups[groupId];
    if (group.creator.email === email) {
      delete groups[groupId]; // Radera hela gruppen om användaren är skapare
    } else {
      // Ta bort användaren från gruppen
      group.tokens = group.tokens.filter(token => {
        // Här behöver du koppla token till email på något sätt
        return true; // Placeholder
      });
      group.joinedEmails = group.joinedEmails.filter(e => e !== email);
      group.invitees = group.invitees.filter(inv => inv.email !== email);
    }
  });
  
  // Radera inbjudningar
  delete userInvitations[email];
  
  // Radera förslag
  Object.keys(suggestions).forEach(groupId => {
    suggestions[groupId] = suggestions[groupId].filter(s => s.fromEmail !== email);
  });
  
  res.json({ success: true, message: 'All användardata raderad' });
});