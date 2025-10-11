// Final popup controller - fully CSP compliant
console.log('🎯 Final popup script starting...');

class FinalPopupController {
  constructor() {
    console.log('🎯 Constructor called');
    this.currentTab = 'highlights';
    this.highlights = [];

    // Initialize immediately
    this.init();
  }

  async init() {
    console.log('🎯 Init called');
    try {
      this.setupTabs();
      this.setupEventListeners();
      await this.loadHighlights();
      console.log('🎯 Init completed successfully');
    } catch (error) {
      console.error('🎯 Error in init:', error);
      this.showError('Failed to initialize popup: ' + error.message);
    }
  }

  setupTabs() {
    console.log('🎯 Setting up tabs');
    this.switchTab('highlights');
  }

  setupEventListeners() {
    console.log('🎯 Setting up event listeners');

    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        console.log('🎯 Tab clicked:', tab.dataset.tab);
        this.switchTab(tab.dataset.tab);
      });
    });

    // Action buttons
    this.setupButton('openManagerBtn', () => this.openHighlightManager());
    this.setupButton('syncBtn', () => this.manualSync());
    this.setupButton('connectDriveBtn', () => this.connectGoogleDrive());
    this.setupButton('settingsBtn', () => this.openSettings());
    this.setupButton('helpBtn', () => this.openHelp());
    this.setupButton('aboutBtn', () => this.showAbout());
  }

  setupButton(id, handler) {
    const button = document.getElementById(id);
    if (button) {
      console.log(`🎯 Setting up button: ${id}`);
      button.addEventListener('click', handler);
    } else {
      console.log(`🎯 Button not found: ${id}`);
    }
  }

  switchTab(tabName) {
    console.log('🎯 Switching to tab:', tabName);

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
      console.log('🎯 Tab switched successfully to:', tabName);

      // Load data when switching to highlights tab
      if (tabName === 'highlights') {
        this.loadHighlights();
      }
    } catch (error) {
      console.error('🎯 Error switching tabs:', error);
      this.showError('Failed to switch tabs: ' + error.message);
    }
  }

  async loadHighlights() {
    console.log('🎯 Loading highlights');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        console.log('🎯 Current tab:', tabs[0].url);

        // Try to get highlights from content script
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'getAllHighlights'
        });

        console.log('🎯 Highlights response:', response);

        if (response && response.success && response.data) {
          this.highlights = response.data;
          console.log('🎯 Loaded highlights count:', this.highlights.length);
          this.displayHighlights();
        } else {
          console.log('🎯 No highlights found or content script not ready');
          this.showNoHighlights();
        }
      }
    } catch (error) {
      console.error('🎯 Error loading highlights:', error);
      this.showNoHighlights('Error loading highlights. Try refreshing the page.');
    }
  }

  displayHighlights() {
    console.log('🎯 Displaying highlights');
    const container = document.getElementById('highlightsList');
    if (!container) {
      console.error('🎯 Highlights container not found');
      return;
    }

    if (this.highlights.length === 0) {
      this.showNoHighlights();
      return;
    }

    // Display highlights without any inline styles (CSP compliant)
    container.innerHTML = this.highlights.map((highlight, index) => `
      <div class="highlight-item" data-highlight-id="${highlight.id || index}">
        <div class="highlight-text">${this.escapeHtml(highlight.text || 'No text available')}</div>
        <div class="highlight-meta">
          ${this.getDomain(highlight.url || '')} • ${this.formatDate(highlight.timestamp || Date.now())}
        </div>
      </div>
    `).join('');

    console.log('🎯 Highlights displayed successfully');
  }

  showNoHighlights(message = null) {
    console.log('🎯 Showing no highlights message');
    const container = document.getElementById('highlightsList');
    if (!container) return;

    container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">📝</div>
        <div>${message || 'No highlights found'}</div>
        <div class="no-results-subtitle">
          ${message ? 'Try refreshing the page and extension' : 'Start highlighting text on any webpage!'}
        </div>
      </div>
    `;
  }

  // Action handlers
  openHighlightManager() {
    console.log('🎯 Opening highlight manager');
    chrome.tabs.create({
      url: chrome.runtime.getURL('highlights-manager.html')
    });
  }

  openSettings() {
    console.log('🎯 Opening settings');
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html')
    });
  }

  async connectGoogleDrive() {
    console.log('🎯 Connecting to Google Drive');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        this.showSyncStatus('Connecting...', '🔄');

        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'authenticateGoogleDrive'
        });

        if (response && response.success) {
          console.log('🎯 Google Drive connected successfully');
          this.showSyncStatus('Connected to Google Drive', '✅');
        } else {
          console.error('🎯 Google Drive connection failed:', response);
          this.showError('Google Drive connection failed. Please try again.');
          this.hideSyncStatus();
        }
      }
    } catch (error) {
      console.error('🎯 Error connecting to Google Drive:', error);
      this.showError('Google Drive connection error: ' + error.message);
      this.hideSyncStatus();
    }
  }

  async manualSync() {
    console.log('🎯 Manual sync triggered');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        this.showSyncStatus('Syncing...', '🔄');

        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'syncWithCloud'
        });

        if (response && response.success) {
          console.log('🎯 Manual sync completed');
          this.showSyncStatus('Sync completed', '✅');
          // Reload highlights after sync
          setTimeout(() => this.loadHighlights(), 1000);
        } else {
          console.error('🎯 Manual sync failed:', response);
          this.showError('Sync failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('🎯 Error during manual sync:', error);
      this.showError('Sync error: ' + error.message);
    }
  }

  openHelp() {
    console.log('🎯 Opening help');
    chrome.tabs.create({
      url: 'https://github.com/your-username/chrome-highlighter#readme'
    });
  }

  showAbout() {
    console.log('🎯 Showing about');
    const manifest = chrome.runtime.getManifest();
    alert(`Universal Web Highlighter\nVersion: ${manifest.version}\n\nA free web highlighter with Google Drive sync.`);
  }

  // UI utility methods
  showSyncStatus(message, icon = '✅') {
    console.log('🎯 Showing sync status:', message);
    const connectBtn = document.getElementById('connectDriveBtn');
    const syncStatus = document.getElementById('syncStatus');
    const syncMessage = document.getElementById('syncMessage');
    const syncIcon = syncStatus?.querySelector('.action-icon');

    if (connectBtn) connectBtn.classList.add('hidden');
    if (syncStatus) syncStatus.classList.remove('hidden');
    if (syncMessage) syncMessage.textContent = message;
    if (syncIcon) syncIcon.textContent = icon;
  }

  hideSyncStatus() {
    const connectBtn = document.getElementById('connectDriveBtn');
    const syncStatus = document.getElementById('syncStatus');

    if (connectBtn) connectBtn.classList.remove('hidden');
    if (syncStatus) syncStatus.classList.add('hidden');
  }

  showError(message) {
    console.error('🎯 Showing error:', message);

    // Remove existing errors
    document.querySelectorAll('.error-message').forEach(el => el.remove());

    // Create new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;

    // Add to current tab content
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
      activeTab.insertBefore(errorDiv, activeTab.firstChild);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (errorDiv.parentNode) {
          errorDiv.remove();
        }
      }, 5000);
    }
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
      return 'Unknown domain';
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 DOM Content Loaded');
  try {
    new FinalPopupController();
  } catch (error) {
    console.error('🎯 Fatal error:', error);
    document.body.innerHTML = `
      <div style="padding: 20px; background: #ffebee; color: #c62828; border-radius: 8px; margin: 20px;">
        <h3>Extension Error</h3>
        <p>The popup failed to load. Please try:</p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Refreshing the current page</li>
          <li>Reloading the extension</li>
          <li>Restarting Chrome</li>
        </ul>
        <small>Error: ${error.message}</small>
      </div>
    `;
  }
});

console.log('🎯 Final popup script loaded successfully');