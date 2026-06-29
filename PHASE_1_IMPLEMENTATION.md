# Phase 1: The Solid Core — Implementation Plan

**Timeline:** 6 weeks  
**Output:** v1.1.0 ready for Chrome Web Store  
**Principle:** Every feature that exists must work perfectly. No silent failures.

---

## Priority Order: Fix Silent Failures First

### WEEK 1-2: Repair the Broken Foundation

#### 1.1 Google Drive Storage — CRITICAL
**File:** `storage-providers.js`  
**Current state:** Lines 140-400 are stub methods  
**Problem:** `save()`, `load()`, `delete()` are placeholders; actual sync happens in background.js instead

**Action:**
```javascript
// storage-providers.js → GoogleDriveStorageProvider class

// Implement save(highlight) → uploads to Google Drive
async save(highlight) {
  const file = {
    name: `${highlight.id}.json`,
    mimeType: 'application/json',
    parents: [this.folderId]
  };
  const metadata = {
    name: file.name,
    mimeType: file.mimeType,
    parents: file.parents
  };
  const body = JSON.stringify(highlight);
  // Use Google Drive API to create/update file
  return await this.driveApi.files.create({
    resource: metadata,
    media: { body },
    fields: 'id'
  });
}

// Implement load(domainKey) → fetches highlights for this domain
async load(domainKey) {
  const query = `name contains '${domainKey}' and trashed=false`;
  const response = await this.driveApi.files.list({
    q: query,
    spaces: 'drive',
    fields: 'files(id, name)'
  });
  
  const highlights = [];
  for (const file of response.files) {
    const content = await this.driveApi.files.get({
      fileId: file.id,
      alt: 'media'
    });
    highlights.push(JSON.parse(content));
  }
  return highlights;
}

// Implement delete(highlightId) → removes from Google Drive
async delete(highlightId) {
  await this.driveApi.files.delete({ fileId: highlightId });
}
```

**Exit condition:** Test with real Google Drive account:
- [ ] Create highlight → appears in Google Drive folder
- [ ] Refresh page → highlight syncs back
- [ ] Delete highlight → removed from Google Drive
- [ ] No duplicates on re-sync

---

#### 1.2 OAuth Token Refresh — CRITICAL
**File:** `background.js` (lines 394-539)  
**Current state:** Token cached indefinitely; refresh logic incomplete  
**Problem:** At some point (~1 hour), token expires; all Google Drive calls fail silently

**Action:**
```javascript
// background.js → update authenticate() and addTokenRefreshListener()

const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // Refresh 5 min before expiry

async function getValidToken() {
  const stored = await chrome.storage.local.get('google_token_info');
  const now = Date.now();
  
  if (stored.google_token_info && stored.google_token_info.expiry > now) {
    return stored.google_token_info.access_token;
  }
  
  // Token expired or doesn't exist; refresh
  return await refreshToken();
}

async function refreshToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error('Token refresh failed: ' + chrome.runtime.lastError.message));
      } else {
        // Store token with expiry time (typically 3600s from now)
        chrome.storage.local.set({
          google_token_info: {
            access_token: token,
            expiry: Date.now() + 3600 * 1000
          }
        });
        resolve(token);
      }
    });
  });
}
```

**Exit condition:**
- [ ] Manually expire token in DevTools
- [ ] Trigger a Google Drive sync
- [ ] System automatically refreshes without user action
- [ ] Sync completes successfully

---

#### 1.3 AI Summary Service — MAKE IT WORK OR REMOVE IT
**File:** `ai-summary-service.js`  
**Current state:** All provider implementations are stubs  
**Decision:** Ship with Ollama + extractive fallback (no Hugging Face yet)

**Action — Option A: Implement Ollama properly**
```javascript
// ai-summary-service.js

async generateSummary(highlights, provider = 'ollama') {
  if (provider === 'ollama') {
    return await this.generateOllamaSummary(highlights);
  } else if (provider === 'extractive') {
    return this.generateExtractiveSummary(highlights);
  }
}

async generateOllamaSummary(highlights) {
  const text = highlights.map(h => h.text).join('\n\n');
  
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'neural-chat', // or user's selected model
        prompt: `Summarize these highlights in 2-3 sentences:\n\n${text}`,
        stream: false
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      success: true,
      summary: data.response,
      provider: 'ollama'
    };
  } catch (error) {
    // Fall back to extractive if Ollama unavailable
    return this.generateExtractiveSummary(highlights);
  }
}

generateExtractiveSummary(highlights) {
  // Extract key sentences, don't claim it's AI
  const sentences = highlights
    .flatMap(h => h.text.match(/[^.!?]+[.!?]+/g) || [])
    .slice(0, 3)
    .join(' ');
  
  return {
    success: true,
    summary: sentences,
    provider: 'extractive',
    note: 'Key sentences extracted (AI model not available)'
  };
}
```

**Or Option B: Remove completely if no Ollama available**
```javascript
// In popup-minimal.html, hide AI button if no Ollama
if (!userHasOllama) {
  document.querySelector('[data-action="summarize"]').style.display = 'none';
  // Show message: "Enable AI: Install Ollama to unlock summaries"
}
```

**Exit condition:**
- [ ] Install Ollama locally, select a model
- [ ] Highlight text on a page
- [ ] Click "Summarize" → receives actual Ollama response within 3-5 seconds
- [ ] If Ollama offline, shows helpful message (not silent failure)

---

#### 1.4 DOM Restoration Fuzzy Matcher — FIX OR DISABLE
**File:** `highlighter-service.js` (lines 938-1004)  
**Current state:** Strategy 4 (fuzzy matching) produces false positives  
**Problem:** On content-heavy pages, highlights appear on wrong paragraphs

**Action:**
```javascript
// highlighter-service.js → Remove strategy 4 entirely, improve strategy 3

async restoreHighlights() {
  for (const highlight of storedHighlights) {
    // Strategy 1: Position-based (most reliable)
    if (this.tryRestoreByPosition(highlight)) continue;
    
    // Strategy 2: Exact text match
    if (this.tryRestoreByExactText(highlight)) continue;
    
    // Strategy 3: Normalized text (case-insensitive, trim whitespace)
    if (this.tryRestoreByNormalizedText(highlight)) continue;
    
    // Strategy 4: REMOVED — fuzzy matching causes false positives
    // Instead: skip and mark as "lost" with recoverable marker
    
    // If all strategies fail, mark highlight as unrestorable this session
    this.markHighlightLost(highlight.id);
  }
}

markHighlightLost(highlightId) {
  // Store fact that this highlight couldn't be restored
  // Show subtle indicator to user: "1 highlight lost on reload"
  // Provide recovery: right-click → "Find this highlight"
}
```

**Exit condition:**
- [ ] Test on 10 pages with heavy DOM changes (React, dynamically loaded)
- [ ] Verify no false-positive highlights appear
- [ ] Highlights either restore correctly or show "lost" marker
- [ ] User can re-highlight lost text with one click

---

#### 1.5 Delete Dead Code
**Remove these files entirely:**
- `popup.html`, `popup.js` (old version)
- `popup-final.html`, `popup-final.js`
- `popup-working.html`, `popup-working.js`
- `popup-simple.html`
- `popup-test.html`
- `popup-debug.js`
- `pdf-reader-old.js`
- `options.html`, `options.js` (replaced by highlights-manager)

**Update manifest.json:** Already points to `popup-minimal.html` ✓

**Exit condition:**
- [ ] Run `git rm` on all dead files
- [ ] Codebase is ~3,500 lines lighter
- [ ] Extension still loads and works identically

---

### WEEK 3-4: Redesign the UI — "Quiet Confidence"

#### 2.1 Popup Redesign
**Current:** `popup-minimal.html` + `popup-minimal.js` (already close, minor changes)  
**Goal:** One screen. Context-aware. No tabs.

**New structure:**
```html
<div class="popup">
  <!-- Header: shows what's on this page -->
  <header class="popup-header">
    <div class="page-context">
      <span class="highlight-count">3</span>
      <span class="page-type">Article</span>
    </div>
    <button class="settings-btn">⚙️</button>
  </header>

  <!-- Main action: context changes based on page type -->
  <section class="popup-actions">
    <!-- Article page: show related features -->
    <button class="action-primary">Ask AI about this page</button>
    <button class="action-secondary">Find similar highlights</button>
    
    <!-- PDF page: show PDF actions -->
    <!-- <button class="action-primary">Summarize this PDF</button> -->
    
    <!-- Video page: show transcript -->
    <!-- <button class="action-primary">Show transcript</button> -->
  </section>

  <!-- Live highlights list (first 5, scrollable) -->
  <section class="popup-highlights">
    <div class="highlights-list">
      <!-- Each highlight is a small card -->
    </div>
    <button class="see-all">See all (23)</button>
  </section>

  <!-- Settings slide-in panel (hidden by default) -->
  <aside class="settings-panel">
    <!-- Toggles, color picker, export -->
  </aside>
</div>
```

**Design tokens already exist** in `design-tokens.css`  
**Just need:**
- [ ] Remove tab navigation
- [ ] Make popup height responsive (expand for more highlights)
- [ ] Context detection (article vs PDF vs video)
- [ ] Settings as slide-in panel, not separate tab

---

#### 2.2 Highlights Manager Redesign
**Current:** Dense table layout in `highlights-manager.html`  
**Goal:** Card grid. Generous whitespace. Actions on hover.

**New grid structure:**
```html
<div class="manager">
  <!-- Filters (simplified) -->
  <header class="manager-header">
    <input type="search" placeholder="Search highlights...">
    <select class="filter-type">
      <option value="">All types</option>
      <option value="definition">Definitions</option>
      <option value="evidence">Evidence</option>
      <option value="question">Questions</option>
      <option value="action">Actions</option>
      <option value="key">Key insights</option>
    </select>
    <select class="filter-date">
      <option value="">Any time</option>
      <option value="today">Today</option>
      <option value="week">This week</option>
      <option value="month">This month</option>
    </select>
  </header>

  <!-- Card grid -->
  <div class="highlights-grid">
    <div class="highlight-card">
      <!-- Left border: color-coded by type -->
      <div class="card-type-bar" data-type="definition"></div>
      
      <div class="card-content">
        <p class="highlight-text">"The highlighted text goes here..."</p>
        <div class="card-meta">
          <span class="page-title">Article Title</span>
          <span class="time-ago">2 days ago</span>
        </div>
      </div>
      
      <!-- Actions (on hover) -->
      <div class="card-actions">
        <button class="action-copy" title="Copy">📋</button>
        <button class="action-note" title="Edit note">📝</button>
        <button class="action-delete" title="Delete">🗑️</button>
      </div>
    </div>
    <!-- More cards... -->
  </div>

  <!-- Pagination or infinite scroll -->
</div>
```

**CSS for card grid:**
```css
.highlights-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.highlight-card {
  display: grid;
  grid-template-columns: 4px 1fr auto;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  transition: all 0.2s ease;
}

.highlight-card:hover {
  background: var(--surface-raised);
  border-color: var(--border-mid);
}

.card-type-bar {
  width: 4px;
  border-radius: 2px;
  background: var(--accent); /* changes by type */
}

.card-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.highlight-card:hover .card-actions {
  opacity: 1;
}
```

---

#### 2.3 Semantic Highlight Types
**Already have colors in `design-tokens.css`:**
- `--highlight-definition: #FEF3C7` (yellow)
- `--highlight-evidence: #DBEAFE` (blue)
- `--highlight-question: #F3E8FF` (purple)
- `--highlight-action: #FECACA` (red)
- `--highlight-key: #86EFAC` (green)

**Action:**
1. Update `highlighter-service.js` to detect and store highlight type automatically
2. Use type color in card left border
3. Add type label below highlighted text on page

---

#### 2.4 Dark Mode
**Current:** `design-tokens.css` has light colors  
**Add dark mode:**

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #09090E;
    --surface: #111119;
    --text-primary: #EDEDF5;
    /* ...etc */
  }
}

/* User can also toggle manually in settings */
html[data-theme="dark"] {
  --bg: #09090E;
  /* ... */
}

html[data-theme="light"] {
  --bg: #FFFFFF;
  /* ... */
}
```

**Exit condition:**
- [ ] Extension respects OS dark mode preference
- [ ] User can toggle manually in settings
- [ ] All UI elements are readable in both modes

---

### WEEK 5-6: Polish & Testing

#### 3.1 Error States That Help
**Current problem:** Many failures show nothing or generic "something went wrong"

**Create a error-handler module:**
```javascript
// lib/error-display.js

class ErrorDisplay {
  showError(errorType, context) {
    const messages = {
      'google-drive-auth-failed': {
        title: 'Google Drive connection failed',
        message: 'Please sign in again to sync highlights',
        action: 'Sign in',
        actionFn: () => authenticateGoogleDrive()
      },
      'ollama-not-running': {
        title: 'AI model not found',
        message: 'Install Ollama to use AI summaries',
        action: 'Learn how',
        actionFn: () => openURL('https://ollama.ai/download')
      },
      'pdf-corrupted': {
        title: 'PDF could not be read',
        message: 'The file might be corrupted. Try downloading again.',
        action: null
      },
      // ...more error types
    };
    
    const error = messages[errorType];
    if (!error) {
      console.error('Unknown error type:', errorType);
      return;
    }
    
    // Display as toast notification
    this.showToast(error.title, error.message, error.action, error.actionFn);
  }
}
```

**Exit condition:**
- [ ] Every error the system can encounter has a human-readable message
- [ ] Each message explains what went wrong and how to fix it
- [ ] No console errors left unsurfaced to the user

---

#### 3.2 Loading States & Empty States
**Loading skeleton:**
```html
<div class="highlight-card loading">
  <div class="card-type-bar"></div>
  <div class="card-content">
    <div class="skeleton-text" style="width: 80%; height: 1em;"></div>
    <div class="skeleton-text" style="width: 60%; height: 0.8em; margin-top: 8px;"></div>
  </div>
</div>

<style>
.skeleton-text {
  background: linear-gradient(
    90deg,
    var(--surface),
    var(--surface-raised),
    var(--surface)
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
```

**Empty state (no highlights):**
```html
<div class="empty-state">
  <div class="empty-icon">📖</div>
  <h3>No highlights yet</h3>
  <p>Select text on any page and click the highlight button to get started</p>
  <button class="btn-primary">Learn more</button>
</div>
```

**Exit condition:**
- [ ] Skeletons appear while loading
- [ ] Empty state appears when there are no highlights
- [ ] All loading states feel intentional, not broken

---

#### 3.3 Testing Checklist
**Functional:**
- [ ] Create highlight → stored locally
- [ ] Create highlight → synced to Google Drive
- [ ] Refresh page → highlights reappear
- [ ] Change color → persists
- [ ] Add note → appears in manager
- [ ] Delete highlight → gone everywhere
- [ ] Export to JSON/HTML/Markdown → file downloads
- [ ] Popup opens in < 200ms
- [ ] Manager loads 100 highlights without lag

**Cross-browser:**
- [ ] Chrome (obviously)
- [ ] Edge (uses same Chromium)
- [ ] Test on 5 different websites (news, blog, academic paper, ecommerce, SPA)

**Design:**
- [ ] Light mode: all text readable
- [ ] Dark mode: all text readable
- [ ] Mobile popup: resizable, not cut off
- [ ] Manager on small screen: scrollable, usable
- [ ] Hover states visible on all interactive elements

**Error handling:**
- [ ] Google Drive offline → graceful fallback to local
- [ ] PDF broken → shows helpful message
- [ ] Highlight lost on reload → shows "lost" indicator, recovery option
- [ ] Ollama not running → shows helpful message, not silent failure

**Accessibility:**
- [ ] Tab navigation works
- [ ] Focus states visible
- [ ] Color not the only distinguishing factor
- [ ] ARIA labels where needed

---

## Definition of Done: Phase 1

✅ **Every feature that ships either:**
1. Works perfectly and is tested, OR
2. Is removed entirely (not hidden/broken)

✅ **Design is intentional:**
- One-screen popup (context-aware)
- Card-based highlights manager
- Semantic colors that mean something
- Dark mode works
- Empty/loading states designed

✅ **Silent failures eliminated:**
- Google Drive sync tested end-to-end
- AI summaries (Ollama only) or not offered
- Token refresh works
- Fuzzy matching disabled
- Error messages are helpful

✅ **Dead code deleted**
- No popup variants
- No old settings page
- No deprecated implementations

✅ **Ready for Chrome Web Store**
- Icon and description finalized
- Privacy policy included
- Tested on at least 5 different sites
- Performance acceptable
- No console errors

---

## Git Workflow

```bash
# Start Phase 1 branch
git checkout -b phase/1-solid-core

# Commit structure (one per major fix/feature):
git commit -m "fix: implement Google Drive save/load/delete methods"
git commit -m "fix: add OAuth token refresh logic"
git commit -m "fix: Ollama integration with graceful fallback"
git commit -m "fix: remove fuzzy matching strategy from DOM restoration"
git commit -m "chore: delete dead popup variants and old settings"
git commit -m "feat: redesign popup for context-awareness"
git commit -m "feat: redesign highlights manager as card grid"
git commit -m "feat: add semantic highlight type colors"
git commit -m "feat: implement dark mode"
git commit -m "feat: add error display module with helpful messages"
git commit -m "feat: add loading skeletons and empty states"
git commit -m "test: comprehensive cross-browser and functional testing"

# When Phase 1 complete:
git checkout main
git merge --no-ff phase/1-solid-core
git tag v1.1.0
```

---

**Ready to start with Week 1?**

Priority order:
1. Google Drive storage fix (most critical)
2. OAuth token refresh
3. AI summary (Ollama or remove)
4. DOM restoration fuzzy matcher removal
5. Delete dead code

Which do you want to tackle first?

