// options.js - Configuration page for external automation

document.addEventListener('DOMContentLoaded', async () => {
  const syncEndpointInput = document.getElementById('syncEndpoint');
  const testConnectionBtn = document.getElementById('testConnection');
  const saveEndpointBtn = document.getElementById('saveEndpoint');
  const clearEndpointBtn = document.getElementById('clearEndpoint');
  const connectionStatus = document.getElementById('connectionStatus');

  // Status display elements
  const storageTypeSpan = document.getElementById('storageType');
  const userIdSpan = document.getElementById('userId');
  const currentEndpointSpan = document.getElementById('currentEndpoint');
  const syncStatusSpan = document.getElementById('syncStatus');

  // Load current settings
  loadCurrentSettings();

  // Event listeners
  saveEndpointBtn.addEventListener('click', saveEndpoint);
  testConnectionBtn.addEventListener('click', testConnection);
  clearEndpointBtn.addEventListener('click', clearEndpoint);

  async function loadCurrentSettings() {
    try {
      // Get current endpoint
      const currentEndpoint = localStorage.getItem('highlighter_sync_endpoint') || '';
      syncEndpointInput.value = currentEndpoint;

      // Get user ID
      const userId = localStorage.getItem('highlighter_user_id') || 'Not set';

      // Update status display
      storageTypeSpan.textContent = 'External Automation';
      userIdSpan.textContent = userId;
      currentEndpointSpan.textContent = currentEndpoint || 'Not configured';
      syncStatusSpan.textContent = currentEndpoint ? '🟢 Configured' : '🔴 Not configured';

    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading current settings', 'error');
    }
  }

  async function saveEndpoint() {
    const endpoint = syncEndpointInput.value.trim();

    if (!endpoint) {
      showStatus('Please enter a valid webhook URL', 'error');
      return;
    }

    try {
      // Validate URL format
      new URL(endpoint);

      // Save to localStorage
      localStorage.setItem('highlighter_sync_endpoint', endpoint);

      showStatus('✅ Endpoint saved successfully!', 'success');
      loadCurrentSettings(); // Refresh status display

    } catch (error) {
      showStatus('❌ Invalid URL format', 'error');
    }
  }

  async function testConnection() {
    const endpoint = syncEndpointInput.value.trim();

    if (!endpoint) {
      showStatus('Please enter a webhook URL first', 'error');
      return;
    }

    try {
      // Show testing status
      showStatus('🧪 Testing connection...', 'success');
      testConnectionBtn.disabled = true;

      // Create test payload
      const testPayload = {
        action: 'test_connection',
        userId: localStorage.getItem('highlighter_user_id') || 'test_user',
        domain: 'test.com',
        highlights: {
          highlights: [{
            id: 'test_highlight',
            text: 'Test highlight text',
            color: '#ffff00',
            url: 'https://test.com',
            timestamp: new Date().toISOString()
          }],
          lastModified: Date.now()
        },
        timestamp: Date.now(),
        browser: 'chrome'
      };

      // Send test request
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload)
      });

      if (response.ok) {
        showStatus(`✅ Connection successful! (HTTP ${response.status})`, 'success');
      } else {
        showStatus(`❌ Connection failed: HTTP ${response.status} ${response.statusText}`, 'error');
      }

    } catch (error) {
      showStatus(`❌ Connection failed: ${error.message}`, 'error');
    } finally {
      testConnectionBtn.disabled = false;
    }
  }

  async function clearEndpoint() {
    if (confirm('Are you sure you want to clear the automation endpoint?')) {
      localStorage.removeItem('highlighter_sync_endpoint');
      syncEndpointInput.value = '';
      showStatus('🗑️ Endpoint cleared', 'success');
      loadCurrentSettings();
    }
  }

  function showStatus(message, type) {
    connectionStatus.textContent = message;
    connectionStatus.className = `status ${type}`;
    connectionStatus.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      connectionStatus.style.display = 'none';
    }, 5000);
  }
});