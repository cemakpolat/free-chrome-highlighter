// highlights-manager.js - Web-based highlight manager

class HighlightManager {
  constructor() {
    this.highlights = [];
    this.pages = [];
    this.filteredHighlights = [];
    this.selectedPage = null;
    this.currentFilter = 'all';
    this.exportModalInitialized = false;
    this.exportInProgress = false;
    this.searchTerm = '';
    this.aiService = new AISummaryService();
    this.ttsService = new TTSService();
    this.dontShowDeleteConfirmation = false; // Track "don't show again" preference

    this.init();
  }

  async init() {
    // Load delete confirmation preference
    const stored = await chrome.storage.local.get(['dontShowDeleteConfirmation']);
    this.dontShowDeleteConfirmation = stored.dontShowDeleteConfirmation || false;

    this.setupEventListeners();
    this.setupDeleteModal();
    await this.loadHighlights();
    // this.populateCategoryFilter(); // removed - categories no longer used
    this.updateStats();
    this.renderPages();
    this._handleHashNavigation();
  }

  _handleHashNavigation() {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const tab = document.querySelector(`.page-tab[data-view="${hash}"]`);
    if (tab) tab.click();
  }

  setupEventListeners() {
    // Search functionality
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.applyFilters();
    });

    // Advanced filters
    // Category and importance filter listeners removed - no longer used

    document.getElementById('tagFilter').addEventListener('input', () => {
      this.applyFilters();
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.dataset.filter;
        this.applyFilters();
      });
    });

    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      await this.loadHighlights();
      // this.populateCategoryFilter(); // removed - categories no longer used
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.showExportModal();
    });

    // AI Summary button
    document.getElementById('generateSummaryBtn').addEventListener('click', () => {
      this.generateAISummary();
    });

    // Summary panel controls
    document.getElementById('closeSummaryBtn').addEventListener('click', () => {
      this.closeSummaryPanel();
    });

    document.getElementById('copySummaryBtn').addEventListener('click', () => {
      this.copySummaryToClipboard();
    });

    document.getElementById('exportSummaryBtn').addEventListener('click', () => {
      this.exportSummary();
    });

    document.getElementById('playSummaryBtn').addEventListener('click', () => {
      this.toggleSummaryTTS();
    });

    // Edit Note Modal event listeners
    document.getElementById('closeEditModal').addEventListener('click', () => {
      this.closeEditNoteModal();
    });

    document.getElementById('cancelEditNote').addEventListener('click', () => {
      this.closeEditNoteModal();
    });

    document.getElementById('saveEditNote').addEventListener('click', () => {
      this.saveNoteFromModal();
    });

    document.getElementById('editNoteModal').addEventListener('click', (e) => {
      if (e.target.id === 'editNoteModal') {
        this.closeEditNoteModal();
      }
    });

    // Handle keyboard shortcuts for modal
    document.addEventListener('keydown', (e) => {
      const modalOpen = document.getElementById('editNoteModal').classList.contains('show');

      if (modalOpen) {
        if (e.key === 'Escape') {
          this.closeEditNoteModal();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.saveNoteFromModal();
        }
      }
    });
  }

  async loadHighlights() {
    try {
      this.updateSyncStatus('syncing', 'Loading highlights...');

      // Check if extension context is available
      const hasExtensionContext = await this.checkExtensionContext();

      if (hasExtensionContext) {
        // Try to get data from Google Drive via background script first
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'getAllHighlights'
          });

          if (response && response.success && response.data) {
            console.log(`🌐 Loaded ${response.data.length} highlights from Google Drive`);
            this.highlights = response.data;
            this.processHighlights();
            this.updateSyncStatus('synced', 'Synced from Google Drive');
            return;
          } else {
            const errorMsg = response?.error || 'Unknown error';

            // Check if it's an authentication error
            if (errorMsg.includes('401') || errorMsg.includes('authentication') || errorMsg.includes('Unauthorized')) {
              console.warn('Google Drive authentication expired or invalid');
              this.updateSyncStatus('error', 'Google Drive: Please re-authenticate');
            } else {
              console.warn('Google Drive load failed:', errorMsg);
            }
          }
        } catch (error) {
          console.warn('Google Drive API error:', error.message);
        }

        // Try content script approach
        console.log('📱 Trying content script approach...');
        await this.loadFromContentScripts();
        return;
      }

      // Extension context not available - use direct localStorage
      console.log('🔧 Extension context unavailable, using direct localStorage...');
      await this.loadFromDirectLocalStorage();

    } catch (error) {
      console.error('Error loading highlights:', error);
      this.updateSyncStatus('error', 'Failed to load highlights');

      // Show empty state
      this.highlights = [];
      this.processHighlights();
    }
  }

  async checkExtensionContext() {
    try {
      // Try a simple extension API call
      await chrome.runtime.getManifest();
      return true;
    } catch (error) {
      console.log('Extension context not available:', error.message);
      return false;
    }
  }

  async loadFromDirectLocalStorage() {
    try {
      this.highlights = [];

      // Use chrome.storage.local instead of localStorage
      const allData = await chrome.storage.local.get(null);

      // Load regular web page highlights
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('universal_highlighter_')) {
          try {
            if (value && value.highlights && Array.isArray(value.highlights)) {
              this.highlights.push(...value.highlights);
            }
          } catch (parseError) {
            console.warn(`Failed to parse highlights from key ${key}:`, parseError);
          }
        }
      }

      // Load PDF highlights
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('pdfHighlights_')) {
          try {
            const pdfUrl = decodeURIComponent(key.replace('pdfHighlights_', ''));
            const pdfName = pdfUrl.split('/').pop().split('?')[0] || 'PDF Document';

            // Convert PDF highlights to standard format
            for (const [pageNum, pageHighlights] of Object.entries(value)) {
              if (Array.isArray(pageHighlights)) {
                pageHighlights.forEach(highlight => {
                  this.highlights.push({
                    id: highlight.id,
                    text: highlight.text,
                    note: highlight.note || '',
                    color: highlight.color || 'yellow',
                    url: pdfUrl,
                    domain: new URL(pdfUrl).hostname,
                    timestamp: highlight.timestamp || Date.now(),
                    pageTitle: `${pdfName} (Page ${pageNum})`,
                    isPDF: true,
                    pdfPage: pageNum
                  });
                });
              }
            }
          } catch (parseError) {
            console.warn(`Failed to parse PDF highlights from key ${key}:`, parseError);
          }
        }
      }

      console.log(`📦 Loaded ${this.highlights.length} highlights (including PDFs) from chrome.storage`);
      this.processHighlights();
      this.updateSyncStatus('synced', 'Local data loaded');

    } catch (error) {
      console.error('Error loading from chrome.storage:', error);
      this.updateSyncStatus('error', 'Failed to load local data');
    }
  }

  async loadFromContentScripts() {
    try {
      // Query only valid tabs with proper URLs
      const tabs = await chrome.tabs.query({
        url: ['http://*/*', 'https://*/*', 'file://*/*']
      });

      this.highlights = [];

      for (const tab of tabs) {
        // Skip invalid tabs
        if (!tab.id || tab.id < 0 || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
          continue;
        }

        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'getPageHighlights'
          });

          if (response && response.success && response.data) {
            this.highlights.push(...response.data);
          }
        } catch (error) {
          // Tab might not have content script or extension context invalidated
          console.log(`Tab ${tab.id} (${tab.url}) not accessible:`, error.message);
          continue;
        }
      }

      // Also load PDF highlights from storage
      await this.loadPDFHighlights();

      this.processHighlights();
      this.updateSyncStatus('synced', 'All highlights loaded');
    } catch (error) {
      console.error('Error loading from content scripts:', error);
      // Fall back to direct localStorage
      await this.loadFromDirectLocalStorage();
    }
  }

  async loadPDFHighlights() {
    try {
      const allData = await chrome.storage.local.get(null);
      let totalPDFHighlights = 0;
      let pdfCount = 0;

      // Load PDF highlights
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('pdfHighlights_')) {
          pdfCount++;
          try {
            const pdfUrl = decodeURIComponent(key.replace('pdfHighlights_', ''));
            const pdfName = pdfUrl.split('/').pop().split('?')[0] || 'PDF Document';
            console.log(`📄 Loading highlights from: ${pdfName}`);

            // Convert PDF highlights to standard format
            for (const [pageNum, pageHighlights] of Object.entries(value)) {
              if (Array.isArray(pageHighlights)) {
                console.log(`  Page ${pageNum}: ${pageHighlights.length} highlights`);
                pageHighlights.forEach(highlight => {
                  this.highlights.push({
                    id: highlight.id,
                    text: highlight.text,
                    note: highlight.note || '',
                    color: highlight.color || 'yellow',
                    url: pdfUrl,
                    domain: new URL(pdfUrl).hostname,
                    timestamp: highlight.timestamp || Date.now(),
                    pageTitle: `${pdfName} (Page ${pageNum})`,
                    title: pdfName,
                    isPDF: true,
                    pdfPage: pageNum,
                    tags: []
                  });
                  totalPDFHighlights++;
                });
              }
            }
          } catch (parseError) {
            console.warn(`Failed to parse PDF highlights from key ${key}:`, parseError);
          }
        }
      }

      console.log(`📄 Loaded ${totalPDFHighlights} PDF highlights from ${pdfCount} PDFs`);
    } catch (error) {
      console.error('Error loading PDF highlights:', error);
    }
  }

  processHighlights() {
    // Group highlights by page
    const pageMap = new Map();

    this.highlights.forEach(highlight => {
      // Migrate old tag format to new array format
      if (highlight.tags && typeof highlight.tags === 'string') {
        // Convert old comma-separated string format to array
        highlight.tags = highlight.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      } else if (!highlight.tags || !Array.isArray(highlight.tags)) {
        // Ensure tags is always an array
        highlight.tags = [];
      }

      // Remove old importance tags and general tag that are no longer used
      if (highlight.tags && Array.isArray(highlight.tags)) {
        highlight.tags = highlight.tags.filter(tag =>
          !['low', 'medium', 'high', 'general'].includes(tag.toLowerCase())
        );
      }

      // Remove old importance and category properties if they exist
      if (highlight.importance) {
        delete highlight.importance;
      }
      if (highlight.category) {
        delete highlight.category;
      }

      const url = highlight.url;
      const domain = this.getDomain(url);

      if (!pageMap.has(url)) {
        pageMap.set(url, {
          url: url,
          title: highlight.title || domain,
          domain: domain,
          highlights: [],
          lastUpdated: highlight.timestamp
        });
      }

      const page = pageMap.get(url);
      page.highlights.push(highlight);

      // Update last updated time
      if (highlight.timestamp > page.lastUpdated) {
        page.lastUpdated = highlight.timestamp;
      }
    });

    // Convert to array and sort by last updated
    this.pages = Array.from(pageMap.values()).sort((a, b) => b.lastUpdated - a.lastUpdated);

    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.highlights];

    // Apply date filters
    const now = new Date();
    switch (this.currentFilter) {
      case 'today':
        const today = now.toDateString();
        filtered = filtered.filter(h => new Date(h.timestamp).toDateString() === today);
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(h => new Date(h.timestamp) >= weekAgo);
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(h => new Date(h.timestamp) >= monthAgo);
        break;
      case 'notes':
        filtered = filtered.filter(h => h.note && h.note.trim());
        break;
    }

    // Apply search filter
    if (this.searchTerm) {
      filtered = filtered.filter(h =>
        h.text.toLowerCase().includes(this.searchTerm) ||
        (h.note && h.note.toLowerCase().includes(this.searchTerm)) ||
        (h.title && h.title.toLowerCase().includes(this.searchTerm)) ||
        h.url.toLowerCase().includes(this.searchTerm) ||
        (h.tags && h.tags.some(tag => tag.toLowerCase().includes(this.searchTerm)))
      );
    }

    // Category and importance filters removed - no longer used

    // Apply tag filter
    const tagFilter = document.getElementById('tagFilter').value.toLowerCase();
    if (tagFilter) {
      filtered = filtered.filter(h =>
        h.tags && h.tags.some(tag => tag.toLowerCase().includes(tagFilter))
      );
    }

    this.filteredHighlights = filtered;
    this.renderPages();

    if (this.selectedPage) {
      this.showPageHighlights(this.selectedPage);
    }
  }

  renderPages() {
    const pageList = document.getElementById('pageList');

    if (this.pages.length === 0) {
      pageList.innerHTML = `
        <div class="empty-state">
          <h3>📝 No highlights found</h3>
          <p>Start highlighting content on web pages to see them here!</p>
        </div>
      `;
      return;
    }

    // Filter pages that have filtered highlights
    const relevantPages = this.pages.filter(page =>
      page.highlights.some(h => this.filteredHighlights.includes(h))
    );

    pageList.innerHTML = relevantPages.map(page => {
      const highlightCount = page.highlights.filter(h => this.filteredHighlights.includes(h)).length;
      const noteCount = page.highlights.filter(h => h.note && h.note.trim()).length;

      return `
        <div class="page-item" data-url="${page.url}">
          <div class="page-content">
            <div class="page-title">${this.escapeHtml(page.title)}</div>
            <div class="page-url">${this.escapeHtml(page.domain)}</div>
            <div class="page-stats">
              <span>📝 ${highlightCount} highlights</span>
              ${noteCount > 0 ? `<span>💭 ${noteCount} notes</span>` : ''}
            </div>
          </div>
          <button class="delete-page-btn" data-url="${page.url}" title="Delete all highlights from this page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    // Add click handlers
    pageList.querySelectorAll('.page-item').forEach(item => {
      // Click handler for page content (not delete button)
      const pageContent = item.querySelector('.page-content');
      pageContent.addEventListener('click', () => {
        const url = item.dataset.url;
        const page = this.pages.find(p => p.url === url);
        this.selectPage(page);
      });

      // Delete button handler
      const deleteBtn = item.querySelector('.delete-page-btn');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = deleteBtn.dataset.url;
        await this.deletePage(url);
      });
    });
  }

  selectPage(page) {
    this.selectedPage = page;

    // Update active state
    document.querySelectorAll('.page-item').forEach(item => {
      item.classList.toggle('active', item.dataset.url === page.url);
    });

    this.showPageHighlights(page);
  }

  showPageHighlights(page) {
    const container = document.getElementById('highlightsContainer');
    const title = document.getElementById('contentTitle');

    title.textContent = page.title;

    // Get highlights for this page that match current filters
    const pageHighlights = page.highlights.filter(h => this.filteredHighlights.includes(h))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (pageHighlights.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>📝 No highlights found</h3>
          <p>No highlights match the current filters for this page.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = pageHighlights.map(highlight => `
      <div class="highlight-card" data-highlight-id="${highlight.id}">
        <div class="highlight-content">
          <div class="highlight-text" data-highlight-color="${highlight.color}">
            ${this.escapeHtml(this.cleanHighlightText(highlight.text))}
          </div>

          ${highlight.note ? `
            <div class="highlight-note">
              💭 ${this.escapeHtml(highlight.note)}
            </div>
          ` : ''}

          ${(highlight.tags && highlight.tags.length > 0) ? `
            <div class="highlight-tags">
              ${highlight.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}

          <div class="highlight-meta">
            <span class="highlight-date">${this.formatDate(highlight.timestamp)}</span>
            <div class="highlight-actions">
              <button class="highlight-action tts-highlight" data-highlight-id="${highlight.id}" data-text="${this.escapeHtml(highlight.text)}">
                🔊 Listen
              </button>
              <button class="highlight-action go-to-page" data-highlight-id="${highlight.id}" data-url="${highlight.url}">
                🔗 Go to page
              </button>
              <button class="highlight-action edit-note" data-highlight-id="${highlight.id}">
                ✏️ Edit note
              </button>
              <button class="highlight-action delete delete-highlight" data-highlight-id="${highlight.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3,6 5,6 21,6"></polyline>
                  <path d="m19,6v14a2,2 0 0 1 -2,2H7a2,2 0 0 1 -2,-2V6m3,0V4a2,2 0 0 1 2,-2h4a2,2 0 0 1 2,2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Add event listeners for action buttons
    this.addActionButtonListeners();
  }

  addActionButtonListeners() {
    const container = document.getElementById('highlightsContainer');

    // TTS (Text-to-Speech) buttons
    container.querySelectorAll('.tts-highlight').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const highlightId = btn.dataset.highlightId;
        const text = btn.dataset.text;
        this.toggleTTS(highlightId, text, btn);
      });
    });

    // Go to page buttons
    container.querySelectorAll('.go-to-page').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const highlightId = btn.dataset.highlightId;
        const url = btn.dataset.url;
        this.goToHighlight(highlightId, url);
      });
    });

    // Edit note buttons
    container.querySelectorAll('.edit-note').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const highlightId = btn.dataset.highlightId;
        this.editNote(highlightId);
      });
    });

    // Apply highlight colors using CSS custom properties
    container.querySelectorAll('.highlight-text[data-highlight-color]').forEach(element => {
      const color = element.dataset.highlightColor;
      if (color) {
        element.style.setProperty('background-color', color + '20');
        element.style.setProperty('border-left-color', color);
      }
    });

    // Delete buttons
    container.querySelectorAll('.delete-highlight').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const highlightId = btn.dataset.highlightId;
        this.deleteHighlight(highlightId);
      });
    });
  }

  updateStats() {
    const totalHighlights = this.highlights.length;
    const totalPages = this.pages.length;
    const totalNotes = this.highlights.filter(h => h.note && h.note.trim()).length;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = this.highlights.filter(h => new Date(h.timestamp) >= weekAgo).length;

    document.getElementById('totalHighlights').textContent = totalHighlights;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('totalNotes').textContent = totalNotes;
    document.getElementById('thisWeek').textContent = thisWeek;
  }

  // populateCategoryFilter() method removed - categories no longer used

  async goToHighlight(highlightId, url) {
    try {
      // Validate URL before creating tab
      if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
        this.showErrorMessage('Cannot open this page type');
        return;
      }

      // Check if extension context is available
      const hasExtensionContext = await this.checkExtensionContext();
      if (hasExtensionContext) {
        await chrome.tabs.create({ url: url });
        // Could add logic to scroll to specific highlight
      } else {
        // Fallback to opening URL in new window/tab
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error opening page:', error);
      // Fallback to window.open if chrome.tabs fails
      try {
        window.open(url, '_blank');
      } catch (fallbackError) {
        this.showErrorMessage('Failed to open page');
      }
    }
  }

  async editNote(highlightId) {
    const highlight = this.highlights.find(h => h.id === highlightId);
    if (!highlight) {
      this.showErrorMessage('Highlight not found');
      return;
    }

    // Store current highlight for modal
    this.currentEditingHighlight = highlight;

    // Set up modal content
    document.getElementById('highlightPreview').textContent = highlight.text;
    document.getElementById('noteTextarea').value = highlight.note || '';

    // Show modal
    this.showEditNoteModal();
  }

  showEditNoteModal() {
    const modal = document.getElementById('editNoteModal');
    modal.classList.add('show');

    // Focus on textarea after animation
    setTimeout(() => {
      document.getElementById('noteTextarea').focus();
    }, 100);
  }

  closeEditNoteModal() {
    const modal = document.getElementById('editNoteModal');
    modal.classList.remove('show');
    this.currentEditingHighlight = null;

    // Clear form
    document.getElementById('highlightPreview').textContent = '';
    document.getElementById('noteTextarea').value = '';
  }

  async saveNoteFromModal() {
    if (!this.currentEditingHighlight) {
      this.showErrorMessage('No highlight selected for editing');
      return;
    }

    const newNote = document.getElementById('noteTextarea').value.trim();
    const highlightId = this.currentEditingHighlight.id;

    try {
      // Update local copy
      this.currentEditingHighlight.note = newNote;

      // Save to localStorage directly
      await this.saveToLocalStorage(this.currentEditingHighlight);

      // Try to save via content script (if extension context is available)
      const hasExtensionContext = await this.checkExtensionContext();
      if (hasExtensionContext) {
        try {
          const tabs = await chrome.tabs.query({ url: this.currentEditingHighlight.url });
          if (tabs.length > 0) {
            const tab = tabs[0];

            // Skip invalid tabs
            if (!tab.id || tab.id < 0 || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
              console.log('Tab not accessible for highlight update');
            } else {
              const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'updateHighlight',
                highlightId: highlightId,
                changes: { note: newNote }
              });

              if (response && response.success) {
                console.log('✅ Note updated via content script');
              }
            }
          }
        } catch (error) {
          console.warn('Could not update via content script:', error);
        }
      }

      // Close modal
      this.closeEditNoteModal();

      // Update the display
      this.showPageHighlights(this.selectedPage);
      this.updateStats();

      // Show success message
      this.showSuccessMessage(newNote ? 'Note updated successfully' : 'Note removed successfully');

    } catch (error) {
      console.error('Error updating note:', error);
      this.showErrorMessage('Failed to update note');
    }
  }

  async saveToLocalStorage(highlight) {
    try {
      const domain = this.getDomain(highlight.url);
      const key = `${domain}_${highlight.id}`;
      const storageKey = `universal_highlighter_${key}`;
      localStorage.setItem(storageKey, JSON.stringify(highlight));
      console.log(`💾 Saved highlight to localStorage: ${storageKey}`);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }

  async deleteFromLocalStorage(highlightId, url) {
    try {
      const domain = this.getDomain(url);
      const key = `${domain}_${highlightId}`;
      const storageKey = `universal_highlighter_${key}`;
      localStorage.removeItem(storageKey);
      console.log(`🗑️ Removed highlight from localStorage: ${storageKey}`);
    } catch (error) {
      console.error('Error deleting from localStorage:', error);
    }
  }

  toggleTTS(highlightId, text, button) {
    const status = this.ttsService.getStatus();

    // If currently playing this highlight, stop it
    if (status.currentHighlightId === highlightId && (status.isPlaying || status.isPaused)) {
      console.log('🛑 Stopping TTS for highlight:', highlightId);
      this.ttsService.stop();
      button.innerHTML = '🔊 Listen';
      button.title = 'Listen to highlight';
      return;
    }

    // If playing different highlight, stop it first
    if (status.isPlaying || status.isPaused) {
      this.ttsService.stop();
      this.resetAllTTSButtons();
    }

    // Start playing this highlight
    try {
      const highlight = this.highlights.find(h => h.id === highlightId);
      let fullText = text;

      // Add note if available
      if (highlight && highlight.note && highlight.note.trim()) {
        fullText += `. Note: ${highlight.note}`;
      }

      console.log('🔊 Playing TTS for highlight:', highlightId);
      this.ttsService.speak(fullText, highlightId);

      // Update button state to show stop option
      button.innerHTML = '⏹️ Stop';
      button.title = 'Stop speech';

      // Set up event handlers for this session
      this.setupTTSEventHandlers(button);

    } catch (error) {
      console.error('Error playing TTS:', error);
      this.showErrorMessage('Failed to play audio. Please check your browser settings.');
    }
  }

  setupTTSEventHandlers(button) {
    // Override TTS service event handlers to update button states
    const originalOnEnd = this.ttsService.onEnd.bind(this.ttsService);
    const originalOnPause = this.ttsService.onPause.bind(this.ttsService);
    const originalOnResume = this.ttsService.onResume.bind(this.ttsService);
    const originalOnError = this.ttsService.onError.bind(this.ttsService);

    this.ttsService.onEnd = (highlightId) => {
      originalOnEnd(highlightId);
      this.resetAllTTSButtons();
    };

    this.ttsService.onPause = (highlightId) => {
      originalOnPause(highlightId);
      // Keep the stop button since user can still stop completely
      if (button) {
        button.innerHTML = '⏹️ Stop';
        button.title = 'Stop speech';
      }
    };

    this.ttsService.onResume = (highlightId) => {
      originalOnResume(highlightId);
      if (button) {
        button.innerHTML = '⏹️ Stop';
        button.title = 'Stop speech';
      }
    };

    this.ttsService.onError = (error, highlightId) => {
      originalOnError(error, highlightId);
      this.resetAllTTSButtons();
      this.showErrorMessage('Speech playback failed');
    };
  }

  resetAllTTSButtons() {
    document.querySelectorAll('.tts-highlight').forEach(btn => {
      btn.innerHTML = '🔊 Listen';
      btn.title = 'Listen to highlight';
    });
  }

  showSuccessMessage(message) {
    this.showMessage(message, 'success');
  }

  showErrorMessage(message) {
    this.showMessage(message, 'error');
  }

  showMessage(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideInNotification 0.3s ease-out;
    `;

    // Set colors based on type
    switch (type) {
      case 'success':
        notification.style.background = '#4caf50';
        notification.style.color = 'white';
        break;
      case 'error':
        notification.style.background = '#f44336';
        notification.style.color = 'white';
        break;
      default:
        notification.style.background = '#333';
        notification.style.color = 'white';
    }

    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOutNotification 0.3s ease-in';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 3000);
  }

  async deletePage(url) {
    const page = this.pages.find(p => p.url === url);
    if (!page) {
      this.showErrorMessage('Page not found');
      return;
    }

    const highlightCount = page.highlights.length;
    const message = `Are you sure you want to delete ALL ${highlightCount} highlight${highlightCount === 1 ? '' : 's'} from this page?\n\n"${page.title}"\n\nThis action cannot be undone.`;

    try {
      await this.showDeleteConfirmation(message);
    } catch {
      // User cancelled
      return;
    }

    try {
      const domain = this.getDomain(url);

      // Update Chrome storage to remove only highlights from this specific URL
      const storageKey = `universal_highlighter_${domain}`;
      const result = await chrome.storage.local.get([storageKey]);
      const domainData = result[storageKey];

      if (domainData && domainData.highlights) {
        // Filter out highlights from this specific URL
        domainData.highlights = domainData.highlights.filter(h => h.url !== url);
        domainData.lastModified = Date.now();

        // Save updated domain data back to storage (or remove if empty)
        if (domainData.highlights.length === 0) {
          await chrome.storage.local.remove([storageKey]);
          console.log(`🗑️ Deleted empty domain data from Chrome storage: ${storageKey}`);
        } else {
          await chrome.storage.local.set({ [storageKey]: domainData });
          console.log(`🗑️ Updated domain data in Chrome storage: ${storageKey}, removed highlights from ${url}`);
        }
      } else {
        console.log(`ℹ️ No domain data found in Chrome storage for: ${storageKey}`);
      }

      // Also try to delete from localStorage (cleanup old format)
      for (const highlight of page.highlights) {
        await this.deleteFromLocalStorage(highlight.id, highlight.url);
      }

      // Try to delete via content script if page is open
      const hasExtensionContext = await this.checkExtensionContext();
      if (hasExtensionContext) {
        try {
          const tabs = await chrome.tabs.query({ url: url });
          if (tabs.length > 0) {
            const tab = tabs[0];
            if (tab.id && tab.id > 0) {
              await chrome.tabs.sendMessage(tab.id, {
                action: 'deleteAllHighlights'
              });
            }
          }
        } catch (error) {
          console.log('Could not communicate with content script:', error.message);
        }
      }

      // Remove from local data
      this.highlights = this.highlights.filter(h => h.url !== url);
      this.pages = this.pages.filter(p => p.url !== url);

      // Clear selection if this page was selected
      if (this.selectedPage && this.selectedPage.url === url) {
        this.selectedPage = null;

        // Hide detail panel
        const detailsElement = document.getElementById('highlight-details');
        if (detailsElement) {
          detailsElement.style.display = 'none';
        }

        // Clear the main content area and show empty state
        const container = document.getElementById('highlightsContainer');
        const title = document.getElementById('contentTitle');

        if (title) {
          title.textContent = 'Select a page to view highlights';
        }

        if (container) {
          container.innerHTML = `
            <div class="empty-state">
              <h3>📝 Ready to explore your highlights</h3>
              <p>Select a page from the sidebar to view your highlighted content</p>
            </div>
          `;
        }
      }

      // Sync deletion to Google Drive if available
      if (hasExtensionContext) {
        try {
          console.log('🔄 Syncing page deletion to Google Drive...');
          const syncResponse = await chrome.runtime.sendMessage({
            action: 'queueSync',
            domain: domain,
            data: { highlights: [] } // Empty data to sync the deletion
          });
          if (syncResponse && syncResponse.success) {
            console.log('✅ Page deletion synced to Google Drive');
          } else {
            console.warn('⚠️ Failed to sync page deletion to Google Drive:', syncResponse?.error);
          }
        } catch (error) {
          console.warn('⚠️ Could not sync to Google Drive:', error.message);
        }
      }

      // Refresh display
      this.applyFilters();
      this.updateStats();

      // Show success message
      this.showSuccessMessage(`Successfully deleted ${highlightCount} highlights from page`);

      console.log(`✅ Successfully deleted page: ${page.title}`);
    } catch (error) {
      console.error('Error deleting page:', error);
      this.showErrorMessage('Error deleting page. Please try again.');
    }
  }

  async deleteHighlight(highlightId) {
    const highlight = this.highlights.find(h => h.id === highlightId);
    if (!highlight) {
      this.showErrorMessage('Highlight not found');
      return;
    }

    const previewText = highlight.text.length > 100 ? highlight.text.substring(0, 100) + '...' : highlight.text;
    const message = `Are you sure you want to delete this highlight?\n\n"${previewText}"`;

    try {
      await this.showDeleteConfirmation(message);
    } catch {
      // User cancelled
      return;
    }

    try {
      const domain = this.getDomain(highlight.url);

      // Check if extension context is available
      const hasExtensionContext = await this.checkExtensionContext();

      if (hasExtensionContext) {
        // Delete from Chrome storage (primary storage)
        const storageKey = `universal_highlighter_${domain}`;
        const result = await chrome.storage.local.get([storageKey]);
        const domainData = result[storageKey];

        if (domainData && domainData.highlights) {
          // Filter out this specific highlight
          domainData.highlights = domainData.highlights.filter(h => h.id !== highlightId);
          domainData.lastModified = Date.now();

          // Save updated domain data back to storage (or remove if empty)
          if (domainData.highlights.length === 0) {
            await chrome.storage.local.remove([storageKey]);
            console.log(`🗑️ Deleted empty domain data from Chrome storage: ${storageKey}`);
          } else {
            await chrome.storage.local.set({ [storageKey]: domainData });
            console.log(`🗑️ Updated domain data in Chrome storage: ${storageKey}`);
          }
        }

        // Try to delete via content script (if page is open) - this invalidates the cache
        try {
          const tabs = await chrome.tabs.query({ url: highlight.url });
          console.log(`📍 Found ${tabs.length} tab(s) with URL: ${highlight.url}`);

          if (tabs.length > 0) {
            for (const tab of tabs) {
              // Skip invalid tabs
              if (tab.id && tab.id > 0 && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                try {
                  console.log(`📤 Sending removeHighlight message to tab ${tab.id}`);
                  const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'removeHighlight',
                    highlightId: highlightId
                  });

                  if (response && response.success) {
                    console.log('✅ Highlight removed via content script on tab', tab.id);
                  } else {
                    console.warn('⚠️ Remove highlight returned unsuccessful response:', response);
                  }
                } catch (tabError) {
                  console.warn('⚠️ Could not communicate with tab', tab.id, ':', tabError.message);

                  // If content script not responding, try to reload the tab
                  if (tabError.message && tabError.message.includes('Receiving end does not exist')) {
                    console.log('📄 Content script not loaded, reloading tab...');
                    try {
                      await chrome.tabs.reload(tab.id);
                    } catch (reloadError) {
                      console.warn('Could not reload tab:', reloadError);
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          console.warn('Could not query tabs:', error);
        }

        // Sync deletion to Google Drive
        try {
          console.log('🔄 Syncing highlight deletion to Google Drive...');
          const syncResponse = await chrome.runtime.sendMessage({
            action: 'queueSync',
            domain: domain,
            data: domainData || { highlights: [] }
          });
          if (syncResponse && syncResponse.success) {
            console.log('✅ Highlight deletion synced to Google Drive');
          }
        } catch (error) {
          console.warn('⚠️ Could not sync to Google Drive:', error.message);
        }
      }

      // Also delete from localStorage (cleanup old format)
      await this.deleteFromLocalStorage(highlightId, highlight.url);

      // Remove from local arrays
      this.highlights = this.highlights.filter(h => h.id !== highlightId);

      // Update pages
      this.pages.forEach(page => {
        page.highlights = page.highlights.filter(h => h.id !== highlightId);
      });

      // Remove empty pages
      this.pages = this.pages.filter(page => page.highlights.length > 0);

      // Update display
      this.applyFilters();
      this.updateStats();

      if (this.selectedPage) {
        this.showPageHighlights(this.selectedPage);
      }

      // Show success message
      this.showSuccessMessage('Highlight deleted successfully');

    } catch (error) {
      console.error('Error deleting highlight:', error);
      this.showErrorMessage('Failed to delete highlight');
    }
  }

  showSuccessMessage(message) {
    // Create and show a temporary success message
    const messageEl = document.createElement('div');
    messageEl.className = 'success-message';
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4caf50;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(messageEl);

    // Remove after 3 seconds
    setTimeout(() => {
      messageEl.remove();
    }, 3000);
  }

  exportHighlights(format) {
    let content, filename, mimeType;

    switch (format) {
      case 'json':
        content = JSON.stringify(this.filteredHighlights, null, 2);
        filename = 'highlights.json';
        mimeType = 'application/json';
        break;
      case 'html':
        content = this.generateHTML();
        filename = 'highlights.html';
        mimeType = 'text/html';
        break;
      case 'markdown':
        content = this.generateMarkdown();
        filename = 'highlights.md';
        mimeType = 'text/markdown';
        break;
      case 'csv':
        content = this.generateCSV();
        filename = 'highlights.csv';
        mimeType = 'text/csv';
        break;
      case 'pdf':
        this.generatePDF();
        return; // PDF generation handles its own download
      default:
        console.error('Unknown export format:', format);
        return;
    }

    this.downloadFile(filename, content, mimeType);
    this.showSuccessMessage(`Highlights exported as ${format.toUpperCase()}`);
  }

  generatePDF() {
    // For now, we'll generate HTML and let the user print to PDF
    // In the future, this could use a PDF library like jsPDF
    const htmlContent = this.generateHTML();
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();

    // Trigger print dialog
    setTimeout(() => {
      printWindow.print();
      this.showSuccessMessage('PDF export initiated - use your browser\'s print dialog to save as PDF');
    }, 500);
  }

  generateHTML() {
    const pageGroups = this.groupHighlightsByPage(this.filteredHighlights);

    return `
<!DOCTYPE html>
<html>
<head>
  <title>My Highlights</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 2rem; }
    .page { margin-bottom: 3rem; }
    .page-title { font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem; }
    .highlight { margin-bottom: 1rem; padding: 1rem; border-left: 4px solid #ffc107; background: #fff3cd; }
    .highlight-note { font-style: italic; margin-top: 0.5rem; color: #666; }
    .highlight-meta { font-size: 0.9rem; color: #888; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <h1>My Highlights</h1>
  ${Object.entries(pageGroups).map(([url, highlights]) => `
    <div class="page">
      <div class="page-title">${highlights[0].title || this.getDomain(url)}</div>
      <div class="page-url">${url}</div>
      ${highlights.map(h => `
        <div class="highlight">
          <div class="highlight-text">${this.escapeHtml(h.text)}</div>
          ${h.note ? `<div class="highlight-note">${this.escapeHtml(h.note)}</div>` : ''}
          <div class="highlight-meta">${this.formatDate(h.timestamp)}</div>
        </div>
      `).join('')}
    </div>
  `).join('')}
</body>
</html>
    `;
  }

  generateCSV() {
    const headers = ['text', 'note', 'color', 'type', 'tags', 'url', 'title', 'domain', 'date'];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = this.filteredHighlights.map(h => [
      escape(h.text),
      escape(h.note || ''),
      escape(h.color || ''),
      escape(h.type || ''),
      escape((h.tags || []).join('; ')),
      escape(h.url || ''),
      escape(h.title || ''),
      escape(h.domain || ''),
      escape(this.formatDate(h.timestamp))
    ].join(','));
    return [headers.join(','), ...rows].join('\r\n');
  }

  generateMarkdown() {
    const pageGroups = this.groupHighlightsByPage(this.filteredHighlights);

    return `# My Highlights\n\n${Object.entries(pageGroups).map(([url, highlights]) => `
## ${highlights[0].title || this.getDomain(url)}

**URL:** ${url}

${highlights.map(h => `
> ${h.text}

${h.note ? `*Note: ${h.note}*\n` : ''}
*Highlighted on ${this.formatDate(h.timestamp)}*

---
`).join('')}
    `).join('')}`;
  }

  groupHighlightsByPage(highlights) {
    return highlights.reduce((groups, highlight) => {
      if (!groups[highlight.url]) {
        groups[highlight.url] = [];
      }
      groups[highlight.url].push(highlight);
      return groups;
    }, {});
  }

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async generateAISummary() {
    if (!this.selectedPage) {
      this.showErrorMessage('Please select a page to generate a summary for.');
      return;
    }

    const pageHighlights = this.selectedPage.highlights.filter(h =>
      this.filteredHighlights.includes(h)
    );

    if (pageHighlights.length === 0) {
      this.showErrorMessage('No highlights found for this page. Please add some highlights first.');
      return;
    }

    try {
      // Show the summary panel and loading state
      this.showSummaryPanel();
      this.showSummaryLoading(true);

      console.log(`🤖 Generating AI summary for ${pageHighlights.length} highlights...`);

      // Generate the summary
      const result = await this.aiService.generateSummary(
        pageHighlights,
        this.selectedPage.title
      );

      // Display the summary
      this.displaySummary(result);
      this.showSummaryLoading(false);

      // Track this action
      this.showSuccessMessage(`Summary generated using ${result.provider}`);

    } catch (error) {
      console.error('Error generating AI summary:', error);
      this.showSummaryError(error.message);
      this.showSummaryLoading(false);
    }
  }

  showSummaryPanel() {
    document.getElementById('summaryPanel').style.display = 'block';
    document.getElementById('summaryPanel').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  closeSummaryPanel() {
    // Stop TTS if playing summary
    const status = this.ttsService.getStatus();
    if (status.isPlaying && status.currentHighlightId === 'summary') {
      this.ttsService.stop();
    }

    // Reset the summary TTS button
    const playBtn = document.getElementById('playSummaryBtn');
    if (playBtn) {
      playBtn.innerHTML = '🔊 Listen';
      playBtn.title = 'Listen to summary';
    }

    document.getElementById('summaryPanel').style.display = 'none';
  }

  showSummaryLoading(show) {
    document.getElementById('summaryLoading').style.display = show ? 'block' : 'none';
  }

  displaySummary(result) {
    const summaryText = document.getElementById('summaryText');

    let content = result.summary;

    // Add metadata
    content += `\n\n---\n`;
    content += `Generated by: ${result.provider}\n`;
    content += `Word count: ${result.wordCount} words\n`;
    content += `Source: ${this.selectedPage.highlights.length} highlights from "${this.selectedPage.title}"\n`;

    if (result.isFallback) {
      content += `\nNote: This is an extractive summary created as a fallback when AI services were unavailable.`;
    }

    summaryText.textContent = content;

    // Store for export/copy
    this.currentSummary = result;
  }

  showSummaryError(message) {
    const summaryText = document.getElementById('summaryText');
    summaryText.innerHTML = `
      <div style="color: #ff6b6b; text-align: center; padding: 1rem;">
        <h4>❌ Summary Generation Failed</h4>
        <p>${message}</p>
        <p style="margin-top: 1rem; font-size: 0.9rem;">
          Try again later or check your internet connection.
        </p>
      </div>
    `;
  }

  async copySummaryToClipboard() {
    if (!this.currentSummary) {
      this.showErrorMessage('No summary to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(this.currentSummary.summary);
      this.showSuccessMessage('Summary copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);

      // Fallback: Select text for manual copy
      const summaryText = document.getElementById('summaryText');
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(summaryText);
      selection.removeAllRanges();
      selection.addRange(range);

      this.showSuccessMessage('Summary selected — press Ctrl+C (or Cmd+C) to copy.');
    }
  }

  toggleSummaryTTS() {
    if (!this.currentSummary) {
      this.showErrorMessage('No summary available to play');
      return;
    }

    const playBtn = document.getElementById('playSummaryBtn');
    const status = this.ttsService.getStatus();

    // If currently playing the summary, stop it
    if (status.currentHighlightId === 'summary' && (status.isPlaying || status.isPaused)) {
      console.log('🛑 Stopping summary TTS');
      this.ttsService.stop();
      playBtn.innerHTML = '🔊 Listen';
      playBtn.title = 'Listen to summary';
      return;
    }

    // If playing something else, stop it first
    if (status.isPlaying || status.isPaused) {
      this.ttsService.stop();
      this.resetAllTTSButtons();
    }

    // Start playing the summary
    try {
      console.log('🔊 Playing AI summary narration...');

      // Create a comprehensive summary text
      let fullText = `AI Summary for ${this.selectedPage.title}. `;
      fullText += this.currentSummary.summary;

      // Add provider info
      if (!this.currentSummary.isFallback) {
        fullText += ` This summary was generated by ${this.currentSummary.provider}.`;
      }

      this.ttsService.speak(fullText, 'summary');

      // Update button state to show stop option
      playBtn.innerHTML = '⏹️ Stop';
      playBtn.title = 'Stop summary';

      // Set up event handlers for summary TTS
      this.setupSummaryTTSEventHandlers(playBtn);

      this.showSuccessMessage('Playing AI summary...');

    } catch (error) {
      console.error('Error playing summary TTS:', error);
      this.showErrorMessage('Failed to play summary audio. Please check your browser settings.');
    }
  }

  setupSummaryTTSEventHandlers(playBtn) {
    // Store original handlers to restore them
    const originalOnEnd = this.ttsService.onEnd.bind(this.ttsService);
    const originalOnPause = this.ttsService.onPause.bind(this.ttsService);
    const originalOnResume = this.ttsService.onResume.bind(this.ttsService);
    const originalOnError = this.ttsService.onError.bind(this.ttsService);

    this.ttsService.onEnd = (highlightId) => {
      originalOnEnd(highlightId);
      if (highlightId === 'summary') {
        playBtn.innerHTML = '🔊 Listen';
        playBtn.title = 'Listen to summary';
        this.showSuccessMessage('Summary playback completed');
      }
    };

    this.ttsService.onPause = (highlightId) => {
      originalOnPause(highlightId);
      if (highlightId === 'summary') {
        playBtn.innerHTML = '⏹️ Stop';
        playBtn.title = 'Stop summary';
      }
    };

    this.ttsService.onResume = (highlightId) => {
      originalOnResume(highlightId);
      if (highlightId === 'summary') {
        playBtn.innerHTML = '⏹️ Stop';
        playBtn.title = 'Stop summary';
      }
    };

    this.ttsService.onError = (error, highlightId) => {
      originalOnError(error, highlightId);
      if (highlightId === 'summary') {
        playBtn.innerHTML = '🔊 Listen';
        playBtn.title = 'Listen to summary';
        this.showErrorMessage('Summary playback failed');
      }
    };
  }

  exportSummary() {
    if (!this.currentSummary) {
      this.showErrorMessage('No summary to export');
      return;
    }

    const pageTitle = this.selectedPage.title.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `summary_${pageTitle}_${timestamp}.md`;

    const content = `# AI Summary: ${this.selectedPage.title}

**Generated on:** ${new Date().toLocaleDateString()}
**Source:** ${this.selectedPage.highlights.length} highlights
**AI Provider:** ${this.currentSummary.provider}

## Summary

${this.currentSummary.summary}

## Source Highlights

${this.selectedPage.highlights.map((h, i) => `
${i + 1}. "${h.text}"${h.note ? `\n   *Note: ${h.note}*` : ''}
`).join('\n')}

---
*Generated by Universal Web Highlighter*
`;

    this.downloadFile(filename, content, 'text/markdown');
    this.showSuccessMessage('Summary exported successfully');
  }

  updateSyncStatus(status, message) {
    const syncStatus = document.getElementById('syncStatus');
    syncStatus.className = `sync-status ${status}`;

    const icons = {
      synced: '✅',
      syncing: '🔄',
      error: '❌'
    };

    syncStatus.innerHTML = `
      <span>${icons[status]}</span>
      <span>${message}</span>
    `;
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  setupDeleteModal() {
    const modal = document.getElementById('deleteModal');
    const cancelBtn = document.getElementById('deleteModalCancel');
    const confirmBtn = document.getElementById('deleteModalConfirm');
    const checkbox = document.getElementById('dontShowAgainCheckbox');
    const backdrop = modal.querySelector('.delete-modal-backdrop');

    // Close on cancel or backdrop click
    const closeModal = () => {
      modal.style.display = 'none';
      if (this.deleteModalReject) {
        this.deleteModalReject();
      }
    };

    cancelBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);

    // Confirm deletion
    confirmBtn.addEventListener('click', () => {
      // Save "don't show again" preference
      if (checkbox.checked) {
        this.dontShowDeleteConfirmation = true;
        chrome.storage.local.set({ dontShowDeleteConfirmation: true });
      }

      modal.style.display = 'none';
      if (this.deleteModalResolve) {
        this.deleteModalResolve(true);
      }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display !== 'none') {
        closeModal();
      }
    });
  }

  async showDeleteConfirmation(message) {
    // If "don't show again" is checked, auto-confirm
    if (this.dontShowDeleteConfirmation) {
      return true;
    }

    const modal = document.getElementById('deleteModal');
    const messageEl = document.getElementById('deleteModalMessage');
    const checkbox = document.getElementById('dontShowAgainCheckbox');

    messageEl.textContent = message;
    checkbox.checked = false;
    modal.style.display = 'flex';

    return new Promise((resolve, reject) => {
      this.deleteModalResolve = resolve;
      this.deleteModalReject = () => reject(new Error('Cancelled'));
    });
  }

  formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  cleanHighlightText(text) {
    if (!text) return '';
    // Remove any icons that might have been accidentally included in highlights
    return text
      .replace(/🔊/g, '')  // Remove speaker icons
      .replace(/🗑️/g, '')  // Remove trash icons
      .replace(/✏️/g, '')  // Remove edit icons
      .replace(/🔗/g, '')  // Remove link icons
      .trim();
  }

  showExportModal() {
    const modal = document.getElementById('exportModal');
    modal.classList.add('show');

    // Initialize modal event listeners only once
    if (!this.exportModalInitialized) {
      this.setupExportModalListeners();
      this.exportModalInitialized = true;
    }
  }

  setupExportModalListeners() {
    const modal = document.getElementById('exportModal');

    // Use event delegation for format options to avoid multiple listeners
    modal.addEventListener('click', (e) => {
      const formatOption = e.target.closest('.format-option');
      if (formatOption && !this.exportInProgress) {
        e.preventDefault();
        e.stopPropagation();

        // Prevent multiple rapid clicks
        this.exportInProgress = true;

        // Remove previous selection
        modal.querySelectorAll('.format-option').forEach(opt => opt.classList.remove('selected'));
        // Add selection to clicked option
        formatOption.classList.add('selected');

        // Get selected format and export
        const format = formatOption.dataset.format;
        setTimeout(() => {
          this.exportHighlights(format);
          this.hideExportModal();
          this.exportInProgress = false; // Reset flag
        }, 300);
        return;
      }

      // Close modal if clicking on close button
      if (e.target.closest('#closeExportModal')) {
        this.hideExportModal();
        return;
      }

      // Close on overlay click
      if (e.target === modal) {
        this.hideExportModal();
      }
    });
  }

  hideExportModal() {
    const modal = document.getElementById('exportModal');
    modal.classList.remove('show');
  }
}

// Initialize the highlight manager
const highlightManager = new HighlightManager();