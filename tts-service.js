// tts-service.js - Text-to-Speech service for highlights

class TTSService {
  constructor() {
    this.speechSynth = window.speechSynthesis;
    this.currentUtterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentHighlightId = null;
    this.voices = [];
    this.isStopping = false; // Flag to track intentional stops
    this.detectedLanguage = null; // Detected page language
    this.settings = {
      rate: 0.9,        // Slightly slower for better comprehension
      pitch: 1.0,       // Natural pitch
      volume: 0.9,      // Higher volume for clarity
      voice: null,      // Selected voice
      autoLanguage: true // Auto-detect language from page
    };

    this.init();
  }

  async init() {
    // Detect page language
    this.detectPageLanguage();

    // Load voices when available
    this.loadVoices();

    // Listen for voices changed event
    this.speechSynth.addEventListener('voiceschanged', () => {
      this.loadVoices();
    });

    // Load saved settings
    await this.loadSettings();
  }

  detectPageLanguage() {
    try {
      // Try multiple methods to detect page language
      let detectedLang = null;

      // Method 1: HTML lang attribute
      const htmlLang = document.documentElement.lang;
      if (htmlLang) {
        detectedLang = htmlLang.toLowerCase();
        console.log(`🌐 Language from HTML lang attribute: ${detectedLang}`);
      }

      // Method 2: Meta content-language tag
      if (!detectedLang) {
        const metaLang = document.querySelector('meta[http-equiv="content-language"]');
        if (metaLang && metaLang.content) {
          detectedLang = metaLang.content.toLowerCase();
          console.log(`🌐 Language from meta content-language: ${detectedLang}`);
        }
      }

      // Method 3: Meta og:locale tag (Open Graph)
      if (!detectedLang) {
        const ogLocale = document.querySelector('meta[property="og:locale"]');
        if (ogLocale && ogLocale.content) {
          detectedLang = ogLocale.content.toLowerCase().replace('_', '-');
          console.log(`🌐 Language from Open Graph locale: ${detectedLang}`);
        }
      }

      // Method 4: Browser language as fallback
      if (!detectedLang) {
        detectedLang = navigator.language || navigator.userLanguage || 'en-us';
        console.log(`🌐 Language from browser: ${detectedLang}`);
      }

      // Normalize language code (e.g., "en-US" -> "en", "fr-FR" -> "fr")
      this.detectedLanguage = this.normalizeLanguageCode(detectedLang);
      console.log(`🎯 Detected page language: ${this.detectedLanguage}`);

    } catch (error) {
      console.error('Error detecting page language:', error);
      this.detectedLanguage = 'en'; // Default to English
    }
  }

  normalizeLanguageCode(langCode) {
    if (!langCode) return 'en';

    // Extract the primary language code (before any hyphen or underscore)
    const primaryLang = langCode.split(/[-_]/)[0].toLowerCase();

    // Map common language codes
    const languageMap = {
      'en': 'en',    // English
      'es': 'es',    // Spanish
      'fr': 'fr',    // French
      'de': 'de',    // German
      'it': 'it',    // Italian
      'pt': 'pt',    // Portuguese
      'ru': 'ru',    // Russian
      'ja': 'ja',    // Japanese
      'ko': 'ko',    // Korean
      'zh': 'zh',    // Chinese
      'ar': 'ar',    // Arabic
      'hi': 'hi',    // Hindi
      'nl': 'nl',    // Dutch
      'sv': 'sv',    // Swedish
      'da': 'da',    // Danish
      'no': 'no',    // Norwegian
      'fi': 'fi',    // Finnish
      'pl': 'pl',    // Polish
      'tr': 'tr',    // Turkish
    };

    return languageMap[primaryLang] || 'en'; // Default to English if not found
  }

  loadVoices() {
    this.voices = this.speechSynth.getVoices();

    // Auto-select voice based on detected language
    if (this.settings.autoLanguage && this.detectedLanguage && !this.settings.voice) {
      this.selectVoiceForLanguage(this.detectedLanguage);
    } else if (!this.settings.voice) {
      // Fallback to English voices
      this.selectVoiceForLanguage('en');
    }

    console.log(`🔊 Loaded ${this.voices.length} voices`);
    console.log(`🎯 Selected voice: ${this.settings.voice?.name || 'None'} (${this.settings.voice?.lang || 'N/A'})`);
  }

  selectVoiceForLanguage(languageCode) {
    // Get voices for the target language
    const languageVoices = this.voices.filter(voice => {
      const voiceLang = voice.lang.toLowerCase().split(/[-_]/)[0];
      return voiceLang === languageCode.toLowerCase();
    });

    if (languageVoices.length > 0) {
      const bestVoice = this.selectBestVoice(languageVoices, languageCode);
      this.settings.voice = bestVoice;
      console.log(`🌐 Selected ${languageCode} voice: ${bestVoice?.name} (${bestVoice?.lang})`);
    } else {
      // Fallback to English if no voices found for target language
      const englishVoices = this.voices.filter(voice => voice.lang.startsWith('en'));
      if (englishVoices.length > 0) {
        this.settings.voice = this.selectBestVoice(englishVoices, 'en');
        console.log(`⚠️ No ${languageCode} voices found, using English fallback`);
      }
    }
  }

  selectBestVoice(voicesForLanguage, languageCode) {
    if (!voicesForLanguage || voicesForLanguage.length === 0) {
      return null;
    }

    // Language-specific preferred voices
    const preferredVoicesByLanguage = {
      'en': [
        // English voices
        'Microsoft Aria Online (Natural)',
        'Microsoft Jenny Online (Natural)',
        'Microsoft Guy Online (Natural)',
        'Google US English',
        'Google UK English Female',
        'Samantha', 'Alex', 'Victoria',
        'Microsoft Zira Desktop'
      ],
      'es': [
        // Spanish voices
        'Microsoft Elvira Online (Natural)',
        'Microsoft Alba Online (Natural)',
        'Google español',
        'Google español de Estados Unidos',
        'Paulina', 'Mónica'
      ],
      'fr': [
        // French voices
        'Microsoft Denise Online (Natural)',
        'Microsoft Henri Online (Natural)',
        'Google français',
        'Thomas', 'Amélie'
      ],
      'de': [
        // German voices
        'Microsoft Katja Online (Natural)',
        'Microsoft Klaus Online (Natural)',
        'Google Deutsch',
        'Anna', 'Petra'
      ],
      'it': [
        // Italian voices
        'Microsoft Elsa Online (Natural)',
        'Microsoft Giuseppe Online (Natural)',
        'Google italiano',
        'Alice', 'Luca'
      ],
      'pt': [
        // Portuguese voices
        'Microsoft Raquel Online (Natural)',
        'Microsoft Duarte Online (Natural)',
        'Google português do Brasil',
        'Luciana', 'Felipe'
      ],
      'ja': [
        // Japanese voices
        'Microsoft Nanami Online (Natural)',
        'Microsoft Keita Online (Natural)',
        'Google 日本語',
        'Kyoko', 'Otoya'
      ],
      'zh': [
        // Chinese voices
        'Microsoft Xiaoxiao Online (Natural)',
        'Microsoft Yunyang Online (Natural)',
        'Google 普通话（中国大陆）',
        'Ting-Ting', 'Sin-ji'
      ]
    };

    const preferredVoices = preferredVoicesByLanguage[languageCode] || [];

    // First, try to find language-specific preferred voices
    for (const preferredName of preferredVoices) {
      const voice = voicesForLanguage.find(v =>
        v.name.toLowerCase().includes(preferredName.toLowerCase())
      );
      if (voice) {
        console.log(`🎯 Found preferred ${languageCode} voice: ${voice.name}`);
        return voice;
      }
    }

    // Next, look for voices with quality indicators
    const qualityKeywords = ['neural', 'natural', 'enhanced', 'premium', 'online'];
    for (const keyword of qualityKeywords) {
      const voice = voicesForLanguage.find(v =>
        v.name.toLowerCase().includes(keyword)
      );
      if (voice) {
        console.log(`🎯 Found quality ${languageCode} voice: ${voice.name}`);
        return voice;
      }
    }

    // Finally, return the first available voice for this language
    const fallbackVoice = voicesForLanguage[0];
    console.log(`🎯 Using fallback ${languageCode} voice: ${fallbackVoice?.name}`);
    return fallbackVoice;
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['tts_settings']);
      if (result.tts_settings) {
        this.settings = { ...this.settings, ...result.tts_settings };

        // Restore voice by name since voice objects don't serialize
        if (result.tts_settings.voiceName) {
          const voice = this.voices.find(v => v.name === result.tts_settings.voiceName);
          if (voice) {
            this.settings.voice = voice;
          }
        }
      }
    } catch (error) {
      console.error('Error loading TTS settings:', error);
    }
  }

  async saveSettings() {
    try {
      const settingsToSave = {
        ...this.settings,
        voiceName: this.settings.voice ? this.settings.voice.name : null,
        voice: undefined // Don't save the voice object directly
      };

      await chrome.storage.local.set({ tts_settings: settingsToSave });
    } catch (error) {
      console.error('Error saving TTS settings:', error);
    }
  }

  speak(text, highlightId = null, options = {}) {
    // Stop any current speech
    this.stop();

    if (!text || text.trim().length === 0) {
      console.warn('No text provided for TTS');
      return;
    }

    // Auto-select voice based on page language if enabled and no specific voice provided
    if (this.settings.autoLanguage && !options.voice && this.detectedLanguage) {
      const targetLanguageVoices = this.voices.filter(voice => {
        const voiceLang = voice.lang.toLowerCase().split(/[-_]/)[0];
        return voiceLang === this.detectedLanguage.toLowerCase();
      });

      if (targetLanguageVoices.length > 0) {
        const bestVoice = this.selectBestVoice(targetLanguageVoices, this.detectedLanguage);
        if (bestVoice) {
          options.voice = bestVoice;
          console.log(`🌐 Auto-selected ${this.detectedLanguage} voice: ${bestVoice.name}`);
        }
      }
    }

    // Enhance text for better speech output
    const enhancedText = this.enhanceTextForSpeech(text);

    // Create new utterance
    this.currentUtterance = new SpeechSynthesisUtterance(enhancedText);
    this.currentHighlightId = highlightId;

    // Apply settings
    this.currentUtterance.rate = options.rate || this.settings.rate;
    this.currentUtterance.pitch = options.pitch || this.settings.pitch;
    this.currentUtterance.volume = options.volume || this.settings.volume;
    this.currentUtterance.voice = options.voice || this.settings.voice;

    // Set the language if detected
    if (this.detectedLanguage && this.settings.autoLanguage) {
      // Map our language codes to Speech Synthesis language codes
      const speechLangMap = {
        'en': 'en-US',
        'es': 'es-ES',
        'fr': 'fr-FR',
        'de': 'de-DE',
        'it': 'it-IT',
        'pt': 'pt-BR',
        'ja': 'ja-JP',
        'zh': 'zh-CN',
        'ru': 'ru-RU',
        'ar': 'ar-SA',
        'hi': 'hi-IN',
        'nl': 'nl-NL',
        'sv': 'sv-SE',
        'da': 'da-DK',
        'no': 'nb-NO',
        'fi': 'fi-FI',
        'pl': 'pl-PL',
        'tr': 'tr-TR'
      };

      this.currentUtterance.lang = speechLangMap[this.detectedLanguage] || 'en-US';
    }

    // Set up event handlers
    this.currentUtterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      this.onStart(highlightId);
      console.log('🔊 TTS started');
    };

    this.currentUtterance.onend = () => {
      this.isPlaying = false;
      this.isPaused = false;
      this.currentHighlightId = null;
      this.onEnd(highlightId);
      console.log('🔊 TTS ended');
    };

    this.currentUtterance.onpause = () => {
      this.isPaused = true;
      this.onPause(highlightId);
      console.log('⏸️ TTS paused');
    };

    this.currentUtterance.onresume = () => {
      this.isPaused = false;
      this.onResume(highlightId);
      console.log('▶️ TTS resumed');
    };

    this.currentUtterance.onerror = (event) => {
      this.isPlaying = false;
      this.isPaused = false;
      this.onError(event.error, highlightId);

      // Don't log errors for intentional stops
      if (!this.isStopping || event.error !== 'interrupted') {
        console.error('❌ TTS error:', event.error);
      }
    };

    // Start speaking
    this.speechSynth.speak(this.currentUtterance);

    return this.currentUtterance;
  }

  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.speechSynth.pause();
    }
  }

  resume() {
    if (this.isPlaying && this.isPaused) {
      this.speechSynth.resume();
    }
  }

  stop() {
    if (this.isPlaying || this.isPaused) {
      this.isStopping = true; // Mark as intentional stop
      this.speechSynth.cancel();
      this.isPlaying = false;
      this.isPaused = false;
      this.currentHighlightId = null;
      // Reset flag after a short delay
      setTimeout(() => {
        this.isStopping = false;
      }, 100);
    }
  }

  // Event handlers (can be overridden)
  onStart(highlightId) {
    this.updateHighlightPlayState(highlightId, 'playing');
  }

  onEnd(highlightId) {
    this.updateHighlightPlayState(highlightId, 'stopped');
  }

  onPause(highlightId) {
    this.updateHighlightPlayState(highlightId, 'paused');
  }

  onResume(highlightId) {
    this.updateHighlightPlayState(highlightId, 'playing');
  }

  onError(error, highlightId) {
    // Don't log errors for intentional stops (interruptions)
    if (this.isStopping && error === 'interrupted') {
      console.log('🛑 TTS intentionally stopped');
      return;
    }

    this.updateHighlightPlayState(highlightId, 'error');
    console.error('TTS Error:', error);
  }

  updateHighlightPlayState(highlightId, state) {
    if (!highlightId) return;

    // Find highlight element and update its visual state
    const highlightElement = document.querySelector(`[data-highlight-id="${highlightId}"]`);
    if (highlightElement) {
      // Remove all TTS state classes
      highlightElement.classList.remove('tts-playing', 'tts-paused', 'tts-error');

      // Add current state class
      if (state !== 'stopped') {
        highlightElement.classList.add(`tts-${state}`);
      }

      // Update TTS button if it exists
      const ttsButton = highlightElement.querySelector('.tts-btn');
      if (ttsButton) {
        this.updateTTSButton(ttsButton, state);
      }
    }
  }

  updateTTSButton(button, state) {
    switch (state) {
      case 'playing':
        button.innerHTML = '⏸️';
        button.title = 'Pause speech';
        break;
      case 'paused':
        button.innerHTML = '▶️';
        button.title = 'Resume speech';
        break;
      case 'stopped':
      default:
        button.innerHTML = '🔊';
        button.title = 'Listen to highlight';
        break;
    }
  }

  // Get available voices grouped by language
  getVoicesByLanguage() {
    const grouped = {};

    this.voices.forEach(voice => {
      const lang = voice.lang.split('-')[0]; // Get primary language code
      if (!grouped[lang]) {
        grouped[lang] = [];
      }
      grouped[lang].push(voice);
    });

    return grouped;
  }

  // Set voice by name
  setVoice(voiceName) {
    const voice = this.voices.find(v => v.name === voiceName);
    if (voice) {
      this.settings.voice = voice;
      this.saveSettings();
      return true;
    }
    return false;
  }

  // Update settings
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  // Get current status
  getStatus() {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentHighlightId: this.currentHighlightId,
      voicesAvailable: this.voices.length,
      settings: this.settings
    };
  }

  enhanceTextForSpeech(text) {
    let enhanced = text;

    // Add natural pauses
    enhanced = enhanced
      // Add pause after periods, exclamations, and questions
      .replace(/([.!?])\s+/g, '$1 ')

      // Add pause after commas
      .replace(/,\s+/g, ', ')

      // Add pause after colons and semicolons
      .replace(/([;:])\s+/g, '$1 ')

      // Expand common abbreviations for better pronunciation
      .replace(/\bw\/\b/g, 'with')
      .replace(/\b&\b/g, 'and')
      .replace(/\bw\b/g, 'with')
      .replace(/\bvs\.?\b/gi, 'versus')
      .replace(/\betc\.?\b/gi, 'etcetera')
      .replace(/\be\.g\.?\b/gi, 'for example')
      .replace(/\bi\.e\.?\b/gi, 'that is')
      .replace(/\bURL\b/gi, 'U R L')
      .replace(/\bAPI\b/gi, 'A P I')
      .replace(/\bHTML\b/gi, 'H T M L')
      .replace(/\bCSS\b/gi, 'C S S')
      .replace(/\bJS\b/gi, 'JavaScript')

      // Handle numbers better
      .replace(/\$(\d+)/g, '$1 dollars')
      .replace(/(\d+)%/g, '$1 percent')
      .replace(/(\d+)°/g, '$1 degrees')

      // Handle quotes better
      .replace(/"/g, ' quote ')
      .replace(/'/g, ' ')

      // Clean up extra spaces
      .replace(/\s+/g, ' ')
      .trim();

    return enhanced;
  }

  // Speak multiple highlights in sequence
  async speakHighlights(highlights, options = {}) {
    if (!Array.isArray(highlights) || highlights.length === 0) {
      console.warn('No highlights provided for batch TTS');
      return;
    }

    const combinedText = highlights
      .map((highlight, index) => {
        let text = highlight.text;

        // Add note if available
        if (highlight.note && highlight.note.trim()) {
          text += `. Note: ${highlight.note}`;
        }

        // Add pause between highlights
        if (index < highlights.length - 1) {
          text += '. '; // Natural pause
        }

        return text;
      })
      .join(' ');

    return this.speak(combinedText, null, options);
  }

  // Language detection and control methods
  getDetectedLanguage() {
    return this.detectedLanguage;
  }

  setAutoLanguage(enabled) {
    this.settings.autoLanguage = enabled;
    this.saveSettings();
    console.log(`🌐 Auto-language detection ${enabled ? 'enabled' : 'disabled'}`);
  }

  isAutoLanguageEnabled() {
    return this.settings.autoLanguage;
  }

  forceLanguage(languageCode) {
    // Temporarily override detected language
    const oldLang = this.detectedLanguage;
    this.detectedLanguage = this.normalizeLanguageCode(languageCode);

    // Re-select voice for new language
    this.selectVoiceForLanguage(this.detectedLanguage);

    console.log(`🌐 Forced language change from ${oldLang} to ${this.detectedLanguage}`);
  }

  resetLanguageDetection() {
    // Re-detect page language
    this.detectPageLanguage();

    // Re-select voice for detected language
    if (this.settings.autoLanguage && this.detectedLanguage) {
      this.selectVoiceForLanguage(this.detectedLanguage);
    }

    console.log(`🌐 Language detection reset to: ${this.detectedLanguage}`);
  }

  getSupportedLanguages() {
    // Get unique languages from available voices
    const languages = new Set();
    this.voices.forEach(voice => {
      const lang = voice.lang.toLowerCase().split(/[-_]/)[0];
      languages.add(lang);
    });

    return Array.from(languages).sort();
  }

  getLanguageInfo() {
    return {
      detected: this.detectedLanguage,
      autoEnabled: this.settings.autoLanguage,
      currentVoice: this.settings.voice ? {
        name: this.settings.voice.name,
        lang: this.settings.voice.lang
      } : null,
      supportedLanguages: this.getSupportedLanguages()
    };
  }
}

// Make it available globally
window.TTSService = TTSService;