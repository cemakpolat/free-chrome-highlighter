// PDF Reader - standalone page for viewing and highlighting PDFs

console.log('📄 PDF Reader initializing...');

// Set PDF.js worker - use local copy
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');

class PDFReader {
  constructor() {
    this.pdfDoc = null;
    this.pdfUrl = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1.5;
    this.highlights = {};
    this.rendering = false;
    this.currentColor = 'yellow'; // Default highlight color
    this.searchResults = [];
    this.currentSearchIndex = 0;
    this.currentAnnotationId = null;
    this.init();
  }

  async init() {
    try {
      // Load PDF URL from chrome.storage
      const result = await chrome.storage.local.get(['pdfReaderData', 'pdfReaderTheme']);

      if (!result.pdfReaderData || !result.pdfReaderData.url) {
        this.showError('No PDF URL found. Please try again.');
        return;
      }

      this.pdfUrl = result.pdfReaderData.url;
      console.log(`📄 Loading PDF: ${this.pdfUrl}`);

      // Set theme
      const theme = result.pdfReaderTheme || 'dark';
      if (theme === 'light') {
        document.body.classList.add('light-theme');
        document.getElementById('pdf-theme-toggle').textContent = '☀️';
      }

      // Setup event listeners first
      this.setupEventListeners();

      // Load saved highlights BEFORE rendering PDF
      // This way highlights are available when pages render
      await this.loadHighlights();

      // Load and render PDF
      await this.loadPDF();

      console.log('✅ PDF Reader fully initialized');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.showError(`Initialization failed: ${error.message}`);
    }
  }

  async loadPDF() {
    try {
      console.log('📄 Loading PDF from:', this.pdfUrl);

      let pdfData;

      // Fetch PDF data to avoid CORS issues
      try {
        const response = await fetch(this.pdfUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        pdfData = new Uint8Array(arrayBuffer);
        console.log('✅ PDF data fetched successfully');
      } catch (fetchError) {
        console.error('Fetch failed, trying direct URL:', fetchError);
        // Fallback to direct URL
        pdfData = this.pdfUrl;
      }

      const loadingTask = pdfjsLib.getDocument(pdfData);
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;

      console.log(`✅ PDF loaded: ${this.totalPages} pages`);

      // Update title with filename
      const filename = this.pdfUrl.split('/').pop().split('?')[0] || 'PDF Document';
      document.getElementById('pdf-title').textContent = decodeURIComponent(filename);

      // Render all pages
      await this.renderAllPages();

    } catch (error) {
      console.error('Failed to load PDF:', error);
      this.showError(`Failed to load PDF: ${error.message}. Please try opening the PDF directly from the extension popup.`);
    }
  }

  async renderAllPages() {
    const container = document.getElementById('pdf-canvas-container');
    container.innerHTML = '';

    // Set scale factor on container as well
    container.style.setProperty('--scale-factor', this.scale);

    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      await this.renderPage(pageNum, container);
    }

    this.updatePageInfo();
    console.log(`✅ Rendered all ${this.totalPages} pages`);
  }

  async renderPage(pageNum, container) {
    console.log(`📄 Rendering page ${pageNum}`);
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });

    // Create page container
    const pageDiv = document.createElement('div');
    pageDiv.className = 'pdf-page';
    pageDiv.setAttribute('data-page-number', pageNum);

    // Set CSS scale factor variable for text layer
    pageDiv.style.setProperty('--scale-factor', this.scale);

    // Create canvas for PDF rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Create text layer for text selection
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'pdf-text-layer';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';

    // Create highlight layer
    const highlightLayerDiv = document.createElement('div');
    highlightLayerDiv.className = 'pdf-highlight-layer';
    highlightLayerDiv.style.width = viewport.width + 'px';
    highlightLayerDiv.style.height = viewport.height + 'px';

    pageDiv.appendChild(canvas);
    pageDiv.appendChild(textLayerDiv);
    pageDiv.appendChild(highlightLayerDiv);
    container.appendChild(pageDiv);

    // Render PDF page
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    await page.render(renderContext).promise;
    console.log(`✅ Page ${pageNum} canvas rendered`);

    // Render text layer
    const textContent = await page.getTextContent();
    pdfjsLib.renderTextLayer({
      textContent: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: []
    });
    console.log(`✅ Page ${pageNum} text layer rendered`);

    // Setup text selection for this page
    this.setupTextSelection(textLayerDiv, pageNum);

    // Render existing highlights for this page
    this.renderHighlightsForPage(pageNum, highlightLayerDiv, viewport);
    console.log(`✅ Page ${pageNum} fully rendered`);
  }

  setupTextSelection(textLayerDiv, pageNum) {
    console.log(`📝 Setting up text selection for page ${pageNum}`);
    textLayerDiv.addEventListener('mouseup', (e) => {
      console.log(`🖱️ Mouse up on page ${pageNum}`);
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      console.log(`📄 Selected text: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`);

      if (selectedText.length > 0) {
        const range = selection.getRangeAt(0);
        console.log(`✅ Creating highlight for "${selectedText.substring(0, 30)}..."`);
        this.createHighlight(range, selectedText, pageNum);
      } else {
        console.log('⚠️ No text selected');
      }
    });
  }

  async createHighlight(range, text, pageNum) {
    try {
      console.log(`🎨 createHighlight called for page ${pageNum}, text length: ${text.length}`);

      const rects = range.getClientRects();
      if (rects.length === 0) {
        console.warn('⚠️ No rects found for selection');
        return;
      }
      console.log(`📏 Found ${rects.length} rects for selection`);

      const pageDiv = document.querySelector(`[data-page-number="${pageNum}"]`);
      if (!pageDiv) {
        console.error(`❌ Could not find page div for page ${pageNum}`);
        return;
      }

      const highlightLayer = pageDiv.querySelector('.pdf-highlight-layer');
      if (!highlightLayer) {
        console.error(`❌ Could not find highlight layer for page ${pageNum}`);
        return;
      }

      const pageBounds = pageDiv.getBoundingClientRect();

    // Store highlight data
    if (!this.highlights[pageNum]) {
      this.highlights[pageNum] = [];
    }

    const timestamp = Date.now();
    const highlightId = `highlight_${timestamp}_${Math.random()}`;
    const highlightData = {
      id: highlightId,
      text: text,
      rects: [],
      pageNum: pageNum,
      color: this.currentColor, // Save current color
      note: '', // Empty note initially
      timestamp: timestamp, // Add timestamp for sorting
      url: this.pdfUrl // Add URL for reference
    };

    // Create highlight elements for each rect
    Array.from(rects).forEach((rect, index) => {
      const highlightDiv = document.createElement('div');
      highlightDiv.className = `pdf-highlight ${this.currentColor}`; // Add color class
      highlightDiv.setAttribute('data-highlight-id', highlightId);

      // Calculate position relative to page
      const left = rect.left - pageBounds.left;
      const top = rect.top - pageBounds.top;

      highlightDiv.style.left = left + 'px';
      highlightDiv.style.top = top + 'px';
      highlightDiv.style.width = rect.width + 'px';
      highlightDiv.style.height = rect.height + 'px';

      // Add icons (only on first rect to avoid clutter)
      if (index === 0) {
        // Note icon
        const noteIcon = document.createElement('div');
        noteIcon.className = 'pdf-highlight-note';
        noteIcon.innerHTML = '📝';
        noteIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.openAnnotationModal(highlightId, pageNum);
        });
        highlightDiv.appendChild(noteIcon);

        // Trash icon
        const trashIcon = document.createElement('div');
        trashIcon.className = 'pdf-highlight-trash';
        trashIcon.innerHTML = '🗑️';
        trashIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.removeHighlight(highlightId, pageNum);
        });
        highlightDiv.appendChild(trashIcon);
      }

      highlightLayer.appendChild(highlightDiv);

      // Store rect data
      highlightData.rects.push({
        left: left / pageBounds.width,
        top: top / pageBounds.height,
        width: rect.width / pageBounds.width,
        height: rect.height / pageBounds.height
      });
    });

    this.highlights[pageNum].push(highlightData);
    console.log(`✨ Created PDF highlight on page ${pageNum}:`, {
      id: highlightId,
      text: text.substring(0, 50) + '...',
      color: this.currentColor,
      timestamp: timestamp
    });

      await this.saveHighlights();

      window.getSelection().removeAllRanges();
      this.showTempMessage('Highlight saved!', 'info');
    } catch (error) {
      console.error('❌ Error creating highlight:', error);
      this.showTempMessage('Failed to create highlight', 'error');
    }
  }

  async removeHighlight(highlightId, pageNum) {
    // Remove from DOM
    document.querySelectorAll(`[data-highlight-id="${highlightId}"]`).forEach(el => el.remove());

    // Remove from data
    if (this.highlights[pageNum]) {
      this.highlights[pageNum] = this.highlights[pageNum].filter(h => h.id !== highlightId);

      // Clean up empty page entries
      if (this.highlights[pageNum].length === 0) {
        delete this.highlights[pageNum];
      }
    }

    await this.saveHighlights();
    console.log('🗑️ Removed PDF highlight');
    this.showTempMessage('Highlight removed', 'info');
  }

  renderHighlightsForPage(pageNum, highlightLayer, viewport) {
    if (!this.highlights[pageNum]) return;

    const pageDiv = document.querySelector(`[data-page-number="${pageNum}"]`);
    const pageBounds = pageDiv.getBoundingClientRect();

    this.highlights[pageNum].forEach(highlight => {
      highlight.rects.forEach((rect, index) => {
        const highlightDiv = document.createElement('div');
        const highlightColor = highlight.color || 'yellow'; // Default to yellow if no color saved
        highlightDiv.className = `pdf-highlight ${highlightColor}`;
        highlightDiv.setAttribute('data-highlight-id', highlight.id);

        highlightDiv.style.left = (rect.left * pageBounds.width) + 'px';
        highlightDiv.style.top = (rect.top * pageBounds.height) + 'px';
        highlightDiv.style.width = (rect.width * pageBounds.width) + 'px';
        highlightDiv.style.height = (rect.height * pageBounds.height) + 'px';

        // Add icons (only on first rect)
        if (index === 0) {
          // Note icon
          const noteIcon = document.createElement('div');
          noteIcon.className = 'pdf-highlight-note';
          noteIcon.innerHTML = '📝';
          noteIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.openAnnotationModal(highlight.id, pageNum);
          });
          highlightDiv.appendChild(noteIcon);

          // Trash icon
          const trashIcon = document.createElement('div');
          trashIcon.className = 'pdf-highlight-trash';
          trashIcon.innerHTML = '🗑️';
          trashIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.removeHighlight(highlight.id, pageNum);
          });
          highlightDiv.appendChild(trashIcon);
        }

        highlightLayer.appendChild(highlightDiv);
      });
    });
  }

  async saveHighlights() {
    try {
      const key = `pdfHighlights_${encodeURIComponent(this.pdfUrl)}`;

      // Log what we're about to save
      const totalHighlights = Object.values(this.highlights).reduce((sum, pageHighlights) => sum + pageHighlights.length, 0);
      console.log(`💾 Saving ${totalHighlights} highlights for PDF: ${this.pdfUrl}`);
      console.log(`📦 Storage key: ${key}`);
      console.log(`📊 Highlight data:`, JSON.parse(JSON.stringify(this.highlights)));

      await chrome.storage.local.set({
        [key]: this.highlights
      });

      // Verify save
      const verification = await chrome.storage.local.get(key);
      if (verification[key]) {
        const verifiedCount = Object.values(verification[key]).reduce((sum, pageHighlights) => sum + pageHighlights.length, 0);
        console.log(`✅ Verification: ${verifiedCount} highlights confirmed in storage`);

        // Deep verification - check if timestamps are there
        Object.entries(verification[key]).forEach(([page, highlights]) => {
          highlights.forEach(h => {
            if (!h.timestamp) {
              console.warn(`⚠️ Highlight ${h.id} on page ${page} is missing timestamp!`);
            }
          });
        });
      } else {
        console.warn('⚠️ Verification failed: No data found in storage');
      }

      // Update highlight counter
      this.updateHighlightCount();
    } catch (error) {
      console.error('❌ Failed to save highlights:', error);
      this.showTempMessage('Failed to save highlights', 'error');
    }
  }

  updateHighlightCount() {
    const totalHighlights = Object.values(this.highlights).reduce((sum, pageHighlights) => sum + pageHighlights.length, 0);
    const counterEl = document.getElementById('pdf-highlight-count');
    if (counterEl) {
      counterEl.textContent = `${totalHighlights} highlight${totalHighlights !== 1 ? 's' : ''}`;
    }
  }

  async loadHighlights() {
    try {
      const key = `pdfHighlights_${encodeURIComponent(this.pdfUrl)}`;
      console.log('📥 Loading highlights with key:', key);

      const result = await chrome.storage.local.get([key]);

      if (result[key]) {
        this.highlights = result[key];
        const totalHighlights = Object.values(this.highlights).reduce((sum, pageHighlights) => sum + pageHighlights.length, 0);
        console.log(`✅ Loaded ${totalHighlights} highlights across ${Object.keys(this.highlights).length} pages`);
      } else {
        console.log('📝 No existing highlights found for this PDF');
        this.highlights = {};
      }

      // Update highlight counter
      this.updateHighlightCount();
    } catch (error) {
      console.error('❌ Failed to load highlights:', error);
      this.highlights = {};
    }
  }

  setupEventListeners() {
    // Exit button
    document.getElementById('pdf-exit').addEventListener('click', () => {
      window.close();
    });

    // Theme toggle
    document.getElementById('pdf-theme-toggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    // Download button
    document.getElementById('pdf-download').addEventListener('click', () => {
      this.downloadPDF();
    });

    // Export highlights button
    document.getElementById('pdf-export-highlights').addEventListener('click', () => {
      this.exportHighlights();
    });

    // Search toggle
    document.getElementById('pdf-search-toggle').addEventListener('click', () => {
      this.toggleSearch();
    });

    // Search input
    document.getElementById('pdf-search-input').addEventListener('input', (e) => {
      this.performSearch(e.target.value);
    });

    // Search navigation
    document.getElementById('pdf-search-prev').addEventListener('click', () => {
      this.navigateSearch(-1);
    });

    document.getElementById('pdf-search-next').addEventListener('click', () => {
      this.navigateSearch(1);
    });

    document.getElementById('pdf-search-close').addEventListener('click', () => {
      this.toggleSearch();
    });

    // Color picker
    document.querySelectorAll('.color-option').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setHighlightColor(btn.dataset.color);
      });
    });

    // Set default color as active
    document.querySelector('.color-option[data-color="yellow"]').classList.add('active');

    // Annotation modal
    document.getElementById('annotation-cancel').addEventListener('click', () => {
      this.closeAnnotationModal();
    });

    document.getElementById('annotation-save').addEventListener('click', () => {
      this.saveAnnotation();
    });

    // Close modal on background click
    document.getElementById('annotation-modal').addEventListener('click', (e) => {
      if (e.target.id === 'annotation-modal') {
        this.closeAnnotationModal();
      }
    });

    // Page navigation
    document.getElementById('pdf-prev-page').addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.scrollToPage(this.currentPage);
      }
    });

    document.getElementById('pdf-next-page').addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.scrollToPage(this.currentPage);
      }
    });

    // Zoom controls
    document.getElementById('pdf-zoom-in').addEventListener('click', () => {
      this.scale += 0.25;
      this.renderAllPages();
      this.updateZoomLevel();
    });

    document.getElementById('pdf-zoom-out').addEventListener('click', () => {
      if (this.scale > 0.5) {
        this.scale -= 0.25;
        this.renderAllPages();
        this.updateZoomLevel();
      }
    });
  }

  scrollToPage(pageNum) {
    const pageDiv = document.querySelector(`[data-page-number="${pageNum}"]`);
    if (pageDiv) {
      pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.currentPage = pageNum;
      this.updatePageInfo();
    }
  }

  updatePageInfo() {
    document.getElementById('pdf-page-info').textContent = `Page ${this.currentPage} of ${this.totalPages}`;
  }

  updateZoomLevel() {
    document.getElementById('pdf-zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
  }

  toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('pdf-theme-toggle');
    const isLight = body.classList.contains('light-theme');

    if (isLight) {
      body.classList.remove('light-theme');
      themeBtn.textContent = '🌙';
      chrome.storage.local.set({ pdfReaderTheme: 'dark' });
    } else {
      body.classList.add('light-theme');
      themeBtn.textContent = '☀️';
      chrome.storage.local.set({ pdfReaderTheme: 'light' });
    }
  }

  downloadPDF() {
    const a = document.createElement('a');
    a.href = this.pdfUrl;
    a.download = this.pdfUrl.split('/').pop() || 'document.pdf';
    a.click();
  }

  showError(message) {
    const container = document.getElementById('pdf-canvas-container');
    container.innerHTML = `
      <div class="error-message">
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `;
  }

  showTempMessage(message, type = 'info') {
    // Create or update temp message element
    let msgEl = document.getElementById('pdf-temp-message');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = 'pdf-temp-message';
      msgEl.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(msgEl);
    }

    msgEl.textContent = message;
    msgEl.style.background = type === 'error' ? '#ef4444' : '#4f46e5';
    msgEl.style.color = 'white';

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (msgEl.parentNode) {
        msgEl.remove();
      }
    }, 3000);
  }

  // New Features

  setHighlightColor(color) {
    this.currentColor = color;
    // Update active state on color buttons
    document.querySelectorAll('.color-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === color);
    });
    console.log(`✨ Highlight color set to: ${color}`);
  }

  toggleSearch() {
    const searchPanel = document.getElementById('pdf-search-panel');
    if (searchPanel.style.display === 'none' || !searchPanel.style.display) {
      searchPanel.style.display = 'flex';
      document.getElementById('pdf-search-input').focus();
    } else {
      searchPanel.style.display = 'none';
      this.searchResults = [];
      this.currentSearchIndex = 0;
      document.getElementById('pdf-search-results').textContent = '0 / 0';
    }
  }

  async performSearch(query) {
    if (!query || query.length < 2) {
      this.searchResults = [];
      this.currentSearchIndex = 0;
      document.getElementById('pdf-search-results').textContent = '0 / 0';
      return;
    }

    this.searchResults = [];
    const lowerQuery = query.toLowerCase();

    // Search through all pages
    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      const page = await this.pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');

      if (pageText.toLowerCase().includes(lowerQuery)) {
        this.searchResults.push(pageNum);
      }
    }

    this.currentSearchIndex = 0;
    document.getElementById('pdf-search-results').textContent =
      `${this.searchResults.length > 0 ? 1 : 0} / ${this.searchResults.length}`;

    if (this.searchResults.length > 0) {
      this.scrollToPage(this.searchResults[0]);
    }
  }

  navigateSearch(direction) {
    if (this.searchResults.length === 0) return;

    this.currentSearchIndex += direction;
    if (this.currentSearchIndex < 0) {
      this.currentSearchIndex = this.searchResults.length - 1;
    } else if (this.currentSearchIndex >= this.searchResults.length) {
      this.currentSearchIndex = 0;
    }

    document.getElementById('pdf-search-results').textContent =
      `${this.currentSearchIndex + 1} / ${this.searchResults.length}`;

    this.scrollToPage(this.searchResults[this.currentSearchIndex]);
  }

  openAnnotationModal(highlightId, pageNum) {
    this.currentAnnotationId = highlightId;
    const modal = document.getElementById('annotation-modal');
    const textarea = document.getElementById('annotation-text');

    // Load existing note if any
    const highlight = this.highlights[pageNum]?.find(h => h.id === highlightId);
    if (highlight) {
      textarea.value = highlight.note || '';
    }

    modal.classList.add('show');
    textarea.focus();
  }

  closeAnnotationModal() {
    const modal = document.getElementById('annotation-modal');
    modal.classList.remove('show');
    document.getElementById('annotation-text').value = '';
    this.currentAnnotationId = null;
  }

  async saveAnnotation() {
    const note = document.getElementById('annotation-text').value.trim();

    // Find the highlight and save the note
    for (let pageNum in this.highlights) {
      const highlight = this.highlights[pageNum].find(h => h.id === this.currentAnnotationId);
      if (highlight) {
        highlight.note = note;
        await this.saveHighlights();
        console.log('📝 Annotation saved');
        this.showTempMessage(note ? 'Note saved!' : 'Note cleared', 'info');
        break;
      }
    }

    this.closeAnnotationModal();
  }

  exportHighlights() {
    let exportText = `PDF Highlights Export\n`;
    exportText += `File: ${this.pdfUrl.split('/').pop()}\n`;
    exportText += `Date: ${new Date().toLocaleDateString()}\n`;
    exportText += `Total Highlights: ${Object.values(this.highlights).flat().length}\n`;
    exportText += `\n${'='.repeat(60)}\n\n`;

    // Group by page
    const sortedPages = Object.keys(this.highlights).sort((a, b) => parseInt(a) - parseInt(b));

    sortedPages.forEach(pageNum => {
      const pageHighlights = this.highlights[pageNum];
      if (pageHighlights && pageHighlights.length > 0) {
        exportText += `PAGE ${pageNum}\n${'-'.repeat(60)}\n\n`;

        pageHighlights.forEach((highlight, index) => {
          exportText += `${index + 1}. "${highlight.text}"\n`;
          exportText += `   Color: ${highlight.color || 'yellow'}\n`;
          if (highlight.note) {
            exportText += `   Note: ${highlight.note}\n`;
          }
          exportText += `\n`;
        });

        exportText += `\n`;
      }
    });

    // Download as text file
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `highlights-${this.pdfUrl.split('/').pop().replace('.pdf', '')}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('📤 Highlights exported');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PDFReader());
} else {
  new PDFReader();
}
