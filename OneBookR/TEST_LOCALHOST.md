# BookR Localhost Test Guide

## Starta servrar

### 1. Backend (Terminal 1)
```bash
cd backend
npm start
```
Ska visa:
- ✅ Port 3000
- ✅ Environment: LOCALHOST
- ✅ Frontend URL: http://localhost:5173
- ✅ Backend URL: http://localhost:3000

### 2. Frontend (Terminal 2)
```bash
cd calendar-frontend
npm run dev
```
Ska visa:
- ✅ Port 5173
- ✅ Proxy till localhost:3000

## Test Checklist

### ✅ Grundläggande funktioner
- [ ] Öppna http://localhost:5173
- [ ] Logga in med Google/Microsoft
- [ ] Kommer till ShortcutDashboard
- [ ] Inga 401/404/CORS-fel i konsolen

### ✅ Logout-funktionalitet
- [ ] Klicka på användarikon (högst upp till höger)
- [ ] Klicka "Logga ut"
- [ ] Ska omdirigeras till inloggningssida
- [ ] localStorage ska rensas
- [ ] Inga fel i konsolen

### ✅ Kalenderjämförelse
- [ ] Klicka "1v1 Meeting" eller "Group Meeting"
- [ ] Ska komma till kalenderjämförelse
- [ ] Inga 401-fel från Google Calendar API
- [ ] Token-validering ska fungera

### ✅ API-endpoints
- [ ] GET /api/user - ska returnera användardata
- [ ] GET /api/invitations/:email - ska returnera tom array
- [ ] POST /api/errors - ska logga fel
- [ ] GET /auth/logout - ska logga ut och omdirigera

## Vanliga problem och lösningar

### Problem: "CORS blocked"
**Lösning**: Kontrollera att backend körs på port 3000

### Problem: "401 Unauthorized"
**Lösning**: Token har gått ut - logga ut och in igen

### Problem: "Cannot access '_e' before initialization"
**Lösning**: Bygg om frontend: `npm run build && npm run dev`

### Problem: Logout fungerar inte
**Lösning**: Kontrollera att LOGOUT_URL pekar på http://localhost:3000/auth/logout

## Debug-kommandon

```bash
# Testa backend direkt
curl http://localhost:3000/health

# Testa API endpoints
curl http://localhost:3000/api/invitations/test@example.com

# Visa alla routes
curl http://localhost:3000/api/debug/routes
```

## Produktionsdeploy

När allt fungerar i localhost:
1. Pusha till GitHub
2. Railway deployer automatiskt
3. NODE_ENV=production aktiveras
4. Alla URLs växlar till https://www.onebookr.se