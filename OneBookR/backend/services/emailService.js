export async function sendBatchInvitations(invitations, fromUser, groupName, resend) {
  const emailPromises = invitations.map(async (invitation) => {
    try {
      const inviteLink = `${process.env.NODE_ENV === 'production' ? 'https://www.onebookr.se' : 'http://localhost:5173'}/?group=${invitation.groupId}&invitee=${invitation.id}`;
      
      // ✅ SECURE EMAIL - Individual emails to protect privacy
      await resend.emails.send({
        from: 'BookR <info@onebookr.se>',
        to: invitation.email, // Individual recipient
        subject: `${fromUser} vill jämföra kalendrar med dig - ${groupName}`,
        html: generateInvitationHtml(invitation, fromUser, groupName, inviteLink),
        text: generateInvitationText(invitation, fromUser, groupName, inviteLink)
      });
      
      return { success: true, email: invitation.email };
    } catch (error) {
      console.error(`Failed to send email to ${invitation.email}:`, error);
      return { success: false, email: invitation.email, error: error.message };
    }
  });
  
  const results = await Promise.allSettled(emailPromises);
  
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failCount = results.length - successCount;
  
  console.log(`[EMAIL] Sent ${successCount}/${results.length} invitations successfully`);
  
  if (failCount > 0) {
    console.warn(`[EMAIL] ${failCount} emails failed to send`);
  }
  
  return { successCount, failCount, total: results.length };
}

function generateInvitationHtml(invitation, fromUser, groupName, inviteLink) {
  return `
    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(90deg, #635bff 0%, #6c47ff 100%); padding: 30px; border-radius: 12px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">BookR</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Kalenderjämförelse</p>
      </div>
      
      <div style="padding: 40px 30px; background: #f8f9fa; border-radius: 0 0 12px 12px;">
        <h2 style="color: #0a2540; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Du har fått en inbjudan!</h2>
        
        <p style="color: #425466; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          <strong>${fromUser}</strong> vill jämföra kalendrar med dig för att hitta en gemensam ledig tid.
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #635bff; margin: 20px 0;">
          <p style="margin: 0; color: #0a2540; font-weight: 600;">Grupp: ${groupName}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background: linear-gradient(90deg, #635bff 0%, #6c47ff 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 8px; font-weight: 600; display: inline-block; box-shadow: 0 4px 15px rgba(99, 91, 255, 0.3);">
            Gå med i jämförelsen
          </a>
        </div>
        
        <div style="border-top: 1px solid #e0e3e7; padding-top: 20px; margin-top: 30px;">
          <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0;">
            BookR hjälper dig hitta lediga tider genom att säkert jämföra kalendrar. Dina kalenderdata delas endast med personer du godkänner.
          </p>
        </div>
      </div>
    </div>
  `;
}

function generateInvitationText(invitation, fromUser, groupName, inviteLink) {
  return `
BookR - Kalenderjämförelse

Du har fått en inbjudan!

${fromUser} vill jämföra kalendrar med dig för att hitta en gemensam ledig tid.

Grupp: ${groupName}

Klicka här för att gå med: ${inviteLink}

BookR hjälper dig hitta lediga tider genom att säkert jämföra kalendrar.
  `.trim();
}
