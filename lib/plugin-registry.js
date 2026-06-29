/**
 * Plugin Registry
 *
 * Single source of truth for all registered plugins.
 * Agents and features go through the registry — never directly import a plugin.
 *
 * Usage:
 *   const registry = PluginRegistry.getInstance();
 *   registry.register('storage', 'google-drive', new GoogleDrivePlugin());
 *   const plugin = registry.get('storage', 'google-drive');
 *   const active  = registry.getActive('storage');
 */

'use strict';

class PluginRegistry {
  constructor() {
    // Map<category, Map<id, plugin>>
    this._plugins = {
      storage: new Map(),
      ai: new Map(),
      tool: new Map()
    };

    // Active plugin IDs per category (user-selected)
    this._active = {
      storage: 'local',
      ai: 'extractive',
      tool: null
    };

    this._listeners = [];
  }

  static getInstance() {
    if (!PluginRegistry._instance) {
      PluginRegistry._instance = new PluginRegistry();
    }
    return PluginRegistry._instance;
  }

  // ─── Registration ────────────────────────────────────────────────────────

  register(category, id, instance) {
    if (!this._plugins[category]) {
      throw new Error(`Unknown plugin category: "${category}". Valid: storage, ai, tool`);
    }
    this._plugins[category].set(id, instance);
    this._emit('registered', { category, id });
    console.log(`[PluginRegistry] Registered ${category}:${id}`);
  }

  unregister(category, id) {
    const removed = this._plugins[category]?.delete(id);
    if (removed) {
      this._emit('unregistered', { category, id });
      if (this._active[category] === id) {
        this._active[category] = this._defaultFor(category);
      }
    }
    return removed;
  }

  // ─── Access ───────────────────────────────────────────────────────────────

  get(category, id) {
    const plugin = this._plugins[category]?.get(id);
    if (!plugin) throw new Error(`Plugin not found: ${category}:${id}`);
    return plugin;
  }

  getActive(category) {
    const id = this._active[category];
    if (!id) return null;
    return this._plugins[category]?.get(id) || null;
  }

  has(category, id) {
    return this._plugins[category]?.has(id) ?? false;
  }

  list(category) {
    if (!this._plugins[category]) return [];
    return Array.from(this._plugins[category].entries()).map(([id, plugin]) => ({
      id,
      plugin,
      metadata: plugin.constructor.metadata || {},
      isActive: this._active[category] === id
    }));
  }

  listAll() {
    return {
      storage: this.list('storage'),
      ai: this.list('ai'),
      tool: this.list('tool')
    };
  }

  // ─── Active Plugin Selection ──────────────────────────────────────────────

  async setActive(category, id) {
    if (!this.has(category, id)) {
      throw new Error(`Cannot activate unknown plugin: ${category}:${id}`);
    }

    const prev = this._active[category];
    this._active[category] = id;

    await this._persistActiveSelections();
    this._emit('activeChanged', { category, id, prev });
    console.log(`[PluginRegistry] Active ${category} → ${id}`);
  }

  async loadActiveSelections() {
    try {
      const stored = await chrome.storage.local.get('plugin_active_selections');
      if (stored.plugin_active_selections) {
        Object.assign(this._active, stored.plugin_active_selections);
        console.log('[PluginRegistry] Loaded active selections:', this._active);
      }
    } catch (e) {
      console.warn('[PluginRegistry] Could not load active selections:', e.message);
    }
  }

  async _persistActiveSelections() {
    try {
      await chrome.storage.local.set({ plugin_active_selections: this._active });
    } catch (e) {
      console.warn('[PluginRegistry] Could not persist active selections:', e.message);
    }
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  on(event, listener) {
    this._listeners.push({ event, listener });
    return () => this._listeners = this._listeners.filter(l => l.listener !== listener);
  }

  _emit(event, data) {
    this._listeners
      .filter(l => l.event === event || l.event === '*')
      .forEach(l => { try { l.listener(data); } catch (e) { } });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _defaultFor(category) {
    const defaults = { storage: 'local', ai: 'extractive', tool: null };
    return defaults[category] || null;
  }

  // Summary for UI display
  getSummary() {
    const counts = {};
    for (const cat of ['storage', 'ai', 'tool']) {
      counts[cat] = this._plugins[cat].size;
    }
    return { active: { ...this._active }, counts };
  }
}

PluginRegistry._instance = null;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PluginRegistry };
} else {
  window.PluginRegistry = PluginRegistry;
}
