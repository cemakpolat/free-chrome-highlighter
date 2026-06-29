---
name: highlighter-project-vision
description: Strategic vision and positioning for Universal Web Highlighter as AI-agentic alternative to Web Highlights
metadata:
  type: project
---

## Universal Web Highlighter - Strategic Vision

**Goal:** Build the superior, more elegant, AI-integrated alternative to Web Highlights—emphasizing freedom, intelligence, and extensibility over feature bloat.

## Core Differentiators vs Web Highlights

**Web Highlights:** Premium cloud-first, feature-rich, expensive → $10-15/month
**Your App:** Free-first, elegant, AI-agentic, extensible, open-source

### Key Competitive Advantages

1. **Free Forever Core** - Cheaper, no vendor lock-in
2. **Agentic Intelligence** - Built-in Claude/Ollama agents for automation
3. **MCP Integration** - Connect to 50+ external tools/APIs seamlessly
4. **Open Source** - Community-driven, transparent
5. **Design Excellence** - Minimalist, intentional vs cluttered
6. **Privacy-First** - Local processing, no forced cloud
7. **Developer-Friendly** - API, plugins, custom agents

## Architecture: 3-Phase Integration

### Phase 1: Highlight Intelligence
- Context extraction (surrounding text + page metadata)
- Auto-tagging by type (definition, evidence, question, TODO, key)
- Multi-label classification (topic, importance, learning status)
- Highlight relationships graph

### Phase 2: Agentic Actions
- Smart Summary Agent (multi-document synthesis)
- Research Agent (answer questions, suggest follow-up)
- Writing Assistant Agent (outline, citations, paraphrase)
- Learning Agent (spaced repetition, practice questions)

### Phase 3: MCP Integration
- High-priority: Semantic Scholar, Obsidian/Notion, Claude API, Ollama
- Later: Slack, Discord, Evernote, GitHub, Hemingway, etc.
- Custom agent orchestration (chain multiple agents)

## Design Philosophy: "Elegant Simplicity"

**Current issue:** Feature-heavy design alienates casual users
**Target:** Intentional, minimal, powerful—accessible yet capable

### Design Evolution
1. **Popup redesign**: Context-aware (changes by page type, not tabs)
2. **Manager redesign**: Card-based grid instead of dense table
3. **Complete color system**: Semantic highlight types (definition=yellow, evidence=blue, etc.)
4. **Dark mode + themes**: Automatic + manual + per-site preference
5. **Storybook component library**: For consistency

## Business Model (Future, Not Yet)

Free: Unlimited highlighting, no AI
Premium ($2-3/mo): AI summaries, research assistant, 2 MCP integrations
Pro ($5-7/mo): Unlimited MCP, advanced agentics, team features
Enterprise: Self-hosted, API, custom

**Positioning:** 5-10x cheaper than Web Highlights + more advanced AI

## 6-Month Implementation Timeline

```
Month 1: Design completion + Highlight Intelligence MVP + Popup redesign
Month 2-3: Agentic Actions Phase 1 + MCP framework setup
Month 4: First MCP integrations + Advanced agentics
Month 5: Team features + More MCP integrations
Month 6: Polish + Beta + Marketing
```

## Brand Narrative

**Tagline:** "Research, Reimagined: Highlight. Think. Create."

**Positioning:** Open, intelligent, beautiful—freedom for researchers, students, knowledge workers.

**Pillars:** Elegant Simplicity, Intelligent, Open & Extensible, Privacy-First, Accessible

## Technical Stack Evolution

Current → Target:
- Add: MCP Client, Agent Orchestrator, Highlight Intelligence, Knowledge Graph
- All wrapped in unified API layer for extension UI

## Next Week Priorities

- Finalize design tokens
- Create Storybook
- Redesign popup (context-aware, minimal)
- Implement highlight context extraction
- Add auto-tagging system
- Set up MCP client framework
