/**
 * Error Display Module
 *
 * Provides user-friendly error messages instead of silent failures.
 * Each error type maps to a helpful message and optional action.
 */

class ErrorDisplay {
  constructor() {
    this.toastContainer = null;
    this.initToastContainer();
  }

  initToastContainer() {
    const existing = document.getElementById('error-toast-container');
    if (existing) {
      this.toastContainer = existing;
      return;
    }

    const container = document.createElement('div');
    container.id = 'error-toast-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      max-width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    document.body.appendChild(container);
    this.toastContainer = container;
  }

  /**
   * Show error with context-aware message
   */
  show(errorType, context = {}) {
    const errorConfig = this.getErrorConfig(errorType, context);
    if (!errorConfig) {
      console.warn('Unknown error type:', errorType);
      return;
    }

    this.showToast(errorConfig);
  }

  /**
   * Map error type to user-friendly message
   */
  getErrorConfig(errorType, context) {
    const configs = {
      'google-drive-auth-failed': {
        title: 'Google Drive connection failed',
        message: 'Please sign in again to sync highlights.',
        action: 'Sign in',
        actionFn: () => this.authenticateGoogleDrive(),
        severity: 'error'
      },
      'google-drive-network-error': {
        title: 'Network error',
        message: 'Could not reach Google Drive. Check your connection and try again.',
        action: 'Retry',
        actionFn: () => this.retrySyncQueue(),
        severity: 'warning'
      },
      'google-drive-quota-exceeded': {
        title: 'Storage quota exceeded',
        message: 'Your Google Drive is full. Delete some files to continue syncing.',
        action: null,
        severity: 'error'
      },
      'ollama-not-running': {
        title: 'AI model not available',
        message: 'Install Ollama and start the server to use AI summaries.',
        action: 'Learn more',
        actionFn: () => window.open('https://ollama.ai', '_blank'),
        severity: 'info'
      },
      'highlight-restore-failed': {
        title: 'Highlight lost on reload',
        message: `"${context.text?.substring(0, 50)}..." could not be found on this page.`,
        action: 'Re-highlight',
        actionFn: null,
        severity: 'info'
      },
      'pdf-corrupted': {
        title: 'PDF could not be read',
        message: 'The file might be corrupted or unsupported. Try downloading again.',
        action: null,
        severity: 'error'
      },
      'extension-context-invalid': {
        title: 'Extension context lost',
        message: 'The extension was reloaded. Please try your action again.',
        action: 'Reload',
        actionFn: () => location.reload(),
        severity: 'warning'
      },
      'storage-quota-exceeded': {
        title: 'Local storage is full',
        message: 'Your browser storage is full. Export and delete some highlights.',
        action: null,
        severity: 'error'
      },
      'video-transcript-unavailable': {
        title: 'Video transcript not available',
        message: 'This video does not have captions or is not supported yet.',
        action: null,
        severity: 'info'
      },
      'highlight-text-not-found': {
        title: 'Highlight text changed',
        message: 'The page content has changed. Please re-highlight this text.',
        action: null,
        severity: 'info'
      }
    };

    return configs[errorType] || null;
  }

  /**
   * Show a toast notification
   */
  showToast(errorConfig) {
    if (!this.toastContainer) {
      this.initToastContainer();
    }

    const toast = document.createElement('div');
    const severityColor = this.getSeverityColor(errorConfig.severity);

    toast.style.cssText = `
      background: white;
      border-left: 4px solid ${severityColor};
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease-out;
    `;

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-weight: 600; font-size: 14px; color: #1f2937; margin-bottom: 4px;';
    titleEl.textContent = errorConfig.title;

    const messageEl = document.createElement('div');
    messageEl.style.cssText = 'font-size: 13px; color: #6b7280; line-height: 1.4; margin-bottom: 10px;';
    messageEl.textContent = errorConfig.message;

    toast.appendChild(titleEl);
    toast.appendChild(messageEl);

    if (errorConfig.action) {
      const actionBtn = document.createElement('button');
      actionBtn.textContent = errorConfig.action;
      actionBtn.style.cssText = `
        background: ${severityColor};
        color: white;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
      `;
      actionBtn.onmouseover = () => actionBtn.style.opacity = '0.8';
      actionBtn.onmouseout = () => actionBtn.style.opacity = '1';
      actionBtn.onclick = () => {
        if (errorConfig.actionFn) {
          errorConfig.actionFn();
        }
        toast.remove();
      };
      toast.appendChild(actionBtn);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      font-size: 18px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeBtn.onclick = () => toast.remove();
    toast.style.position = 'relative';
    toast.appendChild(closeBtn);

    this.toastContainer.appendChild(toast);

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
      }
    }, 6000);
  }

  getSeverityColor(severity) {
    const colors = {
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      success: '#10b981'
    };
    return colors[severity] || '#6b7280';
  }

  /**
   * Placeholder methods for actions
   */
  authenticateGoogleDrive() {
    chrome.runtime.sendMessage({ action: 'authenticateGoogleDrive' });
  }

  retrySyncQueue() {
    chrome.runtime.sendMessage({ action: 'processSyncQueue' });
  }
}

// Add CSS animation styles
if (!document.getElementById('error-display-styles')) {
  const style = document.createElement('style');
  style.id = 'error-display-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// Export for use
const errorDisplay = new ErrorDisplay();
