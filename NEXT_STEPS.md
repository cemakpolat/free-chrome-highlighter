# Immediate Next Steps: AI-Agentic Web Highlighter

**Goal:** Transform your extension into a visionary research platform with embedded AI agents and tool integrations.

---

## 🎯 This Week (Priority Actions)

### 1. Design System Finalization (2-3 hours)
**File:** `design-tokens.css` (already started)

Expand with:
- [ ] Highlight type colors (definition, evidence, question, action, key)
- [ ] Component spacing/sizing scale
- [ ] Animation/transition timings
- [ ] A11y color contrast verification

```css
/* Add to design-tokens.css */
:root {
  /* Highlight Types */
  --highlight-definition: #FEF3C7;     /* Yellow */
  --highlight-evidence: #DBEAFE;       /* Blue */
  --highlight-question: #F3E8FF;       /* Purple */
  --highlight-action: #FECACA;         /* Red */
  --highlight-key: #86EFAC;            /* Green */
  
  /* Interaction States */
  --state-hover: 0 4px 12px rgba(0,0,0,0.1);
  --state-active: 0 10px 25px rgba(0,0,0,0.15);
  --state-focus: 0 0 0 3px var(--color-blue-light);
}
```

---

### 2. Popup Redesign (4-5 hours)
**Current:** `popup-minimal.html` (tab-based)
**Goal:** Context-aware, single unified interface

Create new file: `popup-modern.html`

```html
<!-- Structure:
┌──────────────────────┐
│ Quick Actions Bar    │  ← Always visible (2-3 actions)
├──────────────────────┤
│ Dynamic Content      │  ← Changes by context:
│ (Page Type Aware)    │    - Article page → "Find related" + "Ask AI"
│                      │    - PDF → "Summarize section"
│                      │    - First time → Interactive tutorial
├──────────────────────┤
│ Footer Controls      │  ← Settings + Stats (minimal)
└──────────────────────┘
-->
```

**Key improvement:** Reduce cognitive load, context-sensitive help

---

### 3. Highlight Context Extractor (3-4 hours)
**New file:** `lib/highlight-intelligence.js`

```javascript
class HighlightIntelligence {
  /**
   * Extract rich context around a highlight
   */
  async extractContext(highlight) {
    return {
      highlight: highlight.text,
      context: {
        before: surroundingParagraph.before,
        after: surroundingParagraph.after,
      },
      pageContext: {
        title: document.title,
        author: extractAuthor(),
        contentType: detectContentType(), // article, paper, blog, news
        language: document.documentElement.lang,
        wordCount: estimateReadTime(),
      },
      position: {
        section: getCurrentSection(),
        percentageDown: scrollPercentage(),
      },
    };
  }
}
```

**Why:** Foundation for smarter search, better summaries, relationship detection

---

### 4. Auto-Tagging System (3-4 hours)
**New file:** `lib/highlight-classifier.js`

```javascript
class HighlightClassifier {
  /**
   * Classify highlight type automatically
   */
  async classify(highlight) {
    return {
      type: 'definition|evidence|question|action|key', // auto-detected
      topics: ['AI', 'ML', 'algorithms'], // semantic tags
      importance: 1-5, // confidence score
      suggestedActions: [
      // What user might want to do:
        'Ask AI about this',
        'Find related highlights',
        'Add to learning deck'
      ],
    };
  }
}
```

**Classification rules:**
- "Define/defined as" → definition
- "Shows that/proves" → evidence
- "Why/how/what if" → question
- "TODO/must/should" → action
- "Key insight/critical/essential" → key

---

### 5. MCP Client Framework (4-5 hours)
**New file:** `lib/mcp-client.js`

```javascript
class MCPClient {
  constructor(config) {
    this.servers = new Map(); // { name → server config }
    this.tools = new Map();   // { toolId → tool metadata }
  }
  
  async registerServer(name, config) {
    // Register an MCP server
    // config = { host, port, protocol, auth? }
  }
  
  async callTool(toolId, args) {
    // Execute a tool via MCP
  }
  
  async listTools() {
    // Discover available tools
  }
}
```

**High-priority servers to register first:**
1. Semantic Scholar (paper search)
2. Ollama (local Claude)
3. Hugging Face (open models)

---

## 📅 Next 2 Weeks (Build Foundation)

### Week 1
- [ ] Finalize design tokens
- [ ] Deploy popup redesign
- [ ] Implement highlight context extraction
- [ ] Add auto-tagging classifier

### Week 2
- [ ] Create Storybook component library (interactive)
- [ ] Implement knowledge graph structure
- [ ] Set up MCP client framework
- [ ] Integrate first MCP server (Ollama local)

---

## 🧠 Architecture Decision Points

### Should You...?

**Q1: Where to build MCP client?**
- Option A: Background script (better, isolated)
- Option B: Content script (easier access to highlights)
- **Decision:** Background script, communicate via messages

**Q2: How to store highlight relationships?**
- Option A: Local storage (simple, limits scale)
- Option B: Cloud (Google Drive, but privacy?)
- **Decision:** Local storage initially, cloud sync as premium feature

**Q3: When to call agents?**
- Option A: Always available in popup
- Option B: Context-aware (show "Ask AI" only when relevant)
- **Decision:** Context-aware to avoid feature bloat

---

## 🚀 Quick Wins (Do These First!)

These can be done independently, ship fast:

1. **Highlight Type Colors** (30 min)
   - Add colored dots to highlights based on auto-detected type
   - Visual immediately, no backend needed

2. **Search by Type** (1 hour)
   - Filter highlights in manager by type (definitions only, questions only, etc.)
   - Useful instantly

3. **Context Preview** (1.5 hours)
   - On hover, show surrounding paragraph
   - Better context without clicking

4. **Dark Mode Toggle** (30 min)
   - Add 🌙 button in popup
   - Use existing design tokens

---

## 📊 Success Criteria for Phase 1 (This Month)

- [ ] Design system production-ready
- [ ] Popup redesign launched
- [ ] Context extraction working on all content types
- [ ] Auto-tagging 80%+ accuracy
- [ ] MCP client can connect to local Ollama
- [ ] 50%+ faster UI response times

---

## 🔗 Integration Checklist

### MCP Servers (Priority Order)

**Tier 1: Critical (Month 1)**
- [ ] Ollama (local Claude/Llama)
- [ ] Semantic Scholar API
- [ ] Notion/Obsidian API

**Tier 2: High-Value (Month 2)**
- [ ] Hugging Face Inference
- [ ] GitHub API
- [ ] Slack/Discord webhooks

**Tier 3: Nice-to-Have (Month 3+)**
- [ ] Gmail/Evernote
- [ ] Grammarly/Hemingway
- [ ] Observable/Plotly

---

## 📝 Branching Strategy

```bash
# For each phase, create feature branch
git checkout -b feature/highlight-intelligence
git checkout -b feature/popup-redesign
git checkout -b feature/mcp-integration

# Merge to develop when complete
# Deploy to main for releases
```

---

## 🎯 Measure Success

### Metrics to Track

```javascript
// In analytics (local, no external tracking)
{
  highlights_created: count,
  highlights_deleted: count,
  average_context_extracted: yes/no,
  auto_tagging_enabled: yes/no,
  mcp_integrations_active: count,
  agent_calls: count,
  agent_success_rate: percentage,
  user_retention_7d: percentage,
  feature_adoption: {
    context_preview: percentage,
    auto_tagging: percentage,
    agents: percentage,
  }
}
```

---

## 🎨 Design Assets Needed

Create/update:
- [ ] Icon set for highlight types
- [ ] Agent status indicators
- [ ] MCP integration badges
- [ ] Loading states/skeletons
- [ ] Empty states messaging
- [ ] Error state designs

---

## 💡 Research/Learning

Before implementing, review:

1. **MCP Specification**
   - https://modelcontextprotocol.io/
   - Understand server/client architecture

2. **Claude API Best Practices**
   - Token limits, rate limits
   - Streaming vs non-streaming
   - System prompts for agents

3. **Knowledge Graph Design**
   - Vector embeddings for similarity
   - Graph visualization libraries
   - Query optimization

---

## 🚨 Risks & Mitigation

**Risk 1: Feature scope creep**
- *Mitigation:* Strict prioritization, timeline discipline

**Risk 2: Performance degradation with agents**
- *Mitigation:* Agent calls async, progress indicators, caching

**Risk 3: Storage limits (Chrome quota)**
- *Mitigation:* Implement cleanup, encourage cloud sync

**Risk 4: MCP server reliability**
- *Mitigation:* Fallbacks, offline mode, graceful degradation

---

## 🎬 Final Thought

You're building something ambitious: a research platform that's elegant, intelligent, and free. The roadmap is aggressive but achievable. The key is:

1. **Ship incrementally** - Don't wait for perfection
2. **Design first** - Let elegance guide feature addition
3. **Prioritize users** - Not feature count
4. **Build community** - Open source + GitHub engagement

The moment you ship agentic research features (Month 2-3), you'll have something Web Highlights users will switch to immediately.

---

**Let's build something that researchers actually love to use.**

---

*Version: 1.0 - Phase 1 Action Plan*
*Updated: 2026-06-29*
