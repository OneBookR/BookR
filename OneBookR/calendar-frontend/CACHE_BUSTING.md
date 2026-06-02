# ✅ Cache-Busting & Version Management

## Problem
Användare fick gamla versioner av appen cachelagrat i webbläsaren, vilket orsakade fel. Temporär lösning var Ctrl+Shift+R (hard refresh).

## Robust Lösning

### 1. **Automatisk Cache-Busting via Vite**
- Alla JS/CSS-filer får en unik hash i filnamnet: `app-a1b2c3d4.js`
- Nya deployments = nya filnamn = ingen cache-konflikt
- Konfigurerat i `vite.config.js`

### 2. **Version-Check Service** (`src/services/versionCheck.js`)
- Kontrollerar var 60:e sekund om ny version finns
- Läser från `/version.json` (genereras vid build)
- Skickar `newVersionAvailable` event när uppdatering finns

### 3. **Service Worker** (`public/sw.js`)
- **Network-first** för dynamiskt innehål (API, HTML, JS, CSS)
- **Cache-first** för statiska assets (bilder)
- Renser gamla caches automatiskt vid uppdatering
- Fallback till cache vid offline

### 4. **Update Notification UI** (`src/components/UpdateNotification.jsx`)
- Visar notifikation när ny version är tillgänglig
- Användare kan uppdatera med en knapp
- Tvingar hard reload för att ladda ny version

### 5. **Build-Process**
- `npm run build` genererar `dist/version.json` automatiskt
- Version-filen innehåller: version, timestamp, buildTime
- Möjliggör version-check utan backend-ändringar

## Hur det fungerar

```
1. App startar → versionCheck.init()
2. Service Worker registreras
3. Var 60:e sekund: Kontrollera /version.json
4. Om ny version: Visa notifikation
5. Användare klickar "Uppdatera" → Hard reload
6. Ny version laddar med nya filnamn (cache-busting)
```

## Deployment Checklist

- [ ] Uppdatera `package.json` version innan build
- [ ] Kör `npm run build` (genererar version.json automatiskt)
- [ ] Deploy `dist/` mappen
- [ ] Verifiera `/version.json` är tillgänglig
- [ ] Testa i DevTools: Disable cache, håll F5 tryckt

## Testing

### Lokal testing:
```bash
npm run build
npm run preview
# Öppna DevTools → Application → Service Workers
# Verifiera sw.js är registrerad
```

### Simulera ny version:
1. Ändra version i `package.json`
2. Kör `npm run build`
3. Öppna app i ny tab
4. Gamla tab bör visa uppdateringsnotifikation

## Fallback-mekanismer

- ✅ Service Worker fallback vid offline
- ✅ Version-check med error-handling
- ✅ Automatisk cache-cleanup
- ✅ Hard reload om uppdatering misslyckas

## Framtida Förbättringar

- [ ] Lägg till backend-endpoint för version-info
- [ ] Implementera gradual rollout (A/B testing)
- [ ] Lägg till analytics för update-tracking
- [ ] Implementera delta-updates (bara ladda ändrade filer)
