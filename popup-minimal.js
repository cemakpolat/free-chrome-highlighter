// Minimal popup - absolutely no CSP violations
console.log('🟢 Minimal popup starting...');

class MinimalPopup {
  constructor() {
    this.highlights = [];
    this.currentTab = 'highlights';
    this.currentFilter = 'current'; // 'current' or 'all'
    this.init();
  }

  init() {
    this.setupTabs();
    this.setupButtons();
    this.setupFilters();
    this.setupAITab();
    this.checkGoogleDriveStatus();
    this.loadHighlights();

    // Periodically check Google Drive status every 10 seconds
    setInterval(() => {
      this.checkGoogleDriveStatus();
    }, 10000);
  }

  setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });
  }

  setupButtons() {
    // Header icon buttons
    this.setupButton('header-manage-all', () => this.openManager());
    this.setupButton('header-reader-view', () => this.activateReaderView());
    this.setupButton('header-video-transcript', () => this.activateVideoAnnotation());
    this.setupButton('header-pdf-reader', () => this.openPDFReader());

    // AI tab buttons
    this.setupButton('summarizePageBtn', () => this.summarizePage());

    // Manage tab buttons (keep existing)
    this.setupButton('manage-all', () => this.openManager());
    this.setupButton('reader-view-btn', () => this.activateReaderView());
    this.setupButton('video-annotation-btn', () => this.activateVideoAnnotation());
    this.setupButton('pdf-reader-btn', () => this.openPDFReader());
    this.setupButton('sync-now', () => this.syncNow());
    this.setupButton('connect-drive', () => this.connectDrive());
    this.setupButton('open-settings', () => this.openSettings());
    this.setupButton('help', () => this.openHelp());
  }

  setupButton(id, handler) {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener('click', handler);
    }
  }

  setupFilters() {
    const filterToggles = document.querySelectorAll('.filter-toggle');
    filterToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        this.switchFilter(toggle.dataset.filter);
      });
    });
  }

  switchFilter(filterType) {
    this.currentFilter = filterType;

    // Update toggle buttons
    document.querySelectorAll('.filter-toggle').forEach(toggle => {
      toggle.classList.toggle('active', toggle.dataset.filter === filterType);
    });

    // Reload highlights with new filter
    this.loadHighlights();
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === tabName);
    });

    this.currentTab = tabName;

    if (tabName === 'highlights') {
      this.loadHighlights();
    }
  }

  async loadHighlights() {
    console.log('🟢 Loading highlights...');
    const container = document.getElementById('highlights-list');

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const action = this.currentFilter === 'current' ? 'getPageHighlights' : 'searchHighlights';
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: action,
          query: ''
        });

        if (response && response.success && response.data) {
          this.highlights = response.data;
          this.displayHighlights(container);
        } else {
          this.showNoHighlights(container);
        }
      }
    } catch (error) {
      console.error('🟢 Error:', error);
      this.showError(container, 'Failed to load highlights');
    }
  }

  displayHighlights(container) {
    if (this.highlights.length === 0) {
      this.showNoHighlights(container);
      return;
    }

    container.innerHTML = this.highlights.map(h => `
      <div class="highlight-item" data-highlight-id="${h.id}">
        <div class="highlight-content">
          <div class="highlight-text">${this.escapeHtml(h.text || '')}</div>
          <div class="highlight-meta">${this.getDomain(h.url)} • ${this.formatTime(h.timestamp)}</div>
        </div>
        <div class="highlight-actions">
          <button class="delete-btn" data-highlight-id="${h.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="m19,6v14a2,2 0 0 1 -2,2H7a2,2 0 0 1 -2,-2V6m3,0V4a2,2 0 0 1 2,-2h4a2,2 0 0 1 2,2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Add delete button event listeners
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteHighlight(btn.dataset.highlightId);
      });
    });

    console.log('🟢 Displayed', this.highlights.length, 'highlights');
  }

  showNoHighlights(container) {
    const message = this.currentFilter === 'current'
      ? 'No highlights on this page'
      : 'No highlights found';
    const subMessage = this.currentFilter === 'current'
      ? 'Start highlighting text on this webpage!'
      : 'Start highlighting text on any webpage!';

    container.innerHTML = `
      <div class="no-highlights">
        📝<br>
        ${message}<br>
        <small>${subMessage}</small>
      </div>
    `;
  }

  showError(container, message) {
    container.innerHTML = `
      <div class="error">
        Error: ${message}
      </div>
    `;
  }

  // Button handlers
  openManager() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('highlights-manager.html')
    });
  }

  async summarizePage() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        this.showErrorMessage('No active page found');
        return;
      }

      const currentUrl = tabs[0].url;
      const domain = new URL(currentUrl).hostname;

      // Open manager with hash to indicate summary mode
      chrome.tabs.create({
        url: chrome.runtime.getURL('highlights-manager.html') + '#summarize-' + encodeURIComponent(domain)
      }, (tab) => {
        // Send message to the newly opened tab to trigger auto-summary
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'auto-summarize-domain',
            domain: domain
          }).catch(() => {});
        }, 500);
      });
    } catch (error) {
      console.error('Error summarizing page:', error);
      this.showErrorMessage('Could not summarize page');
    }
  }

  openSettings() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('highlights-manager.html') + '#plugins'
    });
  }

  async syncNow() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'syncWithCloud'
        });
        this.loadHighlights();
      }
    } catch (error) {
      console.error('🟢 Sync error:', error);
    }
  }

  async activateReaderView() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'activateReaderView'
        });
        window.close(); // Close popup after activation
      }
    } catch (error) {
      console.error('🟢 Reader view error:', error);
      this.showErrorMessage('Could not activate reader view. Make sure you are on a regular webpage.');
    }
  }

  async activateVideoAnnotation() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'activateVideoAnnotation'
        });
        window.close(); // Close popup after activation
      }
    } catch (error) {
      console.error('🟢 Video annotation error:', error);
      this.showErrorMessage('Could not activate video annotation. Make sure there is a video on this page.');
    }
  }

  async openPDFReader() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const url = tabs[0].url;

        // Check if current page is a PDF
        const isPDF = url.toLowerCase().endsWith('.pdf') ||
                      url.includes('pdf') ||
                      tabs[0].url.includes('application/pdf');

        if (isPDF) {
          // Store PDF data and open reader
          await chrome.storage.local.set({
            pdfReaderData: {
              url: url,
              timestamp: Date.now()
            }
          });

          const readerUrl = chrome.runtime.getURL('pdf-reader.html');
          await chrome.tabs.create({ url: readerUrl });
          window.close();
        } else {
          this.showErrorMessage('This page is not a PDF. Please navigate to a PDF file first.');
        }
      }
    } catch (error) {
      console.error('🟢 PDF reader error:', error);
      this.showErrorMessage('Could not open PDF reader. Make sure you are on a PDF page.');
    }
  }

  async connectDrive() {
    const driveBtn = document.getElementById('connect-drive');
    const originalText = driveBtn.innerHTML;

    try {
      // Update button to show loading state
      driveBtn.innerHTML = '🔄 Connecting...';
      driveBtn.disabled = true;

      // Use background script for authentication instead of content script
      const response = await chrome.runtime.sendMessage({
        action: 'authenticateGoogleDrive'
      });

      if (response && response.success) {
        // Connection successful
        driveBtn.innerHTML = '✅ Connected to Google Drive';
        driveBtn.style.backgroundColor = '#28a745';
        driveBtn.style.color = 'white';
        console.log('🟢 Google Drive connected successfully');

        // Keep the success state for a few seconds, then refresh status
        setTimeout(() => {
          this.checkGoogleDriveStatus(); // Refresh the actual status
        }, 3000);
      } else {
        // Connection failed
        driveBtn.innerHTML = '❌ Connection Failed';
        driveBtn.style.backgroundColor = '#dc3545';
        driveBtn.style.color = 'white';
        console.error('🟢 Google Drive connection failed:', response);

        // Reset after showing error
        setTimeout(() => {
          driveBtn.innerHTML = originalText;
          driveBtn.style.backgroundColor = '';
          driveBtn.style.color = '';
          driveBtn.disabled = false;
        }, 3000);
      }
    } catch (error) {
      console.error('🟢 Drive error:', error);
      // Reset button on error
      driveBtn.innerHTML = '❌ Connection Error';
      driveBtn.style.backgroundColor = '#dc3545';
      driveBtn.style.color = 'white';

      setTimeout(() => {
        driveBtn.innerHTML = originalText;
        driveBtn.style.backgroundColor = '';
        driveBtn.style.color = '';
        driveBtn.disabled = false;
      }, 3000);
    }
  }

  openHelp() {
    chrome.tabs.create({
      url: 'https://github.com/cemakpolat/free-chrome-highlighter'
    });
  }

  async deleteHighlight(highlightId) {
    console.log('🟢 Deleting highlight:', highlightId);
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        let response;
        try {
          response = await chrome.tabs.sendMessage(tabs[0].id, {
            action: 'removeHighlight',
            highlightId: highlightId
          });
        } catch (connectionError) {
          console.log('🟢 Connection error, trying direct storage deletion:', connectionError.message);
          // Try to delete directly from storage when content script is not available
          const deleted = await this.deleteHighlightFromStorage(highlightId);
          if (deleted) {
            this.highlights = this.highlights.filter(h => h.id !== highlightId);
            const container = document.getElementById('highlights-list');
            this.displayHighlights(container);
            this.showSuccessMessage('Highlight deleted');
          } else {
            this.showErrorMessage('Failed to delete highlight');
          }
          return;
        }

        if (response && response.success) {
          console.log('🟢 Highlight deleted successfully');
          // Remove from local array
          this.highlights = this.highlights.filter(h => h.id !== highlightId);
          // Refresh display
          const container = document.getElementById('highlights-list');
          this.displayHighlights(container);
          // Show success message briefly
          this.showSuccessMessage('Highlight deleted');
        } else {
          console.error('🟢 Delete failed:', response);
          const errorMsg = response && response.error ? response.error : 'Failed to delete highlight';
          this.showErrorMessage(errorMsg);
        }
      }
    } catch (error) {
      console.error('🟢 Delete error:', error);
      this.showErrorMessage('Error deleting highlight');
    }
  }

  showSuccessMessage(message) {
    this.showTempMessage(message, 'success');
  }

  showErrorMessage(message) {
    this.showTempMessage(message, 'error');
  }

  showTempMessage(message, type) {
    // Remove existing messages
    document.querySelectorAll('.temp-message').forEach(el => el.remove());

    const messageEl = document.createElement('div');
    messageEl.className = `temp-message ${type}`;
    messageEl.textContent = message;

    document.body.appendChild(messageEl);

    // Auto-remove after 2 seconds
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.remove();
      }
    }, 2000);
  }

  // Utilities
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

  formatTime(timestamp) {
    if (!timestamp) return 'Recently';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return date.toLocaleDateString();
  }

  async checkGoogleDriveStatus() {
    try {
      // Check directly with background script instead of content script
      const response = await chrome.runtime.sendMessage({
        action: 'getGoogleDriveAuthStatus'
      });

      const driveBtn = document.getElementById('connect-drive');
      if (driveBtn) {
        if (response && response.success && response.authenticated) {
          driveBtn.innerHTML = '✅ Google Drive Connected';
          driveBtn.style.backgroundColor = '#28a745';
          driveBtn.style.color = 'white';
          driveBtn.disabled = false;
        } else {
          driveBtn.innerHTML = '🔗 Connect Google Drive';
          driveBtn.style.backgroundColor = '';
          driveBtn.style.color = '';
          driveBtn.disabled = false;
        }
      }
    } catch (error) {
      console.log('Could not check Google Drive status:', error.message);
      // Set button to disconnected state on error
      const driveBtn = document.getElementById('connect-drive');
      if (driveBtn) {
        driveBtn.innerHTML = '🔗 Connect Google Drive';
        driveBtn.style.backgroundColor = '';
        driveBtn.style.color = '';
        driveBtn.disabled = false;
      }
    }
  }

  /**
   * Delete highlight directly from chrome.storage when content script is not available
   */
  async deleteHighlightFromStorage(highlightId) {
    try {
      // Find the highlight to get its URL
      const highlight = this.highlights.find(h => h.id === highlightId);
      if (!highlight) {
        console.log('🟢 Highlight not found in local cache');
        return false;
      }

      const domain = new URL(highlight.url).hostname;
      console.log('🟢 Deleting from domain:', domain);

      // Load domain data from storage using the correct prefix
      const storageKey = `universal_highlighter_${domain}`;
      const result = await chrome.storage.local.get([storageKey]);
      const domainData = result[storageKey];

      if (domainData && domainData.highlights) {
        // Remove the highlight
        domainData.highlights = domainData.highlights.filter(h => h.id !== highlightId);
        domainData.lastModified = Date.now();

        // Save back to storage
        await chrome.storage.local.set({ [storageKey]: domainData });
        console.log('🟢 Highlight deleted from storage successfully');
        return true;
      } else {
        console.log('🟢 No highlights found for domain in storage');
        return false;
      }
    } catch (error) {
      console.error('🟢 Error deleting from storage:', error);
      return false;
    }
  }
  setupAITab() {
    // Agent quick-launch buttons → open manager on the agents tab
    document.querySelectorAll('.ai-agent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('highlights-manager.html') + '#agents' });
        window.close();
      });
    });

    document.getElementById('openAgentsManager')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('highlights-manager.html') + '#agents' });
      window.close();
    });

    // Show current AI plugin status
    chrome.runtime.sendMessage({ action: 'plugin:summary' })
      .then(resp => {
        const dot = document.getElementById('aiStatusDot');
        const label = document.getElementById('aiStatusLabel');
        if (!dot || !label) return;

        if (resp?.success) {
          const ai = resp.result.active.ai || 'none';
          dot.classList.add('ready');
          label.textContent = `AI: ${ai}`;
        } else {
          dot.classList.add('unavailable');
          label.textContent = 'Plugin system loading...';
        }
      })
      .catch(() => {
        const dot = document.getElementById('aiStatusDot');
        const label = document.getElementById('aiStatusLabel');
        if (dot) dot.classList.add('unavailable');
        if (label) label.textContent = 'Offline (extractive only)';
      });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('🟢 DOM ready');
  new MinimalPopup();
});

console.log('🟢 Minimal popup script loaded');