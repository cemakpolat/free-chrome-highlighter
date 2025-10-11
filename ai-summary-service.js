// ai-summary-service.js - Free AI integration for highlight summarization

class AISummaryService {
  constructor() {
    this.providers = [
      {
        name: 'Ollama (Local)',
        endpoint: 'http://localhost:11434/api/generate',
        headers: { 'Content-Type': 'application/json' },
        requiresAuth: false,
        format: 'ollama'
      },
      {
        name: 'Hugging Face (Free)',
        endpoint: 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
        headers: {},
        requiresAuth: false,
        format: 'huggingface_simple'
      }
    ];
  }

  async generateSummary(highlights, pageTitle = '') {
    // Prepare the text content
    const textContent = this.prepareTextForSummary(highlights, pageTitle);

    if (textContent.length < 50) {
      throw new Error('Not enough content to summarize. Please add more highlights.');
    }

    // Try each provider in order
    for (const provider of this.providers) {
      try {
        console.log(`🤖 Trying ${provider.name} for summary generation...`);
        const summary = await this.tryProvider(provider, textContent);

        if (summary) {
          console.log(`✅ Summary generated successfully using ${provider.name}`);
          return {
            summary: summary,
            provider: provider.name,
            wordCount: summary.split(' ').length,
            originalLength: textContent.length
          };
        }
      } catch (error) {
        console.warn(`❌ ${provider.name} failed:`, error.message);
        continue;
      }
    }

    // If all providers fail, return a basic extractive summary
    console.log('🔄 All AI providers failed, falling back to extractive summary...');
    return this.createExtractiveSummary(highlights, pageTitle);
  }

  prepareTextForSummary(highlights, pageTitle) {
    // Combine all highlight text with context
    let content = pageTitle ? `Title: ${pageTitle}\n\n` : '';

    content += 'Key highlights:\n\n';

    highlights.forEach((highlight, index) => {
      content += `${index + 1}. ${highlight.text}\n`;
      if (highlight.note && highlight.note.trim()) {
        content += `   Note: ${highlight.note}\n`;
      }
      content += '\n';
    });

    return content;
  }

  async tryProvider(provider, textContent) {
    switch (provider.format) {
      case 'ollama':
        return this.callOllama(provider, textContent);
      case 'huggingface_simple':
        return this.callHuggingFaceSimple(provider, textContent);
      case 'huggingface':
        return this.callHuggingFace(provider, textContent);
      case 'openai':
        return this.callOpenAIFormat(provider, textContent);
      default:
        throw new Error(`Unknown provider format: ${provider.format}`);
    }
  }

  async callOllama(provider, textContent) {
    // Local Ollama instance (if available)
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: provider.headers,
        body: JSON.stringify({
          model: 'llama3.2:1b', // Small, fast model
          prompt: `Please create a concise summary of these highlighted text passages:\n\n${textContent}\n\nSummary:`,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 200
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.response) {
        return result.response.trim();
      }

      throw new Error('No response from Ollama');
    } catch (error) {
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Ollama not running locally. Please install and start Ollama or skip this provider.');
      }
      throw error;
    }
  }

  async callHuggingFaceSimple(provider, textContent) {
    // Simplified approach for Hugging Face without auth
    // Use a conversation model to generate summary
    const prompt = `Summarize this in 2-3 sentences: ${textContent.substring(0, 500)}`;

    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...provider.headers
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_length: 100,
            temperature: 0.7,
            return_full_text: false
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      if (Array.isArray(result) && result[0]?.generated_text) {
        return result[0].generated_text.trim();
      }

      throw new Error('Unexpected response format from Hugging Face Simple');
    } catch (error) {
      throw new Error(`Hugging Face Simple failed: ${error.message}`);
    }
  }

  async callHuggingFace(provider, textContent) {
    // Original Hugging Face method (kept for backward compatibility)
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...provider.headers
      },
      body: JSON.stringify({
        inputs: textContent.substring(0, 1024),
        parameters: {
          max_length: 150,
          min_length: 50,
          do_sample: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error);
    }

    if (Array.isArray(result) && result[0]?.summary_text) {
      return result[0].summary_text;
    }

    throw new Error('Unexpected response format from Hugging Face');
  }

  async callOpenAIFormat(provider, textContent) {
    // For providers using OpenAI-compatible format (Groq, Together, etc.)
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...provider.headers
      },
      body: JSON.stringify({
        model: 'llama-3.2-3b-preview', // Free model
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise, informative summaries of highlighted text from web pages. Focus on the key insights and main points. Keep the summary under 200 words.'
          },
          {
            role: 'user',
            content: `Please create a summary of these highlights:\n\n${textContent}`
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.choices && result.choices[0]?.message?.content) {
      return result.choices[0].message.content.trim();
    }

    throw new Error('Unexpected response format from OpenAI-compatible API');
  }

  createExtractiveSummary(highlights, pageTitle) {
    // Fallback: Create a simple extractive summary
    console.log('📝 Creating extractive summary...');

    // Clean and filter highlights to remove navigation text
    const cleanedHighlights = highlights
      .map(h => this.cleanHighlightText(h.text))
      .filter(text => text.length > 20); // Filter out very short snippets

    if (cleanedHighlights.length === 0) {
      return {
        summary: `Summary of ${highlights.length} highlights from "${pageTitle}". The highlighted content appears to contain mainly navigation or interface elements rather than substantive text.`,
        provider: 'Extractive (Fallback)',
        wordCount: 20,
        originalLength: 100,
        isFallback: true
      };
    }

    // Combine all cleaned text
    const allText = cleanedHighlights.join(' ');
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 15);

    if (sentences.length === 0) {
      // If no complete sentences, use the highlights directly
      const summary = cleanedHighlights.slice(0, 3).join('. ') + '.';
      return {
        summary: summary,
        provider: 'Extractive (Fallback)',
        wordCount: summary.split(' ').length,
        originalLength: allText.length,
        isFallback: true
      };
    }

    // Advanced scoring for sentence selection
    const scoredSentences = sentences.map((sentence, index) => {
      const trimmed = sentence.trim();
      let score = 0;

      // Base score: sentence length (longer is usually better for content)
      score += trimmed.length;

      // Boost for sentences with meaningful content indicators
      if (trimmed.match(/\b(because|therefore|however|although|since|while|whereas)\b/i)) {
        score *= 1.3; // Connecting words suggest meaningful content
      }

      // Boost for sentences with numbers/data
      if (trimmed.match(/\d+/)) {
        score *= 1.2;
      }

      // Penalize sentences that look like navigation
      if (trimmed.match(/\b(click|select|menu|button|link|home|about|contact)\b/i)) {
        score *= 0.5;
      }

      // Penalize very short sentences
      if (trimmed.length < 30) {
        score *= 0.7;
      }

      // Boost score if this sentence appears in a highlight with a note
      const hasNote = highlights.some(h =>
        h.text.includes(trimmed) && h.note && h.note.trim()
      );
      if (hasNote) score *= 1.4;

      return { sentence: trimmed, score, index };
    });

    // Sort by score and take top sentences
    const numSentences = Math.min(3, Math.max(1, sentences.length));
    const topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, numSentences)
      .sort((a, b) => a.index - b.index) // Restore original order
      .map(item => item.sentence);

    let summary = topSentences.join('. ');
    if (!summary.endsWith('.')) {
      summary += '.';
    }

    // Add context if page title is available
    if (pageTitle && !summary.toLowerCase().includes(pageTitle.toLowerCase().substring(0, 20))) {
      summary = `From "${pageTitle}": ${summary}`;
    }

    return {
      summary: summary,
      provider: 'Extractive (Fallback)',
      wordCount: summary.split(' ').length,
      originalLength: allText.length,
      isFallback: true
    };
  }

  cleanHighlightText(text) {
    // Clean up highlight text to remove navigation elements
    return text
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Remove common navigation patterns
      .replace(/^(Home|About|Contact|Menu|Navigation|Skip to|Sign in|Log in|Register)\b/i, '')
      // Remove standalone numbers/bullets
      .replace(/^\d+\.\s*$/, '')
      // Remove single words that are likely navigation
      .replace(/^(Next|Previous|Back|Forward|Up|Down)$/i, '')
      .trim();
  }

  // Configure API keys (optional, for better results)
  setApiKey(provider, apiKey) {
    const providerConfig = this.providers.find(p =>
      p.name.toLowerCase().includes(provider.toLowerCase())
    );

    if (providerConfig) {
      providerConfig.headers['Authorization'] = `Bearer ${apiKey}`;
      providerConfig.requiresAuth = false; // Mark as configured
      console.log(`🔑 API key configured for ${providerConfig.name}`);
    }
  }

  // Check which providers are available
  async checkAvailability() {
    const status = {};

    for (const provider of this.providers) {
      try {
        // Simple health check
        const response = await fetch(provider.endpoint, {
          method: 'OPTIONS',
          headers: provider.headers
        });

        status[provider.name] = {
          available: true,
          authenticated: !provider.requiresAuth,
          endpoint: provider.endpoint
        };
      } catch (error) {
        status[provider.name] = {
          available: false,
          error: error.message
        };
      }
    }

    return status;
  }
}

// Export for use in highlight manager
window.AISummaryService = AISummaryService;