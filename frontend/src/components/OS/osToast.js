import useNotificationStore from '../../store/useNotificationStore';

const osToast = {
  success: (message, options = {}) => {
    return useNotificationStore.getState().addNotification({
      type: 'success',
      message,
      title: options.title || 'Success',
      ...options
    });
  },
  
  error: (message, options = {}) => {
    return useNotificationStore.getState().addNotification({
      type: 'error',
      message,
      title: options.title || 'Error',
      // Errors might be more persistent if needed
      ...options
    });
  },
  
  info: (message, options = {}) => {
    return useNotificationStore.getState().addNotification({
      type: 'info',
      message,
      title: options.title || 'Information',
      ...options
    });
  },
  
  warning: (message, options = {}) => {
    return useNotificationStore.getState().addNotification({
      type: 'warning',
      message,
      title: options.title || 'Warning',
      ...options
    });
  },
  
  // Loading toast might have timeout 0 (persistent until removed manually)
  loading: (message, options = {}) => {
    return useNotificationStore.getState().addNotification({
       type: 'loading',
       message,
       title: options.title || 'Processing',
       timeout: 0, 
       ...options
    });
  },

  // Useful to dismiss persistent toasts like loading toasts manually
  dismiss: (id) => {
    if (id) {
       useNotificationStore.getState().removeNotification(id);
    } else {
       useNotificationStore.getState().clearNotifications();
    }
  }
};

export default osToast;
