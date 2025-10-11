// Working popup controller - minimal and functional
console.log('🔧 Working popup loading...');

class WorkingPopupController {
  constructor() {
    this.currentTab = 'search';
    this.highlights = [];
    this.init();
  }

  async init() {
    console.log('🔧 Initializing...');
    this.setupEventListeners();
    await this.loadHighlights();
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // Action buttons
    const openManagerBtn = document.getElementById('openManagerBtn');
    if (openManagerBtn) {
      openManagerBtn.addEventListener('click', () => {
        chrome.tabs.create({
          url: chrome.runtime.getURL('highlights-manager.html')
        });
      });
    }

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        chrome.tabs.create({
          url: chrome.runtime.getURL('options.html')
        });
      });
    }

    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        this.manualSync();
      });
    }

    const connectDriveBtn = document.getElementById('connectDriveBtn');
    if (connectDriveBtn) {
      connectDriveBtn.addEventListener('click', () => {
        this.connectGoogleDrive();
      });
    }
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    this.currentTab = tabName;

    if (tabName === 'search') {
      this.loadHighlights();
    }
  }

  async loadHighlights() {
    console.log('🔧 Loading highlights...');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        // Try the message that was working before
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'searchHighlights',
          query: ''
        });

        console.log('🔧 Response:', response);

        if (response && response.success) {
          this.highlights = response.data || [];
          this.displayHighlights();
        } else {
          this.showNoHighlights('No highlights found');
        }
      }
    } catch (error) {
      console.error('🔧 Error loading highlights:', error);
      this.showNoHighlights('Error loading highlights');
    }
  }

  displayHighlights() {
    const container = document.getElementById('searchResults');
    if (!container) return;

    if (this.highlights.length === 0) {
      this.showNoHighlights('No highlights found');
      return;
    }

    container.innerHTML = this.highlights.map(highlight => `
      <div class="highlight-item">
        <div class="highlight-text">${this.escapeHtml(highlight.text || '')}</div>
        <div class="highlight-meta">${this.getDomain(highlight.url || '')} • ${this.formatDate(highlight.timestamp)}</div>
      </div>
    `).join('');

    console.log('🔧 Displayed', this.highlights.length, 'highlights');
  }

  showNoHighlights(message) {
    const container = document.getElementById('searchResults');
    if (!container) return;

    container.innerHTML = `
      <div class="no-results">
        <div>📝</div>
        <div>${message}</div>
        <div style="font-size: 12px; margin-top: 8px;">Start highlighting text on any webpage!</div>
      </div>
    `;
  }

  async manualSync() {
    console.log('🔧 Manual sync...');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'syncWithCloud'
        });
        this.loadHighlights(); // Reload after sync
      }
    } catch (error) {
      console.error('🔧 Sync error:', error);
    }
  }

  async connectGoogleDrive() {
    console.log('🔧 Connecting Google Drive...');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'authenticateGoogleDrive'
        });
      }
    } catch (error) {
      console.error('🔧 Google Drive error:', error);
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
      return 'Unknown';
    }
  }

  formatDate(timestamp) {
    if (!timestamp) return 'Recently';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 DOM ready, starting popup...');
  try {
    new WorkingPopupController();
  } catch (error) {
    console.error('🔧 Failed to start popup:', error);
  }
});

console.log('🔧 Working popup script loaded');