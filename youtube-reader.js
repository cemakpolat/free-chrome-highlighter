// YouTube Reader - standalone page for viewing YouTube videos with transcripts

console.log('📺 YouTube Reader initializing...');

class YouTubeReader {
  constructor() {
    this.transcript = [];
    this.videoId = null;
    this.startTime = 0;
    this.player = null;
    this.updateInterval = null;
    this.currentActiveIndex = -1;
    this.selectedLines = new Set();
    this.highlights = {}; // Store user highlights
    this.mergedLines = new Map(); // Track merged line groups
    this.init();
  }

  async init() {
    // Load data from chrome.storage
    const result = await chrome.storage.local.get(['youtubeReaderData', 'videoReaderTheme']);

    if (!result.youtubeReaderData) {
      this.showError('No video data found. Please try again from YouTube.');
      return;
    }

    const data = result.youtubeReaderData;
    this.videoId = data.videoId;
    this.startTime = data.startTime || 0;
    this.transcript = data.transcript || [];

    console.log(`📺 Loaded: videoId=${this.videoId}, segments=${this.transcript.length}`);

    // Set theme
    const theme = result.videoReaderTheme || 'dark';
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      document.getElementById('vr-theme-toggle').textContent = '☀️';
    }

    // Create video player
    this.createVideoPlayer();

    // Load saved highlights and merges
    await this.loadHighlightsAndMerges();

    // Render transcript (from DOM scraping)
    this.renderTranscript();

    // Setup event listeners
    this.setupEventListeners();

    // Setup text selection for user highlighting
    this.setupTextHighlighting();
  }

  createVideoPlayer() {
    const container = document.getElementById('video-container');

    const iframe = document.createElement('iframe');
    iframe.id = 'youtube-player';
    iframe.src = `https://www.youtube.com/embed/${this.videoId}?start=${this.startTime}&autoplay=1&enablejsapi=1`;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allowfullscreen', '');

    container.appendChild(iframe);

    console.log(`📺 Created player: ${iframe.src}`);

    // Start monitoring for active transcript highlighting
    this.startTranscriptSync();
  }

  renderTranscript() {
    const container = document.getElementById('transcript-content');
    const countEl = document.getElementById('transcript-count');

    // Group transcript into time-based paragraphs (every 10 seconds)
    const paragraphs = this.groupIntoParagraphs(this.transcript, 10);

    countEl.textContent = `${paragraphs.length} paragraphs`;

    const html = paragraphs.map((para, paraIndex) => {
      const startTime = para.segments[0].start;
      const endTime = para.segments[para.segments.length - 1].end || para.segments[para.segments.length - 1].start + 5;

      // Create clickable segments
      const segmentsHtml = para.segments.map((seg, segIndex) =>
        `<span class="text-segment" data-start="${seg.start}" data-end="${seg.end || seg.start + 5}" data-index="${seg.index}">${this.escapeHtml(seg.text)}</span>`
      ).join(' ');

      return `
        <div class="vr-transcript-paragraph" data-para-index="${paraIndex}" data-start="${startTime}" data-end="${endTime}">
          <span class="vr-time-badge">${this.formatTime(startTime)}</span>${segmentsHtml}
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    // Add click listeners to all segments
    document.querySelectorAll('.text-segment').forEach(segment => {
      segment.addEventListener('click', (e) => {
        e.stopPropagation();
        const startTime = parseFloat(segment.dataset.start);
        this.jumpToTime(startTime);
      });
    });

    console.log(`✅ Rendered ${paragraphs.length} paragraphs with ${this.transcript.length} total segments`);
  }

  groupIntoParagraphs(transcript, intervalSeconds) {
    const paragraphs = [];
    let currentParagraph = { segments: [] };
    let paragraphStartTime = 0;

    transcript.forEach((segment, index) => {
      // Start new paragraph if time interval exceeded
      if (currentParagraph.segments.length === 0) {
        paragraphStartTime = segment.start;
      }

      if (segment.start - paragraphStartTime >= intervalSeconds) {
        // Save current paragraph and start new one
        if (currentParagraph.segments.length > 0) {
          paragraphs.push(currentParagraph);
        }
        currentParagraph = { segments: [] };
        paragraphStartTime = segment.start;
      }

      currentParagraph.segments.push({
        ...segment,
        index: index
      });
    });

    // Add last paragraph
    if (currentParagraph.segments.length > 0) {
      paragraphs.push(currentParagraph);
    }

    return paragraphs;
  }

  setupEventListeners() {
    // Exit button
    document.getElementById('vr-exit').addEventListener('click', () => {
      window.close();
    });

    // Theme toggle
    document.getElementById('vr-theme-toggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    // Export button
    document.getElementById('vr-export').addEventListener('click', () => {
      this.exportTranscript();
    });

    // Search
    document.getElementById('vr-search-input').addEventListener('input', (e) => {
      this.searchTranscript(e.target.value);
    });
  }

  jumpToTime(seconds) {
    const iframe = document.getElementById('youtube-player');
    // Update iframe src with new timestamp
    const newSrc = `https://www.youtube.com/embed/${this.videoId}?start=${Math.floor(seconds)}&autoplay=1&enablejsapi=1`;
    iframe.src = newSrc;
    console.log(`⏭️ Jumping to ${seconds}s`);

    // Reset sync with new start time
    this.stopTranscriptSync();
    this.startTime = Math.floor(seconds);
    this.startTranscriptSync();
  }

  searchTranscript(query) {
    const paragraphs = document.querySelectorAll('.vr-transcript-paragraph');
    const lowerQuery = query.toLowerCase();

    paragraphs.forEach(para => {
      const text = para.textContent.toLowerCase();
      para.style.display = (!query || text.includes(lowerQuery)) ? 'block' : 'none';
    });
  }

  toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('vr-theme-toggle');
    const isLight = body.classList.contains('light-theme');

    if (isLight) {
      body.classList.remove('light-theme');
      themeBtn.textContent = '🌙';
      chrome.storage.local.set({ videoReaderTheme: 'dark' });
    } else {
      body.classList.add('light-theme');
      themeBtn.textContent = '☀️';
      chrome.storage.local.set({ videoReaderTheme: 'light' });
    }
  }

  exportTranscript() {
    const content = this.transcript.map(segment =>
      `[${this.formatTime(segment.start)}] ${segment.text}`
    ).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-transcript-${this.videoId}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('💾 Transcript exported');
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showError(message) {
    const container = document.getElementById('transcript-content');
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ef4444;">
        <h3>Error</h3>
        <p>${message}</p>
      </div>
    `;
  }

  startTranscriptSync() {
    // Poll video time and update active transcript line
    // Since we can't access iframe player API directly, we'll use message passing
    // But for now, we'll use a simpler approach: estimate based on click time

    console.log('🔄 Starting transcript sync (polling mode)');

    // Start with estimated time tracking
    let estimatedTime = this.startTime;
    const startRealTime = Date.now();

    this.updateInterval = setInterval(() => {
      // Estimate current video time (assuming it's playing)
      const elapsedSeconds = (Date.now() - startRealTime) / 1000;
      estimatedTime = this.startTime + elapsedSeconds;

      this.updateActiveTranscript(estimatedTime);
    }, 500); // Update twice per second
  }

  updateActiveTranscript(currentTime) {
    // Clear all previous segment highlights
    document.querySelectorAll('.segment-active').forEach(el => el.classList.remove('segment-active'));
    document.querySelectorAll('.vr-transcript-paragraph.active').forEach(el => el.classList.remove('active'));

    // Find active segment
    const allSegments = document.querySelectorAll('.text-segment');
    let activeSegment = null;
    let activeParagraph = null;

    allSegments.forEach(segment => {
      const start = parseFloat(segment.dataset.start);
      const end = parseFloat(segment.dataset.end);

      if (currentTime >= start && currentTime < end) {
        activeSegment = segment;
        activeParagraph = segment.closest('.vr-transcript-paragraph');
      }
    });

    // Highlight active segment with gray
    if (activeSegment) {
      activeSegment.classList.add('segment-active');

      // Mark paragraph as active
      if (activeParagraph) {
        activeParagraph.classList.add('active');

        // Auto-scroll to keep active paragraph visible
        const container = document.getElementById('transcript-content');
        const paraTop = activeParagraph.offsetTop;
        const paraBottom = paraTop + activeParagraph.offsetHeight;
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;

        if (paraTop < containerTop || paraBottom > containerBottom) {
          activeParagraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  stopTranscriptSync() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('⏸️ Stopped transcript sync');
    }
  }

  async loadHighlightsAndMerges() {
    const key = `videoHighlights_${this.videoId}`;
    const result = await chrome.storage.local.get([key]);
    if (result[key]) {
      this.highlights = result[key].highlights || {};
      this.mergedLines = new Map(result[key].mergedLines || []);
      console.log(`📥 Loaded ${Object.keys(this.highlights).length} highlights and ${this.mergedLines.size} merged groups`);
    }
  }

  async saveHighlightsAndMerges() {
    const key = `videoHighlights_${this.videoId}`;
    await chrome.storage.local.set({
      [key]: {
        highlights: this.highlights,
        mergedLines: Array.from(this.mergedLines.entries())
      }
    });
    console.log('💾 Saved highlights and merges');
  }

  setupTextHighlighting() {
    const container = document.getElementById('transcript-content');

    container.addEventListener('mouseup', (e) => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText.length > 0) {
        // Get the selected range
        const range = selection.getRangeAt(0);

        // Check if selection includes time badge - if so, ignore it
        const timeBadge = range.commonAncestorContainer.parentElement?.closest('.vr-time-badge');
        if (timeBadge) {
          console.log('⚠️ Cannot highlight time badge');
          window.getSelection().removeAllRanges();
          return;
        }

        // Check if selection spans across time badge
        const startInBadge = range.startContainer.parentElement?.closest('.vr-time-badge');
        const endInBadge = range.endContainer.parentElement?.closest('.vr-time-badge');
        if (startInBadge || endInBadge) {
          console.log('⚠️ Selection includes time badge - skipping');
          window.getSelection().removeAllRanges();
          return;
        }

        // Check if selection is within a paragraph
        let paraElement = range.commonAncestorContainer;
        while (paraElement && !paraElement.classList?.contains('vr-transcript-paragraph')) {
          paraElement = paraElement.parentElement;
        }

        if (paraElement) {
          this.createHighlight(paraElement, range, selectedText);
        }
      }
    });
  }

  createHighlight(paraElement, range, text) {
    // Wrap selection in highlight span
    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'user-highlight';
    const highlightId = Date.now();
    highlightSpan.setAttribute('data-highlight-id', highlightId);

    try {
      range.surroundContents(highlightSpan);
    } catch (e) {
      // If surroundContents fails (crosses element boundaries), use alternative method
      const contents = range.extractContents();
      highlightSpan.appendChild(contents);
      range.insertNode(highlightSpan);
    }

    // Add trash icon
    const trashIcon = document.createElement('span');
    trashIcon.className = 'highlight-trash';
    trashIcon.innerHTML = '🗑️';
    trashIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const paraIndex = parseInt(paraElement.dataset.paraIndex);
      this.removeHighlight(highlightSpan, paraIndex);
    });
    highlightSpan.appendChild(trashIcon);

    // Save highlight
    const paraIndex = parseInt(paraElement.dataset.paraIndex);
    if (!this.highlights[paraIndex]) {
      this.highlights[paraIndex] = [];
    }
    this.highlights[paraIndex].push({
      id: highlightId,
      text: text,
      timestamp: Date.now()
    });

    this.saveHighlightsAndMerges();
    window.getSelection().removeAllRanges();

    console.log('✨ Created highlight');
  }

  removeHighlight(highlightSpan, lineIndex) {
    const highlightId = highlightSpan.getAttribute('data-highlight-id');

    // Remove from storage
    if (this.highlights[lineIndex]) {
      this.highlights[lineIndex] = this.highlights[lineIndex].filter(h => h.id !== highlightId);
      if (this.highlights[lineIndex].length === 0) {
        delete this.highlights[lineIndex];
      }
    }

    // Remove from DOM - preserve parent node structure
    const parent = highlightSpan.parentNode;

    // If parent is a text-segment, preserve the click functionality
    while (highlightSpan.firstChild) {
      parent.insertBefore(highlightSpan.firstChild, highlightSpan);
    }
    parent.removeChild(highlightSpan);

    // Normalize to merge adjacent text nodes
    parent.normalize();

    this.saveHighlightsAndMerges();
    console.log('🗑️ Removed highlight');
  }

}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new YouTubeReader());
} else {
  new YouTubeReader();
}
