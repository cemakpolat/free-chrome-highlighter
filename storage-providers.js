// storage-providers.js - SOLID: Open/Closed Principle
// Can extend with new storage providers without modifying existing code

/**
 * Check if extension context is still valid
 */
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

/**
 * Local Chrome Storage Provider
 */
class LocalStorageProvider extends IStorageProvider {
  constructor() {
    super();
    this.prefix = 'universal_highlighter_';
  }

  async save(key, data) {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot save to storage');
        return false;
      }
      const storageKey = this.prefix + key;
      await chrome.storage.local.set({ [storageKey]: data });
      return true;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during save operation');
        return false;
      }
      console.error('Local storage save error:', error);
      return false;
    }
  }

  async load(key) {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot load from storage');
        return null;
      }
      const storageKey = this.prefix + key;
      const result = await chrome.storage.local.get([storageKey]);
      return result[storageKey] || null;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during load operation');
        return null;
      }
      console.error('Local storage load error:', error);
      return null;
    }
  }

  async delete(key) {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot delete from storage');
        return false;
      }
      const storageKey = this.prefix + key;
      await chrome.storage.local.remove([storageKey]);
      return true;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during delete operation');
        return false;
      }
      console.error('Local storage delete error:', error);
      return false;
    }
  }

  async list() {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot list from storage');
        return [];
      }
      const allData = await chrome.storage.local.get();
      const keys = Object.keys(allData)
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.replace(this.prefix, ''));
      return keys;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during storage list');
        return [];
      }
      console.error('Local storage list error:', error);
      return [];
    }
  }

  async clear() {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot clear storage');
        return false;
      }
      const allData = await chrome.storage.local.get();
      const keysToRemove = Object.keys(allData)
        .filter(key => key.startsWith(this.prefix));
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      return true;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during storage clear');
        return false;
      }
      console.error('Local storage clear error:', error);
      return false;
    }
  }

  async getSyncStatus() {
    return {
      authenticated: true, // Local storage is always "authenticated"
      storageType: 'local',
      message: 'Local storage only - no sync',
      lastSync: 0,
      queueLength: 0,
      inProgress: false
    };
  }
}

/**
 * Google Drive Storage Provider
 */
class GoogleDriveStorageProvider extends IStorageProvider {
  constructor() {
    super();
    this.folderName = 'Universal Web Highlighter';
    this.folderId = null;
    this.accessToken = null;
  }

  async authenticate() {
    try {
      console.log('Storage: Authentication delegated to background script');

      // Content scripts cannot access chrome.identity directly
      // Authentication must be handled by background script
      console.warn('Storage: Direct authentication not available in content script context');
      return false;
    } catch (error) {
      console.error('Storage: Authentication error:', error);
      this.accessToken = null;
      return false;
    }
  }

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
      console.log('Google Drive connection test successful for user:', data.user?.emailAddress);
    } catch (error) {
      console.error('Google Drive connection test failed:', error);
      throw error;
    }
  }

  async ensureFolder() {
    try {
      if (!this.accessToken) {
        console.warn('Storage: Cannot ensure folder without access token');
        return false;
      }

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

      return true;
    } catch (error) {
      console.error('Error ensuring Google Drive folder:', error);
      return false;
    }
  }

  async save(key, data) {
    try {
      if (!this.accessToken) {
        console.warn('Google Drive save skipped: No access token available. Please authenticate first.');
        return false;
      }
      
      const fileName = `${key}.json`;
      const fileContent = JSON.stringify(data, null, 2);
      
      // Check if file exists
      const existingFile = await this.findFile(fileName);
      
      if (existingFile) {
        // Update existing file
        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: fileContent
        });
        
        return response.ok;
      } else {
        // Create new file
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'multipart/related; boundary="foo_bar_baz"'
          },
          body: this.createMultipartBody(fileName, fileContent)
        });
        
        return response.ok;
      }
    } catch (error) {
      console.error('Google Drive save error:', error);
      return false;
    }
  }

  async load(key) {
    try {
      if (!this.accessToken) {
        console.warn('Google Drive load skipped: No access token available. Please authenticate first.');
        return null;
      }
      
      const fileName = `${key}.json`;
      const file = await this.findFile(fileName);
      
      if (!file) return null;
      
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      if (response.ok) {
        const content = await response.text();
        return JSON.parse(content);
      }
      
      return null;
    } catch (error) {
      console.error('Google Drive load error:', error);
      return null;
    }
  }

  async delete(key) {
    try {
      if (!this.accessToken) {
        console.warn('Google Drive delete skipped: No access token available. Please authenticate first.');
        return false;
      }
      
      const fileName = `${key}.json`;
      const file = await this.findFile(fileName);
      
      if (!file) return true; // Already deleted
      
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Google Drive delete error:', error);
      return false;
    }
  }

  async list() {
    try {
      if (!this.accessToken) {
        console.warn('Google Drive list skipped: No access token available. Please authenticate first.');
        return [];
      }
      
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=parents in '${this.folderId}' and name contains '.json'`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );
      
      const data = await response.json();
      return data.files ? data.files.map(file => file.name.replace('.json', '')) : [];
    } catch (error) {
      console.error('Google Drive list error:', error);
      return [];
    }
  }

  async findFile(fileName) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in '${this.folderId}'`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );
      
      const data = await response.json();
      return data.files && data.files.length > 0 ? data.files[0] : null;
    } catch (error) {
      console.error('Error finding file:', error);
      return null;
    }
  }

  createMultipartBody(fileName, content) {
    const metadata = {
      name: fileName,
      parents: [this.folderId]
    };

    return [
      '--foo_bar_baz',
      'Content-Type: application/json',
      '',
      JSON.stringify(metadata),
      '--foo_bar_baz',
      'Content-Type: application/json',
      '',
      content,
      '--foo_bar_baz--'
    ].join('\r\n');
  }
}

/**
 * Chrome Sync Storage Provider (uses Chrome's built-in sync)
 */
class ChromeSyncStorageProvider extends IStorageProvider {
  constructor() {
    super();
    this.prefix = 'universal_highlighter_';
  }

  async save(key, data) {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot save to Chrome sync');
        return false;
      }
      const storageKey = this.prefix + key;
      await chrome.storage.sync.set({ [storageKey]: data });
      console.log(`Synced to Chrome sync: ${key}`);
      return true;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during Chrome sync save');
        return false;
      }
      console.error('Chrome sync save error:', error);
      // Fallback to local storage if sync fails
      try {
        if (isExtensionContextValid()) {
          const storageKey = this.prefix + key;
          await chrome.storage.local.set({ [storageKey]: data });
          return true;
        }
      } catch (fallbackError) {
        console.error('Chrome sync fallback save error:', fallbackError);
      }
      return false;
    }
  }

  async load(key) {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot load from Chrome sync');
        return null;
      }
      const storageKey = this.prefix + key;
      const result = await chrome.storage.sync.get([storageKey]);
      return result[storageKey] || null;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during Chrome sync load');
        return null;
      }
      console.error('Chrome sync load error:', error);
      // Fallback to local storage if sync fails
      try {
        if (isExtensionContextValid()) {
          const storageKey = this.prefix + key;
          const result = await chrome.storage.local.get([storageKey]);
          return result[storageKey] || null;
        }
      } catch (fallbackError) {
        console.error('Chrome sync fallback load error:', fallbackError);
      }
      return null;
    }
  }

  async delete(key) {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot delete from Chrome sync');
        return false;
      }
      const storageKey = this.prefix + key;
      await chrome.storage.sync.remove([storageKey]);
      return true;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during Chrome sync delete');
        return false;
      }
      console.error('Chrome sync delete error:', error);
      return false;
    }
  }

  async list() {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot list from Chrome sync');
        return [];
      }
      const allData = await chrome.storage.sync.get();
      const keys = Object.keys(allData)
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.replace(this.prefix, ''));
      return keys;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during Chrome sync list');
        return [];
      }
      console.error('Chrome sync list error:', error);
      // Fallback to local storage
      try {
        if (isExtensionContextValid()) {
          const allData = await chrome.storage.local.get();
          const keys = Object.keys(allData)
            .filter(key => key.startsWith(this.prefix))
            .map(key => key.replace(this.prefix, ''));
          return keys;
        }
      } catch (fallbackError) {
        console.error('Chrome sync fallback list error:', fallbackError);
      }
      return [];
    }
  }

  async clear() {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot clear Chrome sync');
        return false;
      }
      const allData = await chrome.storage.sync.get();
      const keysToRemove = Object.keys(allData)
        .filter(key => key.startsWith(this.prefix));
      if (keysToRemove.length > 0) {
        await chrome.storage.sync.remove(keysToRemove);
      }
      return true;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during Chrome sync clear');
        return false;
      }
      console.error('Chrome sync clear error:', error);
      return false;
    }
  }

  async getSyncStatus() {
    try {
      // Chrome sync is always "authenticated" if the API is available
      const hasSync = chrome && chrome.storage && chrome.storage.sync;
      return {
        authenticated: hasSync,
        storageType: 'chrome-sync',
        message: hasSync ? 'Chrome Sync enabled' : 'Chrome Sync unavailable',
        lastSync: Date.now(), // Chrome sync happens automatically
        queueLength: 0, // No queue for Chrome sync
        inProgress: false
      };
    } catch (error) {
      return {
        authenticated: false,
        storageType: 'chrome-sync',
        message: 'Chrome Sync error: ' + error.message,
        lastSync: 0,
        queueLength: 0,
        inProgress: false
      };
    }
  }
}

/**
 * Hybrid Storage: Local + Cloud sync
 */
class HybridStorageProvider extends IStorageProvider {
  constructor() {
    super();
    this.localProvider = new LocalStorageProvider();
    this.cloudProvider = new GoogleDriveStorageProvider();
    this.syncInProgress = false;
    this.syncQueue = [];
  }

  async save(key, data) {
    // Always save locally first (fast)
    const localResult = await this.localProvider.save(key, data);
    
    // Queue cloud sync (background)
    if (!this.syncInProgress) {
      this.queueCloudSync(key, data);
    }
    
    return localResult;
  }

  async load(key) {
    // Load from local first (fast)
    const localData = await this.localProvider.load(key);
    
    // Background sync check
    this.checkCloudSync(key);
    
    return localData;
  }

  async delete(key) {
    const localResult = await this.localProvider.delete(key);
    const cloudResult = await this.cloudProvider.delete(key);
    return localResult && cloudResult;
  }

  async list() {
    // Combine local and cloud listings
    const localKeys = await this.localProvider.list();
    try {
      const cloudKeys = await this.cloudProvider.list();
      return [...new Set([...localKeys, ...cloudKeys])];
    } catch (error) {
      console.warn('Cloud list failed, using local only:', error);
      return localKeys;
    }
  }

  async queueCloudSync(key, data) {
    this.syncQueue.push({ key, data, timestamp: Date.now() });
    
    // Debounce sync operations
    setTimeout(async () => {
      if (this.syncInProgress) return;
      
      this.syncInProgress = true;
      try {
        // Process all queued items
        const itemsToSync = [...this.syncQueue];
        this.syncQueue = [];
        
        for (const item of itemsToSync) {
          try {
            await this.cloudProvider.save(item.key, item.data);
          } catch (error) {
            console.error(`Cloud sync failed for ${item.key}:`, error);
            // Re-queue failed items
            this.syncQueue.push(item);
          }
        }
      } catch (error) {
        console.error('Cloud sync batch failed:', error);
      }
      this.syncInProgress = false;
    }, 1000); // 1 second delay for batching
  }

  async checkCloudSync(key) {
    // Don't check too frequently
    const lastCheck = this.lastSyncCheck || 0;
    const now = Date.now();
    if (now - lastCheck < 30000) return; // 30 seconds minimum between checks
    
    this.lastSyncCheck = now;
    
    setTimeout(async () => {
      try {
        const cloudData = await this.cloudProvider.load(key);
        const localData = await this.localProvider.load(key);
        
        if (cloudData && this.isCloudDataNewer(cloudData, localData)) {
          await this.localProvider.save(key, cloudData);
          // Emit event for UI updates
          if (typeof window !== 'undefined' && window.highlighterEvents) {
            window.highlighterEvents.emit('highlights_updated', { key, data: cloudData });
          }
        }
      } catch (error) {
        console.warn('Cloud sync check failed:', error);
      }
    }, 2000); // 2 second delay
  }

  isCloudDataNewer(cloudData, localData) {
    if (!localData) return true;
    if (!cloudData) return false;
    
    try {
      const cloudTime = new Date(cloudData.lastModified || cloudData.timestamp || 0);
      const localTime = new Date(localData.lastModified || localData.timestamp || 0);
      
      return cloudTime > localTime;
    } catch (error) {
      console.warn('Error comparing sync timestamps:', error);
      return false;
    }
  }

  async forceSync() {
    try {
      // Authentication is now handled by background script
      if (!this.cloudProvider.accessToken) {
        console.warn('Google Drive force sync skipped: No access token available. Please authenticate first.');
        return false;
      }

      const localKeys = await this.localProvider.list();

      for (const key of localKeys) {
        const localData = await this.localProvider.load(key);
        if (localData) {
          await this.cloudProvider.save(key, localData);
        }
      }

      return true;
    } catch (error) {
      console.error('Force sync failed:', error);
      return false;
    }
  }

  async forceSyncAll() {
    try {
      console.log('Starting full sync...');

      // Authentication is now handled by background script
      if (!this.cloudProvider.accessToken) {
        console.warn('Google Drive full sync skipped: No access token available. Please authenticate first.');
        return false;
      }

      // Check if already authenticated (authentication is handled by background script)
      if (!this.cloudProvider.accessToken) {
        throw new Error('Not authenticated with Google Drive. Please authenticate first.');
      }

      // Get all local keys
      const localKeys = await this.localProvider.list();
      console.log(`Syncing ${localKeys.length} domains to Google Drive...`);

      for (const key of localKeys) {
        const localData = await this.localProvider.load(key);
        if (localData) {
          await this.cloudProvider.save(key, localData);
          console.log(`Synced ${key} to Google Drive`);
        }
      }

      console.log('Full sync completed successfully');
      return true;
    } catch (error) {
      console.error('Full sync failed:', error);
      return false;
    }
  }

  async getSyncStatus() {
    try {
      // Check if we have a valid token (indicating authentication)
      const isAuthenticated = this.cloudProvider.accessToken !== null;
      const lastSync = await this.getLastSyncTime();
      const queueLength = this.syncQueue.length;

      return {
        authenticated: isAuthenticated,
        lastSync: lastSync,
        queueLength: queueLength,
        inProgress: this.syncInProgress
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        authenticated: false,
        lastSync: 0,
        queueLength: 0,
        inProgress: false,
        error: error.message
      };
    }
  }

  async getLastSyncTime() {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot get last sync time');
        return 0;
      }
      const result = await chrome.storage.local.get(['last_sync_time']);
      return result.last_sync_time || 0;
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during get last sync time');
        return 0;
      }
      console.error('Error getting last sync time:', error);
      return 0;
    }
  }

  async setLastSyncTime() {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot set last sync time');
        return;
      }
      await chrome.storage.local.set({ last_sync_time: Date.now() });
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during set last sync time');
        return;
      }
      console.error('Error setting last sync time:', error);
    }
  }
}

/**
 * Direct Google Drive Storage Provider
 * Uses Google Drive REST API directly with simple OAuth flow
 * No Chrome extension API complexity - just direct HTTP requests
 */
class DirectGoogleDriveProvider extends IStorageProvider {
  constructor() {
    super();
    this.prefix = 'universal_highlighter_';
    this.localProvider = new LocalStorageProvider();
    this.accessToken = null;
    this.refreshToken = null;
    this.clientId = '886377501929-dm8o4t40sh086dp3rm3ibcahtushjqrs.apps.googleusercontent.com';
    this.folderName = 'Universal Web Highlighter';
    this.folderId = null;
    this.tokensLoaded = false;

    // Batching configuration
    this.syncQueue = new Map(); // key -> { data, timestamp }
    this.deleteQueue = new Set(); // set of keys to delete
    this.batchTimeout = null;
    this.batchInterval = 5000; // 5 seconds
    this.maxBatchSize = 10; // Max items per batch

    // Load tokens from chrome storage on initialization
    this.loadStoredTokens();
  }

  async loadStoredTokens() {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot load stored tokens');
        this.tokensLoaded = true;
        return;
      }

      const result = await chrome.storage.local.get(['gdrive_access_token', 'gdrive_folder_id', 'gdrive_refresh_token']);

      console.log('🔍 Loading stored token - raw result:', result.gdrive_access_token);
      console.log('🔍 Loading stored token - type:', typeof result.gdrive_access_token);

      // Handle both old and new token formats when loading from storage
      let loadedToken = result.gdrive_access_token || null;
      if (loadedToken && typeof loadedToken === 'object' && loadedToken.token) {
        // Token was stored as object, extract the string
        this.accessToken = loadedToken.token;
        console.log('🔧 Extracted token from stored object');
      } else if (loadedToken && typeof loadedToken === 'string') {
        // Token was stored as string
        this.accessToken = loadedToken;
        console.log('🔧 Using stored token directly');
      } else {
        this.accessToken = null;
        console.log('🔧 No valid token found in storage');
      }

      this.folderId = result.gdrive_folder_id || null;
      this.refreshToken = result.gdrive_refresh_token || null;
      this.tokensLoaded = true;

      console.log('DirectGoogleDriveProvider: Loaded stored tokens:', !!this.accessToken);
      console.log('DirectGoogleDriveProvider: Final token type:', typeof this.accessToken);
      if (this.accessToken) {
        console.log('DirectGoogleDriveProvider: Token available for API calls');
      }
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during token loading');
      } else {
        console.error('DirectGoogleDriveProvider: Error loading stored tokens:', error);
      }
      this.tokensLoaded = true;
    }
  }

  async ensureTokensLoaded() {
    if (!this.tokensLoaded) {
      console.log('DirectGoogleDriveProvider: Waiting for tokens to load...');
      await this.loadStoredTokens();
    }
  }

  async validateToken() {
    if (!this.accessToken) {
      return false;
    }

    try {
      // Simple API call to test token validity
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (response.ok) {
        console.log('✅ Token validation successful');
        return true;
      } else {
        console.log('❌ Token validation failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  async save(key, data) {
    try {
      // Always save locally first
      await this.localProvider.save(key, data);
      console.log('✅ Saved locally:', key);

      // Ensure tokens are loaded before checking authentication
      await this.ensureTokensLoaded();

      // Add to sync queue if authenticated (batch sync)
      if (this.accessToken) {
        console.log('📦 Adding to batch sync queue:', key);
        this.addToBatchQueue(key, data);
      } else {
        console.log('📡 Google Drive not authenticated, skipping sync');
      }

      return true;
    } catch (error) {
      console.error('Save error:', error);
      return true; // Local save still succeeded
    }
  }

  async load(key) {
    // Always load from local storage first
    return await this.localProvider.load(key);
  }

  /**
   * Add item to batch sync queue
   */
  addToBatchQueue(key, data) {
    // Remove from delete queue if it was marked for deletion
    this.deleteQueue.delete(key);

    // Add to sync queue
    this.syncQueue.set(key, {
      data: data,
      timestamp: Date.now()
    });

    console.log(`📦 Queue size: ${this.syncQueue.size} items`);

    // Schedule batch sync
    this.scheduleBatchSync();

    // Force sync if queue is getting large
    if (this.syncQueue.size >= this.maxBatchSize) {
      console.log('📦 Queue full, forcing immediate batch sync');
      this.processBatchSync();
    }
  }

  /**
   * Add item to delete queue
   */
  addToDeleteQueue(key) {
    // Remove from sync queue if it was queued for sync
    this.syncQueue.delete(key);

    // Add to delete queue
    this.deleteQueue.add(key);

    console.log(`🗑️ Delete queue size: ${this.deleteQueue.size} items`);

    // Schedule batch sync
    this.scheduleBatchSync();
  }

  /**
   * Schedule batch sync (debounced)
   */
  scheduleBatchSync() {
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Schedule new batch sync
    this.batchTimeout = setTimeout(() => {
      this.processBatchSync();
    }, this.batchInterval);
  }

  /**
   * Process batch sync to Google Drive
   */
  async processBatchSync() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.syncQueue.size === 0 && this.deleteQueue.size === 0) {
      return;
    }

    console.log(`📦 Processing batch sync: ${this.syncQueue.size} saves, ${this.deleteQueue.size} deletes`);

    try {
      // Ensure tokens are loaded
      await this.ensureTokensLoaded();

      if (!this.accessToken) {
        console.log('📦 No access token, skipping batch sync');
        return;
      }

      // Proactively validate token before batch operation
      const tokenValid = await this.validateToken();
      if (!tokenValid) {
        console.log('🔄 Token validation failed, attempting re-authentication before batch sync...');
        const refreshed = await this.refreshAccessToken();
        if (!refreshed) {
          console.log('❌ Token refresh failed, skipping batch sync');
          return;
        }
      }

      // Process deletions first
      for (const key of this.deleteQueue) {
        try {
          await this.syncDeleteToGoogleDrive(key);
          console.log('✅ Batch deleted from Google Drive:', key);
        } catch (error) {
          console.error('❌ Batch delete failed:', key, error);

          // If token expired, try to re-authenticate and retry once
          if (this.isTokenExpiredError(error)) {
            console.log('🔄 Token expired during batch delete, attempting re-authentication...');
            try {
              const refreshed = await this.refreshAccessToken();
              if (refreshed) {
                console.log('🔄 Retrying batch delete after re-authentication:', key);
                await this.syncDeleteToGoogleDrive(key);
                console.log('✅ Batch delete retry successful:', key);
              }
            } catch (retryError) {
              console.error('❌ Batch delete retry failed:', key, retryError);
            }
          }
        }
      }

      // Process saves
      for (const [key, queueItem] of this.syncQueue) {
        try {
          await this.syncToGoogleDrive(key, queueItem.data);
          console.log('✅ Batch synced to Google Drive:', key);
        } catch (error) {
          console.error('❌ Batch sync failed:', key, error);

          // If token expired, try to re-authenticate and retry once
          if (this.isTokenExpiredError(error)) {
            console.log('🔄 Token expired during batch sync, attempting re-authentication...');
            try {
              const refreshed = await this.refreshAccessToken();
              if (refreshed) {
                console.log('🔄 Retrying batch sync item after re-authentication:', key);
                await this.syncToGoogleDrive(key, queueItem.data);
                console.log('✅ Batch sync retry successful:', key);
              }
            } catch (retryError) {
              console.error('❌ Batch sync retry failed:', key, retryError);
            }
          }
        }
      }

      // Clear queues
      this.syncQueue.clear();
      this.deleteQueue.clear();

      console.log('📦 Batch sync completed');

    } catch (error) {
      console.error('📦 Batch sync error:', error);
    }
  }

  async syncToGoogleDrive(key, data) {
    try {
      // Ensure tokens are loaded
      await this.ensureTokensLoaded();

      if (!this.accessToken) {
        throw new Error('No access token available');
      }

      console.log('📡 Google Drive sync - Token available:', !!this.accessToken);
      console.log('🔑 Google Drive sync - Token type:', typeof this.accessToken);
      console.log('🔑 Google Drive sync - Token preview:', (this.accessToken && typeof this.accessToken === 'string') ? this.accessToken.substring(0, 20) + '...' : 'none');
      console.log('📁 Google Drive sync - Folder ID:', this.folderId);

      // Test token validity with a simple API call first
      const tokenValid = await this.validateToken();
      if (!tokenValid) {
        throw new Error('Token invalid or expired - please re-authenticate');
      }

      // Ensure we have a folder
      await this.ensureFolder();

      // Reload folder ID if it was just created
      if (!this.folderId) {
        await this.loadStoredTokens();
      }

      console.log('📁 Google Drive sync - After ensureFolder, Folder ID:', this.folderId);

      // Create filename for the domain
      const fileName = `${key}_highlights.json`;
      const fileContent = JSON.stringify(data, null, 2);

      // Check if file already exists
      const existingFileId = await this.findFile(fileName);

      if (existingFileId) {
        // Update existing file
        await this.updateFile(existingFileId, fileContent);
        console.log('✅ Updated Google Drive file:', fileName);
      } else {
        // Create new file
        await this.createFile(fileName, fileContent);
        console.log('✅ Created Google Drive file:', fileName);
      }

    } catch (error) {
      console.error('Google Drive sync failed:', error);

      // If token expired, try to refresh
      if (this.isTokenExpiredError(error)) {
        console.log('🔄 Attempting token refresh for individual sync...');
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry the sync
          console.log('🔄 Retrying individual sync after re-authentication:', key);
          return this.syncToGoogleDrive(key, data);
        }
      }

      throw error;
    }
  }

  async ensureFolder() {
    if (this.folderId) {
      return this.folderId;
    }

    try {
      // Search for existing folder
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${this.folderName}' and mimeType='application/vnd.google-apps.folder'`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const searchResult = await searchResponse.json();

      if (searchResult.files && searchResult.files.length > 0) {
        // Folder exists
        this.folderId = searchResult.files[0].id;
        if (isExtensionContextValid()) {
          await chrome.storage.local.set({ 'gdrive_folder_id': this.folderId });
        }
        console.log('📁 Found existing Google Drive folder:', this.folderId);
        return this.folderId;
      }

      // Create new folder
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

      const folderResult = await createResponse.json();
      this.folderId = folderResult.id;
      if (isExtensionContextValid()) {
        await chrome.storage.local.set({ 'gdrive_folder_id': this.folderId });
      }
      console.log('✅ Created Google Drive folder:', this.folderId);
      return this.folderId;

    } catch (error) {
      console.error('Error ensuring Google Drive folder:', error);
      throw error;
    }
  }

  async findFile(fileName) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and parents in '${this.folderId}'`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = await response.json();
      return result.files && result.files.length > 0 ? result.files[0].id : null;

    } catch (error) {
      console.error('Error finding file:', error);
      return null;
    }
  }

  async createFile(fileName, content) {
    const metadata = {
      name: fileName,
      parents: [this.folderId],
      mimeType: 'application/json'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'application/json' }));

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`Failed to create file: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async updateFile(fileId, content) {
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: content
    });

    if (!response.ok) {
      throw new Error(`Failed to update file: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async authenticateGoogleDrive() {
    try {
      console.log('Starting Google Drive authentication via background script...');

      // Call background script to handle authentication
      const authResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'authenticateGoogleDrive' },
          (response) => resolve(response)
        );
      });

      if (authResult.success) {
        console.log('Google Drive authentication successful');
        console.log('🔍 DEBUG - authResult:', authResult);
        console.log('🔍 DEBUG - authResult.token type:', typeof authResult.token);
        console.log('🔍 DEBUG - authResult.token value:', authResult.token);

        // Extract the actual token string from the Chrome Identity API response
        // Chrome Identity API now returns { token: "actual_token", grantedScopes: [...] }
        if (typeof authResult.token === 'object' && authResult.token.token) {
          this.accessToken = authResult.token.token;
          console.log('🔧 Extracted token from object:', typeof this.accessToken);
        } else if (typeof authResult.token === 'string') {
          this.accessToken = authResult.token;
          console.log('🔧 Using token directly:', typeof this.accessToken);
        } else {
          throw new Error('Unexpected token format from Chrome Identity API');
        }

        // Store in chrome.storage for persistence across extension restarts
        if (isExtensionContextValid()) {
          await chrome.storage.local.set({
            'gdrive_access_token': this.accessToken
          });
        }

        console.log('🔑 Fresh token stored and set:', this.accessToken ? 'YES' : 'NO');
        console.log('🔑 Token type after assignment:', typeof this.accessToken);
        console.log('🔑 Token stored as:', typeof this.accessToken, '- value:', this.accessToken);
        console.log('🔑 Token preview:', (this.accessToken && typeof this.accessToken === 'string') ? this.accessToken.substring(0, 20) + '...' : 'none');

        // Clear any cached folder ID to force recreation with new token
        this.folderId = null;
        if (isExtensionContextValid()) {
          await chrome.storage.local.remove(['gdrive_folder_id']);
        }

        // Mark tokens as not loaded to force reload from storage
        this.tokensLoaded = false;

        // Force reload of fresh token from storage
        await this.loadStoredTokens();

        console.log('🔄 Reloaded token after auth:', (this.accessToken && typeof this.accessToken === 'string') ? this.accessToken.substring(0, 20) + '...' : 'none');

        // Ensure the Google Drive folder is set up with fresh token
        await this.ensureFolder();

        return {
          success: true,
          token: this.accessToken,
          message: 'Successfully connected to Google Drive'
        };
      } else {
        console.error('Authentication failed:', authResult.error);

        // Check if this is an OAuth verification issue
        if (authResult.error && authResult.error.includes('access_denied')) {
          return {
            success: false,
            error: `Google OAuth needs test user access. Your OAuth is working but restricted.

Option 1 - Add Test User:
1. Go to Google Cloud Console → APIs & Services → OAuth consent screen
2. Make sure "User Type" is "External"
3. App should be in "Testing" status
4. Scroll to "Test users" section (appears after configuring app)
5. Click "Add Users" and add: gtarc001@gmail.com

Option 2 - Publish App:
1. In OAuth consent screen, click "Publish App"
2. No verification needed for this use case

Alternative: Extension works perfectly with local storage for now.`,
            needsSetup: true,
            isOAuthVerificationIssue: true
          };
        }

        return {
          success: false,
          error: authResult.error || 'Authentication failed - please try again'
        };
      }
    } catch (error) {
      console.error('Google Drive authentication error:', error);
      return {
        success: false,
        error: error.message || 'Authentication failed'
      };
    }
  }

  async validateToken() {
    if (!this.accessToken) {
      return false;
    }

    try {
      // Make a simple API call to validate token
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log('✅ Token validation successful');
        return true;
      } else {
        console.log('❌ Token validation failed:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.log('❌ Token validation error:', error);
      return false;
    }
  }

  isTokenExpiredError(error) {
    // Check for various token expiration indicators
    const errorMessage = error.message?.toLowerCase() || '';
    const errorString = error.toString?.()?.toLowerCase() || '';

    return (
      errorMessage.includes('401') ||
      errorMessage.includes('invalid_token') ||
      errorMessage.includes('token expired') ||
      errorMessage.includes('unauthorized') ||
      errorString.includes('401') ||
      errorString.includes('invalid_token') ||
      errorString.includes('token expired') ||
      errorString.includes('unauthorized')
    );
  }

  async refreshAccessToken() {
    try {
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot refresh token');
        return false;
      }

      console.log('🔄 Token refresh needed - re-authenticating through background script...');

      // Clear the current invalid token
      this.accessToken = null;
      if (isExtensionContextValid()) {
        await chrome.storage.local.remove(['gdrive_access_token']);
      }

      // Re-authenticate
      const success = await this.authenticateGoogleDrive();

      if (success) {
        console.log('✅ Token refresh successful');
        return true;
      } else {
        console.error('❌ Token refresh failed');
        return false;
      }
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.warn('Extension context invalidated during token refresh');
        return false;
      }
      console.error('❌ Token refresh error:', error);
      return false;
    }
  }

  async delete(key) {
    // Always delete locally first
    await this.localProvider.delete(key);
    console.log('✅ Deleted locally:', key);

    // Add to batch delete queue if authenticated
    if (this.accessToken) {
      console.log('📦 Adding to batch delete queue:', key);
      this.addToDeleteQueue(key);
    } else {
      console.log('📡 Google Drive not authenticated, skipping delete sync');
    }

    return true;
  }

  /**
   * Sync delete to Google Drive (used by batch processor)
   */
  async syncDeleteToGoogleDrive(key) {
    try {
      const fileName = `${key}_highlights.json`;
      const fileId = await this.findFile(fileName);

      if (fileId) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        });

        if (!response.ok) {
          throw new Error(`Delete failed: ${response.status} ${response.statusText}`);
        }

        console.log('✅ Deleted from Google Drive:', fileName);
      } else {
        console.log('📁 File not found in Google Drive (already deleted):', fileName);
      }
    } catch (error) {
      console.error('Failed to delete from Google Drive:', error);

      // If token expired, try to refresh and retry
      if (this.isTokenExpiredError(error)) {
        console.log('🔄 Attempting token refresh for delete operation...');
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          console.log('🔄 Retrying delete after re-authentication:', key);
          return this.syncDeleteToGoogleDrive(key);
        }
      }

      throw error;
    }
  }

  async list() {
    return await this.localProvider.list();
  }

  async clear() {
    return await this.localProvider.clear();
  }


  async getSyncStatus() {
    return {
      authenticated: !!this.accessToken,
      storageType: 'google-drive-direct',
      message: this.accessToken ?
        '✅ Google Drive connected' :
        '🔐 Click to connect Google Drive',
      lastSync: Date.now(),
      queueLength: 0,
      inProgress: false,
      folderName: this.folderName
    };
  }
}

/**
 * External Automation Storage Provider
 * Uses HTTP requests to external service (like Latenode) instead of Chrome APIs
 * Solves all OAuth, token, and CSP issues by moving complexity to external service
 */
class ExternalSyncStorageProvider extends IStorageProvider {
  constructor() {
    super();
    this.prefix = 'universal_highlighter_';
    this.localProvider = new LocalStorageProvider();
    this.syncEndpoint = this.getSyncEndpoint();
    this.userId = this.getUserId();
  }

  getSyncEndpoint() {
    // Configure this endpoint in extension options or localStorage
    return localStorage.getItem('highlighter_sync_endpoint') ||
           'https://your-latenode-automation.webhook.com/highlights';
  }

  getUserId() {
    // Generate or retrieve a unique user ID for this browser
    let userId = localStorage.getItem('highlighter_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('highlighter_user_id', userId);
    }
    return userId;
  }

  async save(key, data) {
    try {
      // Always save locally first (local-first approach)
      await this.localProvider.save(key, data);
      console.log('✅ Saved locally:', key);

      // Then sync to external service in background
      this.syncToExternal(key, data).catch(error => {
        console.warn('Background sync failed:', error);
      });

      return true;
    } catch (error) {
      console.error('External sync save error:', error);
      return true; // Local save still succeeded
    }
  }

  async load(key) {
    // Always load from local storage (fastest, most reliable)
    return await this.localProvider.load(key);
  }

  async syncToExternal(key, data) {
    if (!this.syncEndpoint || this.syncEndpoint.includes('your-latenode')) {
      console.log('📡 No sync endpoint configured, skipping external sync');
      return;
    }

    try {
      const response = await fetch(this.syncEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'save_highlights',
          userId: this.userId,
          domain: key,
          highlights: data,
          timestamp: Date.now(),
          browser: navigator.userAgent.includes('Chrome') ? 'chrome' : 'other'
        })
      });

      if (response.ok) {
        console.log('✅ Synced to external automation:', key);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('External sync failed:', error);
      // Don't throw - we already saved locally
    }
  }

  async delete(key) {
    await this.localProvider.delete(key);

    // Optionally delete from external service
    if (this.syncEndpoint && !this.syncEndpoint.includes('your-latenode')) {
      try {
        await fetch(this.syncEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_highlights',
            userId: this.userId,
            domain: key
          })
        });
      } catch (error) {
        console.warn('External delete failed:', error);
      }
    }

    return true;
  }

  async list() {
    return await this.localProvider.list();
  }

  async clear() {
    return await this.localProvider.clear();
  }

  async getSyncStatus() {
    const hasEndpoint = this.syncEndpoint && !this.syncEndpoint.includes('your-latenode');

    return {
      authenticated: hasEndpoint,
      storageType: 'external-automation',
      message: hasEndpoint ?
        '🤖 External automation sync active' :
        '⚙️ Configure automation endpoint in options',
      lastSync: Date.now(),
      queueLength: 0,
      inProgress: false,
      endpoint: this.syncEndpoint,
      userId: this.userId
    };
  }

  // Easy configuration method
  async configureSyncEndpoint(endpoint) {
    this.syncEndpoint = endpoint;
    localStorage.setItem('highlighter_sync_endpoint', endpoint);
    console.log('✅ Automation endpoint configured:', endpoint);
    return true;
  }
}

// Storage Factory (SOLID: Dependency Inversion)
class StorageFactory {
  static createLocal() {
    return new LocalStorageProvider();
  }

  static createGoogleDrive() {
    return new GoogleDriveStorageProvider();
  }

  static createHybrid() {
    return new HybridStorageProvider();
  }

  static createChromeSync() {
    return new ChromeSyncStorageProvider();
  }

  // Recommended: Automatic sync that works for all users
  static createAutoSync() {
    // Use Chrome sync if available, fallback to local
    if (chrome && chrome.storage && chrome.storage.sync) {
      return new ChromeSyncStorageProvider();
    } else {
      return new LocalStorageProvider();
    }
  }

  // External automation sync - no Chrome API complexity
  static createExternalSync() {
    return new ExternalSyncStorageProvider();
  }

  // Direct Google Drive sync - uses Google Drive REST API
  static createDirectGoogleDrive() {
    return new DirectGoogleDriveProvider();
  }
}

// Export for use in other files
if (typeof window !== 'undefined') {
  window.StorageProviders = {
    LocalStorageProvider,
    GoogleDriveStorageProvider,
    ChromeSyncStorageProvider,
    HybridStorageProvider,
    ExternalSyncStorageProvider,
    DirectGoogleDriveProvider,
    StorageFactory
  };
}