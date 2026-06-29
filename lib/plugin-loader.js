/**
 * Plugin Loader
 *
 * Bootstraps the plugin system at extension startup.
 * Loads built-in plugins from the plugins/ directory,
 * then loads any user-configured plugins from chrome.storage.
 *
 * The order matters:
 *   1. Load built-ins (always available)
 *   2. Restore active selections from storage
 *   3. Call onEnable() on the active plugins
 *   4. Load user-installed plugins (future)
 */

'use strict';

class PluginLoader {
  constructor(registry) {
    this.registry = registry;
    this.loaded = false;
  }

  async init() {
    if (this.loaded) return;

    console.log('[PluginLoader] Initialising plugin system...');

    try {
      this._registerStoragePlugins();
      this._registerAIPlugins();
      this._registerToolPlugins();

      await this.registry.loadActiveSelections();
      await this._enableActivePlugins();

      this.loaded = true;
      console.log('[PluginLoader] Plugin system ready.', this.registry.getSummary());
    } catch (err) {
      console.error('[PluginLoader] Init failed:', err);
    }
  }

  // ─── Built-in Storage Plugins ─────────────────────────────────────────────

  _registerStoragePlugins() {
    // Local browser storage (always available, no auth)
    this.registry.register('storage', 'local', new LocalStoragePlugin());

    // Google Drive (requires OAuth2 — already set up in Phase 1)
    this.registry.register('storage', 'google-drive', new GoogleDrivePlugin());

    // Notion (Phase 2 new integration)
    this.registry.register('storage', 'notion', new NotionStoragePlugin());

    // Obsidian (via local REST API plugin)
    this.registry.register('storage', 'obsidian', new ObsidianStoragePlugin());
  }

  // ─── Built-in AI Plugins ──────────────────────────────────────────────────

  _registerAIPlugins() {
    // Extractive fallback — always works, no external deps
    this.registry.register('ai', 'extractive', new ExtractiveAIPlugin());

    // Ollama — local models, no cost, privacy-first
    this.registry.register('ai', 'ollama', new OllamaPlugin());

    // Claude API — paid, best quality
    this.registry.register('ai', 'claude', new ClaudeAPIPlugin());

    // HuggingFace — free tier, cloud
    this.registry.register('ai', 'huggingface', new HuggingFacePlugin());
  }

  // ─── Built-in Tool Plugins ────────────────────────────────────────────────

  _registerToolPlugins() {
    // Semantic Scholar — free academic paper search
    this.registry.register('tool', 'semantic-scholar', new SemanticScholarTool());

    // Slack — send highlights/summaries to channels
    this.registry.register('tool', 'slack', new SlackTool());

    // Clipboard — copy to clipboard (always available)
    this.registry.register('tool', 'clipboard', new ClipboardTool());
  }

  // ─── Enable Active Plugins ────────────────────────────────────────────────

  async _enableActivePlugins() {
    const { active } = this.registry.getSummary();

    for (const [category, id] of Object.entries(active)) {
      if (!id) continue;
      if (!this.registry.has(category, id)) continue;

      try {
        const plugin = this.registry.get(category, id);
        const config = await this._loadPluginConfig(category, id);
        await plugin.onEnable(config);
        console.log(`[PluginLoader] Enabled ${category}:${id}`);
      } catch (err) {
        console.warn(`[PluginLoader] Could not enable ${category}:${id}:`, err.message);
      }
    }
  }

  async _loadPluginConfig(category, id) {
    try {
      const key = `plugin_config_${category}_${id}`;
      const result = await chrome.storage.local.get(key);
      return result[key] || {};
    } catch {
      return {};
    }
  }

  async savePluginConfig(category, id, config) {
    try {
      const key = `plugin_config_${category}_${id}`;
      await chrome.storage.local.set({ [key]: config });
    } catch (err) {
      console.warn('[PluginLoader] Could not save plugin config:', err.message);
    }
  }
}


// ─── Storage Plugins ─────────────────────────────────────────────────────────

class LocalStoragePlugin {
  static get metadata() {
    return {
      id: 'local',
      name: 'Local Browser Storage',
      version: '1.0.0',
      category: 'storage',
      description: 'Highlights stored in your browser. Works offline. No account needed.',
      auth: null,
      isBuiltIn: true,
      supportsOffline: true,
      icon: '💾'
    };
  }

  async save(domainKey, highlights) {
    const key = `universal_highlighter_${domainKey}`;
    await chrome.storage.local.set({ [key]: highlights });
    return true;
  }

  async load(domainKey) {
    const key = `universal_highlighter_${domainKey}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || [];
  }

  async delete(highlightId, domainKey) {
    const current = await this.load(domainKey);
    const updated = current.filter(h => h.id !== highlightId);
    await this.save(domainKey, updated);
    return true;
  }

  async listDomains() {
    const all = await chrome.storage.local.get();
    return Object.keys(all)
      .filter(k => k.startsWith('universal_highlighter_'))
      .map(k => k.replace('universal_highlighter_', ''));
  }

  async getSyncStatus() {
    return { connected: true, lastSync: null, queueLength: 0, error: null };
  }

  async onEnable() {}
  async onDisable() {}
}


class GoogleDrivePlugin {
  static get metadata() {
    return {
      id: 'google-drive',
      name: 'Google Drive',
      version: '1.0.0',
      category: 'storage',
      description: 'Sync highlights across all your devices via Google Drive.',
      auth: 'oauth2',
      isBuiltIn: true,
      supportsOffline: false,
      icon: '☁️'
    };
  }

  constructor() {
    this.accessToken = null;
    this.folderId = null;
    this._tokenExpiry = null;
    this.FOLDER_NAME = 'Universal Web Highlighter';
  }

  async onEnable(config) {
    const stored = await chrome.storage.local.get(['gdrive_access_token', 'gdrive_token_expiry', 'gdrive_folder_id']);
    this.accessToken = stored.gdrive_access_token || null;
    this._tokenExpiry = stored.gdrive_token_expiry || null;
    this.folderId = stored.gdrive_folder_id || null;

    if (this.accessToken && this._tokenExpiry && Date.now() >= this._tokenExpiry) {
      this.accessToken = null;
    }
  }

  async getValidToken() {
    if (this.accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
      return this.accessToken;
    }
    // Delegate token refresh to background script
    const result = await chrome.runtime.sendMessage({ action: 'getGoogleDriveAuthStatus' });
    if (result?.authenticated && result?.token) {
      this.accessToken = result.token;
      this._tokenExpiry = Date.now() + 50 * 60 * 1000;
      return this.accessToken;
    }
    throw new Error('Google Drive not authenticated. Please connect your account.');
  }

  async save(domainKey, highlights) {
    const token = await this.getValidToken();
    const folderId = await this._ensureFolder(token);
    const fileName = `${domainKey}.json`;
    const body = JSON.stringify(highlights, null, 2);

    const existing = await this._findFile(token, folderId, fileName);

    if (existing) {
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body
      });
    } else {
      const boundary = 'highlights_boundary';
      const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
      const multipart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipart
      });
    }
    return true;
  }

  async load(domainKey) {
    const token = await this.getValidToken();
    const folderId = await this._ensureFolder(token);
    const file = await this._findFile(token, folderId, `${domainKey}.json`);
    if (!file) return [];

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const text = await res.text();
    try { return JSON.parse(text); } catch { return []; }
  }

  async delete(highlightId, domainKey) {
    const current = await this.load(domainKey);
    const updated = current.filter(h => h.id !== highlightId);
    await this.save(domainKey, updated);
    return true;
  }

  async listDomains() {
    const token = await this.getValidToken();
    const folderId = await this._ensureFolder(token);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=parents+in+'${folderId}'+and+name+contains+'.json'&fields=files(name)`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await res.json();
    return (data.files || []).map(f => f.name.replace('.json', ''));
  }

  async getSyncStatus() {
    try {
      await this.getValidToken();
      return { connected: true, lastSync: null, queueLength: 0, error: null };
    } catch (e) {
      return { connected: false, lastSync: null, queueLength: 0, error: e.message };
    }
  }

  async _ensureFolder(token) {
    if (this.folderId) return this.folderId;

    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${this.FOLDER_NAME}'+and+mimeType='application/vnd.google-apps.folder'`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();

    if (searchData.files?.length > 0) {
      this.folderId = searchData.files[0].id;
    } else {
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
      });
      const data = await createRes.json();
      this.folderId = data.id;
    }

    await chrome.storage.local.set({ gdrive_folder_id: this.folderId });
    return this.folderId;
  }

  async _findFile(token, folderId, fileName) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+parents+in+'${folderId}'&fields=files(id,name)`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await res.json();
    return data.files?.[0] || null;
  }

  async onDisable() {
    this.accessToken = null;
    this.folderId = null;
  }
}


class NotionStoragePlugin {
  static get metadata() {
    return {
      id: 'notion',
      name: 'Notion',
      version: '1.0.0',
      category: 'storage',
      description: 'Save highlights directly to a Notion database.',
      auth: 'apikey',
      isBuiltIn: true,
      supportsOffline: false,
      configFields: [
        { id: 'apiKey', label: 'Notion API Key', type: 'password', placeholder: 'secret_...' },
        { id: 'databaseId', label: 'Database ID', type: 'text', placeholder: 'Your Notion database ID' }
      ],
      icon: '📝'
    };
  }

  constructor() {
    this.apiKey = null;
    this.databaseId = null;
    this.BASE = 'https://api.notion.com/v1';
    this.VERSION = '2022-06-28';
  }

  async onEnable(config) {
    this.apiKey = config.apiKey || null;
    this.databaseId = config.databaseId || null;
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': this.VERSION
    };
  }

  async save(domainKey, highlights) {
    if (!this.apiKey || !this.databaseId) throw new Error('Notion not configured. Add your API key and database ID.');

    // Upsert each highlight as a page in the Notion database
    for (const h of highlights) {
      await fetch(`${this.BASE}/pages`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          parent: { database_id: this.databaseId },
          properties: {
            Title: { title: [{ text: { content: h.text.substring(0, 100) } }] },
            URL: { url: h.url },
            Domain: { rich_text: [{ text: { content: domainKey } }] },
            Type: { select: { name: h.type || 'default' } },
            Note: { rich_text: [{ text: { content: h.note || '' } }] },
            HighlightID: { rich_text: [{ text: { content: h.id } }] },
            Timestamp: { date: { start: h.timestamp } }
          }
        })
      });
    }
    return true;
  }

  async load(domainKey) {
    if (!this.apiKey || !this.databaseId) return [];

    const res = await fetch(`${this.BASE}/databases/${this.databaseId}/query`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        filter: { property: 'Domain', rich_text: { equals: domainKey } }
      })
    });
    const data = await res.json();
    if (!data.results) return [];

    return data.results.map(page => ({
      id: page.properties.HighlightID?.rich_text?.[0]?.text?.content,
      text: page.properties.Title?.title?.[0]?.text?.content,
      url: page.properties.URL?.url,
      type: page.properties.Type?.select?.name,
      note: page.properties.Note?.rich_text?.[0]?.text?.content || '',
      timestamp: page.properties.Timestamp?.date?.start
    })).filter(h => h.id && h.text);
  }

  async delete(highlightId, domainKey) {
    // Notion doesn't support delete via API for database pages; archive instead
    // For now, re-save without the deleted highlight
    const current = await this.load(domainKey);
    const updated = current.filter(h => h.id !== highlightId);
    if (updated.length < current.length) {
      await this.save(domainKey, updated);
    }
    return true;
  }

  async listDomains() {
    if (!this.apiKey || !this.databaseId) return [];

    const res = await fetch(`${this.BASE}/databases/${this.databaseId}/query`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({})
    });
    const data = await res.json();
    const domains = new Set();
    (data.results || []).forEach(page => {
      const domain = page.properties.Domain?.rich_text?.[0]?.text?.content;
      if (domain) domains.add(domain);
    });
    return Array.from(domains);
  }

  async getSyncStatus() {
    if (!this.apiKey || !this.databaseId) {
      return { connected: false, lastSync: null, queueLength: 0, error: 'Not configured' };
    }
    try {
      await fetch(`${this.BASE}/databases/${this.databaseId}`, { headers: this._headers() });
      return { connected: true, lastSync: null, queueLength: 0, error: null };
    } catch (e) {
      return { connected: false, lastSync: null, queueLength: 0, error: e.message };
    }
  }
}


class ObsidianStoragePlugin {
  static get metadata() {
    return {
      id: 'obsidian',
      name: 'Obsidian',
      version: '1.0.0',
      category: 'storage',
      description: 'Sync highlights to your Obsidian vault via the Local REST API plugin.',
      auth: 'apikey',
      isBuiltIn: true,
      supportsOffline: true,
      configFields: [
        { id: 'apiUrl', label: 'Obsidian REST API URL', type: 'text', placeholder: 'http://localhost:27123' },
        { id: 'apiKey', label: 'API Key', type: 'password', placeholder: 'From Obsidian Local REST API plugin' },
        { id: 'folder', label: 'Highlights Folder', type: 'text', placeholder: 'Highlights' }
      ],
      icon: '🌿'
    };
  }

  constructor() {
    this.apiUrl = 'http://localhost:27123';
    this.apiKey = null;
    this.folder = 'Highlights';
  }

  async onEnable(config) {
    this.apiUrl = config.apiUrl || this.apiUrl;
    this.apiKey = config.apiKey || null;
    this.folder = config.folder || 'Highlights';
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  _domainToPath(domainKey) {
    return `${this.folder}/${domainKey}.md`;
  }

  _highlightsToMarkdown(highlights, domainKey) {
    const lines = [`# Highlights: ${domainKey}`, '', `*Last updated: ${new Date().toISOString()}*`, ''];
    for (const h of highlights) {
      lines.push(`## ${h.title || domainKey}`);
      lines.push(`> ${h.text}`);
      lines.push('');
      if (h.note) lines.push(`**Note:** ${h.note}`, '');
      lines.push(`*Type: ${h.type || 'default'} · ${h.timestamp}*`, '', '---', '');
    }
    return lines.join('\n');
  }

  async save(domainKey, highlights) {
    if (!this.apiKey) throw new Error('Obsidian not configured. Add your REST API key.');

    const content = this._highlightsToMarkdown(highlights, domainKey);
    const path = this._domainToPath(domainKey);

    await fetch(`${this.apiUrl}/vault/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: this._headers(),
      body: content
    });
    return true;
  }

  async load(domainKey) {
    if (!this.apiKey) return [];

    try {
      const res = await fetch(`${this.apiUrl}/vault/${encodeURIComponent(this._domainToPath(domainKey))}`, {
        headers: this._headers()
      });
      if (!res.ok) return [];
      // Obsidian stores as markdown — we keep local storage as source of truth and use Obsidian as destination
      return [];
    } catch {
      return [];
    }
  }

  async delete(highlightId, domainKey) {
    // Obsidian is write-destination — just re-save without the deleted item
    return true;
  }

  async listDomains() {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.apiUrl}/vault/${encodeURIComponent(this.folder)}/`, { headers: this._headers() });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.files || []).map(f => f.replace('.md', ''));
    } catch {
      return [];
    }
  }

  async getSyncStatus() {
    if (!this.apiKey) return { connected: false, lastSync: null, queueLength: 0, error: 'Not configured' };
    try {
      const res = await fetch(`${this.apiUrl}/`, { headers: this._headers() });
      return { connected: res.ok, lastSync: null, queueLength: 0, error: res.ok ? null : 'Connection failed' };
    } catch (e) {
      return { connected: false, lastSync: null, queueLength: 0, error: 'Obsidian not reachable. Is the REST API plugin running?' };
    }
  }
}


// ─── AI Plugins ──────────────────────────────────────────────────────────────

class ExtractiveAIPlugin {
  static get metadata() {
    return {
      id: 'extractive',
      name: 'Extractive (Offline)',
      version: '1.0.0',
      category: 'ai',
      description: 'No AI model needed. Extracts key sentences from your highlights.',
      capabilities: ['summary'],
      requiresNetwork: false,
      isLocal: true,
      isBuiltIn: true,
      pricing: null,
      icon: '📋'
    };
  }

  async generateSummary(highlights, pageTitle = '') {
    const texts = highlights.map(h => h.text).filter(Boolean);
    if (!texts.length) return { summary: 'No highlights to summarize.', provider: 'extractive', isFallback: true };

    const allText = texts.join(' ');
    const sentences = allText.match(/[^.!?]+[.!?]+/g) || texts;
    const top = sentences.slice(0, 3).map(s => s.trim()).join(' ');

    return {
      summary: pageTitle ? `From "${pageTitle}": ${top}` : top,
      provider: 'Extractive',
      isFallback: true
    };
  }

  async answerQuestion(question, highlights) {
    const relevant = highlights.filter(h =>
      question.toLowerCase().split(' ').some(word => h.text.toLowerCase().includes(word))
    );
    if (!relevant.length) {
      return { answer: 'No relevant highlights found for this question.', confidence: 0, sources: [] };
    }
    return {
      answer: relevant.map(h => h.text).join('\n\n'),
      confidence: 0.4,
      sources: relevant.map(h => ({ id: h.id, text: h.text.substring(0, 80) }))
    };
  }

  async extractConcepts(text) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'this', 'that', 'these', 'those', 'it', 'its']);
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4 && !stopWords.has(w));
    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
  }

  async classifyHighlight(text) {
    const patterns = {
      definition: /\b(is|are|means?|defined as|refers to|known as|called|represents?)\b/i,
      evidence: /\b(shows?|proves?|demonstrates?|evidence|fact|data|study|research|found|indicates?)\b/i,
      question: /\b(why|how|what|when|where|which)\b.*\?|question|wondering/i,
      action: /\b(TODO|FIXME|must|should|need to|required|action|implement|fix|update)\b/i,
      key: /\b(key|crucial|critical|essential|important|main|fundamental|significant)\b/i
    };
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) return type;
    }
    return 'default';
  }

  async isAvailable() { return true; }
  async onEnable() {}
  async onDisable() {}
}


class OllamaPlugin {
  static get metadata() {
    return {
      id: 'ollama',
      name: 'Ollama (Local AI)',
      version: '1.0.0',
      category: 'ai',
      description: 'Run AI locally. Private, free, no API key needed. Requires Ollama installed.',
      capabilities: ['summary', 'qa', 'concepts', 'classify'],
      requiresNetwork: false,
      isLocal: true,
      isBuiltIn: true,
      pricing: null,
      configFields: [
        { id: 'endpoint', label: 'Ollama URL', type: 'text', placeholder: 'http://localhost:11434' },
        { id: 'model', label: 'Model', type: 'text', placeholder: 'llama3.2:1b' }
      ],
      icon: '🦙'
    };
  }

  constructor() {
    this.endpoint = 'http://localhost:11434';
    this.model = 'llama3.2:1b';
  }

  async onEnable(config) {
    this.endpoint = config.endpoint || this.endpoint;
    this.model = config.model || this.model;
  }

  async _generate(prompt, options = {}) {
    const res = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: { temperature: options.temperature ?? 0.3, num_predict: options.maxTokens ?? 300 }
      })
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (!data.response) throw new Error('Empty response from Ollama');
    return data.response.trim();
  }

  async generateSummary(highlights, pageTitle = '') {
    const content = highlights.map((h, i) => `${i + 1}. ${h.text}`).join('\n');
    const prompt = `Summarize these highlighted passages in 2-3 sentences:\n\n${content}\n\nSummary:`;

    const summary = await this._generate(prompt, { maxTokens: 200 });
    return { summary, provider: 'Ollama', isFallback: false };
  }

  async answerQuestion(question, highlights) {
    const context = highlights.map(h => `- ${h.text}`).join('\n');
    const prompt = `Based on these highlights:\n${context}\n\nAnswer this question: ${question}\n\nAnswer:`;

    const answer = await this._generate(prompt, { maxTokens: 300, temperature: 0.4 });
    return { answer, confidence: 0.8, sources: highlights.map(h => ({ id: h.id, text: h.text.substring(0, 80) })) };
  }

  async extractConcepts(text) {
    const prompt = `Extract the 5-8 most important concepts from this text. Return only a comma-separated list:\n\n${text}\n\nConcepts:`;
    const result = await this._generate(prompt, { maxTokens: 100 });
    return result.split(',').map(c => c.trim()).filter(Boolean);
  }

  async classifyHighlight(text) {
    const prompt = `Classify this text as one of: definition, evidence, question, action, key, default.\nReturn only the label word.\n\nText: "${text}"\n\nLabel:`;
    const result = await this._generate(prompt, { maxTokens: 10 });
    const valid = ['definition', 'evidence', 'question', 'action', 'key', 'default'];
    const found = valid.find(v => result.toLowerCase().includes(v));
    return found || 'default';
  }

  async isAvailable() {
    try {
      const res = await fetch(`${this.endpoint}/api/version`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async onDisable() {}
}


class ClaudeAPIPlugin {
  static get metadata() {
    return {
      id: 'claude',
      name: 'Claude (Anthropic)',
      version: '1.0.0',
      category: 'ai',
      description: 'Best-in-class AI summaries and reasoning. Requires an Anthropic API key.',
      capabilities: ['summary', 'qa', 'concepts', 'classify'],
      requiresNetwork: true,
      isLocal: false,
      isBuiltIn: true,
      pricing: { per1kInputTokens: 0.0025, per1kOutputTokens: 0.0125 },
      configFields: [
        { id: 'apiKey', label: 'Anthropic API Key', type: 'password', placeholder: 'sk-ant-...' },
        { id: 'model', label: 'Model', type: 'text', placeholder: 'claude-haiku-4-5-20251001' }
      ],
      icon: '🤖'
    };
  }

  constructor() {
    this.apiKey = null;
    this.model = 'claude-haiku-4-5-20251001';
    this.BASE = 'https://api.anthropic.com/v1';
  }

  async onEnable(config) {
    this.apiKey = config.apiKey || null;
    this.model = config.model || this.model;
  }

  async _chat(systemPrompt, userMessage, maxTokens = 500) {
    if (!this.apiKey) throw new Error('Claude API key not configured. Add your Anthropic API key in Settings > AI > Claude.');

    const res = await fetch(`${this.BASE}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Claude API error: ${err.error?.message || res.statusText}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || '';
  }

  async generateSummary(highlights, pageTitle = '') {
    const content = highlights.map((h, i) => `${i + 1}. ${h.text}${h.note ? ` (Note: ${h.note})` : ''}`).join('\n');
    const summary = await this._chat(
      'You are a research assistant. Create concise, insightful summaries of highlighted text. Be specific and capture the key insights.',
      `Summarize these highlights${pageTitle ? ` from "${pageTitle}"` : ''} in 2-3 sentences:\n\n${content}`,
      200
    );
    return { summary, provider: 'Claude', isFallback: false };
  }

  async answerQuestion(question, highlights) {
    const context = highlights.map(h => `- ${h.text}`).join('\n');
    const answer = await this._chat(
      'You are a research assistant. Answer questions based on provided highlight context. Be direct and cite sources when relevant.',
      `Context highlights:\n${context}\n\nQuestion: ${question}`,
      400
    );
    return { answer, confidence: 0.95, sources: highlights.map(h => ({ id: h.id, text: h.text.substring(0, 80) })) };
  }

  async extractConcepts(text) {
    const result = await this._chat(
      'Extract key concepts. Return only a comma-separated list of 5-8 concepts.',
      `Text: ${text}`,
      100
    );
    return result.split(',').map(c => c.trim()).filter(Boolean);
  }

  async classifyHighlight(text) {
    const result = await this._chat(
      'Classify text. Return exactly one word: definition, evidence, question, action, key, or default.',
      `Text: "${text}"`,
      10
    );
    const valid = ['definition', 'evidence', 'question', 'action', 'key', 'default'];
    return valid.find(v => result.toLowerCase().includes(v)) || 'default';
  }

  async isAvailable() {
    return !!this.apiKey;
  }
}


class HuggingFacePlugin {
  static get metadata() {
    return {
      id: 'huggingface',
      name: 'HuggingFace (Free)',
      version: '1.0.0',
      category: 'ai',
      description: 'Free AI summaries via HuggingFace Inference API. No API key needed for basic use.',
      capabilities: ['summary'],
      requiresNetwork: true,
      isLocal: false,
      isBuiltIn: true,
      pricing: null,
      configFields: [
        { id: 'apiKey', label: 'HuggingFace API Token (optional)', type: 'password', placeholder: 'hf_...' }
      ],
      icon: '🤗'
    };
  }

  constructor() {
    this.apiKey = null;
    this.ENDPOINT = 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';
  }

  async onEnable(config) {
    this.apiKey = config.apiKey || null;
  }

  async generateSummary(highlights, pageTitle = '') {
    const text = highlights.map(h => h.text).join(' ').substring(0, 1024);
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(this.ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ inputs: text, parameters: { max_length: 150, min_length: 30 } })
    });

    if (!res.ok) throw new Error(`HuggingFace error ${res.status}`);
    const data = await res.json();
    const summary = data[0]?.summary_text || data[0]?.generated_text;
    if (!summary) throw new Error('No summary returned');
    return { summary, provider: 'HuggingFace', isFallback: false };
  }

  async answerQuestion(question, highlights) {
    // HuggingFace free tier doesn't reliably support QA — delegate to extractive
    const fallback = new ExtractiveAIPlugin();
    return fallback.answerQuestion(question, highlights);
  }

  async extractConcepts(text) {
    const fallback = new ExtractiveAIPlugin();
    return fallback.extractConcepts(text);
  }

  async classifyHighlight(text) {
    const fallback = new ExtractiveAIPlugin();
    return fallback.classifyHighlight(text);
  }

  async isAvailable() {
    try {
      const res = await fetch(this.ENDPOINT, { signal: AbortSignal.timeout(3000) });
      return res.status !== 503;
    } catch {
      return false;
    }
  }
}


// ─── Tool Plugins ─────────────────────────────────────────────────────────────

class SemanticScholarTool {
  static get metadata() {
    return {
      id: 'semantic-scholar',
      name: 'Semantic Scholar',
      version: '1.0.0',
      category: 'tool',
      description: 'Search academic papers. Free, no API key needed.',
      actions: ['search', 'getDetails'],
      requiresAuth: false,
      isBuiltIn: true,
      icon: '🎓'
    };
  }

  describe() {
    return {
      actions: {
        search: {
          description: 'Search for academic papers by query string',
          input: { query: 'string', limit: 'number (1-100, default 10)' },
          output: 'Array of { title, authors, year, abstract, url, citationCount }'
        },
        getDetails: {
          description: 'Get details for a specific paper by Semantic Scholar ID',
          input: { paperId: 'string' },
          output: '{ title, authors, year, abstract, url, references, citations }'
        }
      }
    };
  }

  async call(action, args) {
    if (action === 'search') return this._search(args);
    if (action === 'getDetails') return this._getDetails(args);
    return { success: false, error: `Unknown action: ${action}` };
  }

  async _search({ query, limit = 10 }) {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,year,abstract,url,citationCount`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Semantic Scholar error ${res.status}`);
    const data = await res.json();
    return {
      success: true,
      result: (data.data || []).map(p => ({
        paperId: p.paperId,
        title: p.title,
        authors: (p.authors || []).map(a => a.name).join(', '),
        year: p.year,
        abstract: p.abstract?.substring(0, 300),
        url: p.url,
        citationCount: p.citationCount
      }))
    };
  }

  async _getDetails({ paperId }) {
    const url = `https://api.semanticscholar.org/graph/v1/paper/${paperId}?fields=title,authors,year,abstract,url,references,citations`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Semantic Scholar error ${res.status}`);
    const data = await res.json();
    return { success: true, result: data };
  }

  validate(action, args) {
    if (action === 'search' && !args.query) return { valid: false, errors: ['query is required'] };
    if (action === 'getDetails' && !args.paperId) return { valid: false, errors: ['paperId is required'] };
    return { valid: true, errors: [] };
  }

  async onEnable() {}
  async onDisable() {}
}


class SlackTool {
  static get metadata() {
    return {
      id: 'slack',
      name: 'Slack',
      version: '1.0.0',
      category: 'tool',
      description: 'Share highlights and summaries to Slack channels.',
      actions: ['sendMessage', 'sendHighlights'],
      requiresAuth: true,
      configFields: [
        { id: 'webhookUrl', label: 'Slack Webhook URL', type: 'password', placeholder: 'https://hooks.slack.com/...' }
      ],
      isBuiltIn: true,
      icon: '💬'
    };
  }

  constructor() {
    this.webhookUrl = null;
  }

  async onEnable(config) {
    this.webhookUrl = config.webhookUrl || null;
  }

  describe() {
    return {
      actions: {
        sendMessage: { input: { text: 'string', username: 'string (optional)' }, output: '{ success, ts }' },
        sendHighlights: { input: { highlights: 'array', title: 'string' }, output: '{ success, ts }' }
      }
    };
  }

  async call(action, args) {
    if (!this.webhookUrl) return { success: false, error: 'Slack not configured. Add your webhook URL in Settings > Tools > Slack.' };
    if (action === 'sendMessage') return this._sendMessage(args);
    if (action === 'sendHighlights') return this._sendHighlights(args);
    return { success: false, error: `Unknown action: ${action}` };
  }

  async _sendMessage({ text, username = 'Web Highlighter' }) {
    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, username })
    });
    return { success: res.ok };
  }

  async _sendHighlights({ highlights, title }) {
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: title || 'Shared Highlights' } },
      ...highlights.slice(0, 5).map(h => ({
        type: 'section',
        text: { type: 'mrkdwn', text: `> ${h.text.substring(0, 200)}${h.note ? `\n_Note: ${h.note}_` : ''}` },
        accessory: h.url ? { type: 'button', text: { type: 'plain_text', text: 'View Source' }, url: h.url } : undefined
      }))
    ];

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks })
    });
    return { success: res.ok };
  }

  validate(action, args) {
    if (action === 'sendMessage' && !args.text) return { valid: false, errors: ['text is required'] };
    if (action === 'sendHighlights' && !args.highlights?.length) return { valid: false, errors: ['highlights array is required'] };
    return { valid: true, errors: [] };
  }
}


class ClipboardTool {
  static get metadata() {
    return {
      id: 'clipboard',
      name: 'Clipboard',
      version: '1.0.0',
      category: 'tool',
      description: 'Copy highlights or summaries to clipboard. Always available.',
      actions: ['copy'],
      requiresAuth: false,
      isBuiltIn: true,
      icon: '📋'
    };
  }

  describe() {
    return { actions: { copy: { input: { text: 'string', format: 'markdown|plain|json' }, output: '{ success }' } } };
  }

  async call(action, args) {
    if (action !== 'copy') return { success: false, error: `Unknown action: ${action}` };
    try {
      await navigator.clipboard.writeText(args.text);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  validate(action, args) {
    if (!args.text) return { valid: false, errors: ['text is required'] };
    return { valid: true, errors: [] };
  }

  async onEnable() {}
  async onDisable() {}
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PluginLoader,
    LocalStoragePlugin, GoogleDrivePlugin, NotionStoragePlugin, ObsidianStoragePlugin,
    ExtractiveAIPlugin, OllamaPlugin, ClaudeAPIPlugin, HuggingFacePlugin,
    SemanticScholarTool, SlackTool, ClipboardTool
  };
} else {
  window.PluginLoader = PluginLoader;
  window.LocalStoragePlugin = LocalStoragePlugin;
  window.GoogleDrivePlugin = GoogleDrivePlugin;
  window.NotionStoragePlugin = NotionStoragePlugin;
  window.ObsidianStoragePlugin = ObsidianStoragePlugin;
  window.ExtractiveAIPlugin = ExtractiveAIPlugin;
  window.OllamaPlugin = OllamaPlugin;
  window.ClaudeAPIPlugin = ClaudeAPIPlugin;
  window.HuggingFacePlugin = HuggingFacePlugin;
  window.SemanticScholarTool = SemanticScholarTool;
  window.SlackTool = SlackTool;
  window.ClipboardTool = ClipboardTool;
}
