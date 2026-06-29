'use strict';

// ─── Page-level tab switching ─────────────────────────────────────────────────

document.querySelectorAll('.page-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`view-${view}`)?.classList.add('active');

    if (view === 'agents') initAgentsView();
    if (view === 'plugins') initPluginsView();
  });
});

// ─── Agent sidebar selection ──────────────────────────────────────────────────

document.querySelectorAll('.agent-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.agent-config').forEach(c => c.classList.add('hidden'));
    card.classList.add('active');
    document.getElementById(`config-${card.dataset.agent}`)?.classList.remove('hidden');
  });
});

// ─── Format chip toggles ──────────────────────────────────────────────────────

function bindChips(groupId, dataAttr) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.addEventListener('click', e => {
    const chip = e.target.closest('.format-chip');
    if (!chip) return;
    group.querySelectorAll('.format-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
}

bindChips('writing-format-chips', 'format');
bindChips('learning-format-chips', 'format');
bindChips('difficulty-chips', 'difficulty');

// ─── Run buttons ──────────────────────────────────────────────────────────────

document.querySelectorAll('.run-agent-btn').forEach(btn => {
  btn.addEventListener('click', () => runAgent(btn.dataset.agent));
});

async function runAgent(agentName) {
  const btn = document.querySelector(`.run-agent-btn[data-agent="${agentName}"]`);
  const resultArea = document.getElementById('agentResultArea');

  btn.disabled = true;
  showProgress(resultArea, 'Preparing highlights...');

  try {
    const highlights = await loadHighlightsForAgent(agentName);
    if (!highlights.length) {
      showError(resultArea, 'No highlights found. Highlight some text on a page first.');
      return;
    }

    const context = buildContext(agentName, highlights);
    showProgress(resultArea, `Running ${agentName} agent...`);

    const response = await chrome.runtime.sendMessage({
      action: 'agent:run',
      agentName,
      context
    });

    if (!response.success) throw new Error(response.error);
    renderResult(resultArea, agentName, response.result);
  } catch (err) {
    showError(resultArea, err.message);
  } finally {
    btn.disabled = false;
  }
}

async function loadHighlightsForAgent(agentName) {
  const scopeEl = document.getElementById(`${agentName}-scope`);
  const scope = scopeEl?.value || 'all';

  const stored = await chrome.storage.local.get(null);
  const all = [];

  for (const [key, val] of Object.entries(stored)) {
    if (key.startsWith('highlights_') && Array.isArray(val)) {
      all.push(...val);
    }
  }

  if (scope === 'page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [null]);
    if (tab?.url) {
      const domain = new URL(tab.url).hostname;
      return all.filter(h => h.url?.includes(domain));
    }
  }

  return all;
}

function buildContext(agentName, highlights) {
  if (agentName === 'research') {
    return {
      highlights,
      query: document.getElementById('research-query')?.value?.trim() || '',
      includeRelatedPapers: document.getElementById('research-papers')?.checked ?? true
    };
  }

  if (agentName === 'writing') {
    const formatChip = document.querySelector('#writing-format-chips .format-chip.active');
    return {
      highlights,
      format: formatChip?.dataset.format || 'outline',
      title: document.getElementById('writing-title')?.value?.trim() || ''
    };
  }

  if (agentName === 'learning') {
    const formatChip = document.querySelector('#learning-format-chips .format-chip.active');
    const diffChip = document.querySelector('#difficulty-chips .format-chip.active');
    return {
      highlights,
      format: formatChip?.dataset.format || 'flashcards',
      difficulty: diffChip?.dataset.difficulty || 'medium'
    };
  }

  return { highlights };
}

// ─── Result rendering ─────────────────────────────────────────────────────────

function showProgress(area, msg) {
  area.innerHTML = `
    <div class="agent-progress">
      <div class="agent-spinner"></div>
      <span>${escHtml(msg)}</span>
    </div>`;
}

function showError(area, msg) {
  area.innerHTML = `<div class="agent-error">${escHtml(msg)}</div>`;
}

function renderResult(area, agentName, result) {
  if (agentName === 'research') renderResearch(area, result);
  else if (agentName === 'writing') renderWriting(area, result);
  else if (agentName === 'learning') renderLearning(area, result);
  else area.innerHTML = `<pre class="agent-result-body">${escHtml(JSON.stringify(result, null, 2))}</pre>`;
}

function renderResearch(area, result) {
  const papersHtml = (result.relatedPapers || []).map(p => `
    <div class="paper-item">
      <div class="paper-title">${escHtml(p.title || 'Untitled')}</div>
      <div class="paper-meta">${escHtml([p.year, p.venue, p.citationCount != null ? `${p.citationCount} citations` : ''].filter(Boolean).join(' · '))}</div>
    </div>`).join('');

  const conceptsHtml = (result.concepts || []).map(c =>
    `<span class="concept-pill">${escHtml(c)}</span>`).join('');

  area.innerHTML = `
    <div class="agent-result-card">
      <div class="agent-result-title">
        Research Brief
        <button class="agent-result-copy" data-copy="${escAttr(result.brief || result.summary || '')}">Copy</button>
      </div>
      <div class="agent-result-body">${escHtml(result.brief || result.summary || '')}</div>
      ${conceptsHtml ? `
        <div class="agent-result-section">
          <div class="agent-result-section-title">Key Concepts</div>
          <div class="concept-pills">${conceptsHtml}</div>
        </div>` : ''}
      ${papersHtml ? `
        <div class="agent-result-section">
          <div class="agent-result-section-title">Related Papers</div>
          ${papersHtml}
        </div>` : ''}
    </div>`;

  bindCopyButtons(area);
}

function renderWriting(area, result) {
  area.innerHTML = `
    <div class="agent-result-card">
      <div class="agent-result-title">
        ${escHtml(result.title || result.format || 'Output')}
        <button class="agent-result-copy" data-copy="${escAttr(result.content || '')}">Copy</button>
      </div>
      <div class="agent-result-body">${escHtml(result.content || '')}</div>
    </div>`;

  bindCopyButtons(area);
}

function renderLearning(area, result) {
  if (result.format === 'flashcards' && result.content?.cards) {
    const cardsHtml = result.content.cards.slice(0, 12).map(c => `
      <div class="flashcard">
        <div class="flashcard-front">${escHtml(c.front)}</div>
        <div class="flashcard-back">${escHtml(c.back)}</div>
      </div>`).join('');

    area.innerHTML = `
      <div class="agent-result-card">
        <div class="agent-result-title">
          Flashcards (${result.content.totalCards})
          <button class="agent-result-copy" data-copy="${escAttr(JSON.stringify(result.content.cards, null, 2))}">Export</button>
        </div>
        <div class="flashcard-grid">${cardsHtml}</div>
      </div>`;
  } else {
    area.innerHTML = `
      <div class="agent-result-card">
        <div class="agent-result-title">
          ${escHtml(result.format)}
          <button class="agent-result-copy" data-copy="${escAttr(JSON.stringify(result.content, null, 2))}">Export</button>
        </div>
        <div class="agent-result-body">${escHtml(JSON.stringify(result.content, null, 2))}</div>
      </div>`;
  }

  bindCopyButtons(area);
}

function bindCopyButtons(area) {
  area.querySelectorAll('.agent-result-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy || '').then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  });
}

// ─── Agents view init ─────────────────────────────────────────────────────────

function initAgentsView() {
  // Show active AI plugin label
  chrome.runtime.sendMessage({ action: 'plugin:summary' }).then(resp => {
    if (resp?.success) {
      const chip = document.getElementById('aiPluginChip');
      if (chip) chip.textContent = `AI: ${resp.result.active.ai || 'none'}`;
    }
  }).catch(() => {});
}

// ─── Plugins view ─────────────────────────────────────────────────────────────

const PLUGIN_ICONS = {
  'local': '💾', 'google-drive': '☁️', 'notion': '📓', 'obsidian': '💎',
  'extractive': '🔤', 'ollama': '🦙', 'claude-api': '🤖', 'huggingface': '🤗',
  'semantic-scholar': '📚', 'slack': '💬', 'clipboard': '📋'
};

async function initPluginsView() {
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'plugin:list' });
    if (!resp?.success) { renderPluginError(); return; }

    renderPluginCategory('storage', resp.result.storage || []);
    renderPluginCategory('ai', resp.result.ai || []);
    renderPluginCategory('tool', resp.result.tool || []);
  } catch {
    renderPluginError();
  }
}

function renderPluginCategory(category, plugins) {
  const container = document.getElementById(`plugin-list-${category}`);
  if (!container) return;

  if (!plugins.length) {
    container.innerHTML = '<div class="plugin-loading">No plugins registered.</div>';
    return;
  }

  container.innerHTML = plugins.map(({ id, metadata, isActive }) => {
    const m = metadata || {};
    const icon = PLUGIN_ICONS[id] || '🔌';
    const badges = [
      m.isBuiltIn && '<span class="plugin-badge">built-in</span>',
      m.supportsOffline && '<span class="plugin-badge local">offline</span>',
      m.isLocal && '<span class="plugin-badge local">local</span>',
      m.auth === null && '<span class="plugin-badge free">no auth</span>',
      isActive && '<span class="plugin-badge active-badge">active</span>'
    ].filter(Boolean).join('');

    return `
      <div class="plugin-row ${isActive ? 'is-active' : ''}">
        <div class="plugin-row-icon">${icon}</div>
        <div class="plugin-row-body">
          <div class="plugin-row-name">${escHtml(m.name || id)}</div>
          <div class="plugin-row-desc">${escHtml(m.description || '')}</div>
          ${badges ? `<div class="plugin-row-badges">${badges}</div>` : ''}
        </div>
        <button class="plugin-select-btn ${isActive ? 'is-active' : ''}"
          data-category="${escAttr(category)}" data-id="${escAttr(id)}">
          ${isActive ? 'Active' : 'Use'}
        </button>
      </div>`;
  }).join('');

  container.querySelectorAll('.plugin-select-btn:not(.is-active)').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({
          action: 'plugin:setActive',
          category: btn.dataset.category,
          id: btn.dataset.id
        });
        initPluginsView();
        initAgentsView();
      } catch (err) {
        console.error('Could not set active plugin:', err);
      }
    });
  });
}

function renderPluginError() {
  ['storage', 'ai', 'tool'].forEach(cat => {
    const el = document.getElementById(`plugin-list-${cat}`);
    if (el) el.innerHTML = '<div class="plugin-loading">Plugin system unavailable.</div>';
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
