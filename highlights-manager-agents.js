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
    if (view === 'history') initHistoryView();
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
    if (!key.startsWith('universal_highlighter_') && !key.startsWith('highlights_')) continue;
    // Phase 1 stores { highlights: [], lastModified: ... }; plugin layer stores flat []
    const arr = Array.isArray(val) ? val : (val?.highlights || []);
    all.push(...arr.filter(h => h && h.text));
  }

  if (scope === 'page') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const domain = new URL(tab.url).hostname;
        return all.filter(h => h.url?.includes(domain));
      }
    } catch { /* tabs API unavailable — fall through to all */ }
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
  'extractive': '🔤', 'ollama': '🦙', 'claude': '🤖', 'huggingface': '🤗',
  'semantic-scholar': '📚', 'slack': '💬', 'clipboard': '📋'
};

// ─── Plugin list ──────────────────────────────────────────────────────────────

async function initPluginsView() {
  try {
    // Use plugin:getMetadata so we get configFields too
    const resp = await chrome.runtime.sendMessage({ action: 'plugin:getMetadata' });
    if (!resp?.success) { renderPluginError(); return; }

    renderPluginCategory('storage', resp.result.storage || []);
    renderPluginCategory('ai', resp.result.ai || []);
    renderPluginCategory('tool', resp.result.tool || []);
  } catch {
    renderPluginError();
  }
  initMCPSection();
}

function renderPluginCategory(category, plugins) {
  const container = document.getElementById(`plugin-list-${category}`);
  if (!container) return;

  if (!plugins.length) {
    container.innerHTML = '<div class="plugin-loading">No plugins registered.</div>';
    return;
  }

  container.innerHTML = plugins.map(({ id, metadata: m = {}, isActive }) => {
    const icon = PLUGIN_ICONS[id] || '🔌';
    const hasConfig = (m.configFields || []).length > 0;

    const badges = [
      m.isBuiltIn && '<span class="plugin-badge">built-in</span>',
      (m.supportsOffline || m.isLocal) && '<span class="plugin-badge local">offline</span>',
      m.auth === null && '<span class="plugin-badge free">no auth</span>',
      isActive && '<span class="plugin-badge active-badge">active</span>'
    ].filter(Boolean).join('');

    const configBtn = hasConfig
      ? `<button class="plugin-config-trigger" data-category="${escAttr(category)}" data-id="${escAttr(id)}" title="Configure">⚙</button>`
      : '';

    return `
      <div class="plugin-row ${isActive ? 'is-active' : ''}">
        <div class="plugin-row-icon">${icon}</div>
        <div class="plugin-row-body">
          <div class="plugin-row-name">${escHtml(m.name || id)}</div>
          <div class="plugin-row-desc">${escHtml(m.description || '')}</div>
          ${badges ? `<div class="plugin-row-badges">${badges}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          ${configBtn}
          <button class="plugin-select-btn ${isActive ? 'is-active' : ''}"
            data-category="${escAttr(category)}" data-id="${escAttr(id)}">
            ${isActive ? 'Active' : 'Use'}
          </button>
        </div>
      </div>`;
  }).join('');

  // Activate button
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

  // Config gear button
  container.querySelectorAll('.plugin-config-trigger').forEach(btn => {
    btn.addEventListener('click', () => openConfigModal(btn.dataset.category, btn.dataset.id));
  });
}

function renderPluginError() {
  ['storage', 'ai', 'tool'].forEach(cat => {
    const el = document.getElementById(`plugin-list-${cat}`);
    if (el) el.innerHTML = '<div class="plugin-loading">Plugin system unavailable.</div>';
  });
}

// ─── Config modal ─────────────────────────────────────────────────────────────

let _configModal = {
  category: null,
  id: null,
  fields: []
};

async function openConfigModal(category, id) {
  try {
    // Load metadata + current config in parallel
    const [metaResp, configResp] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'plugin:getMetadata' }),
      chrome.runtime.sendMessage({ action: 'plugin:getConfig', category, id })
    ]);

    if (!metaResp?.success) return;

    const allPlugins = [
      ...(metaResp.result.storage || []),
      ...(metaResp.result.ai || []),
      ...(metaResp.result.tool || [])
    ];
    const plugin = allPlugins.find(p => p.id === id);
    if (!plugin) return;

    const m = plugin.metadata || {};
    const savedConfig = configResp?.result || {};
    const fields = m.configFields || [];

    _configModal = { category, id, fields };

    // Populate modal
    document.getElementById('pluginConfigIcon').textContent = PLUGIN_ICONS[id] || '🔌';
    document.getElementById('pluginConfigTitle').textContent = `Configure ${m.name || id}`;
    document.getElementById('pluginConfigDesc').textContent = m.description || '';

    const fieldsEl = document.getElementById('pluginConfigFields');
    fieldsEl.innerHTML = fields.map(f => `
      <div class="config-field">
        <label class="config-field-label" for="cfg_${escAttr(f.id)}">${escHtml(f.label)}</label>
        <input
          class="config-field-input"
          id="cfg_${escAttr(f.id)}"
          type="${f.type === 'password' ? 'password' : 'text'}"
          placeholder="${escAttr(f.placeholder || '')}"
          value="${escAttr(savedConfig[f.id] || '')}"
          autocomplete="off"
        >
        ${f.hint ? `<div class="plugin-config-hint">${escHtml(f.hint)}</div>` : ''}
      </div>`).join('');

    // Show saved indicator if config already exists
    const hasSaved = fields.some(f => savedConfig[f.id]);
    if (hasSaved) {
      fieldsEl.insertAdjacentHTML('afterbegin', `
        <div class="config-status-row">✓ Configuration saved. Update fields below to change.</div>`);
    }

    hideConfigError();
    document.getElementById('pluginConfigOverlay').classList.remove('hidden');

    // Focus first field
    const first = fieldsEl.querySelector('.config-field-input');
    if (first) setTimeout(() => first.focus(), 60);
  } catch (err) {
    console.error('Could not open config modal:', err);
  }
}

function closeConfigModal() {
  document.getElementById('pluginConfigOverlay').classList.add('hidden');
  _configModal = { category: null, id: null, fields: [] };
}

function showConfigError(msg) {
  const el = document.getElementById('pluginConfigError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideConfigError() {
  document.getElementById('pluginConfigError').classList.add('hidden');
}

async function savePluginConfig(e) {
  e.preventDefault();
  hideConfigError();

  const { category, id, fields } = _configModal;
  if (!category || !id) return;

  const config = {};
  for (const f of fields) {
    const el = document.getElementById(`cfg_${f.id}`);
    if (el) config[f.id] = el.value.trim();
  }

  const saveBtn = document.getElementById('pluginConfigSave');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'plugin:saveConfig',
      category,
      id,
      config
    });

    if (!resp?.success) throw new Error(resp?.error || 'Save failed');

    saveBtn.textContent = 'Saved!';
    setTimeout(() => {
      closeConfigModal();
      initPluginsView();
      initAgentsView();
    }, 600);
  } catch (err) {
    showConfigError(err.message);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

// Wire config modal events
document.getElementById('pluginConfigClose')?.addEventListener('click', closeConfigModal);
document.getElementById('pluginConfigCancel')?.addEventListener('click', closeConfigModal);
document.getElementById('pluginConfigForm')?.addEventListener('submit', savePluginConfig);
document.getElementById('pluginConfigOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeConfigModal();
});

// Also add CSS for the gear button inline
(function addGearStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .plugin-config-trigger {
      background: none;
      border: 1px solid rgba(148,163,184,0.15);
      border-radius: 7px;
      color: #64748b;
      font-size: 16px;
      cursor: pointer;
      padding: 5px 9px;
      transition: color 0.15s, border-color 0.15s;
      line-height: 1;
    }
    .plugin-config-trigger:hover { color: #e2e8f0; border-color: rgba(148,163,184,0.35); }
  `;
  document.head.appendChild(style);
})();

// ─── History View ─────────────────────────────────────────────────────────────

const HISTORY_KEYS = {
  'research-brief': 'research_briefs',
  'writing-output': 'writing_outputs',
  'learning-output': 'learning_outputs'
};

const HISTORY_META = {
  'research-brief': { icon: '🔬', label: 'Research', badge: 'badge-research' },
  'writing-output': { icon: '✍️', label: 'Writing', badge: 'badge-writing' },
  'learning-output': { icon: '🧠', label: 'Learning', badge: 'badge-learning' }
};

let _historyFilter = 'all';

let _historyInited = false;

async function initHistoryView() {
  if (!_historyInited) {
    _historyInited = true;

    document.querySelectorAll('.history-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.history-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _historyFilter = btn.dataset.type;
        renderHistory();
      });
    });

    document.getElementById('historyClearBtn')?.addEventListener('click', clearHistory);
  }
  renderHistory();
}

async function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;

  list.innerHTML = '<div style="color:#475569;font-size:13px;padding:12px 0">Loading...</div>';

  const keys = Object.values(HISTORY_KEYS);
  const stored = await chrome.storage.local.get(keys);

  let all = [];
  for (const [type, storageKey] of Object.entries(HISTORY_KEYS)) {
    const items = stored[storageKey] || [];
    items.forEach(item => all.push({ ...item, _type: type }));
  }

  all.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));

  if (_historyFilter !== 'all') {
    all = all.filter(item => item._type === _historyFilter || item.type === _historyFilter);
  }

  if (!all.length) {
    list.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">🗂️</div>
        <p>${_historyFilter === 'all' ? 'No agent outputs yet. Run an agent in the AI Agents tab.' : 'No results for this filter.'}</p>
      </div>`;
    return;
  }

  list.innerHTML = all.map((item, idx) => {
    const meta = HISTORY_META[item._type] || HISTORY_META[item.type] || { icon: '📄', label: item._type, badge: '' };
    const date = item.generatedAt ? new Date(item.generatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const title = item.query || item.title || item.format || item._type;
    const content = extractHistoryContent(item);

    return `
      <div class="history-card" data-idx="${idx}">
        <div class="history-card-header" data-toggle="${idx}">
          <div class="history-card-icon">${meta.icon}</div>
          <div class="history-card-meta">
            <div class="history-card-title">${escHtml(title)}</div>
            <div class="history-card-sub">
              <span class="history-type-badge ${meta.badge}">${meta.label}</span>
              &nbsp;${escHtml(date)} · ${item.highlightCount || 0} highlights
            </div>
          </div>
          <div class="history-card-actions">
            <button class="history-action-btn" data-action="copy" data-content="${escAttr(content)}">Copy</button>
            <button class="history-action-btn" data-action="download" data-content="${escAttr(content)}" data-filename="${escAttr(title + '.md')}">↓ MD</button>
            <button class="history-action-btn danger" data-action="delete" data-id="${escAttr(item.id)}" data-storage="${escAttr(HISTORY_KEYS[item._type] || HISTORY_KEYS[item.type])}">✕</button>
          </div>
        </div>
        <div class="history-card-body" id="history-body-${idx}">
          <div class="history-card-content">${escHtml(content)}</div>
        </div>
      </div>`;
  }).join('');

  // Toggle expand
  list.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const body = document.getElementById(`history-body-${el.dataset.toggle}`);
      body?.classList.toggle('open');
    });
  });

  // Action buttons
  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.action === 'copy') {
        navigator.clipboard.writeText(btn.dataset.content || '').then(() => {
          const orig = btn.textContent; btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1400);
        });
      } else if (btn.dataset.action === 'download') {
        downloadMarkdown(btn.dataset.content, btn.dataset.filename || 'output.md');
      } else if (btn.dataset.action === 'delete') {
        deleteHistoryItem(btn.dataset.id, btn.dataset.storage);
      }
    });
  });
}

function extractHistoryContent(item) {
  if (item.brief) return item.brief;
  if (item.summary) return item.summary;
  if (typeof item.content === 'string') return item.content;
  if (item.content?.cards) {
    return item.content.cards.map(c => `Q: ${c.front}\nA: ${c.back}`).join('\n\n');
  }
  if (item.content?.questions) {
    return item.content.questions.map(q => `Q${q.id}: ${q.question}\nA: ${q.correctAnswer}`).join('\n\n');
  }
  if (item.content?.sessions) {
    return item.content.sessions.map(s => `Session ${s.session}: ${s.focus}\n${s.items.join('\n')}`).join('\n\n');
  }
  return JSON.stringify(item.content || item, null, 2);
}

async function deleteHistoryItem(id, storageKey) {
  if (!id || !storageKey) return;
  const stored = await chrome.storage.local.get(storageKey);
  const items = (stored[storageKey] || []).filter(i => i.id !== id);
  await chrome.storage.local.set({ [storageKey]: items });
  renderHistory();
}

async function clearHistory() {
  const keys = Object.values(HISTORY_KEYS);
  const clear = {};
  keys.forEach(k => { clear[k] = []; });
  await chrome.storage.local.set(clear);
  renderHistory();
}

function downloadMarkdown(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── MCP Servers UI ───────────────────────────────────────────────────────────

async function initMCPSection() {
  document.getElementById('mcpAddBtn')?.addEventListener('click', addMCPServer);
  document.getElementById('mcpServerUrl')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addMCPServer();
  });
  loadMCPServers();
}

async function loadMCPServers() {
  const resp = await chrome.runtime.sendMessage({ action: 'mcp:listServers' }).catch(() => null);
  renderMCPServers(resp?.result || []);
}

function renderMCPServers(servers) {
  const list = document.getElementById('mcp-server-list');
  if (!list) return;

  if (!servers.length) {
    list.innerHTML = '<div class="plugin-loading">No MCP servers connected.</div>';
    return;
  }

  list.innerHTML = servers.map(s => `
    <div class="mcp-server-row ${s.status || ''}" data-id="${escAttr(s.id)}">
      <div class="mcp-server-dot ${s.status || ''}"></div>
      <div class="mcp-server-info">
        <div class="mcp-server-name">${escHtml(s.name || s.id)}</div>
        <div class="mcp-server-url">${escHtml(s.url)}</div>
        ${s.tools?.length ? `<div class="mcp-server-tools">Tools: ${escHtml(s.tools.slice(0,5).join(', '))}${s.tools.length > 5 ? ' +more' : ''}</div>` : ''}
      </div>
      <button class="history-action-btn" data-test="${escAttr(s.id)}" data-url="${escAttr(s.url)}">Test</button>
      <button class="mcp-remove-btn" data-remove="${escAttr(s.id)}" title="Remove">✕</button>
    </div>`).join('');

  list.querySelectorAll('[data-test]').forEach(btn => {
    btn.addEventListener('click', () => testMCPServer(btn.dataset.test, btn.dataset.url));
  });
  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeMCPServer(btn.dataset.remove));
  });
}

async function addMCPServer() {
  const urlEl = document.getElementById('mcpServerUrl');
  const nameEl = document.getElementById('mcpServerName');
  const btn = document.getElementById('mcpAddBtn');

  const url = urlEl?.value?.trim();
  const name = nameEl?.value?.trim() || url;

  if (!url) { urlEl?.focus(); return; }

  btn.disabled = true;
  btn.textContent = 'Testing...';

  const testResp = await chrome.runtime.sendMessage({ action: 'mcp:testServer', url }).catch(() => null);

  const id = `mcp_${Date.now()}`;
  const server = {
    id, name, url,
    status: testResp?.success ? 'connected' : 'error',
    tools: testResp?.result?.tools || []
  };

  const addResp = await chrome.runtime.sendMessage({ action: 'mcp:addServer', server }).catch(() => null);

  if (addResp?.success) {
    urlEl.value = '';
    nameEl.value = '';
    renderMCPServers(addResp.result);
  }

  btn.disabled = false;
  btn.textContent = 'Add';
}

async function testMCPServer(id, url) {
  const row = document.querySelector(`[data-id="${id}"]`);
  const dot = row?.querySelector('.mcp-server-dot');
  if (dot) { dot.className = 'mcp-server-dot testing'; }

  const resp = await chrome.runtime.sendMessage({ action: 'mcp:testServer', url }).catch(() => null);

  if (dot) {
    dot.className = `mcp-server-dot ${resp?.success ? 'connected' : 'error'}`;
  }
  const toolsEl = row?.querySelector('.mcp-server-tools');
  if (toolsEl && resp?.result?.tools) {
    toolsEl.textContent = `Tools: ${resp.result.tools.slice(0,5).join(', ')}${resp.result.tools.length > 5 ? ' +more' : ''}`;
  }
}

async function removeMCPServer(id) {
  const resp = await chrome.runtime.sendMessage({ action: 'mcp:removeServer', id }).catch(() => null);
  renderMCPServers(resp?.result || []);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

(async function initOnboarding() {
  const stored = await chrome.storage.local.get('onboarding_complete');
  if (stored.onboarding_complete) return;

  const overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  let step = 1;
  const totalSteps = 4;

  function goto(n) {
    step = Math.max(1, Math.min(totalSteps, n));

    document.querySelectorAll('.onboarding-step').forEach(el => el.classList.remove('active'));
    document.querySelector(`.onboarding-step[data-step="${step}"]`)?.classList.add('active');

    document.querySelectorAll('.onboarding-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i + 1 === step);
    });

    const backBtn = document.getElementById('onboardingBack');
    const nextBtn = document.getElementById('onboardingNext');
    if (backBtn) backBtn.style.display = step > 1 ? '' : 'none';
    if (nextBtn) nextBtn.textContent = step === totalSteps ? 'Get Started' : 'Next →';
  }

  document.getElementById('onboardingNext')?.addEventListener('click', () => {
    if (step === totalSteps) {
      overlay.classList.add('hidden');
      chrome.storage.local.set({ onboarding_complete: true });
    } else {
      goto(step + 1);
    }
  });

  document.getElementById('onboardingBack')?.addEventListener('click', () => goto(step - 1));

  goto(1);
})();
