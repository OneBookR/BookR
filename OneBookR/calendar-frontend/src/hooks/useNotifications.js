import { useState, useEffect, useCallback, useRef } from 'react';

export const useNotifications = () => {
  const [permission, setPermission] = useState(() => 
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [isSupported] = useState(() => typeof Notification !== 'undefined');
  
  // ✅ RATE LIMITING för notifications
  const notificationQueue = useRef([]);
  const isProcessingQueue = useRef(false);
  const lastNotificationTime = useRef(0);

  // ✅ REQUEST PERMISSION WITH CACHING
  const requestPermission = useCallback(async () => {
    if (!isSupported) return 'denied';
    
    if (permission === 'granted') return 'granted';
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.error('[Notifications] Permission request failed:', error);
      return 'denied';
    }
  }, [isSupported, permission]);

  // ✅ PROCESS NOTIFICATION QUEUE
  const processNotificationQueue = useCallback(async () => {
    if (isProcessingQueue.current || notificationQueue.current.length === 0) return;
    
    isProcessingQueue.current = true;
    
    while (notificationQueue.current.length > 0) {
      const now = Date.now();
      
      // Rate limit: max 1 notification per 3 seconds
      if (now - lastNotificationTime.current < 3000) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      const { title, options, resolve } = notificationQueue.current.shift();
      
      try {
        if (permission === 'granted') {
          const notification = new Notification(title, {
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: options?.tag || 'bookr-notification',
            renotify: false,
            silent: false,
            ...options
          });
          
          // Auto-close after 5 seconds
          setTimeout(() => {
            try {
              notification.close();
            } catch (e) {
              // Notification might already be closed
            }
          }, 5000);
          
          lastNotificationTime.current = now;
          resolve?.(notification);
        } else {
          resolve?.(null);
        }
      } catch (error) {
        console.error('[Notifications] Failed to show notification:', error);
        resolve?.(null);
      }
    }
    
    isProcessingQueue.current = false;
  }, [permission]);

  // ✅ SHOW NOTIFICATION WITH QUEUING
  const showNotification = useCallback((title, options = {}) => {
    if (!isSupported || permission !== 'granted') {
      console.warn('[Notifications] Not supported or permission denied');
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      // Add to queue instead of showing immediately
      notificationQueue.current.push({ title, options, resolve });
      
      // Process queue
      processNotificationQueue();
    });
  }, [isSupported, permission, processNotificationQueue]);

  // ✅ SCHEDULE REMINDER WITH VALIDATION
  const scheduleReminder = useCallback((title, scheduledTime, options = {}) => {
    if (!isSupported) return null;

    const now = Date.now();
    const targetTime = new Date(scheduledTime).getTime();
    const delay = targetTime - now;

    if (delay <= 0) {
      console.warn('[Notifications] Cannot schedule reminder in the past');
      return null;
    }

    if (delay > 24 * 60 * 60 * 1000) { // Max 24 hours
      console.warn('[Notifications] Cannot schedule reminder more than 24 hours ahead');
      return null;
    }

    const timeoutId = setTimeout(() => {
      showNotification(title, {
        body: `Påminnelse: ${title}`,
        tag: 'reminder',
        requireInteraction: true,
        ...options
      });
    }, delay);

    return {
      cancel: () => clearTimeout(timeoutId),
      scheduledTime: targetTime,
      delay
    };
  }, [isSupported, showNotification]);

  // ✅ QUICK NOTIFICATION HELPERS
  const showSuccessNotification = useCallback((message) => {
    return showNotification('✅ Framgång', {
      body: message,
      tag: 'success'
    });
  }, [showNotification]);

  const showErrorNotification = useCallback((message) => {
    return showNotification('❌ Fel', {
      body: message,
      tag: 'error',
      requireInteraction: true
    });
  }, [showNotification]);

  const showMeetingReminder = useCallback((meetingTitle, timeUntil) => {
    return showNotification('📅 Mötespåminnelse', {
      body: `${meetingTitle} börjar om ${timeUntil}`,
      tag: 'meeting-reminder',
      requireInteraction: true,
      actions: [
        { action: 'join', title: 'Gå med' },
        { action: 'dismiss', title: 'Stäng' }
      ]
    });
  }, [showNotification]);

  // ✅ LISTEN FOR PERMISSION CHANGES
  useEffect(() => {
    if (!isSupported) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setPermission(Notification.permission);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isSupported]);

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    scheduleReminder,
    showSuccessNotification,
    showErrorNotification,
    showMeetingReminder
  };
};