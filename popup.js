// popup.js - Popup interface logic

class PopupController {
  constructor() {
    this.currentTab = 'highlights';
    this.highlights = [];
    this.filteredHighlights = [];
    this.settings = {
      defaultColor: '#ffff00',
      autoSync: true,
      showTooltips: true,
      keyboardShortcuts: true,
      analytics: true
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.setupTabs();
    await this.loadInitialData();
    this.startPeriodicUpdates();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['highlighter_settings']);
      if (result.highlighter_settings) {
        this.settings = { ...this.settings, ...result.highlighter_settings };
      }
      this.applySettings();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({ highlighter_settings: this.settings });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  applySettings() {
    // Apply color selection
    document.querySelectorAll('.color-option').forEach(option => {
      option.classList.toggle('selected', option.dataset.color === this.settings.defaultColor);
    });

    // Apply toggles - check if elements exist
    const autoSyncToggle = document.getElementById('autoSyncToggle');
    if (autoSyncToggle) {
      autoSyncToggle.classList.toggle('active', this.settings.autoSync);
    }

    const tooltipsToggle = document.getElementById('tooltipsToggle');
    if (tooltipsToggle) {
      tooltipsToggle.classList.toggle('active', this.settings.showTooltips);
    }

    const shortcutsToggle = document.getElementById('shortcutsToggle');
    if (shortcutsToggle) {
      shortcutsToggle.classList.toggle('active', this.settings.keyboardShortcuts);
    }

    const analyticsToggle = document.getElementById('analyticsToggle');
    if (analyticsToggle) {
      analyticsToggle.classList.toggle('active', this.settings.analytics);
    }
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchHighlights(e.target.value);
      });
    }

    // Filters
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.applyFilter(chip.dataset.filter);
      });
    });

    // Color palette
    document.querySelectorAll('.color-option').forEach(option => {
      option.addEventListener('click', () => {
        this.selectColor(option.dataset.color);
      });
    });

    // Toggles - check if elements exist
    if (document.getElementById('autoSyncToggle')) {
      this.setupToggle('autoSyncToggle', 'autoSync');
    }
    if (document.getElementById('tooltipsToggle')) {
      this.setupToggle('tooltipsToggle', 'showTooltips');
    }
    if (document.getElementById('shortcutsToggle')) {
      this.setupToggle('shortcutsToggle', 'keyboardShortcuts');
    }
    if (document.getElementById('analyticsToggle')) {
      this.setupToggle('analyticsToggle', 'analytics');
    }

    // Action buttons - check if elements exist
    const highlightModeBtn = document.getElementById('highlightModeBtn');
    if (highlightModeBtn) {
      highlightModeBtn.addEventListener('click', () => {
        this.toggleHighlightMode();
      });
    }

    const exportPageBtn = document.getElementById('exportPageBtn');
    if (exportPageBtn) {
      exportPageBtn.addEventListener('click', () => {
        this.exportCurrentPage();
      });
    }

    const clearPageBtn = document.getElementById('clearPageBtn');
    if (clearPageBtn) {
      clearPageBtn.addEventListener('click', () => {
        this.clearCurrentPage();
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

    // Export buttons - check if elements exist
    const exportJson = document.getElementById('exportJson');
    if (exportJson) {
      exportJson.addEventListener('click', () => {
        this.exportAllHighlights('json');
      });
    }

    const exportHtml = document.getElementById('exportHtml');
    if (exportHtml) {
      exportHtml.addEventListener('click', () => {
        this.exportAllHighlights('html');
      });
    }

    const exportMd = document.getElementById('exportMd');
    if (exportMd) {
      exportMd.addEventListener('click', () => {
        this.exportAllHighlights('markdown');
      });
    }

    // Clear all data
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        this.clearAllData();
      });
    }

    // Help and feedback - check if elements exist
    const helpLink = document.getElementById('helpLink');
    if (helpLink) {
      helpLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.openHelp();
      });
    }

    const feedbackLink = document.getElementById('feedbackLink');
    if (feedbackLink) {
      feedbackLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.openFeedback();
      });
    }

    // Open highlight manager button
    document.getElementById('openManagerBtn').addEventListener('click', () => {
      this.openHighlightManager();
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'focusSearch') {
        this.switchTab('highlights');
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
          searchInput.focus();
        }
      }
    });
  }

  setupToggle(elementId, settingKey) {
    const toggle = document.getElementById(elementId);
    toggle.addEventListener('click', () => {
      this.settings[settingKey] = !this.settings[settingKey];
      toggle.classList.toggle('active', this.settings[settingKey]);
      this.saveSettings();
    });
  }

  setupTabs() {
    this.switchTab('highlights');
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-content`);
    });

    this.currentTab = tabName;

    // Load tab-specific data
    switch (tabName) {
      case 'highlights':
        this.loadAllHighlights().then(() => {
          this.displayHighlights(this.highlights);
        });
        break;
      case 'manage':
        this.loadManageData();
        break;
      case 'settings':
        this.loadSettingsData();
        break;
    }
  }

  async loadInitialData() {
    await this.loadAllHighlights();
    await this.checkSyncStatus();

    // Load initial tab content
    if (this.currentTab === 'highlights') {
      this.displayHighlights(this.highlights);
    }
  }

  async loadAllHighlights() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'searchHighlights',
          query: ''
        });

        if (response && response.success) {
          this.highlights = response.data || [];
          this.filteredHighlights = [...this.highlights];
        }
      }
    } catch (error) {
      console.error('Error loading highlights:', error);
      this.highlights = [];
      this.filteredHighlights = [];
    }
  }

  async loadCurrentPageData() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const tab = tabs[0];
        
        // Update page info
        document.getElementById('pageTitle').textContent = tab.title || 'Untitled';
        document.getElementById('pageUrl').textContent = tab.url || '';

        // Load page highlights
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'getPageHighlights'
        });

        if (response && response.success) {
          this.displayCurrentPageHighlights(response.data || []);
        }
      }
    } catch (error) {
      console.error('Error loading current page data:', error);
      document.getElementById('currentPageHighlights').innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">⚠️</div>
          <div>Unable to load highlights for this page</div>
        </div>
      `;
    }
  }

  async loadStatsData() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'getStats'
        });

        if (response && response.success) {
          this.displayStats(response.data);
        }
      }

      // Load analytics from background
      const analyticsResponse = await chrome.runtime.sendMessage({
        action: 'getWeeklyReport'
      });

      if (analyticsResponse && analyticsResponse.success) {
        this.displayAnalytics(analyticsResponse.data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  displayHighlights(highlights) {
    const container = document.getElementById('highlightsList');
    if (!container) return;
    
    if (highlights.length === 0) {
      container.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">📝</div>
          <div>No highlights found</div>
          <div style="margin-top: 8px; font-size: 12px;">Start highlighting text on any webpage!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = highlights.map(highlight => `
      <div class="highlight-item" data-highlight-id="${highlight.id}">
        <div class="highlight-content">
          <div class="highlight-text" style="background-color: ${highlight.color}20; border-left-color: ${highlight.color};">
            ${this.escapeHtml(highlight.text)}
          </div>
          ${highlight.note ? `<div style="font-size: 12px; color: #666; margin: 8px 0 4px 0;">💭 ${this.escapeHtml(highlight.note)}</div>` : ''}
          <div class="highlight-meta">
            <div class="highlight-url" title="${highlight.url}">${this.getDomain(highlight.url)}</div>
            <div class="highlight-date">${this.formatDate(highlight.timestamp)}</div>
          </div>
        </div>
        <div class="highlight-actions">
          <button class="delete-highlight-btn" data-highlight-id="${highlight.id}" title="Delete highlight">
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

    // Add click handlers
    container.querySelectorAll('.highlight-item').forEach(item => {
      // Click on highlight content to open
      const content = item.querySelector('.highlight-content');
      content.addEventListener('click', () => {
        this.openHighlight(item.dataset.highlightId);
      });
    });

    // Add delete button handlers
    container.querySelectorAll('.delete-highlight-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent opening highlight
        this.deleteHighlight(btn.dataset.highlightId);
      });
    });
  }

  displayCurrentPageHighlights(highlights) {
    const container = document.getElementById('currentPageHighlights');

    if (highlights.length === 0) {
      container.innerHTML = `
        <div class="no-results">
          <div class="no-results-icon">📄</div>
          <div>No highlights on this page</div>
          <div style="margin-top: 8px; font-size: 12px;">Select text and click the highlight button!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom: 12px; font-size: 14px; font-weight: 600;">
        ${highlights.length} highlight${highlights.length !== 1 ? 's' : ''} on this page
      </div>
    ` + highlights.map(highlight => `
      <div class="highlight-item" data-highlight-id="${highlight.id}">
        <div class="highlight-text" style="background-color: ${highlight.color}20; border-left-color: ${highlight.color};">
          ${this.escapeHtml(highlight.text)}
        </div>
        ${highlight.note ? `<div style="font-size: 12px; color: #666; margin: 8px 0 4px 0;">💭 ${this.escapeHtml(highlight.note)}</div>` : ''}
        <div class="highlight-meta">
          <div class="highlight-date">${this.formatDate(highlight.timestamp)}</div>
        </div>
      </div>
    `).join('');
  }

  async loadManageData() {
    await this.loadAllHighlights();
    await this.checkSyncStatus();
  }

  async loadSettingsData() {
    this.applySettings();
  }

  displayStats(stats) {
    document.getElementById('totalHighlights').textContent = stats.totalHighlights || 0;
    document.getElementById('totalDomains').textContent = stats.totalDomains || 0;
    document.getElementById('thisWeek').textContent = stats.weekCount || 0;
    document.getElementById('thisMonth').textContent = stats.monthCount || 0;

    // Update progress bar
    const weeklyProgress = Math.min((stats.weekCount || 0) / 50 * 100, 100);
    document.getElementById('weeklyProgress').style.width = `${weeklyProgress}%`;
  }

  displayAnalytics(analytics) {
    // Update achievements based on analytics
    const achievementsContainer = document.getElementById('achievements');
    const achievements = this.calculateAchievements(analytics);
    
    achievementsContainer.innerHTML = achievements.map(achievement => `
      <div class="achievement">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-text">
          <div class="achievement-title">${achievement.title}</div>
          <div class="achievement-desc">${achievement.description}</div>
        </div>
      </div>
    `).join('');
  }

  calculateAchievements(analytics) {
    const achievements = [
      {
        icon: '🎯',
        title: 'First Highlight',
        description: 'Welcome to Universal Highlighter!'
      }
    ];

    if (analytics.weekly && analytics.weekly.highlights >= 10) {
      achievements.push({
        icon: '🔥',
        title: 'On Fire',
        description: '10+ highlights this week!'
      });
    }

    if (analytics.weekly && analytics.weekly.domains >= 5) {
      achievements.push({
        icon: '🌐',
        title: 'Explorer',
        description: 'Highlighted on 5+ different websites'
      });
    }

    if (analytics.weekly && analytics.weekly.highlights >= 50) {
      achievements.push({
        icon: '📚',
        title: 'Scholar',
        description: '50+ highlights this week!'
      });
    }

    return achievements;
  }

  searchHighlights(query) {
    if (!query.trim()) {
      this.filteredHighlights = [...this.highlights];
    } else {
      const searchTerm = query.toLowerCase();
      this.filteredHighlights = this.highlights.filter(highlight =>
        highlight.text.toLowerCase().includes(searchTerm) ||
        (highlight.note && highlight.note.toLowerCase().includes(searchTerm)) ||
        highlight.title.toLowerCase().includes(searchTerm)
      );
    }
    
    this.displayHighlights(this.filteredHighlights);
  }

  applyFilter(filter) {
    // Update active filter
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filter === filter);
    });

    const now = new Date();
    let filtered = [...this.highlights];

    switch (filter) {
      case 'today':
        const today = now.toDateString();
        filtered = this.highlights.filter(h => 
          new Date(h.timestamp).toDateString() === today
        );
        break;
        
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = this.highlights.filter(h => 
          new Date(h.timestamp) >= weekAgo
        );
        break;
        
      case 'notes':
        filtered = this.highlights.filter(h => h.note && h.note.trim());
        break;
        
      default: // 'all'
        filtered = [...this.highlights];
    }

    this.filteredHighlights = filtered;
    this.displayHighlights(this.filteredHighlights);
  }

  async openHighlight(highlightId) {
    try {
      const highlight = this.highlights.find(h => h.id === highlightId);
      if (highlight) {
        // Open the URL in new tab and scroll to highlight
        await chrome.tabs.create({ url: highlight.url });
      }
    } catch (error) {
      console.error('Error opening highlight:', error);
    }
  }

  selectColor(color) {
    document.querySelectorAll('.color-option').forEach(option => {
      option.classList.toggle('selected', option.dataset.color === color);
    });
    
    this.settings.defaultColor = color;
    this.saveSettings();
  }

  async toggleHighlightMode() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleHighlightMode'
        });
        window.close();
      }
    } catch (error) {
      console.error('Error toggling highlight mode:', error);
    }
  }

  async exportCurrentPage() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'exportHighlights',
          format: 'html',
          scope: 'current'
        });

        if (response && response.success) {
          await this.downloadFile(
            `highlights-${this.getDomain(tabs[0].url)}.html`,
            response.data,
            'text/html'
          );
        }
      }
    } catch (error) {
      console.error('Error exporting current page:', error);
    }
  }

  async deleteHighlight(highlightId) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'removeHighlight',
          highlightId: highlightId
        });

        if (response && response.success) {
          // Remove from local arrays
          this.highlights = this.highlights.filter(h => h.id !== highlightId);
          this.filteredHighlights = this.filteredHighlights.filter(h => h.id !== highlightId);

          // Refresh the display
          this.displayHighlights(this.filteredHighlights);

          // Update current page data if we're on that tab
          if (this.currentTab === 'current') {
            this.loadCurrentPageData();
          }

          // Show success feedback
          this.showMessage('✅ Highlight deleted', 'success');
        } else {
          throw new Error('Failed to delete highlight');
        }
      }
    } catch (error) {
      console.error('Error deleting highlight:', error);
      this.showMessage('❌ Failed to delete highlight', 'error');
    }
  }

  async clearCurrentPage() {
    if (!confirm('Remove all highlights from this page? This cannot be undone.')) {
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'getPageHighlights'
        });

        if (response && response.success && response.data) {
          for (const highlight of response.data) {
            await chrome.tabs.sendMessage(tabs[0].id, {
              action: 'removeHighlight',
              highlightId: highlight.id
            });
          }
          
          this.loadCurrentPageData();
          this.loadAllHighlights();
        }
      }
    } catch (error) {
      console.error('Error clearing page highlights:', error);
    }
  }

  async manualSync() {
    this.updateSyncStatus('syncing', 'Syncing...');
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'syncWithCloud'
        });
        
        this.updateSyncStatus('success', 'Sync complete!');
        
        // Reload data after sync
        await this.loadAllHighlights();
      }
    } catch (error) {
      console.error('Error during manual sync:', error);
      this.updateSyncStatus('error', 'Sync failed');
    }
  }

  updateSyncStatus(status, message) {
    const syncStatus = document.getElementById('syncStatus');
    if (!syncStatus) return;

    const icon = syncStatus.querySelector('.sync-icon');
    if (!icon) return;

    icon.className = `sync-icon ${status}`;

    switch (status) {
      case 'syncing':
        icon.textContent = '🔄';
        break;
      case 'success':
        icon.textContent = '✅';
        break;
      case 'error':
        icon.textContent = '❌';
        break;
      case 'pending':
        icon.textContent = '⏳';
        break;
      case 'auth':
        icon.textContent = '🔐';
        break;
      case 'local':
        icon.textContent = '💾';
        break;
      default:
        icon.textContent = '🔄';
    }

    const messageSpan = syncStatus.querySelector('span:last-child');
    if (messageSpan) {
      messageSpan.textContent = message;
    }
  }

  async exportAllHighlights(format) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'exportHighlights',
          format: format,
          scope: 'all'
        });

        if (response && response.success) {
          const extension = format === 'json' ? 'json' : format === 'html' ? 'html' : 'md';
          const mimeType = format === 'json' ? 'application/json' : 
                          format === 'html' ? 'text/html' : 'text/markdown';
          
          await this.downloadFile(
            `all-highlights.${extension}`,
            response.data,
            mimeType
          );
        }
      }
    } catch (error) {
      console.error('Error exporting all highlights:', error);
    }
  }

  async clearAllData() {
    if (!confirm('This will clear all local highlight data. Your Google Drive backup will remain safe. Continue?')) {
      return;
    }

    try {
      await chrome.storage.local.clear();
      
      // Reload the popup
      window.location.reload();
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }

  async downloadFile(filename, content, mimeType) {
    try {
      // Create blob and download directly in popup
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);

      // Create temporary download link
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up
      URL.revokeObjectURL(url);

      console.log(`Downloaded: ${filename}`);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  }

  openHelp() {
    chrome.tabs.create({
      url: 'https://github.com/universal-highlighter/help'
    });
  }

  openFeedback() {
    chrome.tabs.create({
      url: 'https://github.com/universal-highlighter/feedback'
    });
  }

  startPeriodicUpdates() {
    // Update data every 30 seconds
    setInterval(() => {
      if (this.currentTab === 'highlights') {
        this.loadAllHighlights().then(() => {
          this.displayHighlights(this.highlights);
        });
      } else if (this.currentTab === 'manage') {
        this.loadManageData();
      } else if (this.currentTab === 'settings') {
        this.loadSettingsData();
      }
    }, 30000);
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
    
    if (diff < 60000) { // Less than 1 minute
      return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
      return `${Math.floor(diff / 60000)}m ago`;
    } else if (diff < 86400000) { // Less than 1 day
      return `${Math.floor(diff / 3600000)}h ago`;
    } else if (diff < 604800000) { // Less than 1 week
      return `${Math.floor(diff / 86400000)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  async checkSyncStatus() {
    try {
      console.log('📱 Checking sync status...');
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getSyncStatus' });
        console.log('📱 Sync status response:', response);

        if (response && response.success) {
          const status = response.data;
          console.log('📱 Storage type:', status.storageType, 'Authenticated:', status.authenticated);

          // Handle different storage types
          if (status.storageType === 'chrome-sync') {
            this.showSyncStatus();
            if (status.authenticated) {
              this.updateSyncStatus('success', '✅ Chrome Sync enabled');
            } else {
              this.updateSyncStatus('info', '💾 Chrome Sync unavailable - using local storage');
            }
          } else if (status.storageType === 'local') {
            this.showSyncStatus();
            this.updateSyncStatus('info', '💾 Local storage only');
          } else if (status.storageType === 'google-drive' || status.storageType === 'google-drive-direct' || !status.storageType) {
            // Google Drive or hybrid storage
            if (status.authenticated) {
              this.showSyncStatus();
              if (status.inProgress) {
                this.updateSyncStatus('syncing', 'Syncing...');
              } else if (status.queueLength > 0) {
                this.updateSyncStatus('pending', `${status.queueLength} pending`);
              } else {
                const lastSyncText = status.lastSync ?
                  `Synced ${this.formatDate(status.lastSync)}` :
                  'Ready to sync';
                this.updateSyncStatus('success', lastSyncText);
              }
            } else {
              this.showConnectDriveUI();
            }
          } else {
            this.showSyncStatus();
            this.updateSyncStatus('info', status.message || 'Unknown storage type');
          }
        } else {
          this.showConnectDriveUI();
        }
      }
    } catch (error) {
      console.error('Error checking sync status:', error);
      this.showConnectDriveUI();
    }
  }

  showSyncStatus() {
    const syncStatus = document.getElementById('syncStatus');
    const syncSetup = document.getElementById('syncSetup');

    if (syncStatus) syncStatus.style.display = 'flex';
    if (syncSetup) syncSetup.style.display = 'none';
  }

  showConnectDriveUI() {
    console.log('📱 Showing Connect Google Drive UI');
    const syncStatus = document.getElementById('syncStatus');
    const syncSetup = document.getElementById('syncSetup');

    if (syncStatus) syncStatus.style.display = 'none';
    if (syncSetup) syncSetup.style.display = 'block';
  }

  async connectGoogleDrive() {
    try {
      const connectBtn = document.getElementById('connectDriveBtn');
      connectBtn.textContent = '🔄 Connecting...';
      connectBtn.disabled = true;

      console.log('Starting Google Drive connection...');

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        console.log('Sending authentication request to content script...');

        // Trigger authentication
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'authenticateGoogleDrive' });

        console.log('Authentication response:', response);

        if (response && response.success) {
          this.showMessage('✅ Google Drive connected successfully!');
          connectBtn.textContent = '✅ Connected';
          await this.checkSyncStatus(); // Refresh status
        } else {
          const errorMsg = response?.data?.error || response?.error || 'Unknown error';
          console.error('Authentication failed:', errorMsg);

          // Show detailed error message with setup instructions
          if (errorMsg.includes('OAuth setup required') || errorMsg.includes('OAuth verification required')) {
            this.showDetailedOAuthError(errorMsg);
          } else {
            this.showMessage(`❌ Connection failed: ${errorMsg}`);
          }

          connectBtn.textContent = '🔗 Try Again';
          connectBtn.disabled = false;
        }
      }
    } catch (error) {
      console.error('Error connecting to Google Drive:', error);

      // Show more specific error message
      let errorMsg = 'Connection failed';
      if (error.message.includes('Receiving end does not exist')) {
        errorMsg = 'Page needs refresh - please reload and try again';
      } else if (error.message.includes('chrome-extension://')) {
        errorMsg = 'Extension not properly loaded - please check installation';
      } else if (error.message) {
        errorMsg = error.message;
      }

      this.showMessage(`❌ ${errorMsg}`);

      const connectBtn = document.getElementById('connectDriveBtn');
      connectBtn.textContent = '🔗 Try Again';
      connectBtn.disabled = false;
    }
  }

  showDetailedOAuthError(errorMsg) {
    // Create a more detailed error message for OAuth issues
    const errorDiv = document.createElement('div');

    const isVerificationIssue = errorMsg && errorMsg.includes('OAuth verification required');

    if (isVerificationIssue) {
      // OAuth is configured correctly, just needs test user added
      errorDiv.innerHTML = `
        <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 12px; border-radius: 4px; margin: 10px 0; font-size: 12px;">
          <h4 style="margin: 0 0 8px 0; color: #0c5460;">✅ Almost There! OAuth Working</h4>
          <p style="margin: 4px 0; color: #0c5460;">Your OAuth is configured correctly but in testing mode.</p>
          <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin: 8px 0;">
            <strong style="color: #495057;">Quick Fix:</strong>
            <ol style="margin: 4px 0; padding-left: 16px; color: #495057; font-size: 11px;">
              <li>Go to <a href="https://console.cloud.google.com" target="_blank" style="color: #007bff;">Google Cloud Console</a></li>
              <li>Navigate to: APIs & Services → OAuth consent screen</li>
              <li>Scroll to "Test users" section</li>
              <li>Click "Add Users"</li>
              <li>Add: <code style="background: #fff; padding: 1px 3px;">gtarc001@gmail.com</code></li>
              <li>Save and try again</li>
            </ol>
          </div>
          <p style="margin: 4px 0; font-size: 11px; color: #6c757d;">
            Extension works perfectly locally until Google Drive is connected.
          </p>
        </div>
      `;
    } else {
      // OAuth needs initial setup
      errorDiv.innerHTML = `
        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 12px; border-radius: 4px; margin: 10px 0; font-size: 12px;">
          <h4 style="margin: 0 0 8px 0; color: #856404;">⚠️ Google Drive Setup Required</h4>
          <p style="margin: 4px 0; color: #856404;">The extension needs proper OAuth configuration to connect to Google Drive.</p>
          <details style="margin: 8px 0;">
            <summary style="cursor: pointer; color: #495057;">Setup Instructions</summary>
            <ol style="margin: 8px 0; padding-left: 16px; color: #495057;">
              <li>Go to <a href="https://console.cloud.google.com" target="_blank" style="color: #007bff;">Google Cloud Console</a></li>
              <li>Create/select a project</li>
              <li>Enable Google Drive API</li>
              <li>Create OAuth 2.0 Client ID for Chrome Extension</li>
              <li>Use Extension ID: <code style="background: #f8f9fa; padding: 2px 4px;">${chrome.runtime.id}</code></li>
            </ol>
          </details>
          <p style="margin: 4px 0; font-size: 11px; color: #6c757d;">
            For now, highlighting works locally. Contact developer for OAuth assistance.
          </p>
        </div>
      `;
    }

    // Replace the sync setup area with this detailed error
    const syncSetup = document.getElementById('syncSetup');
    if (syncSetup) {
      syncSetup.innerHTML = errorDiv.innerHTML;
    }
  }

  showMessage(message) {
    // Remove existing messages
    document.querySelectorAll('.popup-message').forEach(msg => msg.remove());

    // Create new message
    const messageEl = document.createElement('div');
    messageEl.className = 'popup-message';
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      max-width: 300px;
      text-align: center;
    `;

    document.body.appendChild(messageEl);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.remove();
      }
    }, 3000);
  }

  openHighlightManager() {
    // Open the highlight manager in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('highlights-manager.html')
    });
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    new PopupController();
  } catch (error) {
    console.error('Error initializing popup:', error);
    // Fallback: Show basic error message
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center; font-family: sans-serif;">
        <h3>🔧 Extension Loading</h3>
        <p>Please reload the extension or try again.</p>
        <small>Error: ${error.message}</small>
      </div>
    `;
  }
});