/**
 * Plugin Interfaces
 *
 * Every plugin category has a well-defined contract.
 * Implement the interface for your category and register it.
 * Agents use these interfaces — they never depend on concrete implementations.
 */

'use strict';

// ─── Storage Plugin ──────────────────────────────────────────────────────────

class IStoragePlugin {
  static get metadata() {
    return {
      id: 'base-storage',
      name: 'Storage Plugin',
      version: '1.0.0',
      category: 'storage',
      description: 'Base interface for storage plugins',
      auth: null,          // null = no auth required, 'oauth2' | 'apikey' | 'custom'
      configFields: [],    // UI fields needed during setup
      isBuiltIn: false,
      supportsOffline: false
    };
  }

  /** Save an array of highlights for a domain key */
  async save(domainKey, highlights) {
    throw new Error(`${this.constructor.name} must implement save()`);
  }

  /** Load all highlights for a domain key — returns [] if none */
  async load(domainKey) {
    throw new Error(`${this.constructor.name} must implement load()`);
  }

  /** Delete a specific highlight by ID across all domains */
  async delete(highlightId, domainKey) {
    throw new Error(`${this.constructor.name} must implement delete()`);
  }

  /** List all domain keys that have highlights */
  async listDomains() {
    throw new Error(`${this.constructor.name} must implement listDomains()`);
  }

  /** Load ALL highlights across all domains */
  async loadAll() {
    const domains = await this.listDomains();
    const all = [];
    for (const domain of domains) {
      const highlights = await this.load(domain);
      all.push(...(highlights || []));
    }
    return all;
  }

  /** Returns current sync status */
  async getSyncStatus() {
    return {
      connected: false,
      lastSync: null,
      queueLength: 0,
      error: null
    };
  }

  /** Called once when plugin is first enabled — set up auth, folders, etc. */
  async onEnable(config) {}

  /** Called when plugin is disabled */
  async onDisable() {}
}


// ─── LLM Plugin ──────────────────────────────────────────────────────────────

class ILLMPlugin {
  static get metadata() {
    return {
      id: 'base-llm',
      name: 'LLM Plugin',
      version: '1.0.0',
      category: 'ai',
      description: 'Base interface for AI/LLM plugins',
      capabilities: [],    // 'summary' | 'qa' | 'concepts' | 'classify' | 'embed'
      requiresNetwork: true,
      isLocal: false,      // true = runs on user's machine (Ollama, etc.)
      configFields: [],
      pricing: null        // null = free, or { per1kInputTokens, per1kOutputTokens }
    };
  }

  /**
   * Generate a summary from an array of highlights.
   * Returns { summary, provider, isFallback }
   */
  async generateSummary(highlights, pageTitle = '', options = {}) {
    throw new Error(`${this.constructor.name} must implement generateSummary()`);
  }

  /**
   * Answer a question given context from highlights.
   * Returns { answer, confidence, sources }
   */
  async answerQuestion(question, highlights, options = {}) {
    throw new Error(`${this.constructor.name} must implement answerQuestion()`);
  }

  /**
   * Extract key concepts from text.
   * Returns string[]
   */
  async extractConcepts(text, options = {}) {
    throw new Error(`${this.constructor.name} must implement extractConcepts()`);
  }

  /**
   * Classify a highlight into one of the semantic types.
   * Returns 'definition' | 'evidence' | 'question' | 'action' | 'key' | 'default'
   */
  async classifyHighlight(highlightText, options = {}) {
    throw new Error(`${this.constructor.name} must implement classifyHighlight()`);
  }

  /** Check if this plugin is reachable (health check) */
  async isAvailable() {
    return false;
  }

  /** Called once when plugin is first enabled */
  async onEnable(config) {}

  async onDisable() {}
}


// ─── Tool Plugin ─────────────────────────────────────────────────────────────

class IToolPlugin {
  static get metadata() {
    return {
      id: 'base-tool',
      name: 'Tool Plugin',
      version: '1.0.0',
      category: 'tool',
      description: 'Base interface for tool/action plugins',
      actions: [],         // list of actions this tool exposes
      requiresAuth: false,
      configFields: []
    };
  }

  /**
   * Execute an action.
   * @param {string} action - The action name from metadata.actions
   * @param {object} args   - Action-specific arguments
   * Returns { success, result, error? }
   */
  async call(action, args) {
    throw new Error(`${this.constructor.name} must implement call()`);
  }

  /**
   * Returns the JSON schema describing all callable actions.
   * Used by agents to understand what this tool can do.
   */
  describe() {
    throw new Error(`${this.constructor.name} must implement describe()`);
  }

  /** Validate args before calling */
  validate(action, args) {
    return { valid: true, errors: [] };
  }

  async onEnable(config) {}
  async onDisable() {}
}


// ─── Export ───────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IStoragePlugin, ILLMPlugin, IToolPlugin };
} else {
  window.PluginInterfaces = { IStoragePlugin, ILLMPlugin, IToolPlugin };
}
