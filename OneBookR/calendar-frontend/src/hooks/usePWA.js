import { useState, useEffect } from 'react';

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // ✅ REGISTER SERVICE WORKER
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('[PWA] Service Worker registration failed:', error);
        });
    }

    // ✅ LISTEN FOR INSTALL PROMPT
    const handleBeforeInstallPrompt = (event) => {
      console.log('[PWA] Install prompt available');
      event.preventDefault();
      setDeferredPrompt(event);
      setIsInstallable(true);
    };

    // ✅ DETECT IF ALREADY INSTALLED
    const handleAppInstalled = () => {
      console.log('[PWA] App installed');
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    // ✅ ONLINE/OFFLINE STATUS
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // ✅ CHECK IF RUNNING AS PWA
    const checkIfPWA = () => {
      const isPWA = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      if (isPWA || window.navigator.standalone === true) {
        setIsInstalled(true);
      }
    };

    // Add event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    checkIfPWA();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ✅ TRIGGER INSTALL
  const installPWA = async () => {
    if (!deferredPrompt) return false;

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      console.log('[PWA] Install outcome:', outcome);
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      
      setDeferredPrompt(null);
      return outcome === 'accepted';
    } catch (error) {
      console.error('[PWA] Install error:', error);
      return false;
    }
  };

  return {
    isInstallable,
    isInstalled,
    isOnline,
    installPWA
  };
}

export default usePWA;