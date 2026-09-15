const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images and provide precise accurate answers',
  usage: 'Send an image and the bot will analyze it',
  version: '29.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 10,

  async execute(senderId, args, token, event) {
    try {
      const imageUrl = await this.extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
        return;
      }

      const userPrompt = args.join(' ').trim() || 'Analyze this image and answer all questions';
      const detectedLanguage = this.detectLanguage(userPrompt || '');
      const wantsSolution = this.detectSolutionRequest(userPrompt);

      // ===== STEP 1: OCR =====
      let ocrText = '';
      let ocrSuccess = false;

      try {
        ocrText = await this.extractTextFromImage(imageUrl);
        if (ocrText && ocrText.length > 10) {
          ocrSuccess = true;
          console.log('[OCR] Success! Text length:', ocrText.length);
        }
      } catch (error) {
        console.log('[OCR] Error:', error.message);
      }

      // ===== STEP 2: Detect language =====
      let imageLanguage = 'english';
      if (ocrSuccess && ocrText) {
        imageLanguage = this.detectLanguageFromText(ocrText);
      } else {
        imageLanguage = detectedLanguage || 'english';
      }

      // ===== STEP 3: Detect content type =====
      let questions = [];
      let contentType = 'general';
      let prompt = '';

      if (ocrSuccess) {
        contentType = this.detectContentType(ocrText);
        questions = this.extractAllQuestions(ocrText, contentType);
        prompt = this.buildAnswerPrompt(ocrText, questions, userPrompt, imageLanguage, contentType, wantsSolution);
      } else {
        prompt = this.buildDirectVisionPrompt(userPrompt, imageLanguage, wantsSolution);
      }

      // ===== STEP 4: Call AI =====
      let cleanResponse = '';

      if (ocrSuccess && questions.length > 0) {
        cleanResponse = await this.callAIWithFallback(prompt, imageUrl);
        cleanResponse = this.cleanResponse(cleanResponse);
        cleanResponse = await this.verifyAndComplete(cleanResponse, questions, imageUrl, imageLanguage, wantsSolution);
      } else {
        cleanResponse = await this.callDirectVision(imageUrl, userPrompt, imageLanguage, wantsSolution);
      }

      // ===== STEP 5: Final cleanup =====
      cleanResponse = this.removePartIndicators(cleanResponse);
      cleanResponse = this.finalCleanup(cleanResponse, wantsSolution);

      if (!cleanResponse || cleanResponse.length < 3) {
        cleanResponse = await this.callDirectVision(imageUrl, userPrompt, imageLanguage, wantsSolution);
        cleanResponse = this.finalCleanup(cleanResponse, wantsSolution);
      }

      if (!cleanResponse || cleanResponse.length < 3) {
        await sendMessage(senderId, { text: 'Unable to analyze. Please try again with a clearer image.' }, token);
        return;
      }

      cleanResponse = cleanResponse.substring(0, 8000);
      await this.sendAllChunks(senderId, cleanResponse, token);

    } catch (error) {
      console.error('[gemini] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // FINAL CLEANUP
  // ============================================================
  finalCleanup(response, wantsSolution) {
    if (!response) return '';

    let cleaned = response;
    cleaned = cleaned.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');

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

  // ============================================================
  // DETECT SOLUTION REQUEST
  // ============================================================
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

  // ============================================================
  // DETECT LANGUAGE FROM TEXT
  // ============================================================
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

    let englishCount = 0;
    let tagalogCount = 0;
    let bisayaCount = 0;

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

  // ============================================================
  // VERIFY AND COMPLETE
  // ============================================================
  async verifyAndComplete(response, questions, imageUrl, language, wantsSolution) {
    let verified = response;
    const lines = verified.split('\n');
    const answeredNumbers = new Set();

    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*/);
      if (match) {
        answeredNumbers.add(parseInt(match[1]));
      }
    }

    const missingQuestions = questions.filter(q => !answeredNumbers.has(q.number));

    if (missingQuestions.length > 0) {
      console.log('[Verify] Missing answers for:', missingQuestions.map(q => q.number).join(', '));

      const langName = this.getLanguageName(language);

      const missingPrompt = wantsSolution
        ? `Answer these specific questions with brief explanation:

${missingQuestions.map(q => `${q.number}. ${q.text}`).join('\n')}

RULES:
- Answer each number directly with brief explanation.
- NO extra text, NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Respond in ${langName.toUpperCase()} language.`
        : `Answer these specific questions ONLY (no explanation):

${missingQuestions.map(q => `${q.number}. ${q.text}`).join('\n')}

RULES:
- Answer each number directly. NO explanation.
- For true/false or proper/improper: use ✓ or ✗ only.
- NO extra text, NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Respond in ${langName.toUpperCase()} language.`;

      try {
        const missingAnswers = await this.callAIWithFallback(missingPrompt, imageUrl);
        const cleanMissing = this.cleanResponse(missingAnswers);
        const missingWithoutPrefix = cleanMissing.replace(/^(Answer|Sagot|ANSWER):\s*/i, '');

        if (missingWithoutPrefix.trim()) {
          verified += '\n' + missingWithoutPrefix;
        }
      } catch (e) {
        console.log('[Verify] Failed to get missing answers:', e.message);
      }
    }

    return verified;
  },

  // ============================================================
  // BUILD ANSWER PROMPT
  // ============================================================
  buildAnswerPrompt(ocrText, questions, userPrompt, language, contentType, wantsSolution) {
    const langName = this.getLanguageName(language);

    let prompt = `CRITICAL: You MUST ANSWER EVERY numbered question below. DO NOT just copy the text.

EXTRACTED TEXT FROM IMAGE:
${ocrText}

QUESTIONS TO ANSWER:
${questions.map(q => `${q.number}. ${q.text}`).join('\n')}

STRICT RULES:
1. ANSWER EVERY numbered question. DO NOT just copy the text.
2. Start directly with answers. NO introduction, NO conclusion.
3. NO emojis, NO markdown.
4. For true/false or proper/improper: use ONLY ✓ or ✗.
5. For multiple choice: letter + answer only.
6. For sequencing: numbers in order only.
7. For explanation: 1-2 sentences only.
8. Respond in ${langName.toUpperCase()} language.

DETECTED CONTENT TYPE: ${contentType}`;

    if (contentType === 'activity_sheet') {
      prompt += `

SPECIFIC FORMAT FOR ACTIVITY SHEET:
- PART I: List steps in correct order (e.g., 1, 2, 3, 4, 5, 6)
- PART II: ✓ or ✗ for EACH number 1-10
- PART III: Answer EACH number 1-3 with 1-2 sentences`;
    }

    if (wantsSolution) {
      prompt += `

Provide answer with brief explanation:
1. [Answer] - [Brief explanation]`;
    } else {
      prompt += `

Give ONLY the direct answers. NO explanations. NO reasoning.
Format:
1. [Answer]
2. [Answer]
3. [Answer]`;
    }

    if (userPrompt && !userPrompt.includes('Analyze')) {
      prompt += `\n\nAdditional: ${userPrompt}`;
    }

    prompt += `\n\nNOW ANSWER ALL QUESTIONS ABOVE. NO BLANKS.`;

    return prompt;
  },

  // ============================================================
  // BUILD DIRECT VISION PROMPT
  // ============================================================
  buildDirectVisionPrompt(userPrompt, language, wantsSolution) {
    const langName = this.getLanguageName(language);

    if (wantsSolution) {
      return `Analyze this image and provide answer with solution.

User question: ${userPrompt}

RULES:
- Answer directly with brief explanation.
- NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Respond in ${langName.toUpperCase()} language.`;
    } else {
      return `Analyze this image and give the direct answer only.

User question: ${userPrompt}

RULES:
- Give ONLY the answer. NO explanation. NO reasoning.
- NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Be direct and to the point.
- Respond in ${langName.toUpperCase()} language.`;
    }
  },

  // ============================================================
  // CALL DIRECT VISION
  // ============================================================
  async callDirectVision(imageUrl, userPrompt, language, wantsSolution) {
    const langName = this.getLanguageName(language);

    let visionPrompt = wantsSolution
      ? `Analyze this image and provide answer with solution.

User question: ${userPrompt}

RULES:
- Answer directly with brief explanation.
- NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Respond in ${langName.toUpperCase()} language.`
      : `Analyze this image and give ONLY the direct answer.

User question: ${userPrompt}

RULES:
- Give ONLY the answer. NO explanation. NO reasoning.
- NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Be direct and to the point.
- Respond in ${langName.toUpperCase()} language.`;

    try {
      const encodedPrompt = encodeURIComponent(visionPrompt);
      const url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}&imageurl=${encodeURIComponent(imageUrl)}`;

      const response = await axios.get(url, {
        timeout: 120000,
        headers: { 'Accept': 'application/json' },
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });

      if (response.status === 200 && response.data) {
        const result = response.data.response || response.data.message || '';
        if (result && result.length > 10) {
          return this.cleanResponse(result);
        }
      }

      throw new Error('Gemini direct vision failed');

    } catch (error) {
      console.log('[DirectVision] Gemini failed, trying Chipp AI...');

      try {
        const chippUrl = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(visionPrompt)}&url=${encodeURIComponent(imageUrl)}`;
        const chippResponse = await axios.get(chippUrl, {
          timeout: 60000,
          headers: { 'Accept': 'application/json' }
        });

        if (chippResponse.data && chippResponse.data.status === true && chippResponse.data.response) {
          return this.cleanResponse(chippResponse.data.response);
        }
      } catch (chippError) {
        console.log('[DirectVision] Chipp AI failed:', chippError.message);
      }

      throw new Error('All direct vision methods failed');
    }
  },

  // ============================================================
  // EXTRACT ALL QUESTIONS
  // ============================================================
  extractAllQuestions(ocrText, contentType) {
    const questions = [];
    const lines = ocrText.split('\n');
    let section = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.match(/PART\s*II/i)) section = 'part2';
      else if (trimmed.match(/PART\s*III/i)) section = 'part3';

      const match = trimmed.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        questions.push({
          number: parseInt(match[1]),
          text: match[2].trim(),
          section: section || 'general'
        });
      }
    }

    return questions;
  },

  // ============================================================
  // DETECT CONTENT TYPE
  // ============================================================
  detectContentType(ocrText) {
    const combined = ocrText.toLowerCase();

    if (combined.includes('part i') || combined.includes('part ii') || combined.includes('part iii')) {
      return 'activity_sheet';
    }
    if (combined.includes('solve') || combined.includes('equation')) {
      return 'math';
    }
    if (combined.includes('logic') || combined.includes('puzzle')) {
      return 'logic';
    }
    if (combined.includes('multiple choice') || combined.includes('choose')) {
      return 'multiple_choice';
    }
    if (combined.includes('python') || combined.includes('java') || combined.includes('javascript')) {
      return 'coding';
    }
    return 'general';
  },

  // ============================================================
  // CALL AI WITH FALLBACK
  // ============================================================
  async callAIWithFallback(prompt, imageUrl) {
    try {
      const result = await this.callGeminiWithRetry(prompt, imageUrl);
      if (result && result.length > 10) {
        return this.cleanResponse(result);
      }
    } catch (error) {
      console.log('[AI] Gemini API failed:', error.message);
    }

    try {
      const result = await this.callChippAI(prompt, imageUrl);
      if (result && result.length > 10) {
        return this.cleanResponse(result);
      }
    } catch (error) {
      console.log('[AI] Chipp AI failed:', error.message);
    }

    throw new Error('All AI services failed');
  },

  // ============================================================
  // CALL CHIPP AI
  // ============================================================
  async callChippAI(prompt, imageUrl) {
    const url = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(prompt)}&url=${encodeURIComponent(imageUrl)}`;

    const response = await axios.get(url, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });

    const data = response.data;

    if (data.status === true && data.response) {
      return data.response;
    }

    throw new Error('Chipp AI returned invalid response');
  },

  // ============================================================
  // OCR
  // ============================================================
  async extractTextFromImage(imageUrl) {
    try {
      const apiKey = 'K85096363488957';
      const url = `https://api.ocr.space/parse/imageurl?apikey=${apiKey}&url=${encodeURIComponent(imageUrl)}&language=eng,tgl&isOverlayRequired=false`;

      const response = await axios.get(url, {
        timeout: 60000,
        headers: { 'Accept': 'application/json' }
      });

      const data = response.data;

      if (data.IsErroredOnProcessing) {
        return '';
      }

      return data?.ParsedResults?.[0]?.ParsedText || '';

    } catch (error) {
      return '';
    }
  },

  // ============================================================
  // CALL GEMINI WITH RETRY
  // ============================================================
  async callGeminiWithRetry(prompt, imageUrl) {
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      try {
        attempts++;

        const encodedPrompt = encodeURIComponent(prompt);
        let url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}`;
        if (imageUrl) {
          url += `&imageurl=${encodeURIComponent(imageUrl)}`;
        }

        const response = await axios.get(url, {
          timeout: 120000,
          headers: { 'Accept': 'application/json' },
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024
        });

        if (response.status === 200 && response.data) {
          const result = response.data.response || response.data.message || '';
          if (result && result.length > 10) {
            return result;
          }
        }

        throw new Error('Empty or invalid response');

      } catch (error) {
        lastError = error;

        if (attempts < maxAttempts) {
          const delay = error.response?.status === 429 ? 10000 :
                       error.response?.status >= 500 ? 5000 : 3000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All Gemini attempts failed');
  },

  // ============================================================
  // CLEAN RESPONSE
  // ============================================================
  cleanResponse(response) {
    let cleaned = response || '';

    const patterns = [
      /^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i,
      /^Here is my analysis.*?\n/i,
      /^Let me analyze.*?\n/i,
      /^Based on my analysis.*?\n/i,
      /^I can see that.*?\n/i,
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
      /^STRICT RULES:.*?\n/i,
      /^DETECTED CONTENT TYPE:.*?\n/i,
      /^SPECIFIC FORMAT:.*?\n/i,
      /^LANGUAGE:.*?\n/i,
      /^Additional:.*?\n/i,
      /^NOW ANSWER ALL QUESTIONS.*?\n/i,
      /^You are a precise AI.*?\n/i,
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
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
      .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')
      .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[\u{24C2}-\u{1F251}]/gu, '');

    return cleaned;
  },

  // ============================================================
  // REMOVE PART INDICATORS
  // ============================================================
  removePartIndicators(text) {
    if (!text) return text;
    return text.replace(/\[Part\s*\d+\/\d+\]\s*/gi, '');
  },

  // ============================================================
  // SEND ALL CHUNKS
  // ============================================================
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

  // ============================================================
  // DETECT LANGUAGE FROM USER PROMPT
  // ============================================================
  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();

    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'ni', 'kay', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'po', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'dapat', 'kailangan', 'meron', 'wala', 'hindi', 'oo', 'salamat', 'tanong', 'sagot', 'tulong', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'tabang', 'pasabta'];

    let tagalogCount = 0;
    let bisayaCount = 0;
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
    const names = {
      'english': 'English',
      'tagalog': 'Tagalog',
      'bisaya': 'Bisaya'
    };
    return names[languageCode] || 'English';
  },

  // ============================================================
  // ERROR MESSAGE
  // ============================================================
  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return 'Server is busy. Please wait a moment and try again.';
    }
    if (error.response?.status === 400) {
      return 'Invalid image format. Please send a valid image.';
    }
    if (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503) {
      return 'Server is currently down. Please try again later.';
    }
    if (error.response?.status === 429) {
      return 'API rate limit reached. Please wait a moment and try again.';
    }
    if (error.response?.status === 413) {
      return 'Image too large. Please compress and try again.';
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'Connection failed. Please check your internet connection.';
    }
    return 'Error analyzing image. Please try again.';
  },

  // ============================================================
  // EXTRACT IMAGE URL
  // ============================================================
  async extractImageUrl(event, token) {
    try {
      if (event?._scanImageUrl) {
        return event._scanImageUrl;
      }
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

  // ============================================================
  // GET REPLIED IMAGE
  // ============================================================
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

  // ============================================================
  // SPLIT MESSAGE
  // ============================================================
  splitMessage(text, maxLength) {
    const chunks = [];
    if (text.length <= maxLength) {
      return [text];
    }
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
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }
};
