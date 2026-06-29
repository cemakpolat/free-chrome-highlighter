# Phase 2: Intelligent Agents & Plugin Architecture

**Branch:** `phase/2-intelligent-agents`  
**Timeline:** 8 weeks  
**Goal:** Transform from "feature tool" to "extensible platform"

---

## 🎯 Strategic Decision: Plugin-Based Over Monolithic

### The Question
> Are we locked to Google Drive? Can we build an easy plugin system?

**Answer:** No, we're NOT locked. And yes, we absolutely should build plugin-based for Phase 2.

### Current State: Already Abstracted

Look at what Phase 1 built:

```javascript
// storage-providers.js - ALREADY abstracted!
class IStorageProvider {
  async save(key, data) { }
  async load(key) { }
  async delete(key) { }
}

// Implementations:
- LocalStorageProvider (browser storage)
- GoogleDriveStorageProvider (Google Drive)
- ChromeSyncStorageProvider (Chrome built-in sync)
```

**Already pluggable.** You can add:
- NotionStorageProvider
- ObsidianStorageProvider
- OneDriveStorageProvider
- S3StorageProvider
- etc.

Same for AI:

```javascript
// ai-summary-service.js - ALREADY multi-provider!
const providers = [
  { name: 'Ollama (Local)', endpoint: 'http://localhost:11434/...' },
  { name: 'Hugging Face', endpoint: 'https://api-inference.huggingface.co/...' },
  { fallback: 'extractive' }
];
```

**You can add:**
- Claude API
- OpenAI
- Anthropic direct
- LLaMA
- etc.

---

## 🏗️ Phase 2 Architecture: From Tools to Platform

### What We Have (Phase 1)
```
Chrome Extension
├── Highlight Core
├── Storage (abstracted)
└── AI (abstracted)
```

### What Phase 2 Should Be
```
Intelligent Research Platform
├── Agent Orchestrator
│   ├── Research Agent
│   ├── Writing Agent
│   ├── Learning Agent
│   └── Custom Agents (user-defined)
├── Plugin System (MCP-based)
│   ├── Storage Plugins (where highlights live)
│   ├── AI Plugins (who generates insights)
│   ├── Tool Plugins (who executes actions)
│   └── Integration Plugins (who connects services)
└── Knowledge Graph
    ├── Highlight relationships
    ├── Cross-document synthesis
    └── Context extraction
```

---

## 🔌 Plugin Architecture Design

### Layer 1: Plugin Registry

```javascript
// lib/plugin-registry.js
class PluginRegistry {
  constructor() {
    this.plugins = {
      storage: new Map(),
      ai: new Map(),
      tools: new Map(),
      integrations: new Map()
    };
  }

  registerStoragePlugin(name, provider) {
    // name: 'google-drive', 'notion', 'obsidian'
    // provider: implements IStorageProvider
    this.plugins.storage.set(name, provider);
  }

  registerAIPlugin(name, config) {
    // name: 'claude', 'openai', 'ollama'
    // config: { endpoint, model, auth }
    this.plugins.ai.set(name, config);
  }

  registerToolPlugin(name, tool) {
    // name: 'slack', 'discord', 'email'
    // tool: implements ITool (call, validate, describe)
    this.plugins.tools.set(name, tool);
  }

  listPlugins(category) {
    return Array.from(this.plugins[category].entries());
  }

  getPlugin(category, name) {
    return this.plugins[category].get(name);
  }
}
```

### Layer 2: Plugin Interfaces

```javascript
// lib/plugin-interfaces.js

// Storage plugin interface
class IStoragePlugin {
  async save(domain, highlights) { }
  async load(domain) { }
  async delete(highlightId) { }
  async sync() { }
  
  // Plugin metadata
  static get metadata() {
    return {
      name: 'Plugin Name',
      version: '1.0.0',
      category: 'storage',
      supported: true,
      auth: { type: 'oauth2', scopes: [...] }
    };
  }
}

// AI plugin interface
class ILLMPlugin {
  async generateSummary(highlights, options) { }
  async answerQuestion(question, context) { }
  async extractConcepts(text) { }
  
  static get metadata() {
    return {
      name: 'Plugin Name',
      version: '1.0.0',
      category: 'ai',
      capabilities: ['summary', 'qa', 'concepts'],
      model: 'model-name',
      costPer1kTokens: 0.001
    };
  }
}

// Tool plugin interface (for agents)
class IToolPlugin {
  async call(args) { }
  validate(args) { }
  describe() { }
  
  static get metadata() {
    return {
      name: 'Tool Name',
      category: 'tool',
      action: 'what does this tool do',
      inputSchema: { type: 'object', properties: {...} },
      outputSchema: { type: 'object', properties: {...} }
    };
  }
}
```

### Layer 3: Plugin Loader

```javascript
// lib/plugin-loader.js
class PluginLoader {
  constructor(registry) {
    this.registry = registry;
  }

  async loadBuiltInPlugins() {
    // Load plugins shipped with extension
    const builtIn = {
      storage: ['local', 'google-drive', 'chrome-sync'],
      ai: ['ollama', 'hugging-face', 'extractive'],
      tools: ['slack', 'discord', 'email']
    };
    
    for (const [category, names] of Object.entries(builtIn)) {
      for (const name of names) {
        const plugin = await this.loadPlugin(category, name);
        this.registry.register(category, name, plugin);
      }
    }
  }

  async loadUserPlugins() {
    // Load user-installed plugins from chrome.storage.sync
    const userPlugins = await chrome.storage.sync.get('user_plugins');
    
    for (const [name, config] of Object.entries(userPlugins)) {
      if (config.enabled) {
        const plugin = await this.instantiate(config);
        this.registry.register(config.category, name, plugin);
      }
    }
  }

  async loadPlugin(category, name) {
    const paths = {
      storage: `./plugins/storage/${name}.js`,
      ai: `./plugins/ai/${name}.js`,
      tools: `./plugins/tools/${name}.js`
    };
    
    const module = await import(paths[category]);
    return new module.default();
  }

  async installPlugin(manifest) {
    // Validate manifest, download, store, reload
    await this.validateManifest(manifest);
    await this.savePlugin(manifest);
    await this.loadUserPlugins(); // reload
    return { success: true, id: manifest.id };
  }
}
```

---

## 🧠 Agent Orchestrator (Uses Plugins)

```javascript
// lib/agent-orchestrator.js
class AgentOrchestrator {
  constructor(registry) {
    this.registry = registry;
    this.agents = new Map();
  }

  async executeAgent(agentName, context) {
    const agent = this.agents.get(agentName);
    if (!agent) throw new Error(`Agent not found: ${agentName}`);

    // Agents use registered plugins
    const storage = this.registry.getPlugin('storage', context.storageProvider);
    const llm = this.registry.getPlugin('ai', context.aiProvider);
    
    return agent.execute(context, { storage, llm });
  }

  registerAgent(name, agentClass) {
    this.agents.set(name, new agentClass());
  }
}

// Example: Research Agent
class ResearchAgent {
  async execute(context, services) {
    const { highlights, query } = context;
    const { storage, llm } = services;

    // 1. Extract concepts from highlights
    const concepts = await this.extractConcepts(highlights);

    // 2. Use LLM to generate research questions
    const questions = await llm.answerQuestion(
      `Generate 3 follow-up research questions about: ${concepts.join(', ')}`,
      highlights
    );

    // 3. Use tool plugins to search papers
    const paperSearchTool = this.registry.getPlugin('tool', 'semantic-scholar');
    const papers = await paperSearchTool.call({
      query: concepts.join(' '),
      limit: 10
    });

    // 4. Synthesize into brief
    const brief = await llm.generateSummary(
      highlights.concat(papers.map(p => p.abstract)),
      { format: 'research-brief' }
    );

    // 5. Save to user's storage provider
    await storage.save('research-briefs', {
      id: Date.now(),
      query,
      brief,
      sources: papers,
      timestamp: new Date().toISOString()
    });

    return brief;
  }
}
```

---

## 🚀 NOT Locked to Google Drive

### Storage is Pluggable

User can choose:
```
Settings > Storage Provider > [Google Drive ▼]
  ├─ Google Drive
  ├─ Notion Database
  ├─ Obsidian Vault
  ├─ OneDrive
  ├─ S3 Bucket
  ├─ Self-hosted server
  └─ Local Only
```

Each is a plugin implementing `IStoragePlugin`.

### AI is Pluggable

User can choose:
```
Settings > AI Provider > [Ollama ▼]
  ├─ Ollama (local)
  ├─ Claude (paid API)
  ├─ OpenAI (paid API)
  ├─ HuggingFace (free tier)
  ├─ Self-hosted Llama
  └─ Offline (no AI)
```

Each is a plugin implementing `ILLMPlugin`.

### Tools are Pluggable

User can install:
```
Settings > Tools > [+ Add Tool]
  ├─ Slack (share findings)
  ├─ Discord (team collab)
  ├─ Email (export)
  ├─ GitHub (create issues)
  ├─ Jira (track tasks)
  ├─ Notion (save notes)
  └─ Custom API (user-defined)
```

Each is a plugin implementing `IToolPlugin`.

---

## 📋 Phase 2 Implementation Plan

### Week 1-2: Plugin Foundation
- [ ] Create plugin registry system
- [ ] Define plugin interfaces for storage/AI/tools
- [ ] Implement plugin loader
- [ ] Refactor existing providers into plugins

### Week 3-4: Agent Orchestrator
- [ ] Build agent orchestration framework
- [ ] Implement Research Agent
- [ ] Implement Writing Agent
- [ ] Implement Learning Agent

### Week 5-6: Core MCP Integration
- [ ] Semantic Scholar MCP plugin
- [ ] Notion/Obsidian MCP plugins
- [ ] Claude API MCP plugin
- [ ] Tool discovery system

### Week 7-8: UI & Polish
- [ ] Plugin marketplace/settings UI
- [ ] Agent execution UI
- [ ] Error handling for plugin failures
- [ ] Testing and optimization

---

## 🎓 Why This Matters for Phase 2

### Before (Monolithic)
- User stuck with Google Drive
- AI choices locked at build time
- New integrations require code changes
- Hard to extend for different use cases

### After (Pluggable)
- User chooses their own storage (Google Drive, Notion, Obsidian, etc.)
- User chooses their AI (Ollama, Claude, OpenAI, etc.)
- Users can install new tools without updating extension
- Researchers, students, professionals all find value

### Competitive Advantage
**Web Highlights:** "Use our cloud, use our AI, use our integrations"  
**You:** "Use whatever you want. We're a platform, not a prison."

---

## 🔄 Integration: MCP = Plugin System

You asked about MCP (Model Context Protocol). **MCP IS the plugin system.**

```
MCP is how Claude agents call external tools.
Our plugin system is how users plug those tools in.

Plugin System (user facing):
  - Install tool plugins
  - Configure them
  - Agents use them

MCP (agent-facing):
  - Agents call tools via MCP
  - Tools describe themselves via MCP schema
  - Results flow back to agent

They work together!
```

### Example Flow
```
1. User installs "Semantic Scholar" plugin
2. Plugin registers itself as MCP tool
3. Agent says "I need research papers"
4. Agent calls MCP tool: semantic_scholar.search()
5. Tool returns papers via MCP protocol
6. Agent synthesizes into brief
7. User gets result, chooses where to save it (storage plugin)
```

---

## 📊 Phase 2 Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| **Plugin count** | 3-5 built-in storage, 3-5 AI, 5+ tools | Choice |
| **Integration options** | 20+ (Notion, Obsidian, Slack, etc.) | Freedom |
| **Agent reliability** | > 95% success rate | Trust |
| **Setup friction** | < 5 clicks to change storage | Ease |
| **User retention** | 60% 30-day retention | Stickiness |

---

## 🎯 Answer to Your Question

> **Should we cover plugin systems in Phase 2 via agents?**

**Yes, but let me reframe it:**

Phase 2 isn't "agents that use Google Drive".  
Phase 2 is "**agents that use whatever the user chooses**".

The plugin system IS the agent infrastructure.

Without it:
- Agents are coupled to Google Drive
- Users can't choose their AI
- Hard to add new tools

With it:
- Agents work with any storage
- Users pick their AI and tools
- Infinitely extensible

**Recommendation:** Build the plugin architecture FIRST (week 1-2), THEN build agents ON TOP of it. Don't build agents for Google Drive and try to make it pluggable later—that's architectural debt.

---

## 💻 Start Phase 2 Like This

```bash
# You're on phase/2-intelligent-agents branch

1. Create plugin foundation
   - lib/plugin-registry.js
   - lib/plugin-interfaces.js
   - lib/plugin-loader.js

2. Refactor existing code into plugins
   - storage-providers.js → plugins/storage/
   - ai-summary-service.js → plugins/ai/

3. Build agent orchestrator
   - lib/agent-orchestrator.js
   - lib/agents/research-agent.js
   - lib/agents/writing-agent.js

4. Integrate MCP
   - Hook plugins into MCP protocol
   - Let agents call tools

5. UI for plugin management
   - Settings page shows installed plugins
   - Easy enable/disable
   - Provider selection dropdowns
```

This makes you a **platform**, not just a tool. That's the competitive moat.

---

*Ready to start Phase 2 with plugin architecture as the foundation?*
