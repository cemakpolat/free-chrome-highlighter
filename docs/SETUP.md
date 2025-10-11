# Setup Guide - Universal Web Highlighter

This guide will walk you through setting up the Universal Web Highlighter Chrome extension with all its features.

## 📋 Prerequisites

- **Google Chrome** (or Chromium-based browser)
- **Chrome Developer Mode** enabled
- **Google Account** (optional, for cloud sync)
- **Git** (for downloading the source code)

## 🚀 Installation Steps

### Step 1: Download the Extension

**Option A: Clone from GitHub**
```bash
git clone https://github.com/your-username/chrome-highlighter.git
cd chrome-highlighter
```

**Option B: Download ZIP**
1. Download the ZIP file from GitHub
2. Extract to a folder named `chrome-highlighter`

### Step 2: Load in Chrome

1. **Open Chrome Extensions**
   - Go to `chrome://extensions/`
   - Or: Chrome Menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle "Developer mode" switch (top right)

3. **Load the Extension**
   - Click "Load unpacked"
   - Select the `chrome-highlighter` folder
   - Extension should appear in your extensions list

4. **Pin the Extension**
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "Universal Web Highlighter" for easy access

### Step 3: Verify Installation

1. **Visit any webpage**
2. **Select some text**
3. **Look for the blue highlight button**
4. **Click to highlight** - if it works, you're ready!

## ⚙️ Configuration Options

### Basic Mode (Local Storage Only)

**No additional setup required!**
- Highlights saved locally in browser
- Works immediately after installation
- Perfect for single-device usage

### Google Drive Sync Setup

For cross-device synchronization, follow these steps:

#### 1. Create Google Cloud Project

1. **Visit Google Cloud Console**
   - Go to [console.cloud.google.com](https://console.cloud.google.com/)
   - Sign in with your Google account

2. **Create New Project**
   - Click "New Project"
   - Name: "Chrome Highlighter"
   - Click "Create"

#### 2. Enable Google Drive API

1. **Navigate to APIs & Services**
   - Left sidebar → "APIs & Services" → "Library"

2. **Enable Drive API**
   - Search for "Google Drive API"
   - Click on it → Click "Enable"

#### 3. Create OAuth 2.0 Credentials

1. **Go to Credentials**
   - Left sidebar → "APIs & Services" → "Credentials"

2. **Create Credentials**
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"

3. **Configure OAuth Consent Screen** (if prompted)
   - User Type: "External"
   - App name: "Universal Web Highlighter"
   - User support email: Your email
   - Developer contact: Your email
   - Save and continue through all steps

4. **Create OAuth Client**
   - Application type: "Web application"
   - Name: "Chrome Extension"
   - Authorized JavaScript origins:
     ```
     chrome-extension://[YOUR_EXTENSION_ID]
     ```
   - Click "Create"

#### 4. Find Your Extension ID

1. **Go to Chrome Extensions**
   - `chrome://extensions/`

2. **Find Extension ID**
   - Look for "Universal Web Highlighter"
   - Copy the ID (long string of letters)

#### 5. Update Extension Configuration

1. **Edit manifest.json**
   ```json
   {
     "oauth2": {
       "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
       "scopes": ["https://www.googleapis.com/auth/drive.file"]
     }
   }
   ```

2. **Replace YOUR_CLIENT_ID_HERE** with the client ID from Google Cloud Console

3. **Reload Extension**
   - Go to `chrome://extensions/`
   - Click reload button on the extension

#### 6. Authorize Google Drive Access

1. **Click Extension Icon**
2. **Click "Connect to Google Drive"**
3. **Follow OAuth flow**
4. **Grant permissions**

### AI Features Setup

#### Option 1: Ollama (Local AI - Recommended)

1. **Install Ollama**
   ```bash
   # macOS
   brew install ollama

   # Or download from https://ollama.ai/
   ```

2. **Start Ollama Service**
   ```bash
   ollama serve
   ```

3. **Pull a Model**
   ```bash
   # Lightweight model (recommended)
   ollama pull llama2:7b

   # Or larger model for better quality
   ollama pull llama2:13b
   ```

4. **Configure Extension**
   - Open extension popup
   - Go to Settings
   - AI Provider: "Ollama"
   - Model: "llama2:7b"

#### Option 2: Hugging Face (Cloud AI)

1. **Get API Key**
   - Sign up at [huggingface.co](https://huggingface.co/)
   - Go to Settings → Access Tokens
   - Create new token with read access

2. **Configure Extension**
   - Open extension popup
   - Go to Settings
   - AI Provider: "Hugging Face"
   - Enter your API key

#### Option 3: Extractive Summaries (No Setup)

- **Always available** as fallback
- **No external dependencies**
- **Simple text extraction** from highlights

## 🎯 Usage Guide

### Basic Highlighting

1. **Select Text**
   - Click and drag to select text on any webpage

2. **Highlight**
   - Click the blue highlight button that appears
   - Or use keyboard shortcut (if configured)

3. **Choose Color** (Optional)
   - Right-click highlighted text
   - Select from 8 available colors

### Advanced Features

#### Adding Notes
```
1. Right-click highlighted text
2. Select "Edit note"
3. Type your note in the modal
4. Save with Ctrl+Enter (or Cmd+Enter on Mac)
```

#### Text-to-Speech
```
1. Click 🔊 button on any highlight
2. Extension auto-detects page language
3. Selects best available voice
4. Click ⏹️ to stop playback
```

#### Managing Highlights
```
1. Click extension icon
2. Select "Manage Highlights"
3. Search, filter, and organize
4. Export to various formats
```

#### AI Summaries
```
1. Open Highlights Manager
2. Select a page with multiple highlights
3. Click "Generate AI Summary"
4. Wait for processing
5. Listen with TTS or export
```

## 🔧 Troubleshooting

### Common Issues

#### Extension Not Loading
- **Check Developer Mode**: Must be enabled in `chrome://extensions/`
- **Verify File Permissions**: Ensure Chrome can read the folder
- **Check Console Errors**: Look for errors in extension details

#### Highlights Not Appearing
- **Clear Browser Cache**: Sometimes helps with CSS issues
- **Check Page Content**: Some pages block content scripts
- **Reload Page**: Try refreshing after installing extension

#### Google Drive Sync Not Working
- **Verify Client ID**: Must match exactly in manifest.json
- **Check API Enablement**: Google Drive API must be enabled
- **Review Permissions**: User must grant all requested permissions
- **Network Issues**: Check internet connection

#### TTS Not Working
- **Check Browser Support**: Chrome supports Web Speech API
- **Verify Audio**: Ensure system audio is working
- **Language Availability**: Not all languages available on all systems
- **Browser Permissions**: Some sites block audio playback

#### AI Summaries Failing
- **Ollama Issues**: Ensure service is running on port 11434
- **API Key Issues**: Verify Hugging Face API key is valid
- **Rate Limits**: Wait if you hit API rate limits
- **Network Connectivity**: Check internet connection for cloud AI

### Debug Mode

Enable detailed logging:
```javascript
// In browser console
localStorage.setItem('highlighter_debug', 'true');
// Reload page to see detailed logs
```

### Performance Issues

If the extension is slow:
1. **Reduce Highlight Count**: Export and clear old highlights
2. **Disable Auto-Sync**: Turn off automatic Google Drive sync
3. **Use Local AI**: Switch from cloud AI to Ollama
4. **Clear Browser Data**: Clear browsing data for affected sites

## 🔒 Security Notes

### Permissions Explained
- **`storage`**: Store highlights locally
- **`activeTab`**: Access current page content
- **`identity`**: Google OAuth authentication
- **`scripting`**: Inject highlighting functionality
- **`contextMenus`**: Right-click menu options
- **`alarms`**: Periodic sync scheduling
- **`downloads`**: Export functionality

### Privacy Considerations
- **Local Data**: Highlights stored in browser local storage
- **Google Drive**: Data encrypted in transit, stored in your personal Drive
- **AI Processing**:
  - Ollama: Completely local
  - Hugging Face: Data sent to their servers
  - Extractive: Local processing only

### Data Export
Always keep backups:
```
1. Open Highlights Manager
2. Select all highlights
3. Export to JSON format
4. Save backup file locally
```

## 📚 Additional Resources

- **[Google Drive Setup Guide](GOOGLE_DRIVE_SETUP.md)** - Detailed Google Drive configuration
- **[GitHub Issues](https://github.com/your-username/chrome-highlighter/issues)** - Report bugs or request features
- **[Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)** - Official Chrome extension docs

## 🆘 Getting Help

If you encounter issues:

1. **Check this guide** for common solutions
2. **Search existing issues** on GitHub
3. **Create new issue** with:
   - Chrome version
   - Extension version
   - Detailed error description
   - Console error messages (if any)
   - Steps to reproduce

---

**Happy highlighting! 🎯**