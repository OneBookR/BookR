import { useState, useEffect } from 'react';

export const useNotifications = () => {
  const [permission, setPermission] = useState(Notification.permission);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    }
    return 'denied';
  };

  const showNotification = (title, options = {}) => {
    if (permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
      
      setTimeout(() => notification.close(), 5000);
      return notification;
    }
  };

  const scheduleReminder = (title, message, delay) => {
    setTimeout(() => {
      showNotification(title, { body: message });
    }, delay);
  };

  return {
    permission,
    requestPermission,
    showNotification,
    scheduleReminder,
    isSupported: 'Notification' in window
  };
};