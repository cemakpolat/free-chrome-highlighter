# Extension Development Guide

This guide provides practical examples for extending the Universal Web Highlighter with new features, providers, and plugins.

## 🚀 Quick Extension Examples

### 1. Adding a New Storage Provider

Let's add Firebase as a storage provider:

```javascript
// firebase-storage-provider.js
class FirebaseStorageProvider extends IStorageProvider {
  constructor(config) {
    super();
    this.config = config;
    this.db = null;
    this.user = null;
  }

  async initialize() {
    // Initialize Firebase
    firebase.initializeApp(this.config);
    this.db = firebase.firestore();

    // Set up authentication
    await this.authenticate();
  }

  async authenticate() {
    const auth = firebase.auth();
    const result = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    this.user = result.user;
    console.log('Firebase authenticated:', this.user.uid);
  }

  async save(key, data) {
    try {
      const docRef = this.db
        .collection('users')
        .doc(this.user.uid)
        .collection('highlights')
        .doc(key);

      await docRef.set({
        ...data,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userId: this.user.uid
      });

      return { success: true, id: key };
    } catch (error) {
      console.error('Firebase save error:', error);
      return { success: false, error: error.message };
    }
  }

  async load(key) {
    try {
      const doc = await this.db
        .collection('users')
        .doc(this.user.uid)
        .collection('highlights')
        .doc(key)
        .get();

      if (doc.exists) {
        return { success: true, data: doc.data() };
      } else {
        return { success: false, error: 'Document not found' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async list() {
    try {
      const snapshot = await this.db
        .collection('users')
        .doc(this.user.uid)
        .collection('highlights')
        .get();

      const keys = snapshot.docs.map(doc => doc.id);
      return { success: true, data: keys };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async delete(key) {
    try {
      await this.db
        .collection('users')
        .doc(this.user.uid)
        .collection('highlights')
        .doc(key)
        .delete();

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getSyncStatus() {
    return {
      authenticated: !!this.user,
      storageType: 'firebase',
      message: this.user ? 'Connected to Firebase' : 'Not authenticated',
      lastSync: Date.now(),
      queueLength: 0,
      inProgress: false,
      capabilities: ['sync', 'backup', 'share', 'realtime']
    };
  }

  // Real-time sync capability
  onHighlightChange(callback) {
    if (!this.user) return;

    return this.db
      .collection('users')
      .doc(this.user.uid)
      .collection('highlights')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          callback({
            type: change.type, // 'added', 'modified', 'removed'
            id: change.doc.id,
            data: change.doc.data()
          });
        });
      });
  }
}

// Register with the factory
StorageFactory.register('firebase', (config) => {
  return new FirebaseStorageProvider(config);
});
```

### 2. Creating a Custom Highlight Type

Let's add sticky note highlights:

```javascript
// sticky-note-highlighter.js
class StickyNoteHighlighter extends HighlighterService {
  constructor(storageProvider, eventEmitter) {
    super(storageProvider, eventEmitter);
    this.stickyNotes = new Map();
  }

  async createHighlight(selection, options = {}) {
    // Create base highlight
    const highlight = await super.createHighlight(selection, {
      ...options,
      type: 'sticky-note'
    });

    // Add sticky note functionality
    await this.createStickyNote(highlight, options);

    return highlight;
  }

  async createStickyNote(highlight, options) {
    const stickyNote = document.createElement('div');
    stickyNote.className = 'sticky-note';
    stickyNote.innerHTML = `
      <div class="sticky-note-header">
        <span class="sticky-note-title">💡 Note</span>
        <button class="sticky-note-close">×</button>
      </div>
      <div class="sticky-note-content">
        <textarea placeholder="Add your note here..."
                  class="sticky-note-text">${highlight.note || ''}</textarea>
        <div class="sticky-note-actions">
          <button class="sticky-note-save">Save</button>
          <button class="sticky-note-cancel">Cancel</button>
        </div>
      </div>
    `;

    // Position near the highlight
    const highlightElement = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
    if (highlightElement) {
      const rect = highlightElement.getBoundingClientRect();
      stickyNote.style.position = 'fixed';
      stickyNote.style.left = `${rect.right + 10}px`;
      stickyNote.style.top = `${rect.top}px`;
      stickyNote.style.zIndex = '10000';
    }

    // Add event listeners
    this.setupStickyNoteEvents(stickyNote, highlight);

    document.body.appendChild(stickyNote);
    this.stickyNotes.set(highlight.id, stickyNote);
  }

  setupStickyNoteEvents(stickyNote, highlight) {
    const textarea = stickyNote.querySelector('.sticky-note-text');
    const saveBtn = stickyNote.querySelector('.sticky-note-save');
    const cancelBtn = stickyNote.querySelector('.sticky-note-cancel');
    const closeBtn = stickyNote.querySelector('.sticky-note-close');

    saveBtn.addEventListener('click', async () => {
      highlight.note = textarea.value;
      await this.updateHighlight(highlight);
      this.hideStickyNote(highlight.id);
      this.events.emit('stickyNoteUpdated', highlight);
    });

    cancelBtn.addEventListener('click', () => {
      this.hideStickyNote(highlight.id);
    });

    closeBtn.addEventListener('click', () => {
      this.hideStickyNote(highlight.id);
    });

    // Auto-save on blur
    textarea.addEventListener('blur', async () => {
      if (textarea.value !== highlight.note) {
        highlight.note = textarea.value;
        await this.updateHighlight(highlight);
      }
    });
  }

  showStickyNote(highlightId) {
    const stickyNote = this.stickyNotes.get(highlightId);
    if (stickyNote) {
      stickyNote.style.display = 'block';
    }
  }

  hideStickyNote(highlightId) {
    const stickyNote = this.stickyNotes.get(highlightId);
    if (stickyNote) {
      stickyNote.style.display = 'none';
    }
  }

  removeStickyNote(highlightId) {
    const stickyNote = this.stickyNotes.get(highlightId);
    if (stickyNote) {
      stickyNote.remove();
      this.stickyNotes.delete(highlightId);
    }
  }

  async removeHighlight(highlightId) {
    // Remove sticky note first
    this.removeStickyNote(highlightId);

    // Then remove the highlight
    return await super.removeHighlight(highlightId);
  }
}

// CSS for sticky notes
const stickyNoteCSS = `
  .sticky-note {
    background: #ffffcc;
    border: 1px solid #cccc99;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    min-width: 250px;
    max-width: 300px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .sticky-note-header {
    background: #f0f0aa;
    padding: 8px 12px;
    border-bottom: 1px solid #cccc99;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 8px 8px 0 0;
  }

  .sticky-note-title {
    font-weight: bold;
    font-size: 14px;
  }

  .sticky-note-close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #666;
  }

  .sticky-note-content {
    padding: 12px;
  }

  .sticky-note-text {
    width: 100%;
    min-height: 80px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    resize: vertical;
    font-size: 14px;
    font-family: inherit;
  }

  .sticky-note-actions {
    margin-top: 8px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .sticky-note-actions button {
    padding: 4px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font-size: 12px;
  }

  .sticky-note-save {
    background: #4CAF50 !important;
    color: white !important;
    border-color: #4CAF50 !important;
  }
`;

// Inject CSS
const style = document.createElement('style');
style.textContent = stickyNoteCSS;
document.head.appendChild(style);
```

### 3. Adding a New AI Provider

Let's integrate OpenAI's GPT:

```javascript
// openai-provider.js
class OpenAIProvider {
  constructor(apiKey, options = {}) {
    this.name = 'OpenAI GPT';
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
    this.model = options.model || 'gpt-3.5-turbo';
    this.maxTokens = options.maxTokens || 200;
    this.temperature = options.temperature || 0.7;
  }

  isAvailable() {
    return !!this.apiKey;
  }

  async generateSummary(textContent, context = {}) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const prompt = this.buildPrompt(textContent, context);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that creates concise, informative summaries of highlighted text.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const summary = data.choices[0].message.content.trim();

      return {
        success: true,
        summary: summary,
        provider: this.name,
        model: this.model,
        wordCount: summary.split(' ').length,
        usage: data.usage
      };

    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  buildPrompt(textContent, context) {
    let prompt = `Please provide a concise summary of the following highlighted text`;

    if (context.pageTitle) {
      prompt += ` from the page "${context.pageTitle}"`;
    }

    if (context.highlightCount > 1) {
      prompt += ` (${context.highlightCount} highlights total)`;
    }

    prompt += `:\n\n${textContent}\n\nSummary:`;

    return prompt;
  }

  // Advanced features
  async generateQuestions(textContent) {
    const prompt = `Based on the following text, generate 3-5 thought-provoking questions that would help someone understand and think critically about the content:\n\n${textContent}\n\nQuestions:`;

    const response = await this.makeAPICall(prompt);
    return response.summary.split('\n').filter(q => q.trim());
  }

  async generateKeywords(textContent) {
    const prompt = `Extract the most important keywords and phrases from this text. Return them as a comma-separated list:\n\n${textContent}\n\nKeywords:`;

    const response = await this.makeAPICall(prompt);
    return response.summary.split(',').map(k => k.trim());
  }

  async makeAPICall(prompt) {
    // Reuse the main API call logic
    return await this.generateSummary('', { customPrompt: prompt });
  }
}

// Register the provider
class ExtendedAISummaryService extends AISummaryService {
  constructor() {
    super();

    // Add OpenAI provider if API key is available
    const openaiKey = this.getOpenAIKey();
    if (openaiKey) {
      this.providers.unshift(new OpenAIProvider(openaiKey));
    }
  }

  getOpenAIKey() {
    // Get from storage or environment
    return localStorage.getItem('openai_api_key') ||
           chrome.storage?.sync?.get?.(['openai_key'])?.openai_key;
  }

  // Extended functionality
  async generateQuestions(highlights) {
    const textContent = highlights.map(h => h.text).join('\n\n');
    const openaiProvider = this.providers.find(p => p.name === 'OpenAI GPT');

    if (openaiProvider) {
      return await openaiProvider.generateQuestions(textContent);
    }

    throw new Error('OpenAI provider not available');
  }

  async extractKeywords(highlights) {
    const textContent = highlights.map(h => h.text).join('\n\n');
    const openaiProvider = this.providers.find(p => p.name === 'OpenAI GPT');

    if (openaiProvider) {
      return await openaiProvider.generateKeywords(textContent);
    }

    throw new Error('OpenAI provider not available');
  }
}
```

### 4. Creating a Plugin System

Let's build a plugin architecture:

```javascript
// plugin-system.js
class PluginSystem {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
    this.context = {
      highlighter: null,
      storage: null,
      events: null
    };
  }

  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  async registerPlugin(plugin) {
    try {
      if (this.plugins.has(plugin.name)) {
        throw new Error(`Plugin ${plugin.name} already registered`);
      }

      // Validate plugin interface
      this.validatePlugin(plugin);

      // Initialize plugin
      await plugin.initialize(this.context);

      // Register plugin
      this.plugins.set(plugin.name, plugin);

      // Register plugin hooks
      if (plugin.hooks) {
        Object.entries(plugin.hooks).forEach(([hookName, handler]) => {
          this.addHook(hookName, handler);
        });
      }

      console.log(`✅ Plugin ${plugin.name} registered successfully`);

      return true;
    } catch (error) {
      console.error(`❌ Failed to register plugin ${plugin.name}:`, error);
      return false;
    }
  }

  async unregisterPlugin(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;

    try {
      // Remove hooks
      if (plugin.hooks) {
        Object.keys(plugin.hooks).forEach(hookName => {
          this.removeHook(hookName, plugin.hooks[hookName]);
        });
      }

      // Destroy plugin
      await plugin.destroy();

      // Remove from registry
      this.plugins.delete(pluginName);

      console.log(`✅ Plugin ${pluginName} unregistered successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to unregister plugin ${pluginName}:`, error);
      return false;
    }
  }

  validatePlugin(plugin) {
    const required = ['name', 'version', 'initialize', 'destroy'];
    for (const prop of required) {
      if (!plugin[prop]) {
        throw new Error(`Plugin missing required property: ${prop}`);
      }
    }

    if (typeof plugin.initialize !== 'function') {
      throw new Error('Plugin initialize must be a function');
    }

    if (typeof plugin.destroy !== 'function') {
      throw new Error('Plugin destroy must be a function');
    }
  }

  addHook(hookName, handler) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName).push(handler);
  }

  removeHook(hookName, handler) {
    if (this.hooks.has(hookName)) {
      const handlers = this.hooks.get(hookName);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async executeHook(hookName, data) {
    const handlers = this.hooks.get(hookName) || [];
    let result = data;

    for (const handler of handlers) {
      try {
        result = await handler(result, this.context);
      } catch (error) {
        console.error(`Hook ${hookName} handler error:`, error);
      }
    }

    return result;
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  getAllPlugins() {
    return Array.from(this.plugins.values());
  }
}

// Plugin interface
class BasePlugin {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.context = null;
    this.hooks = {};
  }

  async initialize(context) {
    this.context = context;
    console.log(`Initializing plugin: ${this.name}`);
  }

  async destroy() {
    console.log(`Destroying plugin: ${this.name}`);
    this.context = null;
  }
}

// Example plugin: Auto-save
class AutoSavePlugin extends BasePlugin {
  constructor() {
    super('AutoSave', '1.0.0');
    this.saveInterval = null;
    this.hooks = {
      'highlight.created': this.onHighlightCreated.bind(this),
      'highlight.updated': this.onHighlightUpdated.bind(this)
    };
  }

  async initialize(context) {
    await super.initialize(context);

    // Start auto-save every 30 seconds
    this.saveInterval = setInterval(() => {
      this.autoSave();
    }, 30000);

    console.log('✅ Auto-save enabled (30s interval)');
  }

  async destroy() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    await super.destroy();
  }

  async onHighlightCreated(highlight) {
    // Auto-save immediately when highlight is created
    await this.autoSave();
    return highlight;
  }

  async onHighlightUpdated(highlight) {
    // Auto-save immediately when highlight is updated
    await this.autoSave();
    return highlight;
  }

  async autoSave() {
    try {
      if (this.context.storage && this.context.highlighter) {
        const highlights = Array.from(this.context.highlighter.highlights.values());
        console.log(`💾 Auto-saving ${highlights.length} highlights...`);

        // Trigger sync
        if (typeof this.context.storage.syncAll === 'function') {
          await this.context.storage.syncAll();
        }
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }
}

// Example plugin: Statistics
class StatisticsPlugin extends BasePlugin {
  constructor() {
    super('Statistics', '1.0.0');
    this.stats = {
      highlightsCreated: 0,
      highlightsDeleted: 0,
      sessionsStarted: 0,
      totalWords: 0
    };
    this.hooks = {
      'highlight.created': this.onHighlightCreated.bind(this),
      'highlight.deleted': this.onHighlightDeleted.bind(this)
    };
  }

  async initialize(context) {
    await super.initialize(context);

    // Load existing stats
    await this.loadStats();

    this.stats.sessionsStarted++;
    await this.saveStats();

    console.log('📊 Statistics tracking enabled');
  }

  async destroy() {
    await this.saveStats();
    await super.destroy();
  }

  async onHighlightCreated(highlight) {
    this.stats.highlightsCreated++;
    this.stats.totalWords += highlight.text.split(' ').length;
    await this.saveStats();
    return highlight;
  }

  async onHighlightDeleted(highlightId) {
    this.stats.highlightsDeleted++;
    await this.saveStats();
    return highlightId;
  }

  async loadStats() {
    try {
      const stored = localStorage.getItem('highlighter_stats');
      if (stored) {
        this.stats = { ...this.stats, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async saveStats() {
    try {
      localStorage.setItem('highlighter_stats', JSON.stringify(this.stats));
    } catch (error) {
      console.error('Failed to save stats:', error);
    }
  }

  getStats() {
    return { ...this.stats };
  }
}

// Initialize plugin system
const pluginSystem = new PluginSystem();

// Register built-in plugins
pluginSystem.registerPlugin(new AutoSavePlugin());
pluginSystem.registerPlugin(new StatisticsPlugin());

// Make available globally
window.HighlighterPlugins = {
  PluginSystem,
  BasePlugin,
  AutoSavePlugin,
  StatisticsPlugin,
  pluginSystem
};
```

### 5. Using the Extensions

Here's how to integrate the extensions:

```javascript
// main-extension-integration.js
async function initializeExtensions() {
  try {
    // 1. Initialize storage with Firebase option
    const storageProvider = await initializeStorage();

    // 2. Initialize enhanced AI service
    const aiService = new ExtendedAISummaryService();

    // 3. Initialize sticky note highlighter
    const eventEmitter = new EventEmitter();
    const highlighter = new StickyNoteHighlighter(storageProvider, eventEmitter);

    // 4. Set up plugin system
    const context = {
      highlighter: highlighter,
      storage: storageProvider,
      events: eventEmitter,
      ai: aiService
    };

    pluginSystem.setContext(context);

    // 5. Load user plugins
    await loadUserPlugins();

    console.log('✅ All extensions initialized successfully');

    return {
      highlighter,
      storage: storageProvider,
      ai: aiService,
      plugins: pluginSystem
    };

  } catch (error) {
    console.error('❌ Extension initialization failed:', error);
    throw error;
  }
}

async function initializeStorage() {
  const userPreference = localStorage.getItem('storage_preference');

  switch (userPreference) {
    case 'firebase':
      const firebaseConfig = getFirebaseConfig();
      const firebaseProvider = new FirebaseStorageProvider(firebaseConfig);
      await firebaseProvider.initialize();
      return firebaseProvider;

    case 'local':
      return StorageFactory.createLocal();

    case 'googledrive':
    default:
      return StorageFactory.createDirectGoogleDrive();
  }
}

async function loadUserPlugins() {
  // Load plugins from user configuration
  const userPlugins = JSON.parse(localStorage.getItem('user_plugins') || '[]');

  for (const pluginConfig of userPlugins) {
    try {
      // Dynamically load and register user plugins
      const plugin = await loadPlugin(pluginConfig);
      await pluginSystem.registerPlugin(plugin);
    } catch (error) {
      console.error(`Failed to load user plugin ${pluginConfig.name}:`, error);
    }
  }
}

function getFirebaseConfig() {
  return {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
  };
}

// Usage example
async function main() {
  const extensions = await initializeExtensions();

  // Now you can use enhanced features
  const highlights = await extensions.highlighter.getHighlights();
  const summary = await extensions.ai.generateSummary(highlights);
  const questions = await extensions.ai.generateQuestions(highlights);

  console.log('Summary:', summary);
  console.log('Questions:', questions);

  // Access plugin functionality
  const statsPlugin = extensions.plugins.getPlugin('Statistics');
  console.log('Stats:', statsPlugin.getStats());
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
```

## 🎯 Extension Benefits

With these extensions, you get:

### **Enhanced Storage Options**
- **Firebase**: Real-time sync, collaboration features
- **Multiple providers**: Easy switching between storage backends
- **Standardized interface**: Consistent API across all providers

### **Advanced Highlight Types**
- **Sticky Notes**: Interactive note-taking with highlights
- **Custom behaviors**: Easy to add new highlight styles and interactions
- **Rich UI**: Modern, responsive interface components

### **Powerful AI Integration**
- **Multiple AI providers**: OpenAI, Ollama, Hugging Face, and more
- **Advanced features**: Question generation, keyword extraction
- **Extensible**: Easy to add new AI capabilities

### **Plugin Architecture**
- **Modular extensions**: Add features without modifying core code
- **Hook system**: Intercept and modify behavior at key points
- **Easy management**: Enable/disable plugins as needed

This extension system demonstrates how the SOLID principles in the codebase enable powerful, maintainable extensions that don't break existing functionality! 🚀