/**
 * Agent Orchestrator
 *
 * Manages agent lifecycle and execution.
 * Agents receive services via dependency injection — they never
 * import plugins directly, so they work with any registered provider.
 *
 * Usage:
 *   const orchestrator = new AgentOrchestrator(registry);
 *   const result = await orchestrator.run('research', {
 *     highlights: [...],
 *     query: 'What are the main arguments?'
 *   });
 */

'use strict';

class AgentOrchestrator {
  constructor(registry) {
    this.registry = registry;
    this._agents = new Map();
    this._running = new Map();   // agentName → { status, startTime, promise }
    this._history = [];
    this._maxHistoryLength = 50;
  }

  // ─── Agent Registration ───────────────────────────────────────────────────

  register(name, AgentClass) {
    this._agents.set(name, AgentClass);
    console.log(`[Orchestrator] Registered agent: ${name}`);
  }

  list() {
    return Array.from(this._agents.entries()).map(([name, AgentClass]) => ({
      name,
      description: AgentClass.description || '',
      capabilities: AgentClass.capabilities || [],
      isRunning: this._running.has(name)
    }));
  }

  // ─── Execution ────────────────────────────────────────────────────────────

  /**
   * Run an agent by name.
   * @param {string} agentName
   * @param {object} context  - Agent-specific input
   * @param {object} options  - { onProgress(msg), timeout }
   */
  async run(agentName, context = {}, options = {}) {
    const AgentClass = this._agents.get(agentName);
    if (!AgentClass) throw new Error(`Unknown agent: "${agentName}". Available: ${[...this._agents.keys()].join(', ')}`);

    if (this._running.has(agentName)) {
      throw new Error(`Agent "${agentName}" is already running.`);
    }

    const services = this._buildServices(context);
    const agent = new AgentClass(services, options.onProgress || (() => {}));

    const run = {
      agentName,
      status: 'running',
      startTime: Date.now(),
      context
    };

    this._running.set(agentName, run);

    try {
      const timeout = options.timeout || 60_000;
      const result = await Promise.race([
        agent.execute(context),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Agent "${agentName}" timed out after ${timeout / 1000}s`)), timeout))
      ]);

      run.status = 'done';
      run.result = result;
      this._recordHistory({ ...run, duration: Date.now() - run.startTime });
      return result;
    } catch (err) {
      run.status = 'error';
      run.error = err.message;
      this._recordHistory({ ...run, duration: Date.now() - run.startTime });
      throw err;
    } finally {
      this._running.delete(agentName);
    }
  }

  isRunning(agentName) {
    return this._running.has(agentName);
  }

  getHistory() {
    return [...this._history];
  }

  // ─── Service Injection ────────────────────────────────────────────────────

  _buildServices(context) {
    const registry = this.registry;

    return {
      get storage() {
        const id = context.storagePluginId || 'local';
        try { return registry.get('storage', id); }
        catch { return registry.getActive('storage') || registry.get('storage', 'local'); }
      },
      get ai() {
        const id = context.aiPluginId;
        if (id) {
          try { return registry.get('ai', id); } catch { /**/ }
        }
        return registry.getActive('ai') || registry.get('ai', 'extractive');
      },
      getTool(toolId) {
        return registry.get('tool', toolId);
      },
      hasTool(toolId) {
        return registry.has('tool', toolId);
      }
    };
  }

  _recordHistory(entry) {
    this._history.unshift(entry);
    if (this._history.length > this._maxHistoryLength) {
      this._history = this._history.slice(0, this._maxHistoryLength);
    }
  }
}


// ─── Base Agent ───────────────────────────────────────────────────────────────

class BaseAgent {
  static get description() { return ''; }
  static get capabilities() { return []; }

  constructor(services, onProgress) {
    this.services = services;
    this.progress = onProgress || (() => {});
  }

  async execute(context) {
    throw new Error(`${this.constructor.name} must implement execute()`);
  }

  log(msg) {
    console.log(`[${this.constructor.name}]`, msg);
    this.progress(msg);
  }
}


// ─── Research Agent ───────────────────────────────────────────────────────────

class ResearchAgent extends BaseAgent {
  static get description() {
    return 'Synthesizes highlights into a research brief with related papers from Semantic Scholar.';
  }

  static get capabilities() {
    return ['summarize', 'find-papers', 'extract-concepts', 'generate-brief'];
  }

  async execute({ highlights, query, includeRelatedPapers = true }) {
    if (!highlights?.length) throw new Error('At least one highlight is required.');

    this.log('Extracting key concepts from highlights...');
    const concepts = await this.services.ai.extractConcepts(
      highlights.map(h => h.text).join(' ')
    );
    this.log(`Found ${concepts.length} concepts: ${concepts.slice(0, 5).join(', ')}`);

    this.log('Generating summary from highlights...');
    const { summary } = await this.services.ai.generateSummary(
      highlights,
      query || 'Research Brief'
    );

    let relatedPapers = [];
    if (includeRelatedPapers && this.services.hasTool('semantic-scholar')) {
      this.log('Searching for related academic papers...');
      try {
        const tool = this.services.getTool('semantic-scholar');
        const searchQuery = concepts.slice(0, 4).join(' ');
        const { result } = await tool.call('search', { query: searchQuery, limit: 5 });
        relatedPapers = result || [];
        this.log(`Found ${relatedPapers.length} related papers`);
      } catch (err) {
        this.log(`Paper search unavailable: ${err.message}`);
      }
    }

    let brief = '';
    if (query) {
      this.log('Answering your research question...');
      const { answer } = await this.services.ai.answerQuestion(query, highlights);
      brief = answer;
    } else {
      brief = summary;
    }

    const result = {
      type: 'research-brief',
      query: query || null,
      summary,
      brief,
      concepts,
      relatedPapers,
      highlightCount: highlights.length,
      sources: [...new Set(highlights.map(h => h.url))].filter(Boolean),
      generatedAt: new Date().toISOString()
    };

    this.log('Brief complete. Saving...');
    await this._saveBrief(result);

    return result;
  }

  async _saveBrief(brief) {
    try {
      const existing = await chrome.storage.local.get('research_briefs');
      const briefs = existing.research_briefs || [];
      briefs.unshift({ ...brief, id: `brief_${Date.now()}` });
      if (briefs.length > 20) briefs.splice(20);
      await chrome.storage.local.set({ research_briefs: briefs });
    } catch (err) {
      this.log(`Could not save brief: ${err.message}`);
    }
  }
}


// ─── Writing Agent ────────────────────────────────────────────────────────────

class WritingAgent extends BaseAgent {
  static get description() {
    return 'Turns highlights into a structured essay outline, argument map, or draft sections.';
  }

  static get capabilities() {
    return ['outline', 'argument-map', 'citations', 'draft'];
  }

  async execute({ highlights, format = 'outline', title = '', style = 'academic' }) {
    if (!highlights?.length) throw new Error('At least one highlight is required.');

    this.log(`Building ${format}...`);

    const grouped = this._groupByType(highlights);
    let output;

    switch (format) {
      case 'outline':
        output = await this._buildOutline(highlights, grouped, title);
        break;
      case 'argument-map':
        output = await this._buildArgumentMap(highlights, grouped);
        break;
      case 'citations':
        output = this._buildCitations(highlights, style);
        break;
      case 'draft':
        output = await this._buildDraft(highlights, grouped, title);
        break;
      default:
        output = await this._buildOutline(highlights, grouped, title);
    }

    const result = {
      type: 'writing-output',
      format,
      title,
      style,
      content: output,
      highlightCount: highlights.length,
      generatedAt: new Date().toISOString()
    };

    await this._saveOutput(result);
    this.log('Done.');
    return result;
  }

  _groupByType(highlights) {
    const groups = { definition: [], evidence: [], question: [], action: [], key: [], default: [] };
    highlights.forEach(h => {
      const type = h.type || 'default';
      if (groups[type]) groups[type].push(h);
      else groups.default.push(h);
    });
    return groups;
  }

  async _buildOutline(highlights, grouped, title) {
    this.log('Generating outline structure...');
    const concepts = await this.services.ai.extractConcepts(highlights.map(h => h.text).join(' '));

    const sections = concepts.slice(0, 5).map((concept, i) => {
      const relevant = highlights.filter(h => h.text.toLowerCase().includes(concept.toLowerCase()));
      return {
        heading: `${i + 1}. ${concept.charAt(0).toUpperCase() + concept.slice(1)}`,
        highlights: relevant.slice(0, 3).map(h => `  - ${h.text.substring(0, 120)}`)
      };
    });

    const lines = [
      `# ${title || 'Essay Outline'}`,
      '',
      '## Introduction',
      `*(${grouped.definition.length} definitions, ${grouped.key.length} key insights)*`,
      '',
      ...sections.flatMap(s => [s.heading, ...s.highlights, '']),
      '## Conclusion',
      '*(Key takeaways from highlights)*',
      '',
      grouped.question.length > 0 ? `## Open Questions\n${grouped.question.map(h => `- ${h.text}`).join('\n')}` : ''
    ].filter(l => l !== undefined);

    return lines.join('\n');
  }

  async _buildArgumentMap(highlights, grouped) {
    this.log('Building argument map...');

    const lines = [
      '# Argument Map',
      '',
      '## Claims (Key Highlights)',
      ...grouped.key.map(h => `- **${h.text.substring(0, 100)}**`),
      '',
      '## Supporting Evidence',
      ...grouped.evidence.map(h => `- ${h.text.substring(0, 150)}`),
      '',
      '## Definitions',
      ...grouped.definition.map(h => `- ${h.text.substring(0, 150)}`),
      '',
      '## Open Questions',
      ...grouped.question.map(h => `- ${h.text.substring(0, 150)}`),
      '',
      '## Action Items',
      ...grouped.action.map(h => `- [ ] ${h.text.substring(0, 150)}`)
    ];

    return lines.join('\n');
  }

  _buildCitations(highlights, style) {
    const sources = [...new Map(
      highlights.filter(h => h.url).map(h => [h.url, h])
    ).values()];

    if (style === 'apa') {
      return sources.map((h, i) =>
        `[${i + 1}] ${h.title || h.url}. Retrieved from ${h.url}`
      ).join('\n');
    }

    return sources.map((h, i) => `${i + 1}. ${h.title || h.url}: ${h.url}`).join('\n');
  }

  async _buildDraft(highlights, grouped, title) {
    this.log('Drafting introduction...');
    const { summary } = await this.services.ai.generateSummary(highlights, title);

    const lines = [
      `# ${title || 'Draft'}`,
      '',
      '## Introduction',
      summary,
      '',
      '## Main Points',
      ...grouped.key.map(h => `\n${h.text}\n`),
      '',
      '## Supporting Evidence',
      ...grouped.evidence.map(h => `> ${h.text}`),
      '',
      '## Conclusion',
      '*(To be written)*'
    ];

    return lines.join('\n');
  }

  async _saveOutput(output) {
    try {
      const existing = await chrome.storage.local.get('writing_outputs');
      const outputs = existing.writing_outputs || [];
      outputs.unshift({ ...output, id: `writing_${Date.now()}` });
      if (outputs.length > 20) outputs.splice(20);
      await chrome.storage.local.set({ writing_outputs: outputs });
    } catch (err) {
      this.log(`Could not save output: ${err.message}`);
    }
  }
}


// ─── Learning Agent ───────────────────────────────────────────────────────────

class LearningAgent extends BaseAgent {
  static get description() {
    return 'Converts highlights into spaced repetition flashcards and practice questions.';
  }

  static get capabilities() {
    return ['flashcards', 'quiz', 'study-plan'];
  }

  async execute({ highlights, format = 'flashcards', difficulty = 'medium' }) {
    if (!highlights?.length) throw new Error('At least one highlight is required.');

    this.log(`Generating ${format}...`);

    let output;
    switch (format) {
      case 'flashcards':
        output = await this._buildFlashcards(highlights);
        break;
      case 'quiz':
        output = await this._buildQuiz(highlights, difficulty);
        break;
      case 'study-plan':
        output = this._buildStudyPlan(highlights);
        break;
      default:
        output = await this._buildFlashcards(highlights);
    }

    const result = {
      type: 'learning-output',
      format,
      difficulty,
      content: output,
      highlightCount: highlights.length,
      generatedAt: new Date().toISOString()
    };

    await this._saveOutput(result);
    this.log('Done.');
    return result;
  }

  async _buildFlashcards(highlights) {
    this.log('Creating flashcards...');

    const cards = [];
    for (const h of highlights) {
      const type = h.type || 'default';

      if (type === 'definition') {
        // Definition → Q: What does X mean? A: highlight text
        const concept = h.text.split(/\bis\b|means|defined/i)[0]?.trim().substring(0, 50) || 'this term';
        cards.push({ front: `What does "${concept}" mean?`, back: h.text, source: h.url });
      } else if (type === 'evidence') {
        cards.push({ front: `What evidence supports this claim from ${h.title || 'this source'}?`, back: h.text, source: h.url });
      } else if (type === 'key') {
        cards.push({ front: `What is the key insight here?`, back: h.text, source: h.url });
      } else {
        // Generic: show first half, answer with full text
        const pivot = Math.floor(h.text.length / 2);
        const cutPoint = h.text.indexOf(' ', pivot);
        if (cutPoint > 0) {
          cards.push({ front: h.text.substring(0, cutPoint) + ' ...?', back: h.text, source: h.url });
        }
      }
    }

    return { cards, totalCards: cards.length };
  }

  async _buildQuiz(highlights, difficulty) {
    this.log('Generating quiz questions...');

    const questions = highlights.slice(0, 10).map((h, i) => {
      const type = h.type || 'default';
      let question, correctAnswer;

      if (type === 'definition') {
        question = `True or False: "${h.text.substring(0, 80)}..."`;
        correctAnswer = 'True';
      } else if (type === 'question' && h.note) {
        question = h.text;
        correctAnswer = h.note;
      } else {
        question = `What concept is illustrated by: "${h.text.substring(0, 100)}..."?`;
        correctAnswer = h.text;
      }

      return { id: i + 1, question, correctAnswer, source: h.url, hint: difficulty === 'easy' ? h.text.substring(0, 30) : null };
    });

    return { questions, totalQuestions: questions.length, difficulty };
  }

  _buildStudyPlan(highlights) {
    const byType = {};
    highlights.forEach(h => {
      const t = h.type || 'default';
      if (!byType[t]) byType[t] = [];
      byType[t].push(h);
    });

    const plan = [
      { session: 1, focus: 'Definitions', count: byType.definition?.length || 0, items: (byType.definition || []).map(h => h.text.substring(0, 80)) },
      { session: 2, focus: 'Key Insights', count: byType.key?.length || 0, items: (byType.key || []).map(h => h.text.substring(0, 80)) },
      { session: 3, focus: 'Evidence Review', count: byType.evidence?.length || 0, items: (byType.evidence || []).map(h => h.text.substring(0, 80)) },
      { session: 4, focus: 'Open Questions', count: byType.question?.length || 0, items: (byType.question || []).map(h => h.text.substring(0, 80)) }
    ].filter(s => s.count > 0);

    return { sessions: plan, totalHighlights: highlights.length };
  }

  async _saveOutput(output) {
    try {
      const existing = await chrome.storage.local.get('learning_outputs');
      const outputs = existing.learning_outputs || [];
      outputs.unshift({ ...output, id: `learning_${Date.now()}` });
      if (outputs.length > 20) outputs.splice(20);
      await chrome.storage.local.set({ learning_outputs: outputs });
    } catch (err) {
      this.log(`Could not save output: ${err.message}`);
    }
  }
}


// ─── Export ───────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AgentOrchestrator, BaseAgent, ResearchAgent, WritingAgent, LearningAgent };
} else {
  window.AgentOrchestrator = AgentOrchestrator;
  window.BaseAgent = BaseAgent;
  window.ResearchAgent = ResearchAgent;
  window.WritingAgent = WritingAgent;
  window.LearningAgent = LearningAgent;
}
