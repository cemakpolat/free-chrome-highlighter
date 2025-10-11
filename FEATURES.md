# New Features Guide

## 📖 Reader View

### Overview
Reader View extracts the main content from any webpage and displays it in a clean, distraction-free format optimized for reading.

### Features
- **Clean Layout**: Removes ads, sidebars, navigation, and other distractions
- **Customizable Settings**:
  - Font size (adjustable with A+/A- buttons)
  - Font family (Georgia, Times New Roman, Arial, Verdana, Courier)
  - Three themes: Light, Dark, and Sepia
  - Line height and maximum width optimization
- **Smart Content Extraction**: Uses Mozilla's Readability algorithm to identify main content
- **Metadata Display**: Shows article title, author, and publication date when available
- **Image Preservation**: Keeps relevant images with proper sizing
- **Settings Persistence**: Your preferences are saved for future use

### How to Use

#### Method 1: Context Menu
1. Right-click anywhere on the page
2. Select "📖 Open Reader View"

#### Method 2: Extension Popup
1. Click the extension icon
2. Go to the "Manage" tab
3. Click "📖 Reader View"

#### Method 3: Keyboard Shortcut
- Press `ESC` to exit Reader View

### Controls
- **Exit**: Close reader view and return to original page
- **A-**: Decrease font size
- **A+**: Increase font size
- **🌙**: Toggle between Light, Dark, and Sepia themes
- **Font Dropdown**: Change font family

### Best Practices
- Works best on article pages, blog posts, and long-form content
- May not work well on:
  - Social media sites
  - Search results pages
  - Video streaming sites
  - Web applications

---

## 🎬 Video Annotation & Transcript

### Overview
Video Annotation displays synchronized transcripts alongside videos, with automatic highlighting as the video plays. Perfect for taking notes, studying, and reviewing video content.

### Features
- **Platform Support**:
  - YouTube (automatic transcript extraction)
  - Vimeo (manual transcript input)
  - HTML5 video elements (manual transcript input)
- **Synchronized Highlighting**: Text highlights as the video plays
- **Line Numbers**: Easy reference for specific timestamps
- **Interactive Navigation**: Click any line to jump to that timestamp
- **Search Functionality**: Find specific words or phrases in the transcript
- **Highlight Segments**: Mark important parts for later review
- **Export Transcript**: Save transcript as plain text file
- **Auto-scroll**: Panel automatically scrolls to follow along

### How to Use

#### Method 1: Context Menu
1. Navigate to a page with a video
2. Right-click anywhere on the page
3. Select "🎬 Show Video Transcript"

#### Method 2: Extension Popup
1. Click the extension icon
2. Go to the "Manage" tab
3. Click "🎬 Video Transcript"

### For YouTube Videos
1. Activate Video Annotation
2. If captions are available, they will be automatically extracted
3. If not available, you can manually add a transcript

### For Other Videos
1. Activate Video Annotation
2. A modal will appear asking for transcript input
3. Paste your transcript in one of these formats:

**SRT Format:**
```
1
00:00:00,000 --> 00:00:05,000
This is the first subtitle

2
00:00:05,000 --> 00:00:10,000
This is the second subtitle
```

**Simple Time Format:**
```
0:00 Introduction to the topic
0:30 First main point
1:15 Second main point
2:00 Conclusion
```

### Controls
- **🔄**: Toggle auto-scroll (keeps active line in view)
- **💾**: Export transcript to text file
- **✕**: Close transcript panel
- **Search Box**: Find text within transcript
- **✨** (on hover): Highlight/unhighlight segment

### Features Details

#### Synchronized Highlighting
- Active segment has yellow background
- Automatically scrolls to keep current segment visible
- Updates every 100ms for smooth tracking

#### Interactive Timestamps
- Click any timestamp to jump to that point in the video
- Video automatically starts playing

#### Segment Highlighting
- Hover over a segment to see the highlight button (✨)
- Click to permanently highlight important segments
- Highlighted segments have blue background
- Highlights are saved automatically

#### Search Functionality
- Type in the search box to filter transcript
- Only matching segments are shown
- Clear search to see all segments again

#### Export
- Click the 💾 button to download transcript
- Format: "00:00 - Text content"
- Useful for sharing or archiving

### Keyboard Shortcuts
- `ESC`: Close transcript panel
- `/`: Focus search box (when panel is open)

### Tips & Best Practices

#### For Best Results:
1. **YouTube**: Enable closed captions before activating
2. **Manual Transcripts**: Use consistent timestamp format
3. **Long Videos**: Use search to find specific topics
4. **Note-taking**: Highlight key segments as you watch
5. **Study Sessions**: Export transcript for offline review

#### Troubleshooting:
- **No Transcript Available**: YouTube video must have captions enabled
- **Transcript Not Syncing**: Refresh the page and try again
- **Panel Blocking Video**: Drag panel to reposition (coming soon)

---

## Integration with Existing Features

### Combined with Highlighting
- Use Reader View to focus on content, then highlight important passages
- All highlights work normally in Reader View
- Exit Reader View to see highlights in original context

### Combined with Google Drive Sync
- Reader View settings sync across devices
- Video annotations and highlighted segments sync automatically
- Access your study notes from anywhere

### Combined with AI Summary
- Use Reader View for better content extraction
- Generate AI summaries from video transcripts
- Combine highlights from both features

---

## Advanced Usage

### Reader View + Highlights
1. Activate Reader View for clean reading
2. Highlight important passages as normal
3. Exit Reader View - highlights remain on original page
4. View all highlights in the dashboard

### Video Annotation + Note-taking
1. Activate Video Annotation
2. Play video and highlight key segments
3. Export transcript with timestamps
4. Use highlights as a study guide

### Custom Workflows
- **Research**: Reader View → Highlight → Export
- **Learning**: Video Annotation → Highlight segments → Review dashboard
- **Documentation**: Both features together for comprehensive note-taking

---

## Future Enhancements

### Coming Soon:
- [ ] Draggable video annotation panel
- [ ] Speaker detection in transcripts
- [ ] Transcript editing capabilities
- [ ] Voice annotations
- [ ] Multi-language transcript support
- [ ] Collaboration features
- [ ] Custom keyboard shortcuts
- [ ] Integration with note-taking apps

### Requested Features:
- Timeline view for video annotations
- Side-by-side Reader View comparison
- Automatic transcript generation using AI
- PDF export with highlights
- Smart summary generation

---

## Technical Details

### Browser Compatibility
- Chrome/Edge: Full support
- Firefox: Coming soon
- Safari: Coming soon

### Performance
- Reader View: < 500ms page parsing
- Video Annotation: < 100ms sync interval
- Storage: Settings < 5KB per site

### Privacy
- All processing happens locally
- No data sent to external servers (except Google Drive sync)
- Transcripts stored locally in Chrome storage
- Settings synced via Google Drive (optional)

### Storage
- Reader View settings: Chrome local storage
- Video annotations: Chrome local storage + Google Drive
- Transcripts: Not stored permanently (fetched on demand)

---

## Troubleshooting

### Reader View Issues

**Problem**: Content not extracted correctly
- **Solution**: Try different pages - works best on article-style content

**Problem**: Font settings not saving
- **Solution**: Check Chrome storage permissions

**Problem**: Theme not changing
- **Solution**: Refresh the page and try again

### Video Annotation Issues

**Problem**: Transcript not appearing for YouTube
- **Solution**: Enable captions in YouTube player first

**Problem**: Sync not working
- **Solution**: Pause video, wait 1 second, resume

**Problem**: Search not working
- **Solution**: Click outside search box, then try again

**Problem**: Export fails
- **Solution**: Check download permissions in Chrome

---

## Keyboard Reference

| Key | Action | Context |
|-----|--------|---------|
| `ESC` | Exit Reader View | Reader View active |
| `ESC` | Close Transcript | Video Annotation active |
| `/` | Focus search | Video Annotation active |
| `Space` | Play/Pause video | Video Annotation (native) |

---

## Support

### Getting Help
- Check this documentation first
- Open the Highlights Manager → Help tab
- Report issues on GitHub
- Contact support via extension page

### Known Limitations
- Reader View may not work on heavily JavaScript-based sites
- YouTube transcript extraction requires captions to be available
- Some video platforms may block transcript access
- Large transcripts (> 1000 segments) may cause performance issues

---

## Changelog

### Version 1.1.0 (Current)
- ✨ Added Reader View feature
- ✨ Added Video Annotation feature
- 🎨 Improved popup UI
- 🔧 Added context menu shortcuts
- 📝 Auto-save for settings

### Version 1.0.0
- Initial release with highlighting and Google Drive sync

---

## Credits

- Reader View algorithm inspired by Mozilla's Readability
- Video annotation design inspired by YouTube's transcript feature
- UI/UX patterns from modern web applications

---

## License

Part of Universal Web Highlighter extension
© 2024 - All Rights Reserved
