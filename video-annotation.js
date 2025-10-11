// Video Reader Mode - Side-by-Side Layout
// Video on left, interactive transcript on right

class VideoAnnotationService {
  constructor() {
    this.isActive = false;
    this.videoElement = null;
    this.transcript = [];
    this.currentSegmentIndex = -1;
    this.updateInterval = null;
    this.annotations = {};
    this.originalPageState = null;
  }

  async init() {
    // Detect video platform and element
    this.detectVideo();

    // Load saved annotations
    const stored = await chrome.storage.local.get(['videoAnnotations']);
    if (stored.videoAnnotations) {
      this.annotations = stored.videoAnnotations;
    }
  }

  detectVideo() {
    // Check for YouTube - ONLY on www.youtube.com or m.youtube.com, not other subdomains
    const isYouTubeVideoPage = (
      (window.location.hostname === 'www.youtube.com' || window.location.hostname === 'm.youtube.com') &&
      (window.location.pathname === '/watch' || window.location.pathname.startsWith('/watch?'))
    );

    if (isYouTubeVideoPage) {
      console.log('🔍 Detecting video on YouTube...');
      console.log('📍 URL:', window.location.href);
      console.log('📄 Document ready state:', document.readyState);

      // Log important containers
      const moviePlayer = document.querySelector('#movie_player');
      const ytdPlayer = document.querySelector('ytd-player');
      const html5Player = document.querySelector('.html5-video-player');

      console.log('🎬 Player containers:', {
        moviePlayer: !!moviePlayer,
        ytdPlayer: !!ytdPlayer,
        html5Player: !!html5Player
      });

      // Try multiple selectors for YouTube video element
      const selectors = [
        'video.html5-main-video',
        'video.video-stream',
        '#movie_player video',
        '.html5-video-player video',
        'ytd-player video',
        'video'
      ];

      let videoElement = null;
      console.log('🔎 Trying selectors...');
      for (const selector of selectors) {
        videoElement = document.querySelector(selector);
        console.log(`  ${selector}: ${videoElement ? '✅ FOUND' : '❌ not found'}`);
        if (videoElement) {
          console.log(`✅ YouTube video found with selector: ${selector}`);
          console.log('📹 Video element:', {
            tagName: videoElement.tagName,
            id: videoElement.id,
            className: videoElement.className,
            src: videoElement.src,
            currentSrc: videoElement.currentSrc,
            readyState: videoElement.readyState,
            videoWidth: videoElement.videoWidth,
            videoHeight: videoElement.videoHeight
          });
          break;
        }
      }

      if (videoElement) {
        this.videoElement = videoElement;
        this.platform = 'youtube';
        return true;
      } else {
        // Debug info
        const allVideos = document.querySelectorAll('video');
        const allIframes = document.querySelectorAll('iframe');

        console.warn(`⚠️ On YouTube but video element not found. Total <video> tags: ${allVideos.length}`);
        console.log('🔍 All video elements on page:', allVideos);
        console.log('🔍 All iframes on page:', allIframes.length);

        // Log all elements that might contain video
        console.log('🔍 Checking shadow DOM and nested elements...');
        if (ytdPlayer) {
          console.log('  ytd-player shadowRoot:', ytdPlayer.shadowRoot);
        }
        if (moviePlayer) {
          console.log('  #movie_player children:', moviePlayer.children);
          console.log('  #movie_player innerHTML length:', moviePlayer.innerHTML.length);
        }

        if (allVideos.length > 0) {
          console.log('✅ Found video elements, using first one:', allVideos[0]);
          // Use the first video if any exist
          this.videoElement = allVideos[0];
          this.platform = 'youtube';
          return true;
        }
        return false;
      }
    }

    // Check for Vimeo
    if (window.location.hostname.includes('vimeo.com')) {
      this.videoElement = document.querySelector('video');
      this.platform = 'vimeo';
      return true;
    }

    // Check for generic HTML5 video
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      // Find the largest video
      let largestVideo = videos[0];
      let maxSize = 0;

      videos.forEach(video => {
        const size = video.clientWidth * video.clientHeight;
        if (size > maxSize) {
          maxSize = size;
          largestVideo = video;
        }
      });

      this.videoElement = largestVideo;
      this.platform = 'html5';
      return true;
    }

    return false;
  }

  async createYouTubeReaderInNewTab() {
    const videoId = new URLSearchParams(window.location.search).get('v');

    // Get current video time
    let currentTime = 0;
    try {
      const ytPlayer = document.querySelector('video');
      if (ytPlayer && !isNaN(ytPlayer.currentTime)) {
        currentTime = Math.floor(ytPlayer.currentTime);
      }
    } catch (e) {
      console.warn('Could not get current video time:', e);
    }

    // Store transcript data in chrome.storage for the new tab to access
    const readerData = {
      videoId: videoId,
      startTime: currentTime,
      transcript: this.transcript,
      timestamp: Date.now()
    };

    await chrome.storage.local.set({ youtubeReaderData: readerData });

    // Open the video reader HTML page in a new tab
    const readerUrl = chrome.runtime.getURL('youtube-reader.html');
    chrome.runtime.sendMessage({
      action: 'openYouTubeReader',
      url: readerUrl
    });

    console.log('✅ Opening YouTube Reader in new tab...');
  }

  async extractTranscript() {
    if (this.platform === 'youtube') {
      return await this.extractYouTubeTranscript();
    } else if (this.platform === 'vimeo') {
      return await this.extractVimeoTranscript();
    } else {
      throw new Error('Automatic transcript extraction not supported for this video.');
    }
  }

  async extractYouTubeTranscript() {
    try {
      console.log('🎬 Extracting YouTube transcript...');

      // Get video ID - try multiple methods
      let videoId = null;

      // Method 1: From URL query parameter
      videoId = new URLSearchParams(window.location.search).get('v');

      // Method 2: From URL hash (for some YouTube URLs)
      if (!videoId) {
        const match = window.location.href.match(/[?&]v=([^&]+)/);
        if (match) videoId = match[1];
      }

      // Method 3: From ytInitialData
      if (!videoId && window.ytInitialData?.currentVideoEndpoint?.watchEndpoint?.videoId) {
        videoId = window.ytInitialData.currentVideoEndpoint.watchEndpoint.videoId;
      }

      // Method 4: From the page's canonical URL
      if (!videoId) {
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) {
          const match = canonical.href.match(/watch\?v=([^&]+)/);
          if (match) videoId = match[1];
        }
      }

      if (!videoId) {
        throw new Error('Could not find video ID. Please ensure you are on a YouTube video page.');
      }

      console.log(`📹 Video ID: ${videoId}`);
      console.log('📡 Step 1: Finding caption tracks in page data...');

      // Try to access ytInitialPlayerResponse from the current page
      let captionTracks = null;

      // Wait for YouTube player to be ready with retry logic
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          console.log(`⏳ Retry attempt ${attempt}/3 - waiting for YouTube player...`);
          await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds between retries
        }

        // Method 1: Check if ytInitialPlayerResponse is available in window
        if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          captionTracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
          console.log(`✅ Found ${captionTracks.length} caption tracks from window object`);
          break;
        }

        // Method 2: Parse from page scripts if not in window
        if (!captionTracks) {
          const scripts = Array.from(document.getElementsByTagName('script'));
          for (const script of scripts) {
            const content = script.textContent;

            if (content.includes('captionTracks')) {
              // Try to find the complete ytInitialPlayerResponse object
              const startIdx = content.indexOf('var ytInitialPlayerResponse = ');
              if (startIdx !== -1) {
                const jsonStart = content.indexOf('{', startIdx);
                const jsonEnd = content.indexOf('};', jsonStart) + 1;

                if (jsonStart !== -1 && jsonEnd > jsonStart) {
                  try {
                    const jsonStr = content.substring(jsonStart, jsonEnd);
                    const playerResponse = JSON.parse(jsonStr);

                    if (playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                      captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
                      console.log(`✅ Found ${captionTracks.length} caption tracks from script parsing`);
                      break;
                    }
                  } catch (e) {
                    console.warn('Failed to parse ytInitialPlayerResponse:', e.message);
                  }
                }
              }
            }
          }
        }

        // If we found captions, break out of retry loop
        if (captionTracks && captionTracks.length > 0) {
          break;
        }
      }

      if (!captionTracks || captionTracks.length === 0) {
        throw new Error('No caption tracks found. This video does not have captions available.');
      }

      // Log available tracks
      console.log('Available caption tracks:');
      captionTracks.forEach(track => {
        console.log(`  - ${track.languageCode} (${track.name?.simpleText || 'Unknown'}) ${track.kind === 'asr' ? '[Auto-generated]' : '[Manual]'}`);
      });

      // Find English caption track (prefer manual, fallback to auto-generated)
      let selectedTrack = captionTracks.find(track =>
        (track.languageCode === 'en' || track.languageCode?.startsWith('en')) &&
        track.kind !== 'asr'
      );

      // Fallback to auto-generated English
      if (!selectedTrack) {
        selectedTrack = captionTracks.find(track =>
          track.languageCode === 'en' || track.languageCode?.startsWith('en')
        );
      }

      // Fallback to any track
      if (!selectedTrack) {
        selectedTrack = captionTracks[0];
        console.log(`⚠️ Using non-English track: ${selectedTrack.languageCode}`);
      }

      console.log(`📥 Step 2: Extracting caption data from player config...`);

      // Extract the caption track URL and parse it properly
      // YouTube stores captions in the player's initial data
      const captionUrl = selectedTrack.baseUrl;

      // The baseUrl contains authentication that works in the page context
      // We need to make the request using a CORS proxy or extract data differently

      // Try using youtube-transcript library approach: extract from page's ytInitialData
      let transcript = [];

      // Check if we can access the player's internal caption data
      if (window.ytplayer && window.ytplayer.config) {
        console.log('Found ytplayer.config, trying to extract captions...');
        // This rarely works as it's usually not exposed
      }

      // JSONP approach removed - doesn't work due to CSP restrictions
      console.log('⚠️ Direct API fetch not possible due to YouTube restrictions');

      // Check if transcript is already open on the page
      console.log('📥 Checking for existing transcript on page...');
      transcript = this.scrapeYouTubeTranscriptFromPage();

      if (transcript.length > 0) {
        console.log(`✅ Found ${transcript.length} segments from open transcript panel`);
        return transcript;
      }

      // Transcript is not open - show clear instructions
      console.log('⚠️ Transcript panel is not open');

      // Create a user-friendly error message with instructions
      const instructionMessage =
        'YouTube Video Reader Mode requires the transcript to be visible.\n\n' +
        '📋 Please follow these steps:\n\n' +
        '1. Click the "..." (three dots) button below the video\n' +
        '2. Click "Show transcript" in the menu\n' +
        '3. Wait for the transcript panel to appear on the right\n' +
        '4. Then click the 🎬 Video Transcript button again\n\n' +
        '💡 Tip: The transcript panel must stay visible for this to work.';

      throw new Error(instructionMessage);

    } catch (error) {
      console.error('❌ Failed to extract YouTube transcript:', error);
      throw new Error(`Could not extract transcript: ${error.message}. Please ensure this video has captions/subtitles enabled.`);
    }
  }

  async ensureYouTubeTranscriptOpen() {
    console.log('🔍 Checking if transcript is already open...');

    // Check if transcript is already visible
    let transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');

    if (transcriptSegments.length > 0) {
      console.log('✅ Transcript already open');
      return;
    }

    console.log('📂 Attempting to open transcript...');

    // Try multiple selectors for the "More actions" button (YouTube updates their UI frequently)
    const moreButtonSelectors = [
      'button[aria-label="More actions"]',
      'button[aria-label*="More"]',
      'ytd-menu-renderer button',
      '#button-shape button[aria-label*="more" i]',
      'button.ytp-button[aria-label*="more" i]',
      '#top-level-buttons-computed button[aria-label*="more" i]'
    ];

    let moreButton = null;
    for (const selector of moreButtonSelectors) {
      moreButton = document.querySelector(selector);
      if (moreButton) {
        console.log(`✅ Found "More" button using: ${selector}`);
        break;
      }
    }

    // Fallback: search through all buttons
    if (!moreButton) {
      console.log('🔍 Searching through all buttons...');
      const allButtons = Array.from(document.querySelectorAll('button'));
      moreButton = allButtons.find(b => {
        const label = b.getAttribute('aria-label');
        const title = b.getAttribute('title');
        return (label && label.toLowerCase().includes('more')) ||
               (title && title.toLowerCase().includes('more'));
      });
    }

    if (moreButton) {
      console.log('🖱️ Clicking "More" button...');
      moreButton.click();

      // Wait for menu to appear
      await this.sleep(800);

      // Find "Show transcript" option with multiple selectors
      const transcriptOptionSelectors = [
        'ytd-menu-service-item-renderer',
        'tp-yt-paper-listbox ytd-menu-service-item-renderer',
        'ytd-menu-popup-renderer ytd-menu-service-item-renderer',
        '[role="menuitem"]'
      ];

      let transcriptButton = null;
      for (const selector of transcriptOptionSelectors) {
        const items = Array.from(document.querySelectorAll(selector));
        transcriptButton = items.find(item =>
          item.textContent.toLowerCase().includes('transcript') ||
          item.textContent.toLowerCase().includes('show transcript')
        );
        if (transcriptButton) {
          console.log(`✅ Found "Show transcript" option using: ${selector}`);
          break;
        }
      }

      if (transcriptButton) {
        console.log('🖱️ Clicking "Show transcript" option...');
        transcriptButton.click();

        // Wait for transcript to load
        console.log('⏳ Waiting for transcript to load...');
        await this.sleep(1500);

        // Check if loaded
        transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
        if (transcriptSegments.length > 0) {
          console.log(`✅ Transcript opened successfully (${transcriptSegments.length} segments)`);
          return;
        }
      } else {
        console.warn('⚠️ Could not find "Show transcript" option in menu');
      }
    } else {
      console.warn('⚠️ Could not find "More" button with any selector');
    }

    console.log('💡 If this failed, manually open transcript: Click "..." → "Show transcript"');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  scrapeYouTubeTranscriptFromPage() {
    console.log('🔍 Attempting to scrape transcript from page...');

    // Try multiple possible selectors
    const selectors = [
      'ytd-transcript-segment-renderer',
      '[class*="transcript-segment"]',
      '[class*="cue"]'
    ];

    let transcriptSegments = [];

    for (const selector of selectors) {
      transcriptSegments = document.querySelectorAll(selector);
      console.log(`Selector "${selector}": found ${transcriptSegments.length} elements`);
      if (transcriptSegments.length > 0) break;
    }

    if (transcriptSegments.length === 0) {
      console.warn('❌ No transcript segments found on page');
      console.log('💡 Tip: Open YouTube transcript by clicking "..." → "Show transcript" first');
      return [];
    }

    const transcript = [];

    transcriptSegments.forEach((segment, index) => {
      // Try multiple ways to find timestamp and text
      const timeElement = segment.querySelector('.segment-timestamp') ||
                         segment.querySelector('[class*="timestamp"]') ||
                         segment.querySelector('div:first-child');

      const textElement = segment.querySelector('.segment-text') ||
                         segment.querySelector('[class*="text"]') ||
                         segment.querySelector('div:last-child');

      if (timeElement && textElement) {
        const timeText = timeElement.textContent.trim();
        const time = this.parseYouTubeTime(timeText);
        const text = textElement.textContent.trim();

        if (text && !text.includes(':')) { // Avoid adding timestamps as text
          transcript.push({
            start: time,
            end: time + 5,
            text: text
          });

          if (index < 3) {
            console.log(`Sample segment ${index}: [${timeText}] "${text.substring(0, 50)}..."`);
          }
        }
      }
    });

    console.log(`✅ Scraped ${transcript.length} segments from page`);
    return transcript;
  }

  parseYouTubeTime(timeStr) {
    // Parse "1:23" or "1:23:45" format
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  async extractVimeoTranscript() {
    throw new Error('Vimeo transcript extraction requires manual input');
  }

  async activate() {
    console.log('🚀 activate() called!');
    console.log('   URL:', window.location.href);
    console.log('   Hostname:', window.location.hostname);
    console.log('   Pathname:', window.location.pathname);
    console.log('   isActive:', this.isActive);

    // Check if actually still active by looking for the reader container
    const readerContainer = document.getElementById('video-reader-container');
    if (this.isActive && readerContainer) {
      console.log('⏹️ Already active and container exists, returning');
      return;
    } else if (this.isActive && !readerContainer) {
      console.log('⚠️ isActive=true but container not found, resetting state...');
      this.isActive = false;
    }

    // Early exit for non-video pages
    const isYouTubeVideoPage = (
      (window.location.hostname === 'www.youtube.com' || window.location.hostname === 'm.youtube.com') &&
      (window.location.pathname === '/watch' || window.location.pathname.startsWith('/watch?'))
    );

    console.log('🔎 isYouTubeVideoPage:', isYouTubeVideoPage);

    // Skip activation on non-YouTube-video pages (auth frames, studio, etc.)
    if (window.location.hostname.includes('youtube.com') && !isYouTubeVideoPage) {
      console.log(`ℹ️ Skipping video reader on non-video YouTube page: ${window.location.href}`);
      return;
    }

    // Skip on about:blank and other special pages
    if (window.location.href === 'about:blank' || window.location.protocol === 'chrome-extension:') {
      console.log(`ℹ️ Skipping video reader on: ${window.location.href}`);
      return;
    }

    console.log('✅ Passed all checks, proceeding with video detection...');

    // Try to detect video with retry logic (for YouTube SPA navigation)
    let videoDetected = this.detectVideo();

    if (!videoDetected && isYouTubeVideoPage) {
      console.log('⏳ Video not found immediately, waiting for YouTube SPA to load new video...');
      this.showToast('⏳ Waiting for video to load...', 'info', 8000);

      // YouTube SPA transitions can take time - wait up to 10 seconds
      // Use exponential backoff: wait longer as we go
      const retryDelays = [100, 200, 300, 500, 500, 700, 1000, 1000, 1500, 2000]; // Total ~7.8 seconds

      for (let i = 0; i < retryDelays.length; i++) {
        await new Promise(resolve => setTimeout(resolve, retryDelays[i]));
        console.log(`Retry ${i + 1}/${retryDelays.length} (waited ${retryDelays[i]}ms)...`);
        videoDetected = this.detectVideo();
        if (videoDetected) {
          console.log(`✅ Video found after ${i + 1} attempts`);
          break;
        }
      }
    }

    if (!videoDetected) {
      console.warn('❌ No video found on this page after retries');
      console.log('Current URL:', window.location.href);
      console.log('Page title:', document.title);
      console.log('📊 DOM state:', {
        hasMoviePlayer: !!document.querySelector('#movie_player'),
        hasYtdPlayer: !!document.querySelector('ytd-player'),
        totalVideos: document.querySelectorAll('video').length,
        videoIds: Array.from(document.querySelectorAll('video')).map(v => v.id || v.className)
      });
      this.showToast('⚠️ No video found. Please wait a few seconds for the video to fully load, then try again.', 'error', 6000);
      return;
    }

    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'vr-loading';
    loadingDiv.innerHTML = `
      <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                  background: rgba(0,0,0,0.9); color: white; padding: 30px 50px;
                  border-radius: 12px; z-index: 999999; text-align: center; font-family: sans-serif;">
        <div style="font-size: 20px; margin-bottom: 15px;">🎬 Extracting Video Transcript...</div>
        <div style="color: #aaa; font-size: 14px;">Please wait...</div>
      </div>
    `;
    document.body.appendChild(loadingDiv);

    try {
      // Try to extract transcript automatically
      this.transcript = await this.extractTranscript();

      // Remove loading indicator
      loadingDiv.remove();

      if (this.transcript.length === 0) {
        // Show manual input option
        this.showManualTranscriptInput();
        return;
      }

      this.createSideBySideView();
      this.isActive = true;
      this.startSync();

      // Track event
      chrome.runtime.sendMessage({
        action: 'trackEvent',
        event: 'video_reader_mode_activated',
        data: {
          url: window.location.href,
          platform: this.platform
        }
      });

    } catch (error) {
      // Remove loading indicator
      const loading = document.getElementById('vr-loading');
      if (loading) loading.remove();

      console.error('Failed to activate video reader mode:', error);

      // For YouTube, show error instead of manual input
      if (this.platform === 'youtube') {
        this.showToast(`❌ Could not extract transcript: ${error.message}`, 'error', 6000);
      } else {
        // For other platforms, show manual input
        this.showManualTranscriptInput();
      }
    }
  }

  showManualTranscriptInput() {
    const modal = document.createElement('div');
    modal.id = 'transcript-input-modal';
    modal.innerHTML = `
      <div class="transcript-modal-overlay">
        <div class="transcript-modal-content">
          <h2>Add Video Transcript</h2>
          <p>Automatic transcript extraction is not available. Please paste a transcript:</p>
          <p><strong>Paste transcript in one of these formats:</strong></p>
          <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <p style="color: #2196f3; font-weight: 600; margin-bottom: 8px;">Simple format (recommended):</p>
            <pre style="color: #e0e0e0; font-size: 12px; margin: 0;">0:00 Introduction to the topic
0:45 First main point discussed
1:30 Second important concept
2:15 Practical example shown
3:00 Conclusion and summary</pre>
          </div>
          <div style="background: #1a1a1a; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <p style="color: #2196f3; font-weight: 600; margin-bottom: 8px;">SRT format:</p>
            <pre style="color: #e0e0e0; font-size: 12px; margin: 0;">1
00:00:00,000 --> 00:00:05,000
First line of subtitle

2
00:00:05,000 --> 00:00:10,000
Second line of subtitle</pre>
          </div>
          <textarea id="transcript-input" placeholder="Paste transcript here..." rows="15"></textarea>
          <div class="transcript-modal-actions">
            <button id="transcript-cancel">Cancel</button>
            <button id="transcript-submit">Submit</button>
          </div>
        </div>
      </div>
    `;

    this.injectStyles();
    document.body.appendChild(modal);

    document.getElementById('transcript-cancel').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('transcript-submit').addEventListener('click', () => {
      const input = document.getElementById('transcript-input').value;
      try {
        this.transcript = this.parseTranscriptFormat(input);
        modal.remove();
        this.createSideBySideView();
        this.isActive = true;
        this.startSync();
      } catch (error) {
        alert('Failed to parse transcript: ' + error.message);
      }
    });
  }

  parseTranscriptFormat(input) {
    // Try to parse SRT format
    if (input.includes('-->')) {
      return this.parseSRT(input);
    }

    // Try to parse simple time: text format
    const lines = input.split('\n').filter(line => line.trim());
    const transcript = [];

    lines.forEach(line => {
      const match = line.match(/^(\d+):(\d+)(?::(\d+))?\s+(.+)$/);
      if (match) {
        const hours = match[3] ? parseInt(match[1]) : 0;
        const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
        const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);
        const text = match[4];

        const start = hours * 3600 + minutes * 60 + seconds;
        transcript.push({
          start,
          end: start + 5,
          text
        });
      }
    });

    if (transcript.length === 0) {
      throw new Error('Could not parse transcript format. Please use format: "0:00 Text here"');
    }

    return transcript;
  }

  parseSRT(srtContent) {
    const blocks = srtContent.trim().split(/\n\s*\n/);
    const transcript = [];

    blocks.forEach(block => {
      const lines = block.split('\n');
      if (lines.length >= 3) {
        const timeLine = lines[1];
        const textLines = lines.slice(2);

        const match = timeLine.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
        if (match) {
          const start = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
          const end = parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 + parseInt(match[7]) + parseInt(match[8]) / 1000;

          transcript.push({
            start,
            end,
            text: textLines.join(' ').trim()
          });
        }
      }
    });

    return transcript;
  }

  async createSideBySideView() {
    console.log('🎬 Creating video reader mode (video top, transcript below)...');

    // For YouTube, we need to open in a new tab with a proper HTML page
    // because YouTube blocks iframe embedding from chrome-extension:// origins
    if (this.platform === 'youtube') {
      await this.createYouTubeReaderInNewTab();
      return;
    }

    // Save original page state for non-YouTube platforms
    this.originalPageState = {
      scrollY: window.scrollY,
      bodyHTML: document.body.innerHTML,
      bodyClass: document.body.className,
      bodyStyle: document.body.getAttribute('style')
    };

    // Create embedded video element
    let videoEmbed;
    if (this.platform === 'youtube') {
      const videoId = new URLSearchParams(window.location.search).get('v');

      // Try to get current time from the actual video player
      let currentTime = 0;
      try {
        const ytPlayer = document.querySelector('video');
        if (ytPlayer && !isNaN(ytPlayer.currentTime)) {
          currentTime = Math.floor(ytPlayer.currentTime);
        }
      } catch (e) {
        console.warn('Could not get current video time:', e);
      }

      console.log(`📺 Creating YouTube embed: videoId=${videoId}, startTime=${currentTime}`);

      // Create YouTube iframe embed
      videoEmbed = document.createElement('iframe');
      videoEmbed.id = 'video-embed-player';
      videoEmbed.width = '100%';
      videoEmbed.height = '100%';
      videoEmbed.src = `https://www.youtube.com/embed/${videoId}?start=${currentTime}&autoplay=1&enablejsapi=1`;
      videoEmbed.frameBorder = '0';
      videoEmbed.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      videoEmbed.allowFullscreen = true;
      videoEmbed.setAttribute('allowfullscreen', '');
      videoEmbed.style.cssText = 'width: 100%; height: 100%; aspect-ratio: 16/9; border: none;';

      console.log(`📺 Embed URL: ${videoEmbed.src}`);
    } else {
      // For other platforms, clone the video element
      videoEmbed = this.videoElement.cloneNode(true);
    }

    // Clear the body
    document.body.innerHTML = '';
    document.body.className = 'video-reader-mode';
    document.body.style.cssText = 'margin: 0; padding: 0; overflow: hidden; background: #1a1a1a;';

    // Create vertical layout (video top, transcript below)
    const container = document.createElement('div');
    container.id = 'video-reader-container';
    container.innerHTML = `
      <div class="vr-toolbar">
        <div class="vr-toolbar-left">
          <button class="vr-btn vr-exit" id="vr-exit" title="Exit Video Reader Mode">
            ✕ Exit
          </button>
          <span class="vr-title">Video Reader Mode</span>
        </div>
        <div class="vr-toolbar-right">
          <button class="vr-btn" id="vr-theme-toggle" title="Toggle Dark/Light Mode">
            🌙
          </button>
          <button class="vr-btn" id="vr-export" title="Export Transcript">
            💾
          </button>
        </div>
      </div>

      <div class="vr-main-content">
        <div class="vr-video-section">
          <div class="vr-video-container" id="video-panel">
            <!-- Video will be inserted here -->
          </div>
        </div>

        <div class="vr-transcript-section">
          <div class="vr-search-panel">
            <input type="text" id="vr-search-input" placeholder="🔍 Search transcript...">
            <button id="vr-search-clear" style="display: none;">Clear</button>
          </div>

          <div class="vr-transcript-header">
            <h2>Transcript</h2>
            <span class="vr-transcript-count">${this.transcript.length} segments</span>
          </div>

          <div class="vr-transcript-content" id="transcript-content">
            ${this.renderTranscriptLines()}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Insert the video embed
    const videoPanel = document.getElementById('video-panel');
    videoPanel.appendChild(videoEmbed);

    // Store reference to video element (iframe for YouTube, video for others)
    this.videoElement = videoEmbed;

    // Inject styles
    this.injectStyles();

    // Load saved theme preference
    this.loadThemePreference();

    // Setup event listeners
    this.setupEventListeners();

    console.log('✅ Video reader view created (vertical layout)');
  }

  renderTranscriptLines() {
    return this.transcript.map((segment, index) => `
      <div class="vr-transcript-line" data-index="${index}" data-start="${segment.start}" data-end="${segment.end}">
        <span class="vr-line-time" title="Click to jump to this time">${this.formatTime(segment.start)}</span>
        <span class="vr-line-text">${this.escapeHtml(segment.text)}</span>
      </div>
    `).join('');
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

  injectStyles() {
    if (document.getElementById('video-reader-styles')) return;

    const style = document.createElement('style');
    style.id = 'video-reader-styles';
    style.textContent = `
      .video-reader-mode {
        background: #1a1a1a;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e0e0e0;
      }

      #video-reader-container {
        width: 100vw;
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .vr-toolbar {
        background: #2a2a2a;
        border-bottom: 1px solid #444;
        padding: 12px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        z-index: 100;
      }

      .vr-toolbar-left,
      .vr-toolbar-right {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .vr-title {
        font-size: 15px;
        font-weight: 600;
        color: #e0e0e0;
        margin-left: 8px;
      }

      .vr-btn {
        padding: 8px 16px;
        background: #3a3a3a;
        border: 1px solid #555;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        color: #e0e0e0;
        transition: all 0.2s;
      }

      .vr-btn:hover {
        background: #4a4a4a;
        border-color: #777;
      }

      .vr-exit {
        background: #dc3545;
        border-color: #dc3545;
        color: white;
      }

      .vr-exit:hover {
        background: #c82333;
      }

      .vr-search-panel {
        background: #2a2a2a;
        padding: 15px 20px;
        border-bottom: 1px solid #444;
        display: flex;
        gap: 10px;
        align-items: center;
        flex-shrink: 0;
      }

      #vr-search-input {
        flex: 1;
        padding: 10px 15px;
        border: 1px solid #555;
        border-radius: 6px;
        font-size: 14px;
        background: #3a3a3a;
        color: #e0e0e0;
      }

      #vr-search-input:focus {
        outline: none;
        border-color: #2196f3;
        box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
      }

      #vr-search-clear {
        padding: 10px 20px;
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      }

      #vr-search-clear:hover {
        background: #5a6268;
      }

      .vr-main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        overflow-x: hidden;
        background: #1a1a1a;
      }

      .vr-video-section {
        flex-shrink: 0;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        width: 100%;
      }

      .vr-video-container {
        max-width: 1400px;
        width: 100%;
      }

      .vr-video-container video,
      .vr-video-container iframe,
      .vr-video-container #movie_player,
      .vr-video-container .html5-video-player {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        aspect-ratio: 16/9;
        border: none;
      }

      .vr-transcript-section {
        flex: 1;
        background: #1e1e1e;
        border-top: 1px solid #333;
        display: flex;
        flex-direction: column;
      }

      .vr-transcript-header {
        background: #252525;
        border-bottom: 2px solid #2196f3;
        padding: 20px;
        flex-shrink: 0;
      }

      .vr-transcript-header h2 {
        margin: 0 0 8px 0;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
      }

      .vr-transcript-count {
        font-size: 13px;
        color: #999;
      }

      .vr-transcript-content {
        flex: 1;
        padding: 8px 20px;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .vr-transcript-content::-webkit-scrollbar {
        width: 12px;
      }

      .vr-transcript-content::-webkit-scrollbar-track {
        background: #1e1e1e;
      }

      .vr-transcript-content::-webkit-scrollbar-thumb {
        background: #444;
        border-radius: 6px;
      }

      .vr-transcript-content::-webkit-scrollbar-thumb:hover {
        background: #555;
      }

      .vr-transcript-line {
        display: flex;
        gap: 12px;
        padding: 10px 12px;
        margin-bottom: 4px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        align-items: flex-start;
      }

      .vr-transcript-line:hover {
        background: #2a2a2a;
      }

      .vr-transcript-line.active {
        background: rgba(255, 193, 7, 0.15);
        border-left: 3px solid #ffc107;
        padding-left: 9px;
      }

      .vr-transcript-line.highlighted {
        background: rgba(33, 150, 243, 0.15);
        border-left: 3px solid #2196f3;
        padding-left: 9px;
      }

      .vr-line-time {
        flex-shrink: 0;
        font-size: 12px;
        font-weight: 600;
        color: #2196f3;
        min-width: 50px;
        font-family: 'Courier New', monospace;
        padding-top: 2px;
      }

      .vr-line-time:hover {
        color: #64b5f6;
        text-decoration: underline;
      }

      .vr-line-text {
        flex: 1;
        font-size: 15px;
        line-height: 1.5;
        color: #d0d0d0;
      }

      .vr-transcript-line.active .vr-line-text {
        color: #fff;
        font-weight: 500;
      }

      /* Modal styles */
      .transcript-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }

      .transcript-modal-content {
        background: #2a2a2a;
        padding: 30px;
        border-radius: 12px;
        max-width: 700px;
        width: 90%;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        color: #e0e0e0;
      }

      .transcript-modal-content h2 {
        margin: 0 0 16px 0;
        font-size: 24px;
        color: #fff;
      }

      .transcript-modal-content p {
        margin: 0 0 12px 0;
        color: #ccc;
        font-size: 14px;
        line-height: 1.5;
      }

      .transcript-modal-content pre {
        color: #e0e0e0;
      }

      #transcript-input {
        flex: 1;
        min-height: 300px;
        padding: 12px;
        border: 1px solid #555;
        border-radius: 8px;
        font-family: monospace;
        font-size: 13px;
        resize: vertical;
        margin-bottom: 16px;
        background: #1a1a1a;
        color: #e0e0e0;
      }

      #transcript-input:focus {
        outline: none;
        border-color: #2196f3;
      }

      .transcript-modal-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .transcript-modal-actions button {
        padding: 10px 24px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      #transcript-cancel {
        background: #444;
        color: #fff;
      }

      #transcript-cancel:hover {
        background: #555;
      }

      #transcript-submit {
        background: #2196f3;
        color: white;
      }

      #transcript-submit:hover {
        background: #1976d2;
      }

      /* Light theme */
      .video-reader-mode.light-theme {
        background: #f5f5f5;
        color: #333;
      }

      .light-theme #video-reader-container {
        background: #fff;
      }

      .light-theme .vr-toolbar {
        background: #fff;
        border-bottom: 1px solid #e0e0e0;
      }

      .light-theme .vr-btn {
        background: #f5f5f5;
        border-color: #ddd;
        color: #333;
      }

      .light-theme .vr-btn:hover {
        background: #e0e0e0;
        border-color: #bbb;
      }

      .light-theme .vr-title {
        color: #333;
      }

      .light-theme .vr-search-panel {
        background: #fff;
        border-bottom: 1px solid #e0e0e0;
      }

      .light-theme #vr-search-input {
        background: #f5f5f5;
        border-color: #ddd;
        color: #333;
      }

      .light-theme .vr-main-content {
        background: #f5f5f5;
      }

      .light-theme .vr-transcript-panel {
        background: #fff;
        border-top: 1px solid #e0e0e0;
      }

      .light-theme .vr-transcript-header {
        background: #f8f8f8;
        border-bottom: 2px solid #2196f3;
      }

      .light-theme .vr-transcript-header h2 {
        color: #333;
      }

      .light-theme .vr-transcript-count {
        color: #666;
      }

      .light-theme .vr-transcript-line {
        color: #333;
      }

      .light-theme .vr-transcript-line:hover {
        background: #f0f0f0;
      }

      .light-theme .vr-line-text {
        color: #444;
      }

      .light-theme .vr-transcript-line.active .vr-line-text {
        color: #000;
      }

      .light-theme .vr-transcript-content::-webkit-scrollbar-track {
        background: #f5f5f5;
      }

      .light-theme .vr-transcript-content::-webkit-scrollbar-thumb {
        background: #ccc;
      }

      .light-theme .vr-transcript-content::-webkit-scrollbar-thumb:hover {
        background: #aaa;
      }

      .light-theme .vr-transcript-section {
        background: #fff;
        border-top: 1px solid #e0e0e0;
      }

      /* Responsive - keep vertical layout on all screen sizes */
      @media (max-width: 1400px) {
        .vr-video-container {
          max-width: 95%;
        }
      }

      @media (max-width: 900px) {
        .vr-video-section {
          padding: 10px;
        }

        .vr-transcript-content {
          padding: 8px 15px;
        }
      }

      @media (max-width: 600px) {
        .vr-video-section {
          padding: 5px;
        }

        .vr-toolbar {
          padding: 10px 15px;
        }

        .vr-btn {
          padding: 6px 12px;
          font-size: 13px;
        }

        .vr-transcript-content {
          padding: 8px 10px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  setupEventListeners() {
    // Exit button
    document.getElementById('vr-exit').addEventListener('click', () => {
      this.deactivate();
    });

    // Export button
    document.getElementById('vr-export').addEventListener('click', () => {
      this.exportTranscript();
    });

    // Theme toggle button
    const themeToggle = document.getElementById('vr-theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    // Search toggle (if exists - for backward compatibility)
    const searchToggle = document.getElementById('vr-search-toggle');
    if (searchToggle) {
      searchToggle.addEventListener('click', () => {
        const panel = document.getElementById('vr-search-panel');
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        if (panel.style.display === 'flex') {
          document.getElementById('vr-search-input').focus();
        }
      });
    }

    // Search input
    document.getElementById('vr-search-input').addEventListener('input', (e) => {
      this.searchTranscript(e.target.value);
    });

    // Search clear
    document.getElementById('vr-search-clear').addEventListener('click', () => {
      document.getElementById('vr-search-input').value = '';
      this.searchTranscript('');
    });

    // Transcript line clicks
    document.querySelectorAll('.vr-transcript-line').forEach(line => {
      line.addEventListener('click', () => {
        const start = parseFloat(line.dataset.start);

        // For YouTube iframe, update the src with timestamp
        if (this.platform === 'youtube' && this.videoElement.tagName === 'IFRAME') {
          const videoId = new URLSearchParams(window.location.search).get('v');
          const currentSrc = this.videoElement.src;
          const baseUrl = `https://www.youtube.com/embed/${videoId}`;
          const newSrc = `${baseUrl}?start=${Math.floor(start)}&autoplay=1&enablejsapi=1&origin=${window.location.origin}`;
          this.videoElement.src = newSrc;
        } else if (this.videoElement.currentTime !== undefined) {
          // For regular video elements
          this.videoElement.currentTime = start;
          if (this.videoElement.paused) {
            this.videoElement.play();
          }
        }

        // Highlight the clicked line
        document.querySelectorAll('.vr-transcript-line').forEach(l => l.classList.remove('active'));
        line.classList.add('active');
      });

      // Double-click to highlight
      line.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        line.classList.toggle('highlighted');
        this.saveHighlightedSegments();
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.isActive) return;

      if (e.key === 'Escape') {
        this.deactivate();
      } else if (e.key === '/' && !e.target.matches('input')) {
        e.preventDefault();
        const panel = document.getElementById('vr-search-panel');
        panel.style.display = 'flex';
        document.getElementById('vr-search-input').focus();
      }
    });
  }

  startSync() {
    if (this.updateInterval) return;

    // Skip auto-sync for YouTube iframes (requires YouTube API integration)
    if (this.platform === 'youtube' && this.videoElement.tagName === 'IFRAME') {
      console.log('⏭️ Auto-sync disabled for YouTube iframe (click timestamps to jump)');
      return;
    }

    this.updateInterval = setInterval(() => {
      if (!this.videoElement) return;

      const currentTime = this.videoElement.currentTime;
      const newIndex = this.transcript.findIndex(segment =>
        currentTime >= segment.start && currentTime < segment.end
      );

      if (newIndex !== this.currentSegmentIndex) {
        // Remove old active class
        const oldLine = document.querySelector('.vr-transcript-line.active');
        if (oldLine) {
          oldLine.classList.remove('active');
        }

        // Add new active class
        if (newIndex >= 0) {
          const newLine = document.querySelector(`.vr-transcript-line[data-index="${newIndex}"]`);
          if (newLine) {
            newLine.classList.add('active');

            // Auto-scroll to active line (smooth scroll in main view)
            newLine.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }
        }

        this.currentSegmentIndex = newIndex;
      }
    }, 100);
  }

  searchTranscript(query) {
    const lines = document.querySelectorAll('.vr-transcript-line');
    const lowerQuery = query.toLowerCase();

    lines.forEach(line => {
      const text = line.querySelector('.vr-line-text').textContent.toLowerCase();
      if (!query || text.includes(lowerQuery)) {
        line.style.display = 'flex';
      } else {
        line.style.display = 'none';
      }
    });

    // Show/hide clear button
    const clearBtn = document.getElementById('vr-search-clear');
    if (clearBtn) {
      clearBtn.style.display = query ? 'block' : 'none';
    }
  }

  async loadThemePreference() {
    try {
      const result = await chrome.storage.local.get(['videoReaderTheme']);
      const theme = result.videoReaderTheme || 'dark';
      const themeBtn = document.getElementById('vr-theme-toggle');

      if (theme === 'light') {
        document.body.classList.add('light-theme');
        if (themeBtn) {
          themeBtn.textContent = '☀️';
          themeBtn.title = 'Switch to Dark Mode';
        }
        console.log('🎬 Loaded light theme preference');
      } else {
        document.body.classList.remove('light-theme');
        if (themeBtn) {
          themeBtn.textContent = '🌙';
          themeBtn.title = 'Switch to Light Mode';
        }
        console.log('🎬 Loaded dark theme preference');
      }
    } catch (error) {
      console.error('🎬 Error loading theme preference:', error);
    }
  }

  toggleTheme() {
    const body = document.body;
    const isLight = body.classList.contains('light-theme');
    const themeBtn = document.getElementById('vr-theme-toggle');

    if (isLight) {
      // Switch to dark
      body.classList.remove('light-theme');
      if (themeBtn) {
        themeBtn.textContent = '🌙';
        themeBtn.title = 'Switch to Light Mode';
      }
      chrome.storage.local.set({ videoReaderTheme: 'dark' });
      console.log('🎬 Switched to dark theme');
    } else {
      // Switch to light
      body.classList.add('light-theme');
      if (themeBtn) {
        themeBtn.textContent = '☀️';
        themeBtn.title = 'Switch to Dark Mode';
      }
      chrome.storage.local.set({ videoReaderTheme: 'light' });
      console.log('🎬 Switched to light theme');
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
    a.download = `video-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async saveHighlightedSegments() {
    const highlighted = [];
    document.querySelectorAll('.vr-transcript-line.highlighted').forEach(line => {
      highlighted.push(parseInt(line.dataset.index));
    });

    const videoId = this.getVideoId();
    if (!this.annotations[videoId]) {
      this.annotations[videoId] = {};
    }
    this.annotations[videoId].highlighted = highlighted;

    await chrome.storage.local.set({ videoAnnotations: this.annotations });
  }

  getVideoId() {
    if (this.platform === 'youtube') {
      return new URLSearchParams(window.location.search).get('v');
    }
    return window.location.href;
  }

  deactivate() {
    if (!this.isActive) return;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Restore original page
    if (this.originalPageState) {
      document.body.innerHTML = this.originalPageState.bodyHTML;
      document.body.className = this.originalPageState.bodyClass || '';
      if (this.originalPageState.bodyStyle) {
        document.body.setAttribute('style', this.originalPageState.bodyStyle);
      } else {
        document.body.removeAttribute('style');
      }
      window.scrollTo(0, this.originalPageState.scrollY);
    }

    // Remove styles
    const styles = document.getElementById('video-reader-styles');
    if (styles) styles.remove();

    this.isActive = false;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(message, type = 'info', duration = 4000) {
    // Remove existing toast if any
    const existingToast = document.getElementById('video-annotation-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'video-annotation-toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: sans-serif;
      font-size: 14px;
      max-width: 400px;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    // Auto remove after duration
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// Make it available globally
window.videoAnnotationService = new VideoAnnotationService();
window.videoAnnotationService.init();
