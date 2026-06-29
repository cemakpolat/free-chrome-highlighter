// interfaces.js - SOLID: Interface Segregation Principle
// Each interface has a single responsibility

/**
 * Core Highlight Data Structure
 */
class Highlight {
  constructor(data) {
    console.log('=== HIGHLIGHT CONSTRUCTOR ===');
    console.log('Data received:', data);
    console.log('data.color received:', data.color);
    console.log('data.color type:', typeof data.color);

    this.id = data.id || this.generateId();
    this.text = data.text;
    this.url = data.url;
    this.title = data.title || '';
    this.timestamp = data.timestamp || new Date().toISOString();
    this.position = data.position; // {start: number, end: number, xpath: string}
    this.color = data.color || '#ffff00';
    this.note = data.note || '';
    this.tags = data.tags || [];
    this.category = data.category || 'General';
    this.isPrivate = data.isPrivate || false;
    this.importance = data.importance || 'medium'; // low, medium, high
    this.reviewCount = data.reviewCount || 0;
    this.lastReviewed = data.lastReviewed || null;
    this.nextReview = data.nextReview || null;

    // Auto-detect highlight type from text patterns
    this.type = data.type || this.detectType(this.text);
    this.isLost = data.isLost || false;
    this.lastAttemptedRestore = data.lastAttemptedRestore || null;

    console.log('Final color assigned:', this.color);
    console.log('Detected type:', this.type);
    console.log('=== HIGHLIGHT CONSTRUCTOR COMPLETE ===');
  }

  /**
   * Auto-detect highlight type from text patterns
   */
  detectType(text) {
    if (!text) return 'default';

    const patterns = {
      definition: /\b(is|are|means?|defined as|refers to|known as|called|represents?)\b/i,
      evidence: /\b(shows?|proves?|demonstrates?|evidence|fact|data|study|research|found|shows?|indicates?|reveals?)\b/i,
      question: /\b(why|how|what|when|where|which|does|is|are|can|will|should)\?|question|wondering|unclear|confused|ask/i,
      action: /\b(TODO|FIXME|must|should|need to|required|important|urgent|action|do|must|implement|fix|update|change)\b/i,
      key: /\b(key|crucial|critical|essential|important|main|primary|fundamental|major|significant|breakthrough|discovery)\b/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return type;
      }
    }

    return 'default';
  }

  generateId() {
    return `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      id: this.id,
      text: this.text,
      url: this.url,
      title: this.title,
      timestamp: this.timestamp,
      position: this.position,
      color: this.color,
      note: this.note,
      tags: this.tags,
      category: this.category,
      isPrivate: this.isPrivate,
      importance: this.importance,
      reviewCount: this.reviewCount,
      lastReviewed: this.lastReviewed,
      nextReview: this.nextReview,
      type: this.type,
      isLost: this.isLost,
      lastAttemptedRestore: this.lastAttemptedRestore
    };
  }

  static fromJSON(data) {
    return new Highlight(data);
  }

  // Tag management methods
  addTag(tag) {
    const cleanTag = tag.trim().toLowerCase();
    if (cleanTag && !this.tags.includes(cleanTag)) {
      this.tags.push(cleanTag);
    }
  }

  removeTag(tag) {
    this.tags = this.tags.filter(t => t !== tag.trim().toLowerCase());
  }

  hasTag(tag) {
    return this.tags.includes(tag.trim().toLowerCase());
  }

  // Review system methods
  markReviewed() {
    this.reviewCount++;
    this.lastReviewed = new Date().toISOString();
    this.calculateNextReview();
  }

  calculateNextReview() {
    // Simple spaced repetition algorithm
    const intervals = [1, 3, 7, 14, 30, 90]; // days
    const intervalIndex = Math.min(this.reviewCount, intervals.length - 1);
    const nextInterval = intervals[intervalIndex];

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + nextInterval);
    this.nextReview = nextDate.toISOString();
  }

  isDueForReview() {
    if (!this.nextReview) return true;
    return new Date() >= new Date(this.nextReview);
  }
}

/**
 * Storage Interface - Abstract storage operations
 */
class IStorageProvider {
  async save(key, data) {
    throw new Error('Method must be implemented');
  }

  async load(key) {
    throw new Error('Method must be implemented');
  }

  async delete(key) {
    throw new Error('Method must be implemented');
  }

  async list() {
    throw new Error('Method must be implemented');
  }
}

/**
 * Highlighter Interface - Abstract highlighting operations
 */
class IHighlighter {
  async createHighlight(selection, options) {
    throw new Error('Method must be implemented');
  }

  async removeHighlight(highlightId) {
    throw new Error('Method must be implemented');
  }

  async loadHighlights(url) {
    throw new Error('Method must be implemented');
  }

  async searchHighlights(query) {
    throw new Error('Method must be implemented');
  }
}

/**
 * Sync Interface - Abstract synchronization operations
 */
class ISyncProvider {
  async authenticate() {
    throw new Error('Method must be implemented');
  }

  async syncUp(highlights) {
    throw new Error('Method must be implemented');
  }

  async syncDown() {
    throw new Error('Method must be implemented');
  }

  async getLastSyncTime() {
    throw new Error('Method must be implemented');
  }
}

/**
 * Event System for Communication
 */
class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(data));
    }
  }

  off(event, callback) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
  }
}

// Export for use in other files
if (typeof window !== 'undefined') {
  window.HighlighterInterfaces = {
    Highlight,
    IStorageProvider,
    IHighlighter,
    ISyncProvider,
    EventEmitter
  };
}