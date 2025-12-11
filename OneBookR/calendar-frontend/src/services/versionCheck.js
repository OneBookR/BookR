/**
 * ✅ VERSION CHECK SERVICE
 * Detekterar automatiskt nya deployments och tvingar uppdatering
 * Löser cache-problem utan att användare behöver göra Ctrl+Shift+R
 */

class VersionCheckService {
  constructor() {
    this.currentVersion = null;
    this.checkInterval = 60000; // Kontrollera var 60:e sekund
    this.isChecking = false;
  }

  /**
   * Initialisera version-check
   */
  async init() {
    try {
      // Läs version från build-metadata
      this.currentVersion = await this.getLocalVersion();
      
      // Starta periodisk kontroll
      this.startPeriodicCheck();
      
      // Kontrollera omedelbar vid app-start
      await this.checkForUpdates();
      
      console.log('✅ Version check initialized:', this.currentVersion);
    } catch (error) {
      console.warn('⚠️ Version check init failed:', error);
    }
  }

  /**
   * Hämta lokal version från build-metadata
   */
  async getLocalVersion() {
    try {
      // Försök läsa från version.json (genereras vid build)
      const response = await fetch('/version.json', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        return data.version;
      }
    } catch (error) {
      console.warn('Could not fetch version.json:', error);
    }
    
    // Fallback: använd timestamp från build
    return new Date().getTime().toString();
  }

  /**
   * Kontrollera om ny version finns tillgänglig
   */
  async checkForUpdates() {
    if (this.isChecking) return;
    
    this.isChecking = true;
    try {
      const remoteVersion = await this.getRemoteVersion();
      
      if (remoteVersion && remoteVersion !== this.currentVersion) {
        console.warn('🔄 New version detected:', remoteVersion);
        this.handleNewVersion(remoteVersion);
      }
    } catch (error) {
      console.warn('Version check failed:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Hämta remote version
   */
  async getRemoteVersion() {
    try {
      const response = await fetch('/version.json?t=' + Date.now(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.version;
      }
    } catch (error) {
      console.warn('Could not fetch remote version:', error);
    }
    
    return null;
  }

  /**
   * Hantera ny version - visa notifikation och uppdatera
   */
  handleNewVersion(newVersion) {
    // Skicka custom event som UI kan lyssna på
    const event = new CustomEvent('newVersionAvailable', {
      detail: { version: newVersion }
    });
    window.dispatchEvent(event);
    
    // Logga för debugging
    console.log('📢 New version available:', newVersion);
  }

  /**
   * Starta periodisk version-kontroll
   */
  startPeriodicCheck() {
    setInterval(() => {
      this.checkForUpdates();
    }, this.checkInterval);
  }

  /**
   * Tvinga uppdatering
   */
  forceUpdate() {
    // Rensa all cache
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    
    // Hard reload
    window.location.href = window.location.href;
  }
}

export const versionCheck = new VersionCheckService();
