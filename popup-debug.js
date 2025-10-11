// Debug version of popup controller
console.log('🔍 Debug popup script starting...');

class DebugPopupController {
  constructor() {
    console.log('🔍 Constructor called');
    this.currentTab = 'highlights';
    this.highlights = [];

    try {
      this.init();
    } catch (error) {
      console.error('🔍 Error in constructor:', error);
      this.showError('Constructor error: ' + error.message);
    }
  }

  async init() {
    console.log('🔍 Init called');
    try {
      this.setupTabs();
      this.setupEventListeners();
      await this.loadHighlights();
      console.log('🔍 Init completed successfully');
    } catch (error) {
      console.error('🔍 Error in init:', error);
      this.showError('Init error: ' + error.message);
    }
  }

  setupTabs() {
    console.log('🔍 Setting up tabs');
    this.switchTab('highlights');
  }

  setupEventListeners() {
    console.log('🔍 Setting up event listeners');

    // Tab switching
    const navTabs = document.querySelectorAll('.nav-tab');
    console.log('🔍 Found nav tabs:', navTabs.length);

    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        console.log('🔍 Tab clicked:', tab.dataset.tab);
        this.switchTab(tab.dataset.tab);
      });
    });

    // Open manager button
    const openManagerBtn = document.getElementById('openManagerBtn');
    if (openManagerBtn) {
      console.log('🔍 Found openManagerBtn');
      openManagerBtn.addEventListener('click', () => {
        console.log('🔍 Open manager clicked');
        this.openHighlightManager();
      });
    } else {
      console.log('🔍 openManagerBtn not found');
    }

    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      console.log('🔍 Found settingsBtn');
      settingsBtn.addEventListener('click', () => {
        console.log('🔍 Settings clicked');
        this.openSettings();
      });
    } else {
      console.log('🔍 settingsBtn not found');
    }

    // Connect Google Drive button
    const connectDriveBtn = document.getElementById('connectDriveBtn');
    if (connectDriveBtn) {
      console.log('🔍 Found connectDriveBtn');
      connectDriveBtn.addEventListener('click', () => {
        console.log('🔍 Connect Drive clicked');
        this.connectGoogleDrive();
      });
    } else {
      console.log('🔍 connectDriveBtn not found');
    }

    // Sync button
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
      console.log('🔍 Found syncBtn');
      syncBtn.addEventListener('click', () => {
        console.log('🔍 Manual sync clicked');
        this.manualSync();
      });
    } else {
      console.log('🔍 syncBtn not found');
    }
  }

  switchTab(tabName) {
    console.log('🔍 Switching to tab:', tabName);

    try {
      // Update tab buttons
      document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
      });

      // Update tab content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-content`);
      });

      this.currentTab = tabName;
      console.log('🔍 Tab switched successfully to:', tabName);
    } catch (error) {
      console.error('🔍 Error switching tabs:', error);
      this.showError('Tab switch error: ' + error.message);
    }
  }

  async loadHighlights() {
    console.log('🔍 Loading highlights');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        console.log('🔍 Current tab:', tabs[0].url);

        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'searchHighlights',
          query: ''
        });

        console.log('🔍 Highlights response:', response);

        if (response && response.success) {
          this.highlights = response.data || [];
          console.log('🔍 Loaded highlights:', this.highlights.length);
          this.displayHighlights();
        } else {
          console.log('🔍 No highlights or content script not ready');
          this.showNoHighlights();
        }
      }
    } catch (error) {
      console.error('🔍 Error loading highlights:', error);
      this.showNoHighlights('Error loading highlights: ' + error.message);
    }
  }

  displayHighlights() {
    console.log('🔍 Displaying highlights');
    const container = document.getElementById('highlightsList');
    if (!container) {
      console.error('🔍 Highlights container not found');
      return;
    }

    if (this.highlights.length === 0) {
      this.showNoHighlights();
      return;
    }

    container.innerHTML = this.highlights.map(highlight => `
      <div class="action-card highlight-item" data-highlight-id="${highlight.id}" data-color="${highlight.color}">
        <div class="highlight-text">${this.escapeHtml(highlight.text)}</div>
        <div class="highlight-meta">${this.getDomain(highlight.url)} • ${this.formatDate(highlight.timestamp)}</div>
      </div>
    `).join('');

    // Apply colors via CSS classes instead of inline styles
    container.querySelectorAll('.highlight-item').forEach(item => {
      const color = item.dataset.color;
      if (color) {
        // Add a class instead of inline styles
        item.classList.add('highlight-colored');
        // Create a unique class for this color to avoid CSP violations
        this.addColorStyle(color);
        item.classList.add(`color-${this.getColorClass(color)}`);
      }
    });

    console.log('🔍 Highlights displayed successfully');
  }

  showNoHighlights(message = null) {
    console.log('🔍 Showing no highlights message');
    const container = document.getElementById('highlightsList');
    if (!container) return;

    container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">📝</div>
        <div>${message || 'No highlights found'}</div>
        <div class="no-results-subtitle">${message ? 'Try refreshing the page and extension' : 'Start highlighting text on any webpage!'}</div>
      </div>
    `;
  }

  openHighlightManager() {
    console.log('🔍 Opening highlight manager');
    try {
      chrome.tabs.create({
        url: chrome.runtime.getURL('highlights-manager.html')
      });
    } catch (error) {
      console.error('🔍 Error opening manager:', error);
      this.showError('Manager open error: ' + error.message);
    }
  }

  openSettings() {
    console.log('🔍 Opening settings');
    try {
      chrome.tabs.create({
        url: chrome.runtime.getURL('options.html')
      });
    } catch (error) {
      console.error('🔍 Error opening settings:', error);
      this.showError('Settings open error: ' + error.message);
    }
  }

  async connectGoogleDrive() {
    console.log('🔍 Connecting to Google Drive');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'authenticateGoogleDrive'
        });

        if (response && response.success) {
          console.log('🔍 Google Drive connected successfully');
          this.showSyncStatus('Connected to Google Drive');
        } else {
          console.error('🔍 Google Drive connection failed:', response);
          this.showError('Google Drive connection failed: ' + (response?.error || 'Unknown error'));
        }
      }
    } catch (error) {
      console.error('🔍 Error connecting to Google Drive:', error);
      this.showError('Google Drive error: ' + error.message);
    }
  }

  async manualSync() {
    console.log('🔍 Manual sync triggered');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'syncWithCloud'
        });

        if (response && response.success) {
          console.log('🔍 Manual sync completed');
          this.showSyncStatus('Sync completed');
        } else {
          console.error('🔍 Manual sync failed:', response);
          this.showError('Sync failed: ' + (response?.error || 'Unknown error'));
        }
      }
    } catch (error) {
      console.error('🔍 Error during manual sync:', error);
      this.showError('Sync error: ' + error.message);
    }
  }

  showSyncStatus(message) {
    console.log('🔍 Showing sync status:', message);
    const connectBtn = document.getElementById('connectDriveBtn');
    const syncStatus = document.getElementById('syncStatus');
    const syncMessage = document.getElementById('syncMessage');

    if (connectBtn) connectBtn.classList.add('hidden');
    if (syncStatus) syncStatus.classList.remove('hidden');
    if (syncMessage) syncMessage.textContent = message;
  }

  // Utility methods
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  getColorClass(color) {
    // Convert color to a safe class name
    return color.replace('#', '').toLowerCase();
  }

  addColorStyle(color) {
    // Add CSS rule for this color if not already added
    const className = `color-${this.getColorClass(color)}`;
    const existingStyle = document.querySelector(`style[data-color="${color}"]`);

    if (!existingStyle) {
      const style = document.createElement('style');
      style.setAttribute('data-color', color);

      const rgb = this.hexToRgb(color);
      if (rgb) {
        const bgColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
        style.textContent = `.${className} { background-color: ${bgColor} !important; border-left-color: ${color} !important; }`;
        document.head.appendChild(style);
      }
    }
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  showError(message) {
    console.error('🔍 Showing error:', message);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      right: 10px;
      background: #ff6b6b;
      color: white;
      padding: 10px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔍 DOM Content Loaded');
  try {
    new DebugPopupController();
  } catch (error) {
    console.error('🔍 Fatal error:', error);
    document.body.innerHTML = `
      <div style="padding: 20px; color: red; font-family: monospace;">
        <h3>Debug Error</h3>
        <p>${error.message}</p>
        <pre>${error.stack}</pre>
      </div>
    `;
  }
});

console.log('🔍 Debug script loaded successfully');