# BookR - Utvecklingsmiljö

## Snabbstart för Localhost

### 1. Miljövariabler
```bash
cd backend
cp .env.example .env
# Fyll i dina OAuth-credentials och API-nycklar i .env
```

### 2. Starta Backend (Port 3000)
```bash
cd backend
npm install
npm start
```

### 3. Starta Frontend (Port 5173)
```bash
cd calendar-frontend
npm install
npm run dev
```

## Miljökonfiguration

### Localhost (Development)
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3000
- **OAuth Callbacks**: 
  - Google: http://localhost:3000/auth/google/callback
  - Microsoft: http://localhost:3000/auth/microsoft/callback

### Production (Railway)
- **Frontend**: https://www.onebookr.se
- **Backend**: https://www.onebookr.se
- **OAuth Callbacks**:
  - Google: https://www.onebookr.se/auth/google/callback
  - Microsoft: https://www.onebookr.se/auth/microsoft/callback

## OAuth Setup

### Google OAuth
1. Gå till [Google Cloud Console](https://console.cloud.google.com/)
2. Skapa nytt projekt eller välj befintligt
3. Aktivera Google Calendar API
4. Skapa OAuth 2.0 credentials
5. Lägg till authorized redirect URIs:
   - **Localhost**: `http://localhost:3000/auth/google/callback`
   - **Production**: `https://www.onebookr.se/auth/google/callback`

### Microsoft OAuth
1. Gå till [Azure Portal](https://portal.azure.com/)
2. Registrera ny app i Azure AD
3. Lägg till redirect URIs:
   - **Localhost**: `http://localhost:3000/auth/microsoft/callback`
   - **Production**: `https://www.onebookr.se/auth/microsoft/callback`
4. Ge permissions för Calendar.Read

## Felsökning

### Problem: "OAuth callback mismatch"
- Kontrollera att callback URLs matchar i OAuth-apparna
- Localhost använder `http://localhost:3000/auth/*/callback`
- Production använder `https://www.onebookr.se/auth/*/callback`

### Problem: "CORS error"
- Kontrollera att frontend körs på port 5173
- Kontrollera att backend körs på port 3000
- Miljövariabeln NODE_ENV ska vara `development` för localhost

### Problem: "Session not working"
- Kontrollera SESSION_SECRET i .env
- Cookies är inte secure i localhost (det är normalt)

## Deployment till Railway

1. Pusha kod till GitHub
2. Railway deployer automatiskt från main branch
3. Miljövariabler sätts i Railway dashboard
4. NODE_ENV=production aktiverar production-konfiguration

## Viktiga Filer

- `backend/server.js` - Huvudserver med miljöspecifik konfiguration
- `backend/.env` - Lokala miljövariabler (lägg INTE till i git)
- `backend/.env.example` - Mall för miljövariabler
- `calendar-frontend/vite.config.js` - Frontend proxy-konfiguration