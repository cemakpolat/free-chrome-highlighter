// background.js - Service Worker for background operations

// Load plugin system scripts at the top level of the service worker.
// importScripts() must be called synchronously during SW evaluation in MV3 —
// calling it from inside an async function is unreliable across Chrome versions.
try {
  importScripts(
    'lib/plugin-interfaces.js',
    'lib/plugin-registry.js',
    'lib/plugin-loader.js',
    'lib/mcp-client.js',
    'lib/agent-orchestrator.js'
  );
  console.log('[SW] Plugin scripts loaded');
} catch (e) {
  console.warn('[SW] Could not load plugin scripts:', e.message);
}

// Analytics and usage tracking (privacy-first, local only)
const analytics = {
  dailyStats: {},

  async track(event, data = {}) {
    const today = new Date().toDateString();

    if (!this.dailyStats[today]) {
      this.dailyStats[today] = {
        highlights: 0,
        domains: [],
        sessions: 0,
        features: {}
      };
    }

    const stats = this.dailyStats[today];

    // Ensure domains is an array (in case it was loaded from storage as object)
    if (!Array.isArray(stats.domains)) {
      stats.domains = [];
    }

    switch (event) {
      case 'highlight_created':
        stats.highlights++;
        if (data.domain && !stats.domains.includes(data.domain)) {
          stats.domains.push(data.domain);
        }
        break;
      case 'session_start':
        stats.sessions++;
        break;
      case 'feature_used':
        stats.features[data.feature] = (stats.features[data.feature] || 0) + 1;
        break;
    }

    // Save to local storage (privacy-first - no external tracking)
    await chrome.storage.local.set({ dailyStats: this.dailyStats });
  },

  async getWeeklyReport() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    let totalHighlights = 0;
    let totalDomains = [];
    let totalSessions = 0;

    Object.entries(this.dailyStats).forEach(([date, stats]) => {
      if (new Date(date) >= weekAgo) {
        totalHighlights += stats.highlights;
        // Handle both array and Set formats
        if (Array.isArray(stats.domains)) {
          stats.domains.forEach(domain => {
            if (!totalDomains.includes(domain)) {
              totalDomains.push(domain);
            }
          });
        }
        totalSessions += stats.sessions;
      }
    });

    return {
      highlights: totalHighlights,
      domains: totalDomains.length,
      sessions: totalSessions,
      avgHighlightsPerSession: totalSessions > 0 ? Math.round(totalHighlights / totalSessions) : 0
    };
  }
};

// Sync management
const syncManager = {
  isOnline: navigator.onLine,
  syncQueue: [],
  lastSyncTime: null,

  async init() {
    // Listen for online/offline events
    self.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
    });

    self.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Periodic sync every 5 minutes
    setInterval(() => {
      if (this.isOnline) {
        this.processSyncQueue();
      }
    }, 5 * 60 * 1000);

    // Load last sync time
    const result = await chrome.storage.local.get(['lastSyncTime']);
    this.lastSyncTime = result.lastSyncTime || null;

    // Clear stale sync queue items on startup (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const initialQueueSize = this.syncQueue.length;
    this.syncQueue = this.syncQueue.filter(item => item.timestamp > oneHourAgo);
    const removed = initialQueueSize - this.syncQueue.length;
    if (removed > 0) {
      console.log(`Cleared ${removed} stale items from sync queue on startup`);
    }
  },

  async queueSync(domain, data) {
    this.syncQueue.push({ domain, data, timestamp: Date.now() });

    // Immediate sync if online
    if (this.isOnline) {
      setTimeout(() => this.processSyncQueue(), 1000);
    }
  },

  clearSyncQueue() {
    const queueSize = this.syncQueue.length;
    this.syncQueue = [];
    console.log(`Cleared ${queueSize} items from sync queue`);
    return queueSize;
  },

  getSyncQueueStatus() {
    return {
      queueLength: this.syncQueue.length,
      isOnline: this.isOnline,
      lastSyncTime: this.lastSyncTime,
      items: this.syncQueue.map(item => ({
        domain: item.domain,
        timestamp: item.timestamp,
        age: Date.now() - item.timestamp
      }))
    };
  },

  async processSyncQueue() {
    if (!this.isOnline || this.syncQueue.length === 0) {
      return;
    }

    console.log(`Processing ${this.syncQueue.length} items in sync queue`);

    const batch = this.syncQueue.splice(0, 5); // Process 5 at a time
    const failedItems = [];

    for (const item of batch) {
      try {
        await this.syncToCloud(item.domain, item.data);
      } catch (error) {
        const errorMsg = error.message || '';

        // Skip re-queuing for expected errors (not real failures)
        const expectedErrors = [
          'Receiving end does not exist',
          'Cannot sync to system page',
          'No active tab found',
          'No matching tabs found',
          'All matching tabs failed to sync',
          'Google Drive not authenticated'
        ];

        const isExpectedError = expectedErrors.some(msg => errorMsg.includes(msg));

        if (!isExpectedError) {
          console.error('Sync failed for', item.domain, error);
          failedItems.push(item);
        } else {
          // Skip items where sync isn't possible (expected situations)
          console.log('Skipping sync for', item.domain, '-', errorMsg);
        }
      }
    }

    // Re-queue only legitimate failures, not connection errors
    if (failedItems.length > 0) {
      this.syncQueue.unshift(...failedItems);
    }

    this.lastSyncTime = Date.now();
    await chrome.storage.local.set({ lastSyncTime: this.lastSyncTime });
  },

  async syncToCloud(domain, data) {
    // Check if Google Drive is authenticated
    if (!googleDriveAuth.accessToken || !googleDriveAuth.folderId) {
      throw new Error('Google Drive not authenticated');
    }

    try {
      const fileName = `${domain}_highlights.json`;

      // Search for existing file
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in '${googleDriveAuth.folderId}' and mimeType='application/json'&fields=files(id,name)`,
        {
          headers: {
            'Authorization': `Bearer ${googleDriveAuth.accessToken}`
          }
        }
      );

      if (!searchResponse.ok) {
        throw new Error(`Failed to search for file: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      const existingFiles = searchData.files || [];

      // Check if data is empty (all highlights deleted)
      const isEmpty = !data || !data.highlights || data.highlights.length === 0;

      if (isEmpty && existingFiles.length > 0) {
        // Delete the file from Google Drive
        const fileId = existingFiles[0].id;
        const deleteResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${googleDriveAuth.accessToken}`
            }
          }
        );

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          throw new Error(`Failed to delete file: ${deleteResponse.status}`);
        }

        console.log(`🗑️ Deleted file ${fileName} from Google Drive (no highlights remaining)`);
        return;
      }

      if (isEmpty) {
        // No file exists and no data to save - nothing to do
        console.log(`⏭️ Skipping sync for ${domain} (no highlights)`);
        return;
      }

      // Prepare file content
      const fileContent = JSON.stringify(data, null, 2);
      const blob = new Blob([fileContent], { type: 'application/json' });

      let uploadResponse;

      if (existingFiles.length > 0) {
        // Update existing file
        const fileId = existingFiles[0].id;
        uploadResponse = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${googleDriveAuth.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: fileContent
          }
        );
        console.log(`📤 Updated file ${fileName} in Google Drive`);
      } else {
        // Create new file
        const metadata = {
          name: fileName,
          mimeType: 'application/json',
          parents: [googleDriveAuth.folderId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        uploadResponse = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${googleDriveAuth.accessToken}`
            },
            body: form
          }
        );
        console.log(`📤 Created new file ${fileName} in Google Drive`);
      }

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${uploadResponse.status}`);
      }

      console.log(`✅ Successfully synced ${domain} to Google Drive`);
    } catch (error) {
      console.error('Google Drive sync error:', error);
      throw error;
    }
  }
};

// Context menu setup
const contextMenus = {
  async init() {
    try {
      await chrome.contextMenus.removeAll();

      chrome.contextMenus.create({
        id: 'highlight-text',
        title: '✨ Highlight selected text',
        contexts: ['selection']
      });

      chrome.contextMenus.create({
        id: 'search-highlights',
        title: '🔍 Search my highlights',
        contexts: ['page']
      });

      chrome.contextMenus.create({
        id: 'export-highlights',
        title: '📤 Export page highlights',
        contexts: ['page']
      });

      chrome.contextMenus.create({
        id: 'reader-view',
        title: '📖 Open Reader View',
        contexts: ['page']
      });

      chrome.contextMenus.create({
        id: 'video-annotation',
        title: '🎬 Show Video Transcript',
        contexts: ['page']
      });

      // Set up context menu click handler after menus are created
      chrome.contextMenus.onClicked.addListener(this.handleClick);

      console.log('Context menus initialized successfully');
    } catch (error) {
      console.error('Error initializing context menus:', error);
    }
  },

  async handleClick(info, tab) {
    try {
      switch (info.menuItemId) {
        case 'highlight-text':
          await chrome.tabs.sendMessage(tab.id, {
            action: 'highlightSelection',
            text: info.selectionText
          });
          break;

        case 'search-highlights':
          await chrome.action.openPopup();
          setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'focusSearch' });
          }, 100);
          break;

        case 'export-highlights':
          await chrome.tabs.sendMessage(tab.id, {
            action: 'exportHighlights',
            format: 'html',
            scope: 'current'
          });
          break;

        case 'reader-view':
          await chrome.tabs.sendMessage(tab.id, {
            action: 'activateReaderView'
          });
          break;

        case 'video-annotation':
          await chrome.tabs.sendMessage(tab.id, {
            action: 'activateVideoAnnotation'
          });
          break;
      }
    } catch (error) {
      console.error('Context menu click error:', error);
    }
  }
};

// Google Drive authentication manager
const googleDriveAuth = {
  accessToken: null,
  tokenExpiry: null,
  folderName: 'Universal Web Highlighter',
  folderId: null,
  TOKEN_REFRESH_BUFFER: 5 * 60 * 1000, // Refresh 5 min before expiry

  async getValidToken() {
    // Check if current token is still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Token expired or doesn't exist; try to refresh
    console.log('Background: Token expired or missing, attempting refresh...');
    return await this.authenticate();
  },

  async authenticate() {
    try {
      console.log('Background: Starting Google Drive authentication...');

      // Check if chrome.identity API is available
      if (!chrome || !chrome.identity || typeof chrome.identity.getAuthToken !== 'function') {
        throw new Error('Chrome Identity API not available. Please ensure the extension has identity permission.');
      }

      // Clear any cached token first to force fresh authentication
      try {
        const cachedToken = await chrome.identity.getAuthToken({ interactive: false });
        if (cachedToken) {
          await chrome.identity.removeCachedAuthToken({ token: cachedToken });
          console.log('Background: Cleared cached token');
        }
      } catch (error) {
        console.log('Background: No cached token to clear');
      }

      // Get fresh auth token with interactive flow
      // This uses the manifest.json oauth2 configuration automatically
      const tokenResult = await chrome.identity.getAuthToken({
        interactive: true
      });

      console.log('Background: Raw token result:', tokenResult);
      console.log('Background: Token result type:', typeof tokenResult);

      // Extract the actual token string from Chrome Identity API response
      // Chrome Identity API now returns { token: "actual_token", grantedScopes: [...] }
      if (typeof tokenResult === 'object' && tokenResult.token) {
        this.accessToken = tokenResult.token;
        console.log('Background: Extracted token from object');
      } else if (typeof tokenResult === 'string') {
        this.accessToken = tokenResult;
        console.log('Background: Using token directly');
      } else {
        throw new Error('No access token received');
      }

      // Google OAuth tokens typically expire in 3600 seconds (1 hour)
      this.tokenExpiry = Date.now() + (3600 * 1000) - this.TOKEN_REFRESH_BUFFER;
      console.log('Background: Token will expire at:', new Date(this.tokenExpiry));

      console.log('Background: Google Drive authentication successful, token received');
      console.log('Background: Token type:', typeof this.accessToken);
      console.log('Background: Token value:', this.accessToken);
      console.log('Background: Token preview:', (this.accessToken && typeof this.accessToken === 'string') ? this.accessToken.substring(0, 20) + '...' : 'none');

      // Store token and expiry in chrome storage for persistence
      await chrome.storage.local.set({
        'gdrive_access_token': this.accessToken,
        'gdrive_token_expiry': this.tokenExpiry
      });

      // Ensure folder exists (this will also test the connection)
      await this.ensureFolder();

      const result = { success: true, token: this.accessToken };
      console.log('Background: Returning result:', { success: result.success, tokenType: typeof result.token });

      return result;
    } catch (error) {
      console.error('Background: Google Drive authentication error:', error);
      this.accessToken = null;
      this.tokenExpiry = null;
      return { success: false, error: error.message };
    }
  },

  async ensureFolder() {
    try {
      // Check if folder exists
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${this.folderName}' and mimeType='application/vnd.google-apps.folder'`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const searchData = await searchResponse.json();

      if (searchData.files && searchData.files.length > 0) {
        this.folderId = searchData.files[0].id;
      } else {
        // Create folder
        const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: this.folderName,
            mimeType: 'application/vnd.google-apps.folder'
          })
        });

        const createData = await createResponse.json();
        this.folderId = createData.id;
      }

      // Store folder ID for persistence
      await chrome.storage.local.set({
        'gdrive_folder_id': this.folderId
      });

      console.log('Background: Google Drive folder ready:', this.folderId);
      return { success: true, folderId: this.folderId };
    } catch (error) {
      console.error('Background: Error ensuring Google Drive folder:', error);
      return { success: false, error: error.message };
    }
  },

  async testConnection() {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`API test failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Background: Google Drive connection test successful for user:', data.user?.emailAddress);
      return { success: true, user: data.user };
    } catch (error) {
      console.error('Background: Google Drive connection test failed:', error);
      return { success: false, error: error.message };
    }
  },

  async loadStoredToken() {
    const result = await chrome.storage.local.get(['gdrive_access_token', 'gdrive_token_expiry', 'gdrive_folder_id']);
    this.accessToken = result.gdrive_access_token || null;
    this.tokenExpiry = result.gdrive_token_expiry || null;
    this.folderId = result.gdrive_folder_id || null;

    // Check if stored token is still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      console.log('Background: Loaded valid stored token');
    } else if (this.accessToken) {
      console.log('Background: Stored token expired, will refresh on next use');
      this.accessToken = null;
    } else {
      console.log('Background: No stored token found');
    }
  }
};

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle async operations properly
  (async () => {
    try {
      await handleBackgroundMessage(request, sender, sendResponse);
    } catch (error) {
      console.error('Background message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep message channel open for async response
});

async function handleBackgroundMessage(request, sender, sendResponse) {
  console.log('Background: Received message:', request.action);

  try {
    switch (request.action) {
      case 'authenticateGoogleDrive':
        const authResult = await googleDriveAuth.authenticate();
        sendResponse(authResult);
        break;

      case 'testGoogleDriveConnection':
        const testResult = await googleDriveAuth.testConnection();
        sendResponse(testResult);
        break;

      case 'getGoogleDriveAuthStatus':
        sendResponse({
          success: true,
          authenticated: !!googleDriveAuth.accessToken,
          token: googleDriveAuth.accessToken
        });
        break;

      case 'trackEvent':
        await analytics.track(request.event, request.data);
        sendResponse({ success: true });
        break;

      case 'getWeeklyReport':
        const report = await analytics.getWeeklyReport();
        sendResponse({ success: true, data: report });
        break;

      case 'queueSync':
        // Validate domain before queuing
        if (!request.domain || request.domain.startsWith('chrome://') || request.domain.startsWith('chrome-extension://')) {
          console.log('Skipping sync for invalid domain:', request.domain);
          sendResponse({ success: false, error: 'Invalid domain' });
        } else {
          await syncManager.queueSync(request.domain, request.data);
          sendResponse({ success: true });
        }
        break;

      case 'clearSyncQueue':
        const clearedCount = syncManager.clearSyncQueue();
        sendResponse({ success: true, clearedCount });
        break;

      case 'getSyncQueueStatus':
        const queueStatus = syncManager.getSyncQueueStatus();
        sendResponse({ success: true, data: queueStatus });
        break;

      case 'openPopupWithSearch':
        // Open popup and focus search
        await chrome.action.openPopup();
        // Send message to popup to focus search
        setTimeout(() => {
          chrome.runtime.sendMessage({ action: 'focusSearch' });
        }, 100);
        sendResponse({ success: true });
        break;

      case 'downloadFile':
        await downloadFile(request.filename, request.content, request.type);
        sendResponse({ success: true });
        break;

      case 'getAllHighlights':
        const allHighlights = await getAllHighlightsFromDrive();
        sendResponse(allHighlights);
        break;

      case 'fetchCaptions':
        try {
          console.log('Background: Fetching captions from:', request.url);
          const response = await fetch(request.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9'
            }
          });
          console.log('Background: Response status:', response.status);
          console.log('Background: Response content-type:', response.headers.get('content-type'));

          const text = await response.text();
          console.log(`Background: Fetched ${text.length} bytes`);

          if (text.length > 0) {
            console.log('Background: Caption preview:', text.substring(0, 200));
          } else {
            console.warn('Background: Response body is empty!');
            console.log('Background: Full response headers:', Object.fromEntries(response.headers.entries()));
          }

          sendResponse({ success: true, data: text });
        } catch (fetchError) {
          console.error('Background: Caption fetch error:', fetchError);
          sendResponse({ success: false, error: fetchError.message });
        }
        break;

      case 'openYouTubeReader':
        chrome.tabs.create({ url: request.url });
        sendResponse({ success: true });
        break;

      case 'openPDFReader':
        chrome.tabs.create({ url: request.url });
        sendResponse({ success: true });
        break;

      case 'agent:run':
        await handleAgentMessage(request, sendResponse);
        break;

      case 'agent:list':
        if (_agentOrchestrator) {
          sendResponse({ success: true, result: _agentOrchestrator.list() });
        } else {
          sendResponse({ success: false, error: 'Plugin system not initialized' });
        }
        break;

      case 'plugin:list':
      case 'plugin:setActive':
      case 'plugin:summary':
      case 'plugin:getConfig':
      case 'plugin:saveConfig':
      case 'plugin:getMetadata':
        await handlePluginMessage(request, sendResponse);
        break;

      case 'mcp:addServer':
      case 'mcp:removeServer':
      case 'mcp:listServers':
      case 'mcp:testServer':
        await handleMCPMessage(request, sendResponse);
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Background message error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// File download utility
async function downloadFile(filename, content, type = 'text/plain') {
  try {
    if (!chrome || !chrome.downloads) {
      throw new Error('Downloads API not available');
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });

    // Clean up
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}

// Installation and update handlers
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Universal Web Highlighter installed/updated');

  await contextMenus.init();
  await syncManager.init();
  await googleDriveAuth.loadStoredToken();

  if (details.reason === 'install') {
    // First install
    await analytics.track('session_start');
    console.log('✨ Universal Web Highlighter installed successfully!');
  } else if (details.reason === 'update') {
    // Extension updated
    await analytics.track('feature_used', { feature: 'extension_updated' });
  }
});

// Startup handler
chrome.runtime.onStartup.addListener(async () => {
  await analytics.track('session_start');
  await syncManager.init();
  await googleDriveAuth.loadStoredToken();
});

// Tab update handler for analytics
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        await analytics.track('page_visit', { domain: url.hostname });
      }
    } catch (error) {
      // Invalid URL, ignore
    }
  }
});

// Error handling and logging
self.addEventListener('error', (event) => {
  console.error('Background script error:', event.error);
  analytics.track('error', {
    message: event.error.message,
    stack: event.error.stack
  });
});

// PDF Interception - Auto-redirect PDFs to our custom viewer
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only intercept main frame navigations (not iframes)
  if (details.frameId !== 0) return;

  const url = details.url;

  // Check if URL is a PDF
  const isPDF = url.toLowerCase().endsWith('.pdf') ||
                url.includes('.pdf?') ||
                url.includes('.pdf#');

  if (isPDF && !url.startsWith('chrome-extension://')) {
    console.log('📄 PDF detected, redirecting to custom viewer:', url);

    // Store PDF URL
    await chrome.storage.local.set({
      pdfReaderData: {
        url: url,
        timestamp: Date.now()
      }
    });

    // Redirect to our PDF reader
    const readerUrl = chrome.runtime.getURL('pdf-reader.html');
    chrome.tabs.update(details.tabId, { url: readerUrl });
  }
});

// Also handle completed navigations (backup method)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  try {
    // Check if the page is a PDF by inspecting the content type
    const tab = await chrome.tabs.get(details.tabId);

    if (tab.url && tab.url.startsWith('http')) {
      // Check if it's a PDF that Chrome's viewer opened
      if (tab.url.includes('pdf') || tab.title.includes('.pdf')) {
        // Try to inject detection script
        try {
          await chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            func: () => {
              const isPDFViewer = document.contentType === 'application/pdf' ||
                                  document.querySelector('embed[type="application/pdf"]') !== null;
              return isPDFViewer;
            }
          });
        } catch (e) {
          // Script injection failed, might already be PDF viewer
          console.log('Could not inject PDF detection script');
        }
      }
    }
  } catch (error) {
    // Tab might have been closed or navigation cancelled
    console.log('PDF detection check failed:', error.message);
  }
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  analytics.track('error', {
    message: 'Unhandled promise rejection',
    reason: event.reason
  });
});

// Get all highlights from Google Drive
async function getAllHighlightsFromDrive() {
  try {
    if (!googleDriveAuth.accessToken || !googleDriveAuth.folderId) {
      return { success: false, error: 'Google Drive not connected' };
    }

    // List all files in the highlighter folder
    const listResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=parents in '${googleDriveAuth.folderId}' and mimeType='application/json'&fields=files(id,name,modifiedTime)`,
      {
        headers: {
          'Authorization': `Bearer ${googleDriveAuth.accessToken}`
        }
      }
    );

    if (!listResponse.ok) {
      // If 401, try to refresh token
      if (listResponse.status === 401) {
        console.log('Token expired, attempting to refresh...');
        const refreshResult = await googleDriveAuth.authenticate();
        if (refreshResult.success) {
          // Retry with new token
          return await getAllHighlightsFromDrive();
        }
      }
      throw new Error(`Failed to list files: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const files = listData.files || [];

    // Download content from each file
    const allHighlights = [];

    for (const file of files) {
      try {
        const fileResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            headers: {
              'Authorization': `Bearer ${googleDriveAuth.accessToken}`
            }
          }
        );

        if (fileResponse.ok) {
          const content = await fileResponse.text();
          const data = JSON.parse(content);

          console.log(`📁 File ${file.name}:`);
          console.log(`   - Type:`, typeof data);
          console.log(`   - Is Array:`, Array.isArray(data));
          console.log(`   - Keys:`, data && typeof data === 'object' ? Object.keys(data) : 'N/A');
          console.log(`   - Sample content:`, JSON.stringify(data).substring(0, 200) + '...');

          // Handle different data structures
          let highlights = [];

          if (Array.isArray(data)) {
            // Direct array of highlights
            highlights = data;
            console.log(`   ✅ Using direct array (${highlights.length} items)`);
          } else if (data && data.highlights && Array.isArray(data.highlights)) {
            // Object with highlights array property
            highlights = data.highlights;
            console.log(`   ✅ Using highlights property (${highlights.length} items)`);
          } else if (data && typeof data === 'object') {
            // Object format - check for highlight-like properties
            const keys = Object.keys(data);
            console.log(`   🔍 Checking object keys:`, keys);

            // Look for properties that might contain highlights
            for (const key of keys) {
              if (Array.isArray(data[key])) {
                highlights = data[key];
                console.log(`   ✅ Found array in key '${key}' (${highlights.length} items)`);
                break;
              }
            }

            // If still no array found, try to convert object values to array
            if (highlights.length === 0) {
              console.log(`   🔍 No arrays found, checking individual objects...`);
              const values = Object.values(data);
              for (const value of values) {
                if (value && typeof value === 'object' && value.text && value.id) {
                  highlights.push(value);
                  console.log(`   ✅ Found highlight object:`, value.id);
                }
              }
              console.log(`   📝 Collected ${highlights.length} individual highlights`);
            }
          }

          console.log(`📊 Final result: ${highlights.length} highlights from ${file.name}`);

          // Add file metadata to each highlight
          if (Array.isArray(highlights)) {
            highlights.forEach(highlight => {
              if (highlight && typeof highlight === 'object') {
                highlight.fileId = file.id;
                highlight.fileName = file.name;
                highlight.lastModified = file.modifiedTime;
              }
            });

            allHighlights.push(...highlights);
          } else {
            console.warn(`   ❌ Could not extract valid highlights array from ${file.name}`);
          }
        }
      } catch (error) {
        console.warn(`Failed to load file ${file.name}:`, error);
        continue;
      }
    }

    console.log(`Loaded ${allHighlights.length} highlights from ${files.length} files`);
    return { success: true, data: allHighlights };

  } catch (error) {
    console.error('Error getting all highlights from Drive:', error);
    return { success: false, error: error.message };
  }
}

// ─── MCP Message Handler ──────────────────────────────────────────────────────

async function handleMCPMessage(request, sendResponse) {
  const { action } = request;
  const STORAGE_KEY = 'mcp_servers';

  if (action === 'mcp:listServers') {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    sendResponse({ success: true, result: stored[STORAGE_KEY] || [] });

  } else if (action === 'mcp:addServer') {
    const { server } = request; // { id, name, url }
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const servers = stored[STORAGE_KEY] || [];

    if (servers.find(s => s.id === server.id)) {
      sendResponse({ success: false, error: 'A server with this ID already exists' });
      return;
    }

    servers.push({ ...server, addedAt: new Date().toISOString(), status: 'unknown' });
    await chrome.storage.local.set({ [STORAGE_KEY]: servers });

    // Register as tool plugin if MCPToolPlugin is available
    if (typeof MCPToolPlugin !== 'undefined' && _pluginRegistry) {
      try {
        const plugin = new MCPToolPlugin(server.id, server.url);
        await plugin.onEnable({ serverUrl: server.url });
        _pluginRegistry.register('tool', server.id, plugin);
      } catch (err) {
        console.warn('[MCP] Could not register server as plugin:', err.message);
      }
    }

    sendResponse({ success: true, result: servers });

  } else if (action === 'mcp:removeServer') {
    const { id } = request;
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const servers = (stored[STORAGE_KEY] || []).filter(s => s.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEY]: servers });

    if (_pluginRegistry?.has('tool', id)) {
      _pluginRegistry.unregister('tool', id);
    }

    sendResponse({ success: true, result: servers });

  } else if (action === 'mcp:testServer') {
    const { url } = request;
    if (typeof MCPClient === 'undefined') {
      sendResponse({ success: false, error: 'MCP client not loaded' });
      return;
    }
    try {
      const client = new MCPClient(url, { timeout: 8000 });
      await client.initialize();
      const tools = await client.listTools();
      sendResponse({ success: true, result: { connected: true, toolCount: tools.length, tools: tools.map(t => t.name) } });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
}


// ─── Plugin System Bootstrap ──────────────────────────────────────────────────
//
// The plugin system runs in the service worker so all contexts (popup, agents,
// content scripts via messaging) share one authoritative registry.
//
// We import the files dynamically instead of importScripts() so errors are
// scoped and the rest of the background still starts if a plugin fails.

let _pluginRegistry = null;
let _agentOrchestrator = null;

async function initPluginSystem() {
  try {
    // Scripts are already loaded at the top level — just initialise them here.
    if (typeof PluginRegistry === 'undefined') {
      throw new Error('Plugin scripts not loaded — importScripts failed at SW start');
    }

    const registry = PluginRegistry.getInstance();
    await registry.loadActiveSelections();

    const loader = new PluginLoader(registry);
    await loader.init();

    const orchestrator = new AgentOrchestrator(registry);
    orchestrator.register('research', ResearchAgent);
    orchestrator.register('writing', WritingAgent);
    orchestrator.register('learning', LearningAgent);

    _pluginRegistry = registry;
    _agentOrchestrator = orchestrator;

    console.log('[Plugins] System ready:', registry.getSummary());
  } catch (err) {
    console.warn('[Plugins] Could not initialize plugin system:', err.message);
  }
}

// Handle agent run requests from popup / highlights-manager
async function handleAgentMessage(request, sendResponse) {
  if (!_agentOrchestrator) {
    sendResponse({ success: false, error: 'Plugin system not initialized' });
    return;
  }

  const { agentName, context, options } = request;
  try {
    const result = await _agentOrchestrator.run(agentName, context, options);
    sendResponse({ success: true, result });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handlePluginMessage(request, sendResponse) {
  if (!_pluginRegistry) {
    sendResponse({ success: false, error: 'Plugin system not initialized' });
    return;
  }

  const { action } = request;

  if (action === 'plugin:list') {
    sendResponse({ success: true, result: _pluginRegistry.listAll() });
  } else if (action === 'plugin:setActive') {
    try {
      await _pluginRegistry.setActive(request.category, request.id);
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  } else if (action === 'plugin:summary') {
    sendResponse({ success: true, result: _pluginRegistry.getSummary() });

  } else if (action === 'plugin:getConfig') {
    try {
      const key = `plugin_config_${request.category}_${request.id}`;
      const result = await chrome.storage.local.get(key);
      sendResponse({ success: true, result: result[key] || {} });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }

  } else if (action === 'plugin:saveConfig') {
    try {
      const key = `plugin_config_${request.category}_${request.id}`;
      await chrome.storage.local.set({ [key]: request.config });

      // Re-enable the plugin with new config if it's the active one
      if (_pluginRegistry?.has(request.category, request.id)) {
        const plugin = _pluginRegistry.get(request.category, request.id);
        await plugin.onEnable(request.config);
      }

      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }

  } else if (action === 'plugin:getMetadata') {
    try {
      // Return full plugin list with configFields included
      const all = _pluginRegistry.listAll();
      const withMeta = {};
      for (const [cat, plugins] of Object.entries(all)) {
        withMeta[cat] = plugins.map(({ id, plugin, metadata, isActive }) => ({
          id,
          isActive,
          metadata: {
            ...metadata,
            configFields: plugin.constructor.metadata?.configFields || []
          }
        }));
      }
      sendResponse({ success: true, result: withMeta });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }

  } else {
    sendResponse({ success: false, error: `Unknown plugin action: ${action}` });
  }
}


// ── Keyboard command handler ──────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'highlight-selection') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: 'triggerHighlight' }).catch(() => {});
  } else if (command === 'open-manager') {
    chrome.tabs.create({ url: chrome.runtime.getURL('highlights-manager.html') });
  }
});

// Initialize background script
(async function init() {
  try {
    await contextMenus.init();
    await syncManager.init();
    await googleDriveAuth.loadStoredToken();

    // Load existing analytics
    const stored = await chrome.storage.local.get(['dailyStats']);
    if (stored.dailyStats) {
      analytics.dailyStats = stored.dailyStats;
    }

    // Initialize plugin system (non-blocking — failure is logged, not fatal)
    initPluginSystem().catch(err => console.warn('[Plugins] Init error:', err.message));

    console.log('Universal Web Highlighter background script initialized');
  } catch (error) {
    console.error('Background script initialization error:', error);
  }
})();