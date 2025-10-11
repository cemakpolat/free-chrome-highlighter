// highlighter-service.js - SOLID: Single Responsibility Principle
// This class only handles highlighting logic

/**
 * Check if extension context is still valid
 */
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

/**
 * Core Highlighter Service
 * Responsible for creating, managing, and rendering highlights
 */
class HighlighterService extends IHighlighter {
  constructor(storageProvider, eventEmitter) {
    super();
    this.storage = storageProvider;
    this.events = eventEmitter;
    this.highlights = new Map(); // Cache for current page highlights
    this.domainCache = new Map(); // Cache for domain data to avoid repeated storage calls
    this.lastCacheTime = new Map(); // Track cache freshness
    this.cacheExpiry = 30000; // 30 seconds cache expiry
    this.currentUrl = '';
    // this.createdStickyNotes = new Set(); // OLD: Track created sticky notes by highlight ID - removed
    this.colors = [
      '#ffff00', // Yellow
      '#ff6b6b', // Red
      '#4ecdc4', // Teal
      '#96ceb4', // Green
      '#ffc107', // Orange
      '#e91e63', // Pink
      '#9c27b0'  // Purple
    ];
    this.defaultColor = '#ffff00';
    
    this.init();
  }

  async init() {
    console.log('=== HIGHLIGHTER SERVICE INIT ===');
    this.currentUrl = this.getCurrentUrl();
    console.log('Initialized with URL:', this.currentUrl);
    console.log('Storage provider:', this.storage.constructor.name);

    await this.loadHighlightsForCurrentPage();
    this.setupEventListeners();
    console.log('=== HIGHLIGHTER SERVICE INIT COMPLETE ===');
  }

  getCurrentUrl() {
    return window.location.href.split('#')[0].split('?')[0]; // Remove hash and query params
  }

  getDomainFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Invalidate cache for a domain
   */
  invalidateCache(domain) {
    this.domainCache.delete(domain);
    this.lastCacheTime.delete(domain);
    console.log('Cache invalidated for domain:', domain);
  }

  /**
   * Create a new highlight from text selection - simplified version
   */
  async createHighlight(selection, options = {}) {
    console.log('=== CREATE HIGHLIGHT ===');
    console.log('Selection text:', selection.toString());
    console.log('Options received:', options);
    console.log('Options.color:', options.color);
    console.log('Options.color type:', typeof options.color);

    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated, cannot create highlight');
      return null;
    }

    if (!selection || selection.toString().trim() === '') {
      console.error('No text selected');
      throw new Error('No text selected');
    }

    try {
      const range = selection.getRangeAt(0);
      const rawText = selection.toString().trim();
      const text = this.cleanHighlightText(rawText);

      // Validate cleaned text
      if (!text || text.length === 0) {
        console.error('No meaningful text after cleaning:', rawText);
        throw new Error('Selected text contains only UI elements');
      }

      const selectedColor = options.color || this.defaultColor;

      console.log('Raw text:', rawText);
      console.log('Cleaned text:', text);
      console.log('this.defaultColor:', this.defaultColor);
      console.log('Final selectedColor:', selectedColor);
      console.log('Final selectedColor type:', typeof selectedColor);
      console.log('Text length:', text.length);

      // Generate position data for better restoration
      const positionData = this.generatePositionData(range);

      // Create highlight object with position data
      const highlight = new Highlight({
        text: text,
        url: this.currentUrl,
        title: document.title,
        color: selectedColor,
        note: options.note || '',
        tags: options.tags || [],
        position: positionData
      });

      console.log('Created highlight object:', highlight.id);
      console.log('Highlight object color after creation:', highlight.color);
      console.log('Highlight object full data:', highlight);

      // Check for and remove any existing highlights in the selected range
      await this.removeOverlappingHighlights(range);

      // Apply visual highlight immediately
      this.applySafeHighlight(highlight, range);

      // Store highlight
      await this.saveHighlight(highlight);

      // Cache locally
      this.highlights.set(highlight.id, highlight);

      console.log('✅ Highlight created successfully');

      // Emit event
      this.events.emit('highlight_created', highlight);

      // Clear selection
      selection.removeAllRanges();

      return highlight;

    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during highlight creation');
        return null;
      }
      console.error('❌ Error creating highlight:', error);
      throw error;
    }
  }

  /**
   * Remove a highlight
   */
  async removeHighlight(highlightId) {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated, cannot remove highlight');
      return { success: false, error: 'Extension context invalidated' };
    }

    try {
      const highlight = this.highlights.get(highlightId);

      // Always try to remove from storage first (might be from another page)
      await this.deleteHighlight(highlightId);

      // If highlight exists in current page cache, remove from DOM
      if (highlight) {
        // Remove from DOM
        const element = document.querySelector(`[data-highlight-id="${highlightId}"]`);
        if (element) {
          this.removeHighlightFromDOM(element);
        }

        // Remove from cache
        this.highlights.delete(highlightId);

        // Emit event
        this.events.emit('highlight_removed', highlightId);
      } else {
        console.log('🔧 Highlight not in current page cache, was deleted externally');

        // Force invalidate cache and reload highlights for current page
        const domain = this.getDomainFromUrl(this.currentUrl);
        console.log('🔧 Invalidating cache for domain:', domain);
        this.invalidateCache(domain);

        // Clear all highlights from DOM first
        const allHighlightElements = document.querySelectorAll('.universal-highlight');
        console.log('🔧 Removing', allHighlightElements.length, 'highlights from DOM');
        allHighlightElements.forEach(el => this.removeHighlightFromDOM(el));

        // Clear in-memory cache
        this.highlights.clear();

        // Reload highlights to get fresh data
        console.log('🔄 Reloading highlights after external deletion...');
        await this.loadHighlightsForCurrentPage();
        console.log('✅ Highlights reloaded, now have', this.highlights.size, 'highlights');
      }

      return true;
    } catch (error) {
      console.error('Error removing highlight:', error);
      throw error;
    }
  }

  /**
   * Remove any existing highlights that overlap with the given range
   */
  async removeOverlappingHighlights(range) {
    try {
      console.log('🔍 Checking for overlapping highlights...');

      // Get all elements within the range that have highlights
      const container = range.commonAncestorContainer;
      const walker = document.createTreeWalker(
        container.nodeType === Node.TEXT_NODE ? container.parentNode : container,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            return node.classList && node.classList.contains('universal-highlight')
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          }
        }
      );

      const overlappingHighlights = [];
      let node;

      while (node = walker.nextNode()) {
        // Check if this highlight node intersects with our range
        if (this.rangeIntersectsNode(range, node)) {
          const highlightId = node.dataset.highlightId;
          if (highlightId) {
            overlappingHighlights.push({ id: highlightId, element: node });
            console.log('📍 Found overlapping highlight:', highlightId);
          }
        }
      }

      // Remove overlapping highlights
      for (const overlap of overlappingHighlights) {
        console.log('🗑️ Removing overlapping highlight:', overlap.id);
        await this.removeHighlight(overlap.id);
      }

      console.log(`✅ Removed ${overlappingHighlights.length} overlapping highlights`);
      return overlappingHighlights.length;

    } catch (error) {
      console.error('Error removing overlapping highlights:', error);
      return 0;
    }
  }

  /**
   * Check if a range intersects with a DOM node
   */
  rangeIntersectsNode(range, node) {
    try {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);

      // Check if ranges intersect
      return (
        range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0 &&
        range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0
      );
    } catch (error) {
      console.warn('Error checking range intersection:', error);
      return false;
    }
  }

  /**
   * Load highlights for current page
   */
  async loadHighlights(url = null) {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated, cannot load highlights');
      return [];
    }

    const targetUrl = url || this.currentUrl;
    const domain = this.getDomainFromUrl(targetUrl);

    // Check cache first
    const now = Date.now();
    const cacheKey = domain;
    const cached = this.domainCache.get(cacheKey);
    const cacheTime = this.lastCacheTime.get(cacheKey);

    if (cached && cacheTime && (now - cacheTime) < this.cacheExpiry) {
      console.log('Using cached domain data for:', domain);
      const highlights = cached.highlights ? cached.highlights.filter(h => h.url === targetUrl) : [];
      // Update local cache
      this.highlights.clear();
      highlights.forEach(h => this.highlights.set(h.id, h));
      return highlights;
    }

    console.log('Loading highlights from storage for domain:', domain);

    try {
      const highlightData = await this.storage.load(domain);

      if (!highlightData || !highlightData.highlights) {
        // Cache empty result to avoid repeated calls
        this.domainCache.set(cacheKey, { highlights: [] });
        this.lastCacheTime.set(cacheKey, now);
        return [];
      }

      // Cache the domain data
      this.domainCache.set(cacheKey, highlightData);
      this.lastCacheTime.set(cacheKey, now);

      const pageHighlights = highlightData.highlights.filter(h => h.url === targetUrl);

      // Clear and update local highlights cache
      this.highlights.clear();
      pageHighlights.forEach(highlightData => {
        const highlight = new Highlight(highlightData);
        this.highlights.set(highlight.id, highlight);
      });

      console.log('✅ Loaded', pageHighlights.length, 'highlights for current page');
      return pageHighlights;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during highlights load');
        return [];
      }
      console.error('❌ Error loading highlights:', error);
      return [];
    }
  }

  /**
   * Load and render highlights for current page
   */
  async loadHighlightsForCurrentPage() {
    try {
      const startTime = performance.now();
      console.log('Loading highlights for page:', this.currentUrl);

      // Always load highlights first
      const highlights = await this.loadHighlights();
      const loadTime = performance.now() - startTime;

      // If no highlights, no need to render
      if (highlights.length === 0) {
        return;
      }

      // Function to render highlights
      const renderFunction = async () => {
        const renderStart = performance.now();
        await this.renderHighlights(highlights);
        const renderTime = performance.now() - renderStart;
        const totalTime = performance.now() - startTime;
        console.log(`⚡ Performance: Load ${loadTime.toFixed(1)}ms, Render ${renderTime.toFixed(1)}ms, Total ${totalTime.toFixed(1)}ms`);
      };

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderFunction);
      } else {
        // Use requestAnimationFrame for optimal performance
        requestAnimationFrame(renderFunction);
      }
    } catch (error) {
      console.error('Error loading highlights for current page:', error);
    }
  }

  /**
   * Render highlights on the page
   */
  async renderHighlights(highlights) {
    if (highlights.length === 0) return;

    console.log(`Rendering ${highlights.length} highlights`);

    // Clear any existing highlights first to prevent conflicts
    this.clearExistingHighlights();

    // Batch process highlights for better performance
    const renderPromises = highlights.map(async (highlight, index) => {
      try {
        await this.restoreHighlightInDOM(highlight);
        return { success: true, index };
      } catch (error) {
        console.error(`Error rendering highlight ${index + 1}:`, error);
        return { success: false, index, error };
      }
    });

    // Wait for all highlights to render
    const results = await Promise.allSettled(renderPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    console.log(`Rendering complete: ${successful}/${highlights.length} highlights rendered successfully`);

  }


  /**
   * Clear existing highlights from the page
   */
  clearExistingHighlights() {
    const existingHighlights = document.querySelectorAll('.universal-highlight');
    existingHighlights.forEach(element => {
      try {
        // Unwrap the highlight element and restore original text
        const parent = element.parentNode;
        if (parent) {
          // Move all child nodes to parent, effectively unwrapping
          while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
          }
          // Remove the highlight element
          parent.removeChild(element);

          // Normalize text nodes to merge adjacent text nodes
          parent.normalize();
        }
      } catch (error) {
        console.warn('Error removing existing highlight:', error);
        // Try simple removal as fallback
        try {
          element.remove();
        } catch (e) {
          console.warn('Could not remove highlight element:', e);
        }
      }
    });
  }

  /**
   * Search highlights across all pages
   */
  async searchHighlights(query) {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated, cannot search highlights');
      return [];
    }

    try {
      const domains = await this.storage.list();
      const allHighlights = [];

      for (const domain of domains) {
        const data = await this.storage.load(domain);
        if (data && data.highlights) {
          allHighlights.push(...data.highlights);
        }
      }

      if (!query || query.trim() === '') {
        return allHighlights;
      }

      const searchTerm = query.toLowerCase();
      return allHighlights.filter(highlight => 
        highlight.text.toLowerCase().includes(searchTerm) ||
        highlight.note.toLowerCase().includes(searchTerm) ||
        highlight.title.toLowerCase().includes(searchTerm) ||
        highlight.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during highlights search');
        return [];
      }
      console.error('Error searching highlights:', error);
      return [];
    }
  }

  /**
   * Generate position data for highlight restoration
   */
  generatePositionData(range) {
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    return {
      startXPath: this.getXPath(startContainer),
      endXPath: this.getXPath(endContainer),
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      textContent: range.toString(),
      contextBefore: this.getContextBefore(range, 50),
      contextAfter: this.getContextAfter(range, 50)
    };
  }

  /**
   * Apply highlight styling to DOM
   */
  async applyHighlightToDOM(highlight, range) {
    try {
      console.log('Applying highlight to DOM with color:', highlight.color);

      // Check if this range is already highlighted
      const existingHighlight = this.findExistingHighlight(range);
      if (existingHighlight) {
        console.warn('Range already highlighted, skipping');
        return;
      }

      // Use safe highlighting method that doesn't modify DOM structure
      this.applySafeHighlight(highlight, range);

      console.log('Successfully applied highlight with color:', highlight.color);

    } catch (error) {
      console.error('Failed to apply highlight:', error);
      throw error;
    }
  }

  /**
   * Simple highlighting method - just wrap the text
   */
  applySafeHighlight(highlight, range) {
    console.log('=== APPLY SAFE HIGHLIGHT ===');
    console.log('Highlight object:', highlight);
    console.log('Highlight ID:', highlight.id);
    console.log('Highlight color received:', highlight.color);
    console.log('Highlight color type:', typeof highlight.color);
    console.log('Text to highlight:', range.toString());

    try {
      // Simple approach: just wrap the selected text
      const span = document.createElement('span');
      span.className = 'universal-highlight';
      span.dataset.highlightId = highlight.id;

      // CRITICAL: Make sure we're using the highlight's color
      const colorToUse = highlight.color;
      console.log('Color being applied to span:', colorToUse);

      // Apply the color directly to the background-color property
      span.style.setProperty('background-color', colorToUse, 'important');

      // Get the text content
      const text = range.toString();

      // Replace range with highlighted span
      range.deleteContents();
      span.textContent = text;

      // Add click handler for new inline controls
      span.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Hide any existing inline controls
        this.hideAllInlineControls();

        // Show inline controls for this highlight
        this.showInlineControls(highlight, span, e);
      });

      range.insertNode(span);

      // Add event listeners for context menu and hover effects
      this.addHighlightEventListeners(span, highlight);

      console.log('✅ Highlight applied successfully');
      console.log('Final span background color:', span.style.backgroundColor);
      console.log('Final span computed style:', getComputedStyle(span).backgroundColor);

      return true;

    } catch (error) {
      console.error('❌ Failed to apply highlight:', error);
      return false;
    }
  }

  /**
   * Get all text nodes within a range
   */
  getTextNodesInRange(range) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Check if this text node intersects with our range
          const nodeRange = document.createRange();
          nodeRange.selectNode(node);

          if (range.intersectsNode(node)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      // Skip empty or whitespace-only nodes
      if (node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    return textNodes;
  }

  /**
   * Check if a range overlaps with existing highlights
   */
  findExistingHighlight(range) {
    const existingHighlights = document.querySelectorAll('.universal-highlight');

    for (const highlight of existingHighlights) {
      const highlightRange = document.createRange();
      try {
        highlightRange.selectNode(highlight);
        if (range.intersectsNode(highlight) ||
            (range.compareBoundaryPoints(Range.START_TO_START, highlightRange) >= 0 &&
             range.compareBoundaryPoints(Range.END_TO_END, highlightRange) <= 0)) {
          return highlight;
        }
      } catch (error) {
        // Ignore range comparison errors
      }
    }

    return null;
  }

  /**
   * Restore highlight in DOM based on stored position data
   */
  async restoreHighlightInDOM(highlight) {
    console.log('=== RESTORING HIGHLIGHT IN DOM ===');
    console.log('Highlight:', highlight.id);
    console.log('Position data:', highlight.position);

    try {
      // Check if we have valid position data
      if (highlight.position && highlight.position.startXPath && highlight.position.endXPath) {
        console.log('Trying position-based restoration...');
        const range = this.recreateRangeFromPosition(highlight.position);
        if (range) {
          console.log('Position-based range created, applying highlight...');
          await this.applyHighlightToDOM(highlight, range);
          console.log('✅ Position-based restoration successful');
          return;
        } else {
          console.log('Position-based range creation failed, falling back to text search');
        }
      } else {
        console.log('No valid position data, using text-based restoration');
      }

      // Fall back to text-based restoration
      await this.restoreHighlightByText(highlight);

    } catch (error) {
      // Try text-based fallback
      console.warn('Position-based restore failed, trying text search:', error);
      await this.restoreHighlightByText(highlight);
    }
  }

  /**
   * Simple text-based highlight restoration
   */
  async restoreHighlightByText(highlight) {
    console.log('=== RESTORING HIGHLIGHT BY TEXT ===');
    console.log('Text to find:', `"${highlight.text}"`);
    console.log('Text length:', highlight.text.length);
    console.log('Color:', highlight.color);

    // Check if highlight already exists
    const existingHighlight = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
    if (existingHighlight) {
      console.log('Highlight already exists, skipping');
      return;
    }

    const highlightText = highlight.text.trim();

    // Try multiple restoration strategies in order of preference
    if (this.tryExactTextMatch(highlight, highlightText)) return;
    if (this.tryNormalizedTextMatch(highlight, highlightText)) return;
    if (this.tryPartialTextMatch(highlight, highlightText)) return;
    if (this.tryFuzzyTextMatch(highlight, highlightText)) return;

    console.warn('❌ Failed to restore highlight after trying all strategies:', highlightText.substring(0, 50) + '...');
  }

  /**
   * Strategy 1: Exact text matching with context verification
   */
  tryExactTextMatch(highlight, highlightText) {
    console.log('🔍 Trying exact text match with context...');

    const bodyText = document.body.innerText || document.body.textContent || '';
    if (!bodyText.includes(highlightText)) {
      console.log('❌ Exact text not found in document body');
      return false;
    }

    // Get context from position data if available
    const contextBefore = highlight.position?.contextBefore || '';
    const contextAfter = highlight.position?.contextAfter || '';
    const hasContext = contextBefore || contextAfter;

    console.log('Context before:', contextBefore ? `"${contextBefore.substring(0, 20)}..."` : 'none');
    console.log('Context after:', contextAfter ? `"${contextAfter.substring(0, 20)}..."` : 'none');

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const candidates = [];
    let node;

    // Collect all potential matches
    while (node = walker.nextNode()) {
      if (node.parentElement?.classList.contains('universal-highlight')) {
        continue;
      }

      const text = node.textContent;
      const index = text.indexOf(highlightText);

      if (index !== -1) {
        // Get surrounding context
        const beforeText = text.substring(Math.max(0, index - 50), index);
        const afterText = text.substring(index + highlightText.length, index + highlightText.length + 50);

        candidates.push({
          node,
          index,
          beforeText,
          afterText,
          contextScore: 0
        });
      }
    }

    if (candidates.length === 0) {
      console.log('❌ No matches found');
      return false;
    }

    console.log(`📍 Found ${candidates.length} potential matches`);

    // If we have context, score each candidate
    if (hasContext && candidates.length > 1) {
      candidates.forEach(candidate => {
        let score = 0;

        // Score based on context before
        if (contextBefore) {
          const beforeMatch = candidate.beforeText.includes(contextBefore) ||
                            contextBefore.includes(candidate.beforeText);
          if (beforeMatch) score += 10;
        }

        // Score based on context after
        if (contextAfter) {
          const afterMatch = candidate.afterText.includes(contextAfter) ||
                           contextAfter.includes(candidate.afterText);
          if (afterMatch) score += 10;
        }

        candidate.contextScore = score;
      });

      // Sort by context score (highest first)
      candidates.sort((a, b) => b.contextScore - a.contextScore);

      console.log('Context scores:', candidates.map(c => c.contextScore));

      // Use the best match (highest score)
      const bestMatch = candidates[0];

      if (bestMatch.contextScore > 0) {
        console.log(`✅ Using best match with score ${bestMatch.contextScore}`);
      } else {
        console.log('⚠️ No context match found, using first occurrence');
      }
    }

    // Apply highlight to the best candidate (or first if no context)
    const chosen = candidates[0];
    try {
      const range = document.createRange();
      range.setStart(chosen.node, chosen.index);
      range.setEnd(chosen.node, chosen.index + highlightText.length);

      this.applySafeHighlight(highlight, range);
      console.log('✅ Restored using exact text match');
      return true;
    } catch (error) {
      console.warn('Failed to apply highlight:', error);
      return false;
    }
  }

  /**
   * Strategy 2: Normalized text matching (handle whitespace variations)
   */
  tryNormalizedTextMatch(highlight, highlightText) {
    console.log('🔍 Trying normalized text match...');

    // Normalize text by collapsing whitespace
    const normalizeText = (text) => text.replace(/\s+/g, ' ').trim();
    const normalizedTarget = normalizeText(highlightText);

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.parentElement?.classList.contains('universal-highlight')) {
        continue;
      }

      const text = node.textContent;
      const normalizedText = normalizeText(text);
      const index = normalizedText.indexOf(normalizedTarget);

      if (index !== -1) {
        try {
          // Map back to original text indices
          const startIndex = this.mapNormalizedToOriginal(text, normalizedText, index);
          const endIndex = this.mapNormalizedToOriginal(text, normalizedText, index + normalizedTarget.length);

          const range = document.createRange();
          range.setStart(node, startIndex);
          range.setEnd(node, endIndex);

          this.applySafeHighlight(highlight, range);
          console.log('✅ Restored using normalized text match');
          return true;
        } catch (error) {
          console.warn('Failed normalized match at this location:', error);
          continue;
        }
      }
    }

    return false;
  }

  /**
   * Strategy 3: Partial text matching (find best substring match)
   */
  tryPartialTextMatch(highlight, highlightText) {
    console.log('🔍 Trying partial text match...');

    // Try progressively shorter substrings
    const minLength = Math.max(20, Math.floor(highlightText.length * 0.6));

    for (let length = highlightText.length; length >= minLength; length -= 5) {
      const substring = highlightText.substring(0, length);

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        if (node.parentElement?.classList.contains('universal-highlight')) {
          continue;
        }

        const text = node.textContent;
        const index = text.indexOf(substring);

        if (index !== -1) {
          try {
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + substring.length);

            this.applySafeHighlight(highlight, range);
            console.log(`✅ Restored using partial match (${substring.length}/${highlightText.length} chars)`);
            return true;
          } catch (error) {
            console.warn('Failed partial match at this location:', error);
            continue;
          }
        }
      }
    }

    return false;
  }

  /**
   * Strategy 4: Fuzzy matching across multiple text nodes
   */
  tryFuzzyTextMatch(highlight, highlightText) {
    console.log('🔍 Trying fuzzy cross-node match...');

    // Collect all text content with node references
    const textNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.parentElement?.classList.contains('universal-highlight')) {
        continue;
      }
      textNodes.push({
        node: node,
        text: node.textContent,
        offset: 0
      });
    }

    // Build continuous text string with node mapping
    let continuousText = '';
    const nodeMap = [];

    textNodes.forEach((nodeInfo, nodeIndex) => {
      const startPos = continuousText.length;
      continuousText += nodeInfo.text;

      for (let i = 0; i < nodeInfo.text.length; i++) {
        nodeMap.push({
          nodeIndex: nodeIndex,
          nodeOffset: i
        });
      }
    });

    // Try to find the text in continuous string
    const normalizedTarget = highlightText.replace(/\s+/g, ' ').trim();
    const normalizedContinuous = continuousText.replace(/\s+/g, ' ').trim();
    const index = normalizedContinuous.indexOf(normalizedTarget);

    if (index !== -1) {
      try {
        // Map back to original positions
        const startMapping = nodeMap[index];
        const endMapping = nodeMap[Math.min(index + normalizedTarget.length - 1, nodeMap.length - 1)];

        if (startMapping && endMapping) {
          const range = document.createRange();
          range.setStart(textNodes[startMapping.nodeIndex].node, startMapping.nodeOffset);
          range.setEnd(textNodes[endMapping.nodeIndex].node, endMapping.nodeOffset + 1);

          this.applySafeHighlight(highlight, range);
          console.log('✅ Restored using fuzzy cross-node match');
          return true;
        }
      } catch (error) {
        console.warn('Failed fuzzy match:', error);
      }
    }

    return false;
  }

  /**
   * Map normalized text index back to original text index
   */
  mapNormalizedToOriginal(originalText, normalizedText, normalizedIndex) {
    let originalIndex = 0;
    let normalizedPos = 0;

    for (let i = 0; i < originalText.length && normalizedPos < normalizedIndex; i++) {
      if (originalText[i] !== ' ' || normalizedText[normalizedPos] === ' ') {
        if (normalizedPos < normalizedIndex) {
          normalizedPos++;
        }
      }
      originalIndex = i + 1;
    }

    return originalIndex;
  }


  /**
   * Remove highlight from DOM
   */
  removeHighlightFromDOM(element) {
    const parent = element.parentNode;
    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
    parent.normalize(); // Merge adjacent text nodes
  }

  /**
   * Add event listeners to highlight elements
   */
  addHighlightEventListeners(element, highlight) {
    // Right-click context menu
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showHighlightContextMenu(e, highlight);
    });

    // Double-click to add/edit note
    element.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.editHighlightNote(highlight);
    });

    // Hover effects
    element.addEventListener('mouseenter', () => {
      element.classList.add('highlight-hover');
    });

    element.addEventListener('mouseleave', () => {
      element.classList.remove('highlight-hover');
    });
  }

  /**
   * Show context menu for highlight
   */
  showHighlightContextMenu(event, highlight) {
    // Remove existing menus
    document.querySelectorAll('.highlight-context-menu').forEach(m => m.remove());

    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'highlight-context-menu';

    // Set position using CSS custom properties (CSP-compliant)
    menu.style.setProperty('--menu-top', event.clientY + 'px');
    menu.style.setProperty('--menu-left', event.clientX + 'px');

    const menuItems = [
      { text: '📝 Edit Note', action: () => this.editHighlightNote(highlight) },
      { text: '🎨 Change Color', action: () => this.changeHighlightColor(highlight) },
      { text: '🏷️ Add Tags', action: () => this.editHighlightTags(highlight) },
      { text: '📋 Copy Text', action: () => navigator.clipboard.writeText(highlight.text) },
      { text: '🗑️ Delete', action: () => this.removeHighlight(highlight.id) }
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'highlight-menu-item';
      menuItem.textContent = item.text;
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);

    // Remove menu when clicking elsewhere
    setTimeout(() => {
      document.addEventListener('click', function removeMenu() {
        menu.remove();
        document.removeEventListener('click', removeMenu);
      });
    }, 100);
  }

  /**
   * Edit highlight note
   */
  async editHighlightNote(highlight) {
    const currentNote = highlight.note || '';
    const newNote = prompt('Add or edit note:', currentNote);
    
    if (newNote !== null) {
      highlight.note = newNote;
      await this.updateHighlight(highlight);
      
      // Update tooltip
      const element = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
      if (element) {
        element.title = `Highlighted on ${new Date(highlight.timestamp).toLocaleDateString()}`;
        if (highlight.note) {
          element.title += `\nNote: ${highlight.note}`;
        }
      }
    }
  }

  /**
   * Change highlight color
   */
  async changeHighlightColor(highlight) {
    // Create color picker popup
    const colorPicker = document.createElement('div');
    colorPicker.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 10001;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    `;

    this.colors.forEach(color => {
      const colorButton = document.createElement('button');
      colorButton.style.cssText = `
        width: 40px;
        height: 40px;
        background-color: ${color};
        border: 2px solid ${color === highlight.color ? '#333' : '#ddd'};
        border-radius: 4px;
        cursor: pointer;
      `;
      colorButton.addEventListener('click', async () => {
        console.log(`Changing highlight color from ${highlight.color} to ${color}`);

        highlight.color = color;
        await this.updateHighlight(highlight);

        // Update DOM element
        const element = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
        if (element) {
          element.style.backgroundColor = color;
          console.log(`Updated DOM element background to ${color}`);
        } else {
          console.warn(`Could not find DOM element for highlight ${highlight.id}`);
        }

        colorPicker.remove();
      });
      colorPicker.appendChild(colorButton);
    });

    document.body.appendChild(colorPicker);

    // Remove on outside click
    setTimeout(() => {
      document.addEventListener('click', function removeColorPicker(e) {
        if (!colorPicker.contains(e.target)) {
          colorPicker.remove();
          document.removeEventListener('click', removeColorPicker);
        }
      });
    }, 100);
  }

  /**
   * Edit highlight tags
   */
  async editHighlightTags(highlight) {
    const currentTags = highlight.tags.join(', ');
    const newTags = prompt('Enter tags (comma-separated):', currentTags);
    
    if (newTags !== null) {
      highlight.tags = newTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      await this.updateHighlight(highlight);
    }
  }

  /**
   * Update existing highlight
   */
  async updateHighlight(highlight) {
    try {
      // Ensure highlight is a proper Highlight instance
      let highlightInstance;
      if (highlight.toJSON && typeof highlight.toJSON === 'function') {
        // Already a Highlight instance
        highlightInstance = highlight;
      } else {
        // Convert plain object to Highlight instance
        highlightInstance = Highlight.fromJSON(highlight);
      }

      await this.saveHighlight(highlightInstance);
      this.highlights.set(highlightInstance.id, highlightInstance);
      this.events.emit('highlight_updated', highlightInstance);
    } catch (error) {
      console.error('Error updating highlight:', error);
    }
  }

  /**
   * Save highlight to storage
   */
  async saveHighlight(highlight) {
    console.log('=== SAVING HIGHLIGHT ===');
    console.log('Highlight to save:', highlight);
    console.log('Highlight JSON:', highlight.toJSON());

    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated, cannot save highlight');
      return false;
    }

    const domain = this.getDomainFromUrl(highlight.url);
    console.log('Saving to domain:', domain);

    try {
      // Load existing data for domain
      let domainData = await this.storage.load(domain) || { highlights: [], lastModified: Date.now() };
      console.log('Existing domain data:', domainData);

      // Update or add highlight
      const existingIndex = domainData.highlights.findIndex(h => h.id === highlight.id);
      if (existingIndex >= 0) {
        domainData.highlights[existingIndex] = highlight.toJSON();
        console.log('Updated existing highlight at index:', existingIndex);
      } else {
        domainData.highlights.push(highlight.toJSON());
        console.log('Added new highlight, total count:', domainData.highlights.length);
      }

      domainData.lastModified = Date.now();

      // Save back to storage
      await this.storage.save(domain, domainData);

      // Invalidate cache so next load gets fresh data
      this.invalidateCache(domain);

      console.log('✅ Highlight saved successfully');

    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during highlight save');
        return false;
      }
      console.error('❌ Error saving highlight:', error);
      throw error;
    }
  }

  /**
   * Delete highlight from storage
   */
  async deleteHighlight(highlightId) {
    const highlight = this.highlights.get(highlightId);

    // If highlight is not in current page cache, search for it in storage
    let domain;
    if (highlight) {
      domain = this.getDomainFromUrl(highlight.url);
    } else {
      // Search for the highlight across all domains
      domain = await this.findHighlightDomain(highlightId);
      if (!domain) {
        console.log('🔧 Highlight not found in any domain');
        return;
      }
    }
    
    try {
      const domainData = await this.storage.load(domain);
      if (domainData && domainData.highlights) {
        domainData.highlights = domainData.highlights.filter(h => h.id !== highlightId);
        domainData.lastModified = Date.now();
        await this.storage.save(domain, domainData);

        // Invalidate cache so next load gets fresh data
        this.invalidateCache(domain);
      }
    } catch (error) {
      console.error('Error deleting highlight:', error);
      throw error;
    }
  }

  /**
   * Find which domain contains a specific highlight ID
   */
  async findHighlightDomain(highlightId) {
    try {
      const domains = await this.storage.list();
      for (const domain of domains) {
        const data = await this.storage.load(domain);
        if (data && data.highlights) {
          const found = data.highlights.find(h => h.id === highlightId);
          if (found) {
            return domain;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error finding highlight domain:', error);
      return null;
    }
  }

  /**
   * OLD STICKY NOTE SYSTEM REMOVED - NOTES NOW HANDLED IN INLINE CONTROLS
   */
  /* createStickyNote(highlight, highlightElement) {
    // Check if we've already created a sticky note for this highlight
    if (this.createdStickyNotes.has(highlight.id)) {
      console.log('🔄 Sticky note already tracked for highlight:', highlight.id);
      return document.querySelector(`[data-highlight-id="${highlight.id}"].sticky-note`);
    }

    // Check if sticky note already exists in DOM
    const existingStickyNote = document.querySelector(`[data-highlight-id="${highlight.id}"].sticky-note`);
    if (existingStickyNote) {
      console.log('🔄 Sticky note already exists in DOM for highlight:', highlight.id);
      this.createdStickyNotes.add(highlight.id); // Track it
      return existingStickyNote;
    }

    console.log('🔧 Creating new sticky note for highlight:', highlight.id);

    // Mark as being created to prevent race conditions
    this.createdStickyNotes.add(highlight.id);

    // Create sticky note element
    const stickyNote = document.createElement('div');
    stickyNote.className = 'sticky-note collapsed';
    stickyNote.dataset.highlightId = highlight.id;

    // Calculate absolute position relative to document
    const rect = highlightElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    console.log('🔧 Position calculation for highlight:', highlight.id, {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      scroll: { top: scrollTop, left: scrollLeft },
      viewport: { width: window.innerWidth, height: window.innerHeight }
    });

    // Position to the right of the highlight element
    let left = rect.right + scrollLeft + 5;
    let top = rect.top + scrollTop;

    // More intelligent fallback - use the highlight element's actual position
    if (rect.right === 0 || rect.top === 0 || left <= 5) {
      console.warn('⚠️ Invalid rect values, trying alternative positioning for highlight:', highlight.id);

      // Try to get position from the highlight element's offsetParent chain
      let element = highlightElement;
      let offsetLeft = 0;
      let offsetTop = 0;

      while (element && element.offsetParent) {
        offsetLeft += element.offsetLeft;
        offsetTop += element.offsetTop;
        element = element.offsetParent;
      }

      if (offsetLeft > 0 && offsetTop > 0) {
        left = offsetLeft + highlightElement.offsetWidth + 5;
        top = offsetTop;
        console.log('✅ Using offset-based position:', { left, top });
      } else {
        // Final fallback - position relative to viewport
        left = window.innerWidth * 0.7; // 70% from left edge
        top = window.innerHeight * 0.3; // 30% from top edge
        console.log('⚠️ Using viewport-relative fallback position:', { left, top });
      }
    }

    // Always recalculate position to ensure accuracy (stored positions may be outdated)
    stickyNote.style.left = `${left}px`;
    stickyNote.style.top = `${top}px`;

    // Store the current position for reference (non-blocking)
    highlight.notePosition = { left, top };
    this.updateHighlight(highlight).catch(err =>
      console.error('Error saving note position:', err)
    );

    console.log('🔧 Positioned sticky note:', {
      rect,
      scrollTop,
      scrollLeft,
      finalLeft: left,
      finalTop: top,
      highlightId: highlight.id,
      highlightElementRect: highlightElement.getBoundingClientRect()
    });

    // Create content area
    const contentArea = document.createElement('textarea');
    contentArea.className = 'sticky-note-content';
    contentArea.value = highlight.note || '';
    contentArea.style.display = 'none';

    // Create trash icon
    const trashIcon = document.createElement('div');
    trashIcon.className = 'sticky-note-trash';
    trashIcon.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3,6 5,6 21,6"></polyline>
      <path d="m19,6v14a2,2 0 0 1 -2,2H7a2,2 0 0 1 -2,-2V6m3,0V4a2,2 0 0 1 2,-2h4a2,2 0 0 1 2,2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>`;
    trashIcon.title = 'Delete note';

    stickyNote.appendChild(contentArea);
    stickyNote.appendChild(trashIcon);

    // Add click handlers
    stickyNote.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleStickyNote(stickyNote, highlight);
    });

    // Add trash icon click handler
    trashIcon.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await this.deleteStickyNote(stickyNote, highlight);
    });

    // Prevent note from interfering with highlight hover actions
    stickyNote.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
    });

    stickyNote.addEventListener('mouseleave', (e) => {
      e.stopPropagation();
    });

    // Ensure body has relative positioning for absolute children
    if (!document.body.style.position) {
      document.body.style.position = 'relative';
    }

    document.body.appendChild(stickyNote);
    return stickyNote;
  } */

  /**
   * OLD STICKY NOTE METHODS - COMMENTED OUT
   */
  /* toggleStickyNote(stickyNote, highlight) {
    const isCollapsed = stickyNote.classList.contains('collapsed');
    const contentArea = stickyNote.querySelector('.sticky-note-content');

    if (isCollapsed) {
      // Expand the sticky note
      stickyNote.classList.remove('collapsed');
      stickyNote.classList.add('expanded');
      contentArea.style.display = 'block';
      contentArea.focus();

      // Handle editing
      this.handleStickyNoteEditing(stickyNote, highlight, contentArea);
    } else {
      // Collapse the sticky note
      this.collapseStickyNote(stickyNote, highlight, contentArea);
    }
  }

  /**
   * Handle sticky note editing mode
   */
  handleStickyNoteEditing(stickyNote, highlight, contentArea) {
    stickyNote.classList.add('editing');

    // Save on blur or escape
    const saveNote = async () => {
      const newNote = contentArea.value.trim();
      if (newNote !== highlight.note) {
        highlight.note = newNote;
        await this.updateHighlight(highlight);
      }
      this.collapseStickyNote(stickyNote, highlight, contentArea);
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        saveNote();
      }
    };

    contentArea.addEventListener('blur', saveNote, { once: true });
    contentArea.addEventListener('keydown', keyHandler);
  }

  /**
   * Collapse sticky note to small state
   */
  collapseStickyNote(stickyNote, highlight, contentArea) {
    stickyNote.classList.remove('expanded', 'editing');
    stickyNote.classList.add('collapsed');
    contentArea.style.display = 'none';
  }

  /**
   * Delete sticky note and remove note from highlight
   */
  async deleteStickyNote(stickyNote, highlight) {
    try {
      // Remove the note from the highlight
      highlight.note = '';

      // Update the highlight in storage
      await this.updateHighlight(highlight);

      // Remove the sticky note from DOM
      stickyNote.remove();

      // Remove from tracking
      this.createdStickyNotes.delete(highlight.id);

      console.log('🗑️ Sticky note deleted for highlight:', highlight.id);
    } catch (error) {
      console.error('Error deleting sticky note:', error);
    }
  }

  /**
   * Open tags and category editor for a highlight
   */
  async openTagsEditor(highlight) {
    const modal = this.createTagsModal(highlight);
    document.body.appendChild(modal);

    return new Promise((resolve) => {
      const handleSave = async () => {
        const tagsInput = modal.querySelector('#tagsInput');
        const categorySelect = modal.querySelector('#categorySelect');
        const importanceSelect = modal.querySelector('#importanceSelect');

        // Update highlight
        const newTags = tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag);
        highlight.tags = newTags;
        highlight.category = categorySelect.value;
        highlight.importance = importanceSelect.value;

        await this.updateHighlight(highlight);
        modal.remove();
        resolve();
      };

      const handleCancel = () => {
        modal.remove();
        resolve();
      };

      modal.querySelector('#saveTagsBtn').addEventListener('click', handleSave);
      modal.querySelector('#cancelTagsBtn').addEventListener('click', handleCancel);
      modal.querySelector('.tags-modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) handleCancel();
      });
    });
  }

  /**
   * Create tags modal HTML
   */
  createTagsModal(highlight) {
    const modal = document.createElement('div');
    modal.className = 'tags-modal-overlay';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
    `;

    const currentTags = highlight.tags.join(', ');
    const predefinedCategories = ['General', 'Important', 'To Research', 'Quote', 'Definition', 'Question', 'Action Item'];
    const importanceLevels = ['low', 'medium', 'high'];

    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      ">
        <h3 style="margin: 0 0 20px 0; color: #333; font-size: 18px;">Manage Tags & Category</h3>

        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">Tags (comma-separated)</label>
          <input id="tagsInput" type="text" value="${this.escapeHtml(currentTags)}"
                 style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;"
                 placeholder="important, research, quote">
          <small style="color: #666; font-size: 12px;">Examples: important, research, quote, definition</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">Category</label>
          <select id="categorySelect" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
            ${predefinedCategories.map(cat =>
              `<option value="${cat}" ${cat === highlight.category ? 'selected' : ''}>${cat}</option>`
            ).join('')}
          </select>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #555;">Importance</label>
          <select id="importanceSelect" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
            ${importanceLevels.map(level =>
              `<option value="${level}" ${level === highlight.importance ? 'selected' : ''}>${level.charAt(0).toUpperCase() + level.slice(1)}</option>`
            ).join('')}
          </select>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="cancelTagsBtn" style="
            padding: 8px 16px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">Cancel</button>
          <button id="saveTagsBtn" style="
            padding: 8px 16px;
            border: none;
            background: #667eea;
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">Save</button>
        </div>
      </div>
    `;

    return modal;
  }

  /**
   * HTML escape utility
   */
  /**
   * Check if extension context is still valid
   */
  isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * OLD STICKY NOTE EDITOR - COMMENTED OUT (replaced by inline controls)
   */
  /* async openNoteEditor(highlight) {
    // Find existing sticky note
    let existingStickyNote = document.querySelector(`[data-highlight-id="${highlight.id}"].sticky-note`);

    if (existingStickyNote) {
      // If sticky note exists, expand it for editing
      if (existingStickyNote.classList.contains('collapsed')) {
        this.toggleStickyNote(existingStickyNote, highlight);
      }
    } else {
      // Create new sticky note
      const highlightElement = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
      if (highlightElement) {
        // Initialize empty note if doesn't exist
        if (!highlight.note) {
          highlight.note = '';
        }

        const stickyNote = this.createStickyNote(highlight, highlightElement);
        // Immediately expand for editing
        this.toggleStickyNote(stickyNote, highlight);
      }
    }
  } */

  /**
   * OLD STICKY NOTE CLEANUP - COMMENTED OUT
   */
  /* cleanupStickyNotes() {
    const existingStickyNotes = document.querySelectorAll('.sticky-note');
    existingStickyNotes.forEach(note => note.remove());
    this.createdStickyNotes.clear(); // Clear tracking set
  } */


  /**
   * Clean highlight text to remove any UI icons that might have been included
   */
  cleanHighlightText(text) {
    if (!text) return '';
    // Remove any icons that might have been accidentally included in highlights
    return text
      .replace(/🔊/g, '')  // Remove speaker icons
      .replace(/🗑️/g, '')  // Remove trash icons
      .replace(/✏️/g, '')  // Remove edit icons
      .replace(/🔗/g, '')  // Remove link icons
      .replace(/📝/g, '')  // Remove note icons
      .trim();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Text selection listener with improved detection
    document.addEventListener('mouseup', (e) => {
      // Ignore right-click (button 2) and middle-click (button 1)
      // Only respond to left-click (button 0)
      if (e.button !== 0) {
        return;
      }

      // Small delay to ensure selection is complete
      setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        // Only show popup for meaningful text selections
        if (selectedText.length > 0 && selectedText.length < 5000) {
          // Avoid showing popup in form inputs and textareas
          const activeElement = document.activeElement;
          if (activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true'
          )) {
            return;
          }

          this.showHighlightButton(e, selection);
        }
      }, 10);
    });

    // Global click handler to hide inline controls
    document.addEventListener('click', (e) => {
      // Don't hide if clicking on inline controls or highlighted text
      if (!e.target.closest('.highlight-inline-controls') &&
          !e.target.closest('.universal-highlight')) {
        this.hideAllInlineControls();
      }
    });

    // Also handle keyboard-based selections
    document.addEventListener('keyup', (e) => {
      // Trigger on Shift+Arrow keys (text selection)
      if (e.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const selection = window.getSelection();
        if (selection.toString().trim().length > 0) {
          // Create a synthetic mouse event for positioning
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          const syntheticEvent = {
            pageX: rect.left + rect.width / 2,
            pageY: rect.top + window.scrollY
          };
          this.showHighlightButton(syntheticEvent, selection);
        }
      }
    });

    // Hide highlight popup on click elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.highlight-popup-container') && !e.target.closest('.highlight-button')) {
        this.hideHighlightButton();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Escape key to hide inline controls
      if (e.key === 'Escape') {
        this.hideAllInlineControls();
      }

      if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
          case 'h':
            e.preventDefault();
            const selection = window.getSelection();
            if (selection.toString().trim()) {
              this.createHighlight(selection);
            }
            break;
        }
      }
    });

    // Note: Sticky notes use absolute positioning and stay in place automatically
  }

  /**
   * Show color palette popup near selection
   */
  showHighlightButton(event, selection) {
    this.hideHighlightButton();

    // Store current selection and range for later use
    this.currentSelection = selection;
    this.currentRange = selection.getRangeAt(0).cloneRange();

    // Create main container
    const container = document.createElement('div');
    container.className = 'highlight-popup-container';
    container.style.cssText = `
      position: absolute;
      top: ${event.pageY - 50}px;
      left: ${event.pageX - 60}px;
      z-index: 2147483647;
      user-select: none;
      animation: highlightPopupSlideIn 0.2s ease-out;
    `;

    // Blue circle button removed - directly use color palette only

    // Create color palette container
    const colorPalette = document.createElement('div');
    colorPalette.className = 'highlight-color-palette';
    colorPalette.style.cssText = `
      display: inline-flex;
      gap: 4px;
      background: #000000;
      border-radius: 20px;
      padding: 6px 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 1px solid #333;
    `;

    // Add color options
    this.colors.forEach((color, index) => {
      const colorButton = document.createElement('button');
      colorButton.className = 'highlight-color-option';
      colorButton.style.cssText = `
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid ${color === this.defaultColor ? '#fff' : 'transparent'};
        background-color: ${color};
        margin: 0;
        padding: 0;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      `;
      colorButton.title = `Highlight with ${this.getColorName(color)}`;

      // Add hover effects
      colorButton.addEventListener('mouseenter', () => {
        colorButton.style.transform = 'scale(1.15)';
        colorButton.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
        colorButton.style.borderColor = '#fff';
      });

      colorButton.addEventListener('mouseleave', () => {
        colorButton.style.transform = 'scale(1)';
        colorButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
        colorButton.style.borderColor = color === this.defaultColor ? '#fff' : 'transparent';
      });

      // Handle color selection
      colorButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          console.log('=== COLOR BUTTON CLICKED ===');
          console.log('Selected color:', color);
          console.log('Color type:', typeof color);
          console.log('Available colors:', this.colors);
          console.log('Default color:', this.defaultColor);

          // Use the stored range directly
          const range = this.currentRange;
          console.log('Using stored range:', range.toString());

          // Create new selection object with the stored range
          const newSelection = {
            toString: () => range.toString(),
            getRangeAt: (index) => {
              if (index === 0) return range;
              throw new Error('Invalid range index');
            },
            rangeCount: 1,
            removeAllRanges: () => {
              // Clear the actual selection
              if (this.currentSelection) {
                this.currentSelection.removeAllRanges();
              }
            }
          };

          console.log('Calling createHighlight with options:', { color: color });
          await this.createHighlight(newSelection, { color: color });
          this.hideHighlightButton();
        } catch (error) {
          console.error('Error creating highlight with color:', color, error);
        }
      });

      colorPalette.appendChild(colorButton);
    });

    // Assemble the popup (only color palette, no blue button)
    container.appendChild(colorPalette);
    document.body.appendChild(container);

    // Position adjustment to keep popup in viewport
    this.adjustPopupPosition(container);
  }

  /**
   * Get human-readable color names
   */
  getColorName(color) {
    const colorNames = {
      '#ffff00': 'Yellow',
      '#ff6b6b': 'Red',
      '#4ecdc4': 'Teal',
      '#96ceb4': 'Green',
      '#ffc107': 'Orange',
      '#e91e63': 'Pink',
      '#9c27b0': 'Purple'
    };
    return colorNames[color] || 'Custom';
  }

  /**
   * Adjust popup position to stay within viewport
   */
  adjustPopupPosition(container) {
    const rect = container.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    // Adjust horizontal position
    if (rect.right > viewport.width) {
      container.style.left = (viewport.width - rect.width - 20) + 'px';
    }
    if (rect.left < 0) {
      container.style.left = '20px';
    }

    // Adjust vertical position
    if (rect.top < 0) {
      container.style.top = '20px';
    }
    if (rect.bottom > viewport.height) {
      container.style.top = (viewport.height - rect.height - 20) + 'px';
    }
  }

  /**
   * Hide highlight popup
   */
  hideHighlightButton() {
    document.querySelectorAll('.highlight-popup-container').forEach(container => container.remove());
    document.querySelectorAll('.highlight-button').forEach(btn => btn.remove());
    this.currentSelection = null;
    this.currentRange = null;
  }

  /**
   * Utility methods for DOM manipulation
   */
  getXPath(node) {
    if (node.nodeType === Node.ATTRIBUTE_NODE) {
      return this.getXPath(node.ownerElement) + '/@' + node.nodeName;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return this.getXPath(node.parentNode) + '/text()[' + (Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1) + ']';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    
    let ix = 0;
    const siblings = node.parentNode ? node.parentNode.childNodes : [];
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === node) {
        return this.getXPath(node.parentNode) + '/' + node.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      }
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === node.tagName) {
        ix++;
      }
    }
    return '';
  }

  getElementByXPath(xpath) {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  recreateRangeFromPosition(position) {
    try {
      const startNode = this.getElementByXPath(position.startXPath);
      const endNode = this.getElementByXPath(position.endXPath);
      
      if (!startNode || !endNode) {
        return null;
      }
      
      const range = document.createRange();
      range.setStart(startNode, position.startOffset);
      range.setEnd(endNode, position.endOffset);
      
      // Verify the text matches
      if (range.toString() === position.textContent) {
        return range;
      }
    } catch (error) {
      console.warn('XPath-based range recreation failed:', error);
    }
    
    return null;
  }

  getContextBefore(range, length) {
    try {
      const startContainer = range.startContainer;
      const text = startContainer.textContent || '';
      const beforeText = text.substring(0, range.startOffset);
      return beforeText.slice(-length);
    } catch {
      return '';
    }
  }

  getContextAfter(range, length) {
    try {
      const endContainer = range.endContainer;
      const text = endContainer.textContent || '';
      const afterText = text.substring(range.endOffset);
      return afterText.slice(0, length);
    } catch {
      return '';
    }
  }

  /**
   * Export highlights for current page or all pages
   */
  async exportHighlights(format = 'json', scope = 'current') {
    try {
      let highlights = [];
      
      if (scope === 'current') {
        highlights = Array.from(this.highlights.values());
      } else {
        highlights = await this.searchHighlights('');
      }
      
      switch (format) {
        case 'json':
          return JSON.stringify(highlights, null, 2);
        case 'html':
          return this.exportToHTML(highlights);
        case 'markdown':
          return this.exportToMarkdown(highlights);
        default:
          throw new Error('Unsupported export format');
      }
    } catch (error) {
      console.error('Error exporting highlights:', error);
      throw error;
    }
  }

  exportToHTML(highlights) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>My Web Highlights</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    .highlight { margin: 20px 0; padding: 15px; border-left: 4px solid #4285f4; background: #f8f9fa; }
    .highlight-text { background: #ffff00; padding: 2px 4px; border-radius: 2px; }
    .meta { color: #666; font-size: 14px; margin-top: 10px; }
  </style>
</head>
<body>
  <h1>My Web Highlights</h1>
  ${highlights.map(h => `
    <div class="highlight">
      <div class="highlight-text">${h.text}</div>
      ${h.note ? `<div><strong>Note:</strong> ${h.note}</div>` : ''}
      <div class="meta">
        <strong>From:</strong> <a href="${h.url}">${h.title || h.url}</a><br>
        <strong>Date:</strong> ${new Date(h.timestamp).toLocaleDateString()}
        ${h.tags.length ? `<br><strong>Tags:</strong> ${h.tags.join(', ')}` : ''}
      </div>
    </div>
  `).join('')}
</body>
</html>`;
    return html;
  }

  exportToMarkdown(highlights) {
    return `# My Web Highlights

${highlights.map(h => `
## ${h.title || 'Untitled'}

> ${h.text}

${h.note ? `**Note:** ${h.note}\n` : ''}
**Source:** [${h.title || h.url}](${h.url})
**Date:** ${new Date(h.timestamp).toLocaleDateString()}
${h.tags.length ? `**Tags:** ${h.tags.join(', ')}` : ''}

---
`).join('')}
`;
  }

  /**
   * Show inline controls for a highlighted element
   */
  showInlineControls(highlight, highlightElement, event) {
    // Create the inline controls container
    const controls = document.createElement('div');
    controls.className = 'highlight-inline-controls visible';
    controls.dataset.highlightId = highlight.id;

    // Create top section with color picker and action buttons
    const topSection = document.createElement('div');
    topSection.className = 'highlight-controls-top';

    // Color picker
    const colorPicker = document.createElement('div');
    colorPicker.className = 'highlight-color-picker';

    this.colors.forEach(color => {
      const colorOption = document.createElement('div');
      colorOption.className = 'highlight-color-option-inline';
      if (color === highlight.color) {
        colorOption.classList.add('selected');
      }
      colorOption.style.backgroundColor = color;
      colorOption.title = this.getColorName(color);

      colorOption.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.changeHighlightColorInline(highlight, color, highlightElement);
        // Update selected state
        controls.querySelectorAll('.highlight-color-option-inline').forEach(opt =>
          opt.classList.remove('selected'));
        colorOption.classList.add('selected');
      });

      colorPicker.appendChild(colorOption);
    });

    // Action buttons
    const listenBtn = document.createElement('div');
    listenBtn.className = 'highlight-action-btn listen';
    listenBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
    `;
    listenBtn.title = 'Listen to highlight';
    listenBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleTTSClick(highlight, listenBtn);
    });

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'highlight-action-btn delete';
    deleteBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18"></path>
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
      </svg>
    `;
    deleteBtn.title = 'Delete highlight';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.removeHighlight(highlight.id);
      this.hideAllInlineControls();
    });

    topSection.appendChild(colorPicker);
    topSection.appendChild(listenBtn);
    topSection.appendChild(deleteBtn);

    // Create bottom section with tags and note inputs
    const bottomSection = document.createElement('div');
    bottomSection.className = 'highlight-controls-bottom';

    // Tags section
    const tagsSection = document.createElement('div');
    tagsSection.className = 'highlight-tags-section';

    const tagsLabel = document.createElement('div');
    tagsLabel.className = 'highlight-tags-label';
    tagsLabel.textContent = 'Tags';

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'highlight-tags-container';

    // Tags chips display
    const tagsChips = document.createElement('div');
    tagsChips.className = 'highlight-tags-chips';

    const tagsInput = document.createElement('input');
    tagsInput.className = 'highlight-tags-input';
    tagsInput.type = 'text';
    tagsInput.placeholder = 'Type tag and press Enter to add';

    // Function to create a tag chip
    const createTagChip = (tagText) => {
      const chip = document.createElement('div');
      chip.className = 'highlight-tag-chip';

      const tagSpan = document.createElement('span');
      tagSpan.textContent = tagText;

      const removeBtn = document.createElement('span');
      removeBtn.className = 'highlight-tag-chip-remove';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'Remove tag';

      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Remove from highlight tags array
        highlight.tags = highlight.tags.filter(tag => tag !== tagText);
        await this.updateHighlight(highlight);
        // Remove from UI
        chip.remove();
      });

      chip.appendChild(tagSpan);
      chip.appendChild(removeBtn);
      return chip;
    };

    // Function to render all tag chips
    const renderTagChips = () => {
      tagsChips.innerHTML = '';
      highlight.tags.forEach(tag => {
        if (tag.trim()) {
          tagsChips.appendChild(createTagChip(tag));
        }
      });
    };

    // Initial render
    renderTagChips();

    // Handle adding new tags
    tagsInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const newTag = tagsInput.value.trim();
        if (newTag && !highlight.tags.includes(newTag)) {
          highlight.tags.push(newTag);
          await this.updateHighlight(highlight);
          renderTagChips();
          tagsInput.value = '';
        }
      }
    });

    tagsContainer.appendChild(tagsChips);
    tagsContainer.appendChild(tagsInput);
    tagsSection.appendChild(tagsLabel);
    tagsSection.appendChild(tagsContainer);

    // Note section
    const noteSection = document.createElement('div');
    noteSection.className = 'highlight-note-section';

    const noteLabel = document.createElement('div');
    noteLabel.className = 'highlight-note-label';
    noteLabel.textContent = 'Note';

    const noteTextarea = document.createElement('textarea');
    noteTextarea.className = 'highlight-note-textarea';
    noteTextarea.placeholder = 'Add a note...';
    noteTextarea.value = highlight.note || '';

    noteTextarea.addEventListener('blur', async () => {
      const newNote = noteTextarea.value.trim();
      if (newNote !== highlight.note) {
        highlight.note = newNote;
        await this.updateHighlight(highlight);

        // Notes are now handled directly in the inline controls
        // No need for separate sticky notes
      }
    });

    noteTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        noteTextarea.blur();
        this.hideAllInlineControls();
      }
    });

    noteSection.appendChild(noteLabel);
    noteSection.appendChild(noteTextarea);

    bottomSection.appendChild(tagsSection);
    bottomSection.appendChild(noteSection);

    // Assemble the controls
    controls.appendChild(topSection);
    controls.appendChild(bottomSection);

    // Position the controls
    this.positionInlineControls(controls, highlightElement, event);

    // Add to document
    document.body.appendChild(controls);

    // Focus the note textarea for immediate editing
    setTimeout(() => noteTextarea.focus(), 100);
  }

  /**
   * Position inline controls directly below the click location
   */
  positionInlineControls(controls, highlightElement, clickEvent) {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    const controlsWidth = 180; // From CSS min-width
    const controlsHeight = 180; // Estimated height
    const gap = 5; // Small one-line gap

    let clickX, clickY;

    // Use click coordinates if available
    if (clickEvent && clickEvent.clientX !== undefined && clickEvent.clientY !== undefined) {
      clickX = clickEvent.clientX;
      clickY = clickEvent.clientY;
    } else {
      // Fallback to element position
      const rect = highlightElement.getBoundingClientRect();
      clickX = rect.left + (rect.width / 2);
      clickY = rect.bottom;
    }

    // Position directly below the click point (one line space)
    let left = clickX + scrollLeft - (controlsWidth / 2); // Center horizontally on click
    let top = clickY + scrollTop + gap; // Just below the click with small gap

    // Check if there's enough space below
    if (clickY + controlsHeight + gap > window.innerHeight) {
      // Position above the click instead
      top = clickY + scrollTop - controlsHeight - gap;
    }

    // Adjust horizontal position to stay within viewport
    const viewportWidth = window.innerWidth;
    const margin = 10;

    if (left + controlsWidth > viewportWidth - margin) {
      left = viewportWidth - controlsWidth - margin;
    }

    if (left < margin) {
      left = margin;
    }

    controls.style.left = `${left}px`;
    controls.style.top = `${top}px`;
  }

  /**
   * Hide all inline controls
   */
  hideAllInlineControls() {
    // Remove controls
    const existingControls = document.querySelectorAll('.highlight-inline-controls');
    existingControls.forEach(control => control.remove());
  }

  /**
   * Change highlight color inline
   */
  async changeHighlightColorInline(highlight, newColor, highlightElement) {
    highlight.color = newColor;
    await this.updateHighlight(highlight);

    // Update the visual color immediately
    highlightElement.style.setProperty('background-color', newColor, 'important');
  }

  /**
   * Handle TTS button click in inline controls
   */
  async handleTTSClick(highlight, ttsBtn) {
    try {
      // Initialize TTS service if not already available
      if (!window.ttsService) {
        window.ttsService = new TTSService();
      }

      const status = window.ttsService.getStatus();

      // If currently playing this highlight, stop it
      if (status.currentHighlightId === highlight.id && (status.isPlaying || status.isPaused)) {
        console.log('🛑 Stopping TTS for highlight:', highlight.id);
        window.ttsService.stop();
        ttsBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        `;
        ttsBtn.title = 'Listen to highlight';
        return;
      }

      // If playing different highlight, stop it first
      if (status.isPlaying || status.isPaused) {
        window.ttsService.stop();
      }

      // Start playing this highlight
      const text = highlight.text;
      console.log('🔊 Playing TTS for highlight:', text);

      // Update button to show stop state
      ttsBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      `;
      ttsBtn.title = 'Stop speech';

      // Set up event handlers to reset button when speech ends
      const originalOnEnd = window.ttsService.onEnd.bind(window.ttsService);
      const originalOnError = window.ttsService.onError.bind(window.ttsService);

      window.ttsService.onEnd = (highlightId) => {
        originalOnEnd(highlightId);
        if (highlightId === highlight.id) {
          ttsBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          `;
          ttsBtn.title = 'Listen to highlight';
        }
      };

      window.ttsService.onError = (error, highlightId) => {
        originalOnError(error, highlightId);
        if (highlightId === highlight.id) {
          ttsBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          `;
          ttsBtn.title = 'Listen to highlight';
        }
      };

      // Play the text with the highlight ID for visual feedback
      window.ttsService.speak(text, highlight.id);
    } catch (error) {
      console.error('Error playing TTS:', error);
    }
  }
}

// Export for use in other files
if (typeof window !== 'undefined') {
  window.HighlighterService = HighlighterService;
}