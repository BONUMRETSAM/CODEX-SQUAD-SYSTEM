const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images and respond in the SAME language as the image',
  usage: 'Send an image and the bot will analyze it',
  version: '29.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 10,

  async execute(senderId, args, token, event) {
    try {
      console.log('[gemini] ===== START =====');
      
      const imageUrl = await this.extractImageUrl(event, token);
      console.log('[gemini] Image URL:', imageUrl ? 'OK' : 'NULL');

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
        return;
      }

      const userPrompt = args.join(' ').trim() || 'Analyze this image';
      const detectedLanguage = this.detectLanguage(userPrompt || '');
      const wantsSolution = this.detectSolutionRequest(userPrompt);
      
      console.log('[gemini] Prompt:', userPrompt);
      console.log('[gemini] Language:', detectedLanguage);
      console.log('[gemini] Wants solution:', wantsSolution);

      // ===== Try OCR =====
      let ocrText = '';
      let ocrSuccess = false;

      try {
        ocrText = await this.extractTextFromImage(imageUrl);
        if (ocrText && ocrText.length > 10) {
          ocrSuccess = true;
          console.log('[OCR] Success! Length:', ocrText.length);
        } else {
          console.log('[OCR] Failed or too short');
        }
      } catch (error) {
        console.log('[OCR] Error:', error.message);
      }

      // ===== Detect language =====
      let imageLanguage = detectedLanguage || 'english';
      if (ocrSuccess && ocrText) {
        imageLanguage = this.detectLanguageFromText(ocrText);
      }
      console.log('[gemini] Final language:', imageLanguage);

      // ===== Build prompt =====
      let questions = [];
      let contentType = 'general';
      let prompt = '';

      if (ocrSuccess) {
        contentType = this.detectContentType(ocrText);
        questions = this.extractAllQuestions(ocrText, contentType);
        console.log('[gemini] Content type:', contentType);
        console.log('[gemini] Questions found:', questions.length);
        prompt = this.buildForceAnswerPrompt(ocrText, questions, userPrompt, imageLanguage, contentType, wantsSolution);
      } else {
        prompt = this.buildDirectVisionPrompt(userPrompt, imageLanguage, wantsSolution);
      }

      // ===== Call AI with GRACEFUL FALLBACK =====
      let cleanResponse = '';
      let apiError = null;

      try {
        if (ocrSuccess && questions.length > 0) {
          cleanResponse = await this.callAIWithFallback(prompt, imageUrl);
          cleanResponse = this.cleanResponse(cleanResponse);
          cleanResponse = await this.verifyAndComplete(cleanResponse, questions, imageUrl, imageLanguage, wantsSolution);
        } else {
          cleanResponse = await this.callDirectVision(imageUrl, userPrompt, imageLanguage, wantsSolution);
        }
      } catch (error) {
        apiError = error;
        console.log('[gemini] API call failed:', error.message);
      }

      // ===== If API failed, use emergency fallback =====
      if (!cleanResponse || cleanResponse.length < 3) {
        console.log('[gemini] Trying emergency fallback...');
        try {
          cleanResponse = await this.emergencyFallback(imageUrl, userPrompt, wantsSolution);
        } catch (err) {
          console.log('[gemini] Emergency fallback failed:', err.message);
        }
      }

      // ===== Final cleanup =====
      cleanResponse = this.removePartIndicators(cleanResponse);
      cleanResponse = this.finalCleanup(cleanResponse, wantsSolution);

      console.log('[gemini] Final response length:', cleanResponse.length);

      if (!cleanResponse || cleanResponse.length < 3) {
        await sendMessage(senderId, { text: this.getErrorMessage(apiError || new Error('Empty response')) }, token);
        return;
      }

      cleanResponse = cleanResponse.substring(0, 8000);
      await this.sendAllChunks(senderId, cleanResponse, token);
      
      console.log('[gemini] ===== DONE =====');

    } catch (error) {
      console.error('[gemini] Fatal error:', error.message);
      await sendMessage(senderId, { text: 'Error analyzing image. Please try again.' }, token);
    }
  },

  // ============================================================
  // EMERGENCY FALLBACK - Direct simple API call
  // ============================================================
  async emergencyFallback(imageUrl, userPrompt, wantsSolution) {
    console.log('[Emergency] Trying raw Gemini API call...');
    
    const prompt = wantsSolution
      ? `Analyze this image and answer with brief explanation. User: ${userPrompt}`
      : `Analyze this image and give the direct answer only. User: ${userPrompt}`;

    const url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(prompt)}&imageurl=${encodeURIComponent(imageUrl)}`;

    const response = await axios.get(url, {
      timeout: 90000,
      headers: { 'Accept': 'application/json' }
    });

    if (response.status === 200 && response.data && response.data.response) {
      console.log('[Emergency] Success!');
      return response.data.response;
    }

    // Try Chipp fallback
    console.log('[Emergency] Trying Chipp AI...');
    const chippUrl = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(prompt)}&url=${encodeURIComponent(imageUrl)}`;
    const chippResponse = await axios.get(chippUrl, { timeout: 60000 });

    if (chippResponse.data && chippResponse.data.status === true && chippResponse.data.response) {
      console.log('[Emergency] Chipp success!');
      return chippResponse.data.response;
    }

    throw new Error('Emergency fallback failed');
  },

  // ============================================================
  // FINAL CLEANUP - REMOVES ALL DUPLICATES
  // ============================================================
  finalCleanup(response, wantsSolution) {
    if (!response) return '';

    let cleaned = response;

    // 1. Remove ALL "Answer:" prefixes first
    cleaned = cleaned.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');

    // 2. If user did NOT ask for solution, strip all explanations
    if (!wantsSolution) {
      cleaned = cleaned
        .replace(/EXPLANATION:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/Explanation:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/REASONING:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/Reasoning:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/SOLUTION:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/Solution:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/STEPS?:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/Steps?:[\s\S]*?(?=\n\d+\.|$)/gi, '');
    }

    // 3. Split into lines and remove duplicate numbered items
    const lines = cleaned.split('\n');
    const seenNumbers = new Set();
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        result.push('');
        continue;
      }

      const numMatch = trimmed.match(/^(\d+)\.\s*(.*)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        const content = numMatch[2].trim();

        if (seenNumbers.has(num)) continue;
        seenNumbers.add(num);
        result.push(`${num}. ${content}`);
      } else {
        const lastLine = result[result.length - 1];
        if (lastLine !== trimmed) {
          result.push(trimmed);
        }
      }
    }

    cleaned = result.join('\n');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.trim();

    if (cleaned && !cleaned.match(/^(Answer|Sagot|ANSWER):/i)) {
      cleaned = 'Answer: ' + cleaned;
    }

    return cleaned;
  },

  detectSolutionRequest(userPrompt) {
    if (!userPrompt) return false;
    const lower = userPrompt.toLowerCase();
    const solutionKeywords = [
      'explain', 'why', 'how', 'solution', 'solve', 'step by step',
      'paliwanag', 'bakit', 'paano', 'ipaliwanag', 'sagot at solusyon',
      'show work', 'show solution', 'detailed', 'reasoning',
      'prove', 'derive', 'justify', 'show steps', 'with solution'
    ];
    return solutionKeywords.some(kw => lower.includes(kw));
  },

  detectLanguageFromText(text) {
    if (!text) return 'english';
    const lower = text.toLowerCase();

    const englishKeywords = ['the', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'will', 'would', 'should', 'can', 'could', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'about', 'and', 'or', 'but', 'not', 'this', 'that', 'these', 'those'];
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'ni', 'kay', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'po', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'dapat', 'kailangan', 'meron', 'wala', 'hindi', 'oo', 'salamat', 'tanong', 'sagot', 'tulong', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'tabang', 'pasabta'];

    const codingKeywords = ['python', 'java', 'javascript', 'print', 'function', 'class', 'variable', 'array', 'object', 'string', 'integer', 'loop', 'return', 'import'];
    const mathKeywords = ['solve', 'equation', 'formula', 'calculate', 'x =', 'y =', 'plus', 'minus', 'times', 'divided', 'sum', 'product'];

    for (const kw of codingKeywords) {
      if (lower.includes(kw)) return 'english';
    }
    for (const kw of mathKeywords) {
      if (lower.includes(kw)) return 'english';
    }

    if (lower.match(/[a-d]\)/g) || lower.match(/[a-d]\./g)) {
      return 'english';
    }

    let englishCount = 0, tagalogCount = 0, bisayaCount = 0;
    const words = lower.split(/\s+/);
    for (const word of words) {
      if (englishKeywords.includes(word)) englishCount++;
      if (tagalogKeywords.includes(word)) tagalogCount++;
      if (bisayaKeywords.includes(word)) bisayaCount++;
    }

    if (tagalogCount >= 2 && tagalogCount > englishCount) return 'tagalog';
    if (bisayaCount >= 2 && bisayaCount > englishCount) return 'bisaya';
    return 'english';
  },

  async verifyAndComplete(response, questions, imageUrl, language, wantsSolution) {
    let verified = response;
    const lines = verified.split('\n');
    const answeredNumbers = new Set();

    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*/);
      if (match) answeredNumbers.add(parseInt(match[1]));
    }

    const missingQuestions = questions.filter(q => !answeredNumbers.has(q.number));

    if (missingQuestions.length > 0) {
      console.log('[Verify] Missing:', missingQuestions.map(q => q.number).join(', '));
      const langName = this.getLanguageName(language);

      const missingPrompt = wantsSolution
        ? `Answer these questions with brief explanation:\n${missingQuestions.map(q => `${q.number}. ${q.text}`).join('\n')}\nRespond in ${langName.toUpperCase()}.`
        : `Answer these questions ONLY:\n${missingQuestions.map(q => `${q.number}. ${q.text}`).join('\n')}\nRespond in ${langName.toUpperCase()}.`;

      try {
        const missingAnswers = await this.callAIWithFallback(missingPrompt, imageUrl);
        const cleanMissing = this.cleanResponse(missingAnswers);
        const missingWithoutPrefix = cleanMissing.replace(/^(Answer|Sagot|ANSWER):\s*/i, '');
        if (missingWithoutPrefix.trim()) {
          verified += '\n' + missingWithoutPrefix;
        }
      } catch (e) {
        console.log('[Verify] Failed:', e.message);
      }
    }

    return verified;
  },

  buildForceAnswerPrompt(ocrText, questions, userPrompt, language, contentType, wantsSolution) {
    const langName = this.getLanguageName(language);

    let prompt = `CRITICAL: Answer EVERY numbered question below.

EXTRACTED TEXT:
${ocrText}

QUESTIONS:
${questions.map(q => `${q.number}. ${q.text}`).join('\n')}

RULES:
1. Answer EVERY numbered question.
2. Start directly. NO introduction.
3. NO emojis, NO markdown.
4. Respond in ${langName.toUpperCase()}.`;

    if (wantsSolution) {
      prompt += `\n\nProvide answer with brief explanation:\n1. [Answer] - [Brief explanation]`;
    } else {
      prompt += `\n\nGive ONLY the direct answers:\n1. [Answer]\n2. [Answer]`;
    }

    if (userPrompt) prompt += `\n\nAdditional: ${userPrompt}`;
    return prompt;
  },

  buildDirectVisionPrompt(userPrompt, language, wantsSolution) {
    const langName = this.getLanguageName(language);

    if (wantsSolution) {
      return `Analyze this image and provide answer with solution. User: ${userPrompt}\nRules: Answer directly with brief explanation. NO introduction. NO markdown. Respond in ${langName.toUpperCase()}.`;
    } else {
      return `Analyze this image and give the direct answer only. User: ${userPrompt}\nRules: Give ONLY the answer. NO explanation. NO markdown. Respond in ${langName.toUpperCase()}.`;
    }
  },

  async callDirectVision(imageUrl, userPrompt, language, wantsSolution) {
    const langName = this.getLanguageName(language);

    let visionPrompt = wantsSolution
      ? `Analyze this image and provide answer with solution. User: ${userPrompt}\nRules: Answer directly with brief explanation. NO markdown. Respond in ${langName.toUpperCase()}.`
      : `Analyze this image and give ONLY the direct answer. User: ${userPrompt}\nRules: Give ONLY the answer. NO explanation. NO markdown. Respond in ${langName.toUpperCase()}.`;

    try {
      const url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(visionPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      console.log('[DirectVision] Calling Gemini...');

      const response = await axios.get(url, {
        timeout: 120000,
        headers: { 'Accept': 'application/json' }
      });

      if (response.status === 200 && response.data) {
        const result = response.data.response || response.data.message || '';
        if (result && result.length > 10) {
          console.log('[DirectVision] Gemini OK');
          return this.cleanResponse(result);
        }
      }

      throw new Error('Gemini returned empty');

    } catch (error) {
      console.log('[DirectVision] Gemini failed:', error.message);
      console.log('[DirectVision] Trying Chipp AI...');

      try {
        const chippUrl = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(visionPrompt)}&url=${encodeURIComponent(imageUrl)}`;
        const chippResponse = await axios.get(chippUrl, {
          timeout: 60000,
          headers: { 'Accept': 'application/json' }
        });

        if (chippResponse.data && chippResponse.data.status === true && chippResponse.data.response) {
          console.log('[DirectVision] Chipp OK');
          return this.cleanResponse(chippResponse.data.response);
        }
      } catch (chippError) {
        console.log('[DirectVision] Chipp failed:', chippError.message);
      }

      throw new Error('All direct vision methods failed');
    }
  },

  extractAllQuestions(ocrText, contentType) {
    const questions = [];
    const lines = ocrText.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        questions.push({
          number: parseInt(match[1]),
          text: match[2].trim()
        });
      }
    }

    return questions;
  },

  detectContentType(ocrText) {
    const combined = ocrText.toLowerCase();
    if (combined.includes('part i') || combined.includes('part ii') || combined.includes('part iii')) return 'activity_sheet';
    if (combined.includes('solve') || combined.includes('equation')) return 'math';
    if (combined.includes('logic') || combined.includes('puzzle')) return 'logic';
    if (combined.includes('multiple choice') || combined.includes('choose')) return 'multiple_choice';
    if (combined.includes('python') || combined.includes('java') || combined.includes('javascript')) return 'coding';
    return 'general';
  },

  async callAIWithFallback(prompt, imageUrl) {
    try {
      console.log('[AI] Trying Gemini...');
      const result = await this.callGeminiWithRetry(prompt, imageUrl);
      if (result && result.length > 10) {
        console.log('[AI] Gemini OK');
        return this.cleanResponse(result);
      }
    } catch (error) {
      console.log('[AI] Gemini failed:', error.message);
    }

    try {
      console.log('[AI] Trying Chipp...');
      const result = await this.callChippAI(prompt, imageUrl);
      if (result && result.length > 10) {
        console.log('[AI] Chipp OK');
        return this.cleanResponse(result);
      }
    } catch (error) {
      console.log('[AI] Chipp failed:', error.message);
    }

    throw new Error('All AI services failed');
  },

  async callChippAI(prompt, imageUrl) {
    const url = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(prompt)}&url=${encodeURIComponent(imageUrl)}`;
    const response = await axios.get(url, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });

    if (response.data && response.data.status === true && response.data.response) {
      return response.data.response;
    }
    throw new Error('Chipp invalid response');
  },

  async extractTextFromImage(imageUrl) {
    try {
      const apiKey = 'K85096363488957';
      const url = `https://api.ocr.space/parse/imageurl?apikey=${apiKey}&url=${encodeURIComponent(imageUrl)}&language=eng,tgl&isOverlayRequired=false`;

      const response = await axios.get(url, {
        timeout: 60000,
        headers: { 'Accept': 'application/json' }
      });

      if (response.data.IsErroredOnProcessing) return '';
      return response.data?.ParsedResults?.[0]?.ParsedText || '';
    } catch (error) {
      return '';
    }
  },

  async callGeminiWithRetry(prompt, imageUrl) {
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`[Gemini] Attempt ${attempts}...`);

        let url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(prompt)}`;
        if (imageUrl) url += `&imageurl=${encodeURIComponent(imageUrl)}`;

        const response = await axios.get(url, {
          timeout: 120000,
          headers: { 'Accept': 'application/json' }
        });

        if (response.status === 200 && response.data) {
          const result = response.data.response || response.data.message || '';
          if (result && result.length > 10) return result;
        }

        throw new Error('Empty response');

      } catch (error) {
        lastError = error;
        console.log(`[Gemini] Attempt ${attempts} failed:`, error.message);

        if (attempts < maxAttempts) {
          const delay = error.response?.status === 429 ? 10000 :
                       error.response?.status >= 500 ? 5000 : 3000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All Gemini attempts failed');
  },

  cleanResponse(response) {
    let cleaned = response || '';

    const patterns = [
      /^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i,
      /^Here is my analysis.*?\n/i,
      /^Let me analyze.*?\n/i,
      /^Based on my analysis.*?\n/i,
      /^The image appears to be.*?\n/i,
      /^This looks like.*?\n/i,
      /^Upon examination.*?\n/i,
      /^After analyzing.*?\n/i,
      /^The image shows.*?\n/i,
      /^Ako ay si Gemini.*?\n/i,
      /^Narito ang aking analysis.*?\n/i,
      /^Hayaan mong i-analyze ko.*?\n/i,
      /^Batay sa aking analysis.*?\n/i,
      /^Nakikita ko na.*?\n/i,
      /^CRITICAL:.*?\n/i,
      /^EXTRACTED TEXT FROM IMAGE:.*?\n/i,
      /^QUESTIONS TO ANSWER:.*?\n/i,
      /^RULES:.*?\n/i,
      /^DETECTED CONTENT TYPE:.*?\n/i,
      /^LANGUAGE:.*?\n/i,
      /^Additional:.*?\n/i,
      /^\{"operator":.*?\n/i,
      /^\{"timestamp":.*?\n/i,
      /^\{"responseTime":.*?\n/i,
      /^\{"status":.*?\n/i,
      /^\{"response":.*?\n/i,
      /^\{/
    ];

    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    cleaned = cleaned
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/---+/g, '')
      .replace(/__/g, '')
      .replace(/_/g, '')
      .replace(/~~/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    cleaned = cleaned
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
      .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
      .replace(/[\u{24C2}-\u{1F251}]/gu, '');

    return cleaned;
  },

  removePartIndicators(text) {
    if (!text) return text;
    return text.replace(/\[Part\s*\d+\/\d+\]\s*/gi, '');
  },

  async sendAllChunks(senderId, text, token) {
    if (!text) return;

    if (text.length <= 1900) {
      await sendMessage(senderId, { text: text }, token);
      return;
    }

    const chunks = this.splitMessage(text, 1900);

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (!chunk) continue;

      if (i > 0) {
        chunk = chunk.replace(/^(Answer|Sagot|ANSWER):\s*/i, '');
      }

      try {
        await sendMessage(senderId, { text: chunk }, token);
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error('[sendAllChunks] Error:', error.message);
      }
    }
  },

  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();

    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'ni', 'kay', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'po', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'dapat', 'kailangan', 'meron', 'wala', 'hindi', 'oo', 'salamat', 'tanong', 'sagot', 'tulong', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'tabang', 'pasabta'];

    let tagalogCount = 0, bisayaCount = 0;
    const words = lower.split(/\s+/);

    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagalogCount++;
      if (bisayaKeywords.includes(word)) bisayaCount++;
    }

    if (tagalogCount >= 2 && tagalogCount >= bisayaCount) return 'tagalog';
    if (bisayaCount >= 2 && bisayaCount > tagalogCount) return 'bisaya';
    return 'english';
  },

  getLanguageName(languageCode) {
    const names = { 'english': 'English', 'tagalog': 'Tagalog', 'bisaya': 'Bisaya' };
    return names[languageCode] || 'English';
  },

  getErrorMessage(error) {
    if (!error) return 'Error analyzing image. Please try again.';
    
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return 'Server is busy. Please wait a moment and try again.';
    }
    if (error.response?.status === 400) return 'Invalid image format. Please send a valid image.';
    if (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503) {
      return 'Server is currently down. Please try again later.';
    }
    if (error.response?.status === 429) return 'API rate limit reached. Please wait a moment and try again.';
    if (error.response?.status === 413) return 'Image too large. Please compress and try again.';
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'Connection failed. Please check your internet connection.';
    }
    return 'Error analyzing image. Please try again.';
  },

  async extractImageUrl(event, token) {
    try {
      if (event?.message?.reply_to?.mid) {
        return await this.getRepliedImage(event.message.reply_to.mid, token);
      }
      if (event?.message?.attachments && event.message.attachments.length > 0) {
        for (const attachment of event.message.attachments) {
          if (attachment.type === 'image' || attachment.type === 'photo') {
            const url = attachment.payload?.url || attachment.url || null;
            if (url) {
              const urlObj = new URL(url);
              urlObj.searchParams.set('access_token', token);
              return urlObj.toString();
            }
          }
        }
      }
    } catch (err) {
      console.error('[Image Extraction] Failed:', err);
    }
    return null;
  },

  async getRepliedImage(mid, token) {
    try {
      const url = `https://graph.facebook.com/v21.0/${mid}/attachments`;
      const params = { access_token: token };
      const response = await axios.get(url, { params, timeout: 30000 });
      if (response?.data?.data && response.data.data.length > 0) {
        const attachment = response.data.data[0];
        const imageUrl = attachment?.image_data?.url || attachment?.url || null;
        if (imageUrl) {
          const urlObj = new URL(imageUrl);
          urlObj.searchParams.set('access_token', token);
          return urlObj.toString();
        }
      }
      return null;
    } catch (err) {
      console.error('[Replied Image] Failed:', err.response?.data || err.message);
      return null;
    }
  },

  splitMessage(text, maxLength) {
    const chunks = [];
    if (text.length <= maxLength) return [text];

    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
  }
};
