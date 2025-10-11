// Reader View Service
// Provides a clean, distraction-free reading experience for web pages

class ReaderViewService {
  constructor() {
    this.isActive = false;
    this.originalContent = null;
    this.readerContainer = null;
    this.activationFailed = false; // Track if activation failed to prevent retries
    this.settings = {
      fontSize: 18,
      fontFamily: 'Georgia, serif',
      lineHeight: 1.6,
      maxWidth: 1000,
      theme: 'light' // light, dark, sepia
    };
  }

  async init() {
    // Load settings from storage
    const stored = await chrome.storage.local.get(['readerViewSettings']);
    if (stored.readerViewSettings) {
      this.settings = { ...this.settings, ...stored.readerViewSettings };
    }
  }

  async extractMainContent() {
    console.log('🔍 Starting content extraction...');

    // Use Mozilla's Readability algorithm (simplified version)
    const documentClone = document.cloneNode(true);

    // Remove unwanted elements
    const elementsToRemove = [
      'script', 'style', 'nav', 'header:not(.article-header)', 'footer',
      'aside', 'iframe:not([src*="youtube"]):not([src*="vimeo"])',
      'ads', '[role="banner"]',
      '[role="navigation"]', '[role="complementary"]',
      '.advertisement', '.ad', '.sidebar', '.social-share',
      '.comments', '.related-posts', '.newsletter', '.cookie-banner'
    ];

    elementsToRemove.forEach(selector => {
      try {
        documentClone.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) {
        console.warn('Could not remove selector:', selector);
      }
    });

    console.log('🧹 Removed unwanted elements');

    // Find main content - look for article, main, or largest text block
    let mainContent = null;
    const candidates = [
      // Microsoft Learn specific
      documentClone.querySelector('[data-bi-name="content"]'),
      documentClone.querySelector('.content-container'),
      documentClone.querySelector('#main-column'),
      // Standard selectors
      documentClone.querySelector('article'),
      documentClone.querySelector('main'),
      documentClone.querySelector('[role="main"]'),
      documentClone.querySelector('.post-content'),
      documentClone.querySelector('.article-content'),
      documentClone.querySelector('.entry-content'),
      documentClone.querySelector('.content'),
      documentClone.querySelector('#content'),
      documentClone.querySelector('.main-content')
    ];

    console.log('🔍 Checking candidates...');

    for (const candidate of candidates) {
      if (candidate) {
        const length = this.getTextLength(candidate);
        const identifier = candidate.className || candidate.id || candidate.tagName;
        console.log(`Candidate found with ${length} chars:`, identifier);

        // Skip elements that are clearly not content
        if (identifier.includes('chat') ||
            identifier.includes('sidebar') ||
            identifier.includes('nav') ||
            identifier.includes('header') ||
            identifier.includes('footer')) {
          console.log(`⏭️ Skipping ${identifier} (not content)`);
          continue;
        }

        if (length > 500) {
          mainContent = candidate;
          console.log(`✅ Selected candidate: ${identifier}`);
          break;
        }
      }
    }

    // Fallback: find the element with the most text
    if (!mainContent) {
      console.log('⚠️ No candidate found, searching for element with most text...');
      const allElements = documentClone.querySelectorAll('div, section, article, main');
      let maxLength = 0;
      let bestElement = null;

      allElements.forEach(el => {
        // Skip bad elements
        const className = el.className || '';
        const id = el.id || '';
        if (className.includes('chat') ||
            className.includes('sidebar') ||
            className.includes('nav') ||
            className.includes('header') ||
            className.includes('footer') ||
            id.includes('chat') ||
            id.includes('sidebar')) {
          return;
        }

        const length = this.getTextLength(el);
        if (length > maxLength && length > 500) { // At least 500 chars for fallback
          maxLength = length;
          bestElement = el;
        }
      });

      mainContent = bestElement;
      if (mainContent) {
        const identifier = mainContent.className || mainContent.id || mainContent.tagName;
        console.log(`📊 Found element with ${maxLength} chars:`, identifier);
      }
    }

    if (!mainContent || this.getTextLength(mainContent) < 50) {
      console.warn('⚠️ Could not extract sufficient content (less than 50 chars)');
      throw new Error('Could not extract main content from page. The page may not have enough readable content.');
    }

    console.log('✅ Content extracted successfully');

    return {
      title: this.extractTitle(documentClone),
      author: this.extractAuthor(documentClone),
      publishDate: this.extractPublishDate(documentClone),
      content: mainContent.innerHTML,
      images: this.extractImages(mainContent)
    };
  }

  getTextLength(element) {
    return element.textContent.trim().length;
  }

  extractTitle(doc) {
    // Try various title sources
    const titleCandidates = [
      doc.querySelector('h1'),
      doc.querySelector('[property="og:title"]')?.getAttribute('content'),
      doc.querySelector('[name="twitter:title"]')?.getAttribute('content'),
      doc.querySelector('title')?.textContent
    ];

    for (const candidate of titleCandidates) {
      if (candidate) {
        return typeof candidate === 'string' ? candidate : candidate.textContent.trim();
      }
    }

    return document.title;
  }

  extractAuthor(doc) {
    const authorCandidates = [
      doc.querySelector('[rel="author"]')?.textContent,
      doc.querySelector('[property="article:author"]')?.getAttribute('content'),
      doc.querySelector('[name="author"]')?.getAttribute('content'),
      doc.querySelector('.author')?.textContent,
      doc.querySelector('.byline')?.textContent,
      doc.querySelector('[itemprop="author"]')?.textContent
    ];

    for (const candidate of authorCandidates) {
      if (candidate) {
        const cleaned = candidate.trim();

        // Skip invalid authors
        if (cleaned.length < 3 ||
            cleaned.length > 100 ||
            cleaned.toLowerCase().includes('http') ||
            cleaned.toLowerCase().includes('www') ||
            /^[a-z]-[a-z]-/.test(cleaned.toLowerCase()) || // Skip patterns like "a-a-ron"
            cleaned.includes('©') ||
            cleaned.includes('™')) {
          continue;
        }

        return cleaned;
      }
    }

    return null;
  }

  extractPublishDate(doc) {
    const dateCandidates = [
      doc.querySelector('[property="article:published_time"]')?.getAttribute('content'),
      doc.querySelector('time')?.getAttribute('datetime'),
      doc.querySelector('.publish-date')?.textContent,
      doc.querySelector('.date')?.textContent
    ];

    for (const candidate of dateCandidates) {
      if (candidate) {
        return new Date(candidate).toLocaleDateString();
      }
    }

    return null;
  }

  extractImages(content) {
    const images = [];
    content.querySelectorAll('img').forEach(img => {
      if (img.width > 200 && img.height > 200) {
        images.push({
          src: img.src,
          alt: img.alt || '',
          caption: img.parentElement.querySelector('figcaption')?.textContent || null
        });
      }
    });
    return images;
  }

  async activate() {
    if (this.isActive) {
      console.log('ℹ️ Reader view already active');
      return;
    }

    if (this.activationFailed) {
      console.log('ℹ️ Reader view activation previously failed for this page');
      return;
    }

    // Save original page state BEFORE any changes
    this.originalContent = {
      scrollY: window.scrollY,
      bodyHTML: document.body.innerHTML,
      bodyClass: document.body.className,
      bodyStyle: document.body.getAttribute('style')
    };

    try {
      // Extract content
      const extracted = await this.extractMainContent();

      // Create reader view container
      this.createReaderView(extracted);
      this.isActive = true;

      // Track event
      chrome.runtime.sendMessage({
        action: 'trackEvent',
        event: 'reader_view_activated',
        data: { url: window.location.href }
      });

    } catch (error) {
      console.warn('Reader view activation failed:', error.message);
      this.activationFailed = true; // Prevent future retry attempts

      // Restore original content if we saved it
      if (this.originalContent) {
        this.deactivate();
      }

      // Silently fail - don't show alert or throw error
      // User can still use regular highlighting on the page
    }
  }

  createReaderView(extracted) {
    // Store original error handler
    if (!this.originalErrorHandler) {
      this.originalErrorHandler = window.onerror;
    }

    // Suppress errors from page scripts (they're trying to access removed DOM elements)
    window.onerror = function(message, source, lineno, colno, error) {
      // Suppress common errors from page scripts after DOM is replaced
      if (message && (
        message.includes('Cannot read properties of null') ||
        message.includes('null is not an object') ||
        message.includes('undefined is not an object')
      )) {
        return true; // Suppress error
      }
      return false; // Let other errors through
    };

    // Stop any existing page scripts/intervals to prevent errors
    const highestIntervalId = setInterval(() => {}, 0);
    for (let i = 0; i < highestIntervalId; i++) {
      clearInterval(i);
    }
    clearInterval(highestIntervalId);

    // Clear body
    document.body.innerHTML = '';
    document.body.className = 'reader-view-active';
    document.body.style.cssText = 'margin: 0; padding: 0;';

    // Create container
    this.readerContainer = document.createElement('div');
    this.readerContainer.id = 'universal-highlighter-reader-view';
    this.readerContainer.innerHTML = `
      <div class="reader-toolbar">
        <button class="reader-btn" id="reader-close" title="Exit Reader View">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Exit
        </button>
        <button class="reader-btn" id="reader-font-size-decrease" title="Decrease Font Size">A-</button>
        <button class="reader-btn" id="reader-font-size-increase" title="Increase Font Size">A+</button>
        <button class="reader-btn" id="reader-theme-toggle" title="Change Theme">🌙</button>
        <select class="reader-select" id="reader-font-family">
          <option value="Georgia, serif">Georgia</option>
          <option value="'Times New Roman', serif">Times</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Verdana, sans-serif">Verdana</option>
          <option value="'Courier New', monospace">Courier</option>
        </select>
      </div>

      <div class="reader-content">
        <article>
          <header>
            <h1 class="reader-title">${this.escapeHtml(extracted.title)}</h1>
            ${extracted.author ? `<div class="reader-meta">By ${this.escapeHtml(extracted.author)}</div>` : ''}
            ${extracted.publishDate ? `<div class="reader-meta">${this.escapeHtml(extracted.publishDate)}</div>` : ''}
          </header>

          <div class="reader-body">
            ${extracted.content}
          </div>
        </article>
      </div>
    `;

    // Add styles
    this.injectReaderStyles();

    // Append to body
    document.body.appendChild(this.readerContainer);

    // Setup event listeners
    this.setupReaderEventListeners();

    // Apply saved settings
    this.applySettings();
  }

  injectReaderStyles() {
    if (document.getElementById('reader-view-styles')) return;

    const style = document.createElement('style');
    style.id = 'reader-view-styles';
    style.textContent = `
      .reader-view-active {
        background: #f5f5f5;
      }

      #universal-highlighter-reader-view {
        width: 100%;
        min-height: 100vh;
      }

      .reader-toolbar {
        position: sticky;
        top: 0;
        z-index: 10000;
        background: white;
        border-bottom: 1px solid #ddd;
        padding: 12px 20px;
        display: flex;
        gap: 10px;
        align-items: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .reader-btn {
        padding: 8px 16px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s;
      }

      .reader-btn:hover {
        background: #f0f0f0;
        border-color: #999;
      }

      .reader-select {
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        background: white;
      }

      .reader-content {
        max-width: var(--reader-max-width, 1000px);
        width: 90%;
        margin: 0 auto;
        padding: 40px 60px;
        background: var(--reader-bg, white);
        min-height: calc(100vh - 60px);
      }

      /* Responsive breakpoints */
      @media (max-width: 1200px) {
        .reader-content {
          width: 85%;
          padding: 40px 40px;
        }
      }

      @media (max-width: 900px) {
        .reader-content {
          width: 90%;
          padding: 30px 30px;
        }

        .reader-title {
          font-size: 2em;
        }
      }

      @media (max-width: 600px) {
        .reader-content {
          width: 95%;
          padding: 20px 20px;
        }

        .reader-toolbar {
          padding: 10px 15px;
          flex-wrap: wrap;
        }

        .reader-btn {
          padding: 6px 12px;
          font-size: 13px;
        }

        .reader-title {
          font-size: 1.8em;
        }

        .reader-content article {
          font-size: calc(var(--reader-font-size, 18px) * 0.9);
        }
      }

      .reader-content article {
        font-family: var(--reader-font-family, Georgia, serif);
        font-size: var(--reader-font-size, 18px);
        line-height: var(--reader-line-height, 1.6);
        color: var(--reader-text-color, #333);
      }

      .reader-title {
        font-size: 2.5em;
        font-weight: bold;
        margin: 0 0 20px 0;
        line-height: 1.2;
        color: var(--reader-heading-color, #1a1a1a);
      }

      .reader-meta {
        color: #666;
        font-size: 0.9em;
        margin-bottom: 10px;
      }

      .reader-body {
        margin-top: 40px;
      }

      .reader-body h1, .reader-body h2, .reader-body h3 {
        margin-top: 1.5em;
        margin-bottom: 0.5em;
        color: var(--reader-heading-color, #1a1a1a);
      }

      .reader-body p {
        margin-bottom: 1.2em;
      }

      .reader-body img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 2em auto;
        border-radius: 4px;
      }

      .reader-body blockquote {
        border-left: 4px solid #ddd;
        padding-left: 20px;
        margin: 1.5em 0;
        color: #666;
        font-style: italic;
      }

      .reader-body code {
        background: #f5f5f5;
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
      }

      .reader-body pre {
        background: #f5f5f5;
        padding: 15px;
        border-radius: 4px;
        overflow-x: auto;
      }

      .reader-body ul, .reader-body ol {
        margin-bottom: 1.2em;
        padding-left: 2em;
      }

      .reader-body li {
        margin-bottom: 0.5em;
      }

      /* Dark theme */
      .reader-theme-dark {
        --reader-bg: #1a1a1a;
        --reader-text-color: #e0e0e0;
        --reader-heading-color: #ffffff;
      }

      .reader-theme-dark .reader-toolbar {
        background: #2a2a2a;
        border-bottom-color: #444;
      }

      .reader-theme-dark .reader-btn,
      .reader-theme-dark .reader-select {
        background: #2a2a2a;
        border-color: #444;
        color: #e0e0e0;
      }

      .reader-theme-dark .reader-btn:hover {
        background: #333;
        border-color: #666;
      }

      .reader-theme-dark .reader-body code,
      .reader-theme-dark .reader-body pre {
        background: #2a2a2a;
        color: #e0e0e0;
      }

      /* Sepia theme */
      .reader-theme-sepia {
        --reader-bg: #f4ecd8;
        --reader-text-color: #5b4636;
        --reader-heading-color: #3d2f24;
      }

      .reader-theme-sepia .reader-toolbar {
        background: #f9f3e3;
        border-bottom-color: #d4c4a8;
      }

      .reader-theme-sepia .reader-btn,
      .reader-theme-sepia .reader-select {
        background: #f9f3e3;
        border-color: #d4c4a8;
        color: #5b4636;
      }
    `;

    document.head.appendChild(style);
  }

  setupReaderEventListeners() {
    // Close button
    document.getElementById('reader-close').addEventListener('click', () => {
      this.deactivate();
    });

    // Font size controls
    document.getElementById('reader-font-size-decrease').addEventListener('click', () => {
      this.settings.fontSize = Math.max(12, this.settings.fontSize - 2);
      this.applySettings();
      this.saveSettings();
    });

    document.getElementById('reader-font-size-increase').addEventListener('click', () => {
      this.settings.fontSize = Math.min(32, this.settings.fontSize + 2);
      this.applySettings();
      this.saveSettings();
    });

    // Theme toggle
    document.getElementById('reader-theme-toggle').addEventListener('click', () => {
      const themes = ['light', 'dark', 'sepia'];
      const currentIndex = themes.indexOf(this.settings.theme);
      this.settings.theme = themes[(currentIndex + 1) % themes.length];
      this.applySettings();
      this.saveSettings();
    });

    // Font family
    document.getElementById('reader-font-family').value = this.settings.fontFamily;
    document.getElementById('reader-font-family').addEventListener('change', (e) => {
      this.settings.fontFamily = e.target.value;
      this.applySettings();
      this.saveSettings();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.isActive) return;

      if (e.key === 'Escape') {
        this.deactivate();
      }
    });
  }

  applySettings() {
    const content = document.querySelector('.reader-content');
    if (!content) return;

    content.style.setProperty('--reader-font-size', `${this.settings.fontSize}px`);
    content.style.setProperty('--reader-font-family', this.settings.fontFamily);
    content.style.setProperty('--reader-line-height', this.settings.lineHeight);
    content.style.setProperty('--reader-max-width', `${this.settings.maxWidth}px`);

    // Remove all theme classes
    content.classList.remove('reader-theme-light', 'reader-theme-dark', 'reader-theme-sepia');
    content.classList.add(`reader-theme-${this.settings.theme}`);

    // Update body background
    if (this.settings.theme === 'dark') {
      document.body.style.background = '#1a1a1a';
    } else if (this.settings.theme === 'sepia') {
      document.body.style.background = '#f4ecd8';
    } else {
      document.body.style.background = '#f5f5f5';
    }
  }

  async saveSettings() {
    await chrome.storage.local.set({ readerViewSettings: this.settings });
  }

  deactivate() {
    // Restore original error handler
    if (this.originalErrorHandler !== undefined) {
      window.onerror = this.originalErrorHandler;
      this.originalErrorHandler = undefined;
    }

    // Restore original content (even if reader view wasn't fully activated)
    if (this.originalContent) {
      document.body.innerHTML = this.originalContent.bodyHTML;
      document.body.className = this.originalContent.bodyClass || '';
      if (this.originalContent.bodyStyle) {
        document.body.setAttribute('style', this.originalContent.bodyStyle);
      } else {
        document.body.removeAttribute('style');
      }
      window.scrollTo(0, this.originalContent.scrollY);
      this.originalContent = null;
    }

    this.isActive = false;
    this.readerContainer = null;

    // Remove reader styles
    const styles = document.getElementById('reader-view-styles');
    if (styles) styles.remove();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Make it available globally
window.readerViewService = new ReaderViewService();
window.readerViewService.init();
