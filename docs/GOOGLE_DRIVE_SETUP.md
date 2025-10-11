# 🔐 Google Drive Setup & Testing Guide

## 📋 Prerequisites

### 1. Google Cloud Console Setup

1. **Go to** [Google Cloud Console](https://console.cloud.google.com)
2. **Create a new project** or select existing one
3. **Enable APIs**:
   - Google Drive API
   - Google Identity API (automatically enabled)

### 2. OAuth 2.0 Credentials

1. **Go to** "APIs & Services" → "Credentials"
2. **Click** "Create Credentials" → "OAuth 2.0 Client IDs"
3. **Application type**: Chrome Extension
4. **Extension ID**: Get this after loading unpacked extension
5. **Copy the Client ID** (format: `xxxxx.apps.googleusercontent.com`)

### 3. Update Extension

1. **Edit** `manifest.json`
2. **Replace** `YOUR_GOOGLE_CLIENT_ID` with your actual Client ID:
   ```json
   "oauth2": {
     "client_id": "886377501929-a8j4le1jv08qnol8s71vlrp180erm6v1.apps.googleusercontent.com",
     "scopes": ["https://www.googleapis.com/auth/drive.file"]
   }
   ```

## 🧪 Testing Google Drive Sync

### Step 1: Load Extension
1. **Chrome** → Extensions → Developer mode → Load unpacked
2. **Select** the chrome-highlighter folder
3. **Note the Extension ID** from the card
4. **Update** Google Cloud Console with this Extension ID

### Step 2: Initial Authentication
1. **Create highlights** on test.html or any website
2. **Open extension popup**
3. **Check sync status** - should show "🔐 Click to authenticate"
4. **Click the "🔄 Sync Now" button** in Current tab
5. **Google OAuth popup** should appear
6. **Grant permissions** to access Google Drive

### Step 3: Verify Sync
1. **Sync status** should change to "✅ Synced with Google Drive"
2. **Check Google Drive** - should see "Universal Web Highlighter" folder
3. **Inside folder** - JSON files for each domain with highlights

### Step 4: Cross-Device Testing
1. **Install extension** on another Chrome browser/device
2. **Authenticate** with same Google account
3. **Highlights should sync** automatically
4. **Create new highlights** - should appear on both devices

## 🔍 Debugging

### Console Logs
Open Chrome DevTools on any page to see sync logs:
- `Google Drive authentication successful`
- `Successfully synced to cloud: example.com`
- `Found newer cloud data, updating local: example.com`

### Extension Popup Debugging
1. **Right-click extension icon** → Inspect popup
2. **Console tab** shows popup-specific logs
3. **Network tab** shows Google Drive API calls

### Sync Status Indicators
- 🔐 **Authentication needed** - Click to authenticate
- 🔄 **Syncing** - Upload/download in progress
- ✅ **Synced** - Last sync time displayed
- ⏳ **Pending** - Items queued for sync
- ❌ **Error** - Check console for details
- 💾 **Local only** - Sync disabled or failed

## 🛠️ Common Issues

### "Invalid OAuth Client"
- **Problem**: Extension ID doesn't match Google Cloud Console
- **Solution**: Update OAuth credentials with correct Extension ID

### "Access Denied"
- **Problem**: User denied permissions or wrong scope
- **Solution**: Re-authenticate, ensure Drive API scope is enabled

### "Sync Never Happens"
- **Problem**: JavaScript errors or API failures
- **Solution**: Check browser console for errors

### "Highlights Don't Appear on Other Device"
- **Problem**: Not authenticated or different Google account
- **Solution**: Authenticate with same Google account on all devices

## 📁 Google Drive File Structure

```
Google Drive/
└── Universal Web Highlighter/
    ├── example.com.json
    ├── github.com.json
    ├── stackoverflow.com.json
    └── ... (one file per domain)
```

### File Content Example
```json
{
  "highlights": [
    {
      "id": "highlight_1699123456789_abc123",
      "text": "This is highlighted text",
      "url": "https://example.com/page",
      "title": "Page Title",
      "color": "#ffff00",
      "timestamp": "2023-11-05T10:30:00.000Z",
      "position": {...},
      "note": "My note",
      "tags": ["important"]
    }
  ],
  "lastModified": 1699123456789
}
```

## ⚡ Performance Notes

- **Sync Frequency**: Automatic sync every 2 seconds (debounced)
- **Background Checks**: Every 5 minutes for cloud updates
- **API Limits**: Google Drive has daily quotas (100 requests/100 seconds/user)
- **Conflict Resolution**: Cloud data wins if newer timestamp

## 🔒 Privacy & Security

- **Your Data**: Stored in YOUR personal Google Drive
- **No Server**: Extension communicates directly with Google Drive API
- **Permissions**: Only accesses files created by the extension
- **Encryption**: Google Drive provides encryption at rest and in transit

---

**Ready to test?** Follow the setup steps above and start highlighting! 🎉