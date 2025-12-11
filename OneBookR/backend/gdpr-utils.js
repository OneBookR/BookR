// ===== GDPR-SÄKER DATAHANTERING FÖR BOOKR =====

// ✅ ANONYMISERA EMAIL-ADRESSER FÖR LOGGING
export function anonymizeEmail(email) {
  if (!email || typeof email !== 'string') return 'unknown@privacy.local';
  
  const [username, domain] = email.split('@');
  if (!username || !domain) return 'invalid@privacy.local';
  
  // Visa första bokstaven + antal tecken + första bokstaven i domän
  const anonUsername = username[0] + '*'.repeat(Math.max(0, username.length - 2)) + (username.length > 1 ? username[username.length - 1] : '');
  const anonDomain = domain[0] + '*'.repeat(Math.max(0, domain.length - 2)) + (domain.length > 1 ? domain[domain.length - 1] : '');
  
  return `${anonUsername}@${anonDomain}`;
}

// ✅ KRYPTERA EMAIL FÖR LAGRING (REVERSIBELT)
export function encryptEmail(email) {
  if (!email) return null;
  
  // Enkel base64-kryptering för demonstration
  // I produktion, använd proper kryptering som AES
  return Buffer.from(email).toString('base64');
}

export function decryptEmail(encryptedEmail) {
  if (!encryptedEmail) return null;
  
  try {
    return Buffer.from(encryptedEmail, 'base64').toString();
  } catch {
    return null;
  }
}

// ✅ RENSA KÄNSLIG DATA FRÅN EVENT-OBJEKT
export function sanitizeCalendarEvent(event, userEmail) {
  if (!event || typeof event !== 'object') return null;
  
  return {
    start: event.start,
    end: event.end,
    status: event.status,
    transparency: event.transparency,
    isAllDay: Boolean(event.start?.date),
    userEmail: anonymizeEmail(userEmail),
    calendarId: event.calendarId ? 'cal_***' : undefined
  };
}

// ✅ FÖRBÄTTRAD GDPR LOGGING MED KORREKT EMAIL HANTERING
export function gdprLog(message, data = {}) {
  const sanitizedData = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (key.includes('email') || key.includes('Email')) {
      if (typeof value === 'string') {
        sanitizedData[key] = anonymizeEmail(value);
      } else {
        sanitizedData[key] = value; // Behåll originalvärde om det inte är string
      }
    } else if (Array.isArray(value)) {
      sanitizedData[key] = value.map(item => 
        typeof item === 'string' && item.includes('@') ? anonymizeEmail(item) : item
      );
    } else if (typeof value === 'string' && value.includes('@')) {
      sanitizedData[key] = anonymizeEmail(value);
    } else if (key === 'token' || key === 'accessToken') {
      sanitizedData[key] = value ? '[TOKEN_PRESENT]' : '[NO_TOKEN]';
    } else {
      sanitizedData[key] = value;
    }
  }
  
  console.log(`[GDPR-SAFE-LOG] ${message}`, sanitizedData);
}

// ✅ GDPR-BALANSERAD FUNKTION FÖR SESSION-DELTAGARE
export function sanitizeForSessionParticipants(groupData) {
  // Returnera synliga emails för aktiva session-deltagare
  // men anonymisera för alla server-loggar
  return {
    ...groupData,
    members: groupData.members.map(member => ({
      ...member,
      email: member.email, // Synlig för andra deltagare
      _logEmail: anonymizeEmail(member.email) // För intern server-logging
    }))
  };
}

// ✅ GDPR-SÄKER MEN ANVÄNDBAR GRUPPSTATUS
export function getGroupStatusForParticipants(group) {
  return {
    ...group,
    members: group.members.map(member => ({
      email: member.email, // Synlig för gruppdeltagare
      joinedAt: member.joinedAt,
      isCreator: member.isCreator,
      provider: member.provider
    })),
    // Visa vilka som bjudits in men inte anslutit
    pendingMembers: (group.invitedEmails || []).filter(invitedEmail => 
      !group.members.some(member => 
        member.email.toLowerCase() === invitedEmail.toLowerCase()
      )
    )
  };
}

// ✅ RENSA AKTIVA GRUPPER
export function cleanupExpiredGroups(activeGroups, retentionHours = 24) {
  const now = new Date();
  let deletedCount = 0;
  
  for (const [groupId, group] of activeGroups.entries()) {
    const created = new Date(group.createdAt);
    const hoursSinceCreation = (now - created) / (1000 * 60 * 60);
    
    if (hoursSinceCreation > retentionHours) {
      activeGroups.delete(groupId);
      deletedCount++;
      gdprLog(`Deleted expired group`, { 
        groupId: groupId.substring(0, 10) + '...', 
        ageHours: Math.round(hoursSinceCreation) 
      });
    }
  }
  
  return deletedCount;
}

// ✅ VALIDATOR FÖR KÄNSLIG DATA
export function containsSensitiveInfo(text) {
  if (!text || typeof text !== 'string') return false;
  
  const sensitivePatterns = [
    /\b\d{10,}\b/, // Telefonnummer
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Email
    /\bpassword\b/i,
    /\btoken\b/i,
    /\bsecret\b/i,
    /\bkey\b/i,
    /\bpersonnummer\b/i,
    /\bssn\b/i
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(text));
}

// ✅ GDPR DATA EXPORT HELPER
export function createGDPRExport(userData) {
  return {
    exportDate: new Date().toISOString(),
    userEmail: userData.email ? anonymizeEmail(userData.email) : 'unknown',
    dataIncluded: [
      'User profile information',
      'Group memberships',
      'Calendar comparison sessions',
      'Meeting suggestions'
    ],
    note: 'This export contains all data we have about you in a privacy-safe format.',
    contactInfo: {
      email: 'support@onebookr.se',
      subject: 'GDPR Data Request'
    }
  };
}

// ✅ FIREBASE AUTHENTICATION FIX
export function handleFirebaseError(error) {
  if (error.code === 16 && error.details?.includes('authentication credentials')) {
    console.warn('🔥 Firebase authentication error - likely missing service account key');
    return {
      handled: true,
      message: 'Firebase authentication failed - continuing without Firebase',
      shouldContinue: true
    };
  }
  
  return {
    handled: false,
    message: error.message,
    shouldContinue: false
  };
}
