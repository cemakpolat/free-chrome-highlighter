// content-script.js - Main entry point for web page interaction

(function() {
  'use strict';

  // Don't run on extension pages (pdf-reader, youtube-reader, highlights-manager, etc.)
  if (window.location.href.startsWith('chrome-extension://')) {
    console.log('🚫 Skipping content script on extension page');
    return;
  }

  // Prevent multiple initialization
  if (window.universalHighlighterInitialized) {
    return;
  }
  window.universalHighlighterInitialized = true;

  // Offer to open PDF in our custom editor
  function offerPDFEditor() {
    // Wait for body to be ready
    const addButton = () => {
      // Check if button already exists
      if (document.getElementById('open-pdf-editor-btn')) {
        console.log('📝 PDF editor button already exists');
        return;
      }

      // Create floating button to open PDF in editor
      const button = document.createElement('div');
      button.id = 'open-pdf-editor-btn';
      button.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          cursor: pointer;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: all 0.3s ease;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 32px rgba(0,0,0,0.4)'" onmouseout="this.style.transform=''; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'">
          <span style="font-size: 24px;">📝</span>
          <span>Open PDF Editor & Highlighter</span>
        </div>
      `;

      button.addEventListener('click', async () => {
        // Get current PDF URL
        const pdfUrl = window.location.href;

        // Store PDF data in chrome.storage
        await chrome.storage.local.set({
          pdfReaderData: {
            url: pdfUrl,
            timestamp: Date.now()
          }
        });

        // Open PDF reader in new tab
        const readerUrl = chrome.runtime.getURL('pdf-reader.html');
        chrome.runtime.sendMessage({
          action: 'openPDFReader',
          url: readerUrl
        });

        console.log('✅ Opening PDF in editor...');
      });

      if (document.body) {
        document.body.appendChild(button);
        console.log('✅ PDF editor button added');
      } else {
        console.log('⚠️ Body not ready, waiting...');
        setTimeout(addButton, 100);
      }
    };

    // Try to add immediately, or wait for body
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addButton);
    } else {
      addButton();
    }
  }

  // Initialize immediately since dependencies are loaded via manifest
  initializeHighlighter();

  async function initializeHighlighter() {
    try {
      // Check if we're in a PDF viewer
      const isPDF = document.contentType === 'application/pdf' ||
                    window.location.pathname.toLowerCase().endsWith('.pdf') ||
                    document.querySelector('embed[type="application/pdf"]') !== null;

      if (isPDF) {
        console.log('📄 PDF detected - offering to open in PDF editor...');
        // Offer to open PDF in our custom editor
        offerPDFEditor();
        return; // Don't initialize highlighter on the PDF page itself
      }

      // Load required classes
      const { Highlight, EventEmitter } = window.HighlighterInterfaces;
      const { StorageFactory } = window.StorageProviders;

      if (!Highlight || !EventEmitter || !StorageFactory) {
        console.error('Universal Highlighter: Required dependencies not loaded');
        return;
      }

      // Create global event emitter
      window.highlighterEvents = new EventEmitter();

      // Initialize storage with direct Google Drive integration
      // Uses Google Drive REST API directly - no Chrome extension API complexity
      const storage = StorageFactory.createDirectGoogleDrive();
      console.log('Using storage provider:', storage.constructor.name);
      console.log('📁 Direct Google Drive sync initialized');

      // Initialize TTS service
      window.ttsService = new TTSService();

      // Initialize highlighter service
      const highlighter = new HighlighterService(storage, window.highlighterEvents);

      // Global reference for popup communication
      window.universalHighlighter = highlighter;

      // Load existing highlights for the current page
      console.log('🔧 Loading highlights for current page...');
      await highlighter.loadHighlightsForCurrentPage();
      console.log('🔧 Highlights loaded for current page');

      // Message passing with extension popup/background
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        handleMessage(request, sender, sendResponse);
        return true; // Keep message channel open for async responses
      });

      async function handleMessage(request, sender, sendResponse) {
        try {
          switch (request.action) {
            case 'getPageHighlights':
              const pageHighlights = Array.from(highlighter.highlights.values());
              sendResponse({ success: true, data: pageHighlights });
              break;

            case 'searchHighlights':
              const searchResults = await highlighter.searchHighlights(request.query);
              sendResponse({ success: true, data: searchResults });
              break;

            case 'removeHighlight':
              console.log('🔧 Received removeHighlight request for ID:', request.highlightId);
              console.log('🔧 Current highlights in cache:', Array.from(highlighter.highlights.keys()));

              try {
                await highlighter.removeHighlight(request.highlightId);
                console.log('🔧 Highlight removed successfully');
                sendResponse({ success: true });
              } catch (error) {
                console.error('🔧 Error removing highlight:', error);
                sendResponse({ success: false, error: error.message });
              }
              break;

            case 'updateHighlight':
              const highlight = highlighter.highlights.get(request.highlightId);
              if (highlight) {
                Object.assign(highlight, request.updates);
                await highlighter.updateHighlight(highlight);
                sendResponse({ success: true });
              } else {
                sendResponse({ success: false, error: 'Highlight not found' });
              }
              break;

            case 'exportHighlights':
              const exportData = await highlighter.exportHighlights(
                request.format || 'json',
                request.scope || 'current'
              );
              sendResponse({ success: true, data: exportData });
              break;

            case 'getStats':
              const stats = await getHighlightStats();
              sendResponse({ success: true, data: stats });
              break;

            case 'syncWithCloud':
              const syncResult = await forceSyncWithCloud();
              sendResponse({ success: syncResult.success, data: syncResult });
              break;

            case 'getSyncStatus':
              const syncStatus = await getSyncStatus();
              sendResponse({ success: true, data: syncStatus });
              break;

            case 'getStorageStatus':
              try {
                const storageStatus = await highlighter.storage.getSyncStatus();
                sendResponse({ success: true, ...storageStatus });
              } catch (error) {
                sendResponse({ success: false, authenticated: false, error: error.message });
              }
              break;

            case 'authenticateGoogleDrive':
              // Use the storage provider's authentication method
              if (highlighter.storage.authenticateGoogleDrive) {
                try {
                  const authResult = await highlighter.storage.authenticateGoogleDrive();
                  sendResponse({ success: true, data: authResult });
                } catch (error) {
                  sendResponse({ success: false, error: error.message });
                }
              } else {
                sendResponse({
                  success: false,
                  error: 'Google Drive authentication not available with current storage provider'
                });
              }
              break;

            case 'toggleHighlightMode':
              toggleHighlightMode();
              sendResponse({ success: true });
              break;

            case 'highlightSelection':
              const selection = window.getSelection();
              if (selection.toString().trim()) {
                await highlighter.createHighlight(selection);
              }
              sendResponse({ success: true });
              break;

            case 'activateReaderView':
              if (window.readerViewService) {
                await window.readerViewService.activate();
                sendResponse({ success: true });
              } else {
                sendResponse({ success: false, error: 'Reader view service not available' });
              }
              break;

            case 'activateVideoAnnotation':
              console.log(`📨 Received activateVideoAnnotation message on: ${window.location.href}`);
              console.log(`   Frame: ${window === window.top ? 'TOP' : 'IFRAME'}`);
              if (window.videoAnnotationService) {
                console.log('   ✅ videoAnnotationService available, calling activate()...');
                await window.videoAnnotationService.activate();
                sendResponse({ success: true });
              } else {
                console.warn('   ❌ videoAnnotationService not available');
                sendResponse({ success: false, error: 'Video annotation service not available' });
              }
              break;

            default:
              sendResponse({ success: false, error: 'Unknown action' });
          }
        } catch (error) {
          console.error('Content script message error:', error);
          sendResponse({ success: false, error: error.message });
        }
      }

      async function getHighlightStats() {
        try {
          const allHighlights = await highlighter.searchHighlights('');
          const domains = new Set();
          const today = new Date();
          const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

          let todayCount = 0;
          let weekCount = 0;
          let monthCount = 0;

          allHighlights.forEach(h => {
            try {
              domains.add(new URL(h.url).hostname);
            } catch (e) {
              // Invalid URL, skip
            }
            const highlightDate = new Date(h.timestamp);
            
            if (highlightDate.toDateString() === today.toDateString()) {
              todayCount++;
            }
            if (highlightDate >= thisWeek) {
              weekCount++;
            }
            if (highlightDate >= thisMonth) {
              monthCount++;
            }
          });

          return {
            totalHighlights: allHighlights.length,
            totalDomains: domains.size,
            todayCount,
            weekCount,
            monthCount,
            currentPageCount: highlighter.highlights.size
          };
        } catch (error) {
          console.error('Error getting stats:', error);
          return {
            totalHighlights: 0,
            totalDomains: 0,
            todayCount: 0,
            weekCount: 0,
            monthCount: 0,
            currentPageCount: 0
          };
        }
      }

      async function forceSyncWithCloud() {
        try {
          console.log('Starting manual sync with Google Drive...');

          // Check if we have hybrid storage
          if (storage.forceSyncAll) {
            const success = await storage.forceSyncAll();
            return {
              success: success,
              message: success ? 'Sync completed successfully' : 'Sync failed',
              timestamp: Date.now()
            };
          } else {
            // Fallback for local-only storage
            return {
              success: false,
              message: 'Google Drive sync not available with current storage provider',
              timestamp: Date.now()
            };
          }
        } catch (error) {
          console.error('Force sync error:', error);
          return {
            success: false,
            message: error.message,
            timestamp: Date.now()
          };
        }
      }

      async function getSyncStatus() {
        try {
          if (highlighter.storage.getSyncStatus) {
            return await highlighter.storage.getSyncStatus();
          } else {
            return {
              authenticated: false,
              storageType: 'local',
              lastSync: 0,
              queueLength: 0,
              inProgress: false,
              message: 'Sync not available'
            };
          }
        } catch (error) {
          console.error('Get sync status error:', error);
          return {
            authenticated: false,
            storageType: 'error',
            lastSync: 0,
            queueLength: 0,
            inProgress: false,
            error: error.message
          };
        }
      }

      async function authenticateGoogleDrive() {
        try {
          console.log('Content: Starting Google Drive authentication via background script...');

          // Call background script to handle authentication
          const authResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { action: 'authenticateGoogleDrive' },
              (response) => resolve(response)
            );
          });

          if (authResult.success) {
            console.log('Content: Google Drive authentication successful');

            // Update our storage provider with the new token
            if (storage.cloudProvider) {
              storage.cloudProvider.accessToken = authResult.token;

              // Ensure the Google Drive folder is set up
              await storage.cloudProvider.ensureFolder();

              // Trigger initial sync
              if (storage.forceSyncAll) {
                await storage.forceSyncAll();
              }
            }

            return {
              success: true,
              message: 'Successfully connected to Google Drive',
              timestamp: Date.now()
            };
          } else {
            console.error('Content: Authentication failed:', authResult.error);
            return {
              success: false,
              message: authResult.error || 'Authentication failed - please try again',
              timestamp: Date.now()
            };
          }
        } catch (error) {
          console.error('Content: Google Drive authentication error:', error);
          return {
            success: false,
            message: error.message || 'Authentication failed',
            timestamp: Date.now()
          };
        }
      }

      // Enhanced keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + H: Highlight selected text
        if ((e.ctrlKey || e.metaKey) && e.key === 'h' && !e.shiftKey) {
          e.preventDefault();
          const selection = window.getSelection();
          if (selection.toString().trim()) {
            highlighter.createHighlight(selection);
          }
        }

        // Ctrl/Cmd + Shift + H: Toggle highlight mode
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
          e.preventDefault();
          toggleHighlightMode();
        }

        // Ctrl/Cmd + Shift + S: Search highlights
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
          e.preventDefault();
          openHighlightSearch();
        }

        // Escape: Clear selection and hide UI
        if (e.key === 'Escape') {
          window.getSelection().removeAllRanges();
          if (highlighter && highlighter.hideHighlightButton) {
            highlighter.hideHighlightButton();
          }
        }
      });

      function toggleHighlightMode() {
        const body = document.body;
        if (body.classList.contains('highlight-mode')) {
          body.classList.remove('highlight-mode');
          showNotification('Highlight mode disabled');
        } else {
          body.classList.add('highlight-mode');
          showNotification('Highlight mode enabled - Click and drag to highlight');
        }
      }

      function openHighlightSearch() {
        // Send message to open popup with search focus
        chrome.runtime.sendMessage({ action: 'openPopupWithSearch' });
      }

      function showNotification(message) {
        // Remove existing notifications
        document.querySelectorAll('.highlighter-notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = 'highlighter-notification';
        notification.textContent = message;
        notification.style.cssText = `
          position: fixed !important;
          top: 20px !important;
          right: 20px !important;
          background: #333 !important;
          color: white !important;
          padding: 12px 20px !important;
          border-radius: 6px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-size: 14px !important;
          z-index: 2147483647 !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
          animation: slideIn 0.3s ease-out !important;
          max-width: 300px !important;
          word-wrap: break-word !important;
        `;

        document.body.appendChild(notification);

        // Auto-remove after 3 seconds
        setTimeout(() => {
          notification.style.animation = 'slideOut 0.3s ease-in';
          setTimeout(() => {
            if (notification.parentNode) {
              notification.remove();
            }
          }, 300);
        }, 3000);
      }

      // Add CSS animations and styles
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        body.highlight-mode {
          cursor: crosshair !important;
        }

        body.highlight-mode * {
          cursor: crosshair !important;
        }

        .universal-highlight {
          position: relative !important;
          transition: all 0.2s ease !important;
        }

        .universal-highlight:hover {
          box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3) !important;
        }

        .highlight-popup-container {
          animation: highlightPopupSlideIn 0.2s ease-out !important;
        }

        @keyframes highlightPopupSlideIn {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .highlight-button {
          animation: buttonPop 0.2s ease-out !important;
        }

        @keyframes buttonPop {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        .highlight-context-menu {
          animation: menuSlide 0.2s ease-out !important;
        }

        @keyframes menuSlide {
          from {
            transform: translateY(-10px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);

      // Event listeners for highlighter events
      window.highlighterEvents.on('highlight_created', (highlight) => {
        // Send to background for analytics
        chrome.runtime.sendMessage({
          action: 'trackEvent',
          event: 'highlight_created',
          data: {
            url: highlight.url,
            textLength: highlight.text.length,
            domain: new URL(highlight.url).hostname
          }
        }).catch(() => {
          // Ignore errors if background script isn't available
        });
      });

      window.highlighterEvents.on('highlight_removed', (highlightId) => {
        // No notification needed
      });

      window.highlighterEvents.on('highlight_updated', (highlight) => {
        // No notification needed
      });

      window.highlighterEvents.on('highlights_updated', (data) => {
        // Handle sync updates from cloud
        console.log('Highlights synced from cloud:', data.key);
      });

      // Page navigation detection for SPAs
      let currentUrl = window.location.href;
      const observer = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
          currentUrl = window.location.href;
          // Reinitialize for new page (SPA navigation)
          setTimeout(() => {
            if (highlighter) {
              highlighter.currentUrl = highlighter.getCurrentUrl();
              highlighter.loadHighlightsForCurrentPage();
            }
          }, 1000);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Performance monitoring
      const performanceMonitor = {
        start: Date.now(),
        highlights: 0,
        
        log() {
          const elapsed = Date.now() - this.start;
          console.log(`Universal Highlighter Performance: ${this.highlights} highlights loaded in ${elapsed}ms`);
        }
      };

      window.highlighterEvents.on('highlight_created', () => {
        performanceMonitor.highlights++;
      });

      // Log performance after page load
      if (document.readyState === 'complete') {
        setTimeout(() => performanceMonitor.log(), 2000);
      } else {
        window.addEventListener('load', () => {
          setTimeout(() => performanceMonitor.log(), 2000);
        });
      }

      // Add manual debugging functions to window for easy testing
      window.debugHighlighter = {
        async testSave() {
          console.log('=== MANUAL SAVE TEST ===');
          const testHighlight = new Highlight({
            text: 'Test highlight text',
            url: highlighter.currentUrl,
            title: document.title,
            color: '#ff6b6b'
          });

          await highlighter.saveHighlight(testHighlight);
          console.log('Test highlight saved');
          return testHighlight;
        },

        async testLoad() {
          console.log('=== MANUAL LOAD TEST ===');
          const highlights = await highlighter.loadHighlights();
          console.log('Loaded highlights:', highlights);
          return highlights;
        },

        async checkStorage() {
          console.log('=== STORAGE CHECK ===');
          const domain = highlighter.getDomainFromUrl(highlighter.currentUrl);
          const data = await highlighter.storage.load(domain);
          console.log('Direct storage read:', data);
          return data;
        },

        currentUrl: () => highlighter.currentUrl,
        storage: () => highlighter.storage.constructor.name
      };

      console.log('🌟 Universal Web Highlighter initialized successfully!');
      console.log('💡 Debug functions available: window.debugHighlighter');
      console.log('💡 Shortcuts: Ctrl+H (highlight), Ctrl+Shift+H (toggle mode), Ctrl+Shift+S (search)');

    } catch (error) {
      console.error('Error initializing Universal Highlighter:', error);
    }
  }


})();