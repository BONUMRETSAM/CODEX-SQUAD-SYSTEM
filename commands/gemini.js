const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Universal image analyzer with continuous chunking',
  usage: 'Send an image and the bot will analyze it',
  version: '34.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 10,

  OCR_API_KEY: 'K81011572188957',

  // ===== MAX CHUNK SIZE =====
  MAX_CHUNK: 1900,

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

      // ===== STEP 1: Try OCR =====
      let ocrText = '';
      let ocrSuccess = false;

      try {
        ocrText = await this.extractTextFromImage(imageUrl);
        if (ocrText && ocrText.length > 10) {
          ocrSuccess = true;
          console.log('[OCR] Success! Length:', ocrText.length);
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
        prompt = this.buildUniversalPrompt(ocrText, questions, userPrompt, imageLanguage, contentType, wantsSolution);
      } else {
        prompt = this.buildDirectVisionPrompt(userPrompt, imageLanguage, wantsSolution);
      }

      // ===== STEP 4: Call AI =====
      let cleanResponse = '';

      if (ocrSuccess && questions.length > 0) {
        cleanResponse = await this.callAIWithFallback(prompt, imageUrl);
        cleanResponse = this.cleanResponse(cleanResponse);
        cleanResponse = await this.verifyAndComplete(cleanResponse, questions, imageUrl, imageLanguage, contentType);
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

      // ===== STEP 6: Smart Chunking - Continuous =====
      console.log('[Output] Total length:', cleanResponse.length);
      await this.sendContinuousChunks(senderId, cleanResponse, token);

    } catch (error) {
      console.error('[gemini] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // SMART CHUNKING - CONTINUOUS SPLIT
  // ============================================================
  async sendContinuousChunks(senderId, text, token) {
    if (!text) return;

    // Kung maikli lang, send as-is
    if (text.length <= this.MAX_CHUNK) {
      await sendMessage(senderId, { text: text }, token);
      return;
    }

    // ===== SPLIT INTO CHUNKS =====
    const chunks = this.splitIntelligently(text);
    console.log('[Chunking] Total chunks:', chunks.length);

    // ===== SEND WITH CONTINUITY MARKERS =====
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (!chunk) continue;

      // Add continuity marker
      const isFirst = i === 0;
      const isLast = i === chunks.length - 1;

      if (!isFirst) {
        // Remove "Answer:" from continuation chunks
        chunk = chunk.replace(/^(Answer|Sagot):\s*/i, '');
      }

      // Add continuation marker
      if (!isFirst && !isLast) {
        chunk = `[continue ${i + 1}/${chunks.length}]\n\n${chunk}\n\n[type "continue" for next part]`;
      } else if (!isFirst && isLast) {
        chunk = `[continue ${i + 1}/${chunks.length}]\n\n${chunk}`;
      } else if (isFirst && !isLast) {
        chunk = `${chunk}\n\n[Part 1/${chunks.length} - type "continue" for next part]`;
      }

      try {
        await sendMessage(senderId, { text: chunk }, token);
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error) {
        console.error('[sendContinuousChunks] Error:', error.message);

        // Retry with smaller chunks
        if (error.message.includes('Message too long')) {
          const subChunks = this.splitIntelligently(chunk);
          for (const sub of subChunks) {
            await sendMessage(senderId, { text: sub }, token);
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    }
  },

  // ============================================================
  // INTELLIGENT SPLIT - Hindi Mapuputol ang Sentences
  // ============================================================
  splitIntelligently(text) {
    if (!text) return [];
    if (text.length <= this.MAX_CHUNK) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= this.MAX_CHUNK) {
        chunks.push(remaining);
        break;
      }

      let chunk = remaining.substring(0, this.MAX_CHUNK);

      // ===== BREAK POINTS (Priority) =====
      const breakPoints = [
        { char: '\n\n', priority: 10 },
        { char: '. ', priority: 9 },
        { char: '! ', priority: 8 },
        { char: '? ', priority: 8 },
        { char: '\n', priority: 7 },
        { char: '; ', priority: 6 },
        { char: ', ', priority: 5 },
        { char: '.', priority: 4 },
        { char: ' ', priority: 1 }
      ];

      let bestIndex = -1;
      let bestPriority = -1;

      for (const bp of breakPoints) {
        const idx = chunk.lastIndexOf(bp.char);
        if (idx > this.MAX_CHUNK * 0.3 && idx < this.MAX_CHUNK) {
          if (bestPriority < bp.priority) {
            bestPriority = bp.priority;
            bestIndex = idx + bp.char.length;
          }
        }
      }

      // Fallback: use space
      if (bestIndex === -1) {
        const spaceIdx = chunk.lastIndexOf(' ');
        if (spaceIdx > this.MAX_CHUNK * 0.3) {
          bestIndex = spaceIdx + 1;
        } else {
          bestIndex = this.MAX_CHUNK;
        }
      }

      bestIndex = Math.min(bestIndex, this.MAX_CHUNK);

      const chunkText = remaining.substring(0, bestIndex).trim();
      if (chunkText) chunks.push(chunkText);

      remaining = remaining.substring(bestIndex).trim();
    }

    return chunks;
  },

  // ============================================================
  // UNIVERSAL PROMPT
  // ============================================================
  buildUniversalPrompt(ocrText, questions, userPrompt, language, contentType, wantsSolution) {
    const langName = this.getLanguageName(language);

    let text = ocrText;
    if (text.length > 4000) text = text.substring(0, 4000);

    const instructions = this.extractInstructions(ocrText);

    let prompt = `CRITICAL: Follow the instructions EXACTLY and answer EVERY question.

INSTRUCTIONS FROM IMAGE:
${instructions.length > 0 ? instructions.join('\n') : 'Use standard format.'}

EXTRACTED TEXT FROM IMAGE:
${text}

QUESTIONS FOUND (${questions.length} items):
${questions.map(q => `${q.number}. ${q.text}`).join('\n')}

═══════════════════════════════════════
STRICT RULES:
═══════════════════════════════════════
1. FOLLOW the instructions from the image EXACTLY.
2. Answer ALL questions. NO BLANKS.
3. NO introduction. Start directly with answers.
4. NO conclusion.
5. NO emojis. NO markdown.
6. For true/false: use ✓ or ✗.
7. For multiple choice: letter + answer.
8. For explanation: 1-2 sentences.
9. For math: show steps + Final Answer.
10. Respond in ${langName.toUpperCase()} language.

${this.buildFormatFromInstructions(instructions, contentType, questions)}

NOW ANSWER ALL QUESTIONS. NO BLANKS.`;

    return prompt;
  },

  extractInstructions(ocrText) {
    const instructions = [];
    const lines = ocrText.split('\n');

    const instructionKeywords = [
      'directions', 'instructions', 'write', 'arrange', 'answer',
      'fill', 'choose', 'match', 'identify', 'explain', 'define',
      'list', 'enumerate', 'solve', 'compute', 'calculate', 'show',
      'prove', 'describe', 'discuss', 'compare', 'contrast', 'analyze',
      'evaluate', 'summarize', 'sequence', 'order', 'complete',
      'select', 'pick', 'circle', 'underline', 'true or false',
      'multiple choice', 'fill in the blank', 'explain why',
      'panuto', 'direksyon', 'isulat', 'ayusin', 'sagutin',
      'piliin', 'ipaliwanag', 'ilarawan'
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      for (const kw of instructionKeywords) {
        if (lower.startsWith(kw) || lower.includes(kw + ':') || lower.includes(kw + ' ')) {
          if (trimmed.length > 5 && trimmed.length < 200) {
            instructions.push(trimmed);
          }
          break;
        }
      }
    }

    return [...new Set(instructions)];
  },

  buildFormatFromInstructions(instructions, contentType, questions) {
    const allText = instructions.join(' ').toLowerCase();
    let format = '';

    if (allText.includes('✓') || allText.includes('✗') ||
        allText.includes('proper') || allText.includes('improper') ||
        allText.includes('true or false') || allText.includes('tama o mali')) {
      format += `FORMAT: ✓ or ✗ for each item.\n`;
    } else if (allText.includes('multiple choice') || allText.includes('choose') ||
               allText.includes('piliin') || allText.includes('panuto')) {
      format += `FORMAT: Letter + answer. End with "Final Answer: 1-A, 2-B..."\n`;
    } else if (allText.includes('arrange') || allText.includes('sequence') ||
               allText.includes('order') || allText.includes('ayusin')) {
      format += `FORMAT: Numbers in correct order.\n`;
    } else if (allText.includes('solve') || allText.includes('compute')) {
      format += `FORMAT: Step-by-step + Final Answer.\n`;
    } else if (allText.includes('explain') || allText.includes('why')) {
      format += `FORMAT: 1-2 sentences for each.\n`;
    } else if (allText.includes('fill in the blank')) {
      format += `FORMAT: Direct answer only.\n`;
    } else {
      format += `FORMAT: Direct answers only.\n`;
    }

    format += `\nAnswer ALL ${questions.length} questions. NO BLANKS.\n`;
    return format;
  },

  async verifyAndComplete(response, questions, imageUrl, language, contentType) {
    let verified = response;
    const lines = verified.split('\n');
    const answeredNumbers = new Set();

    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*/);
      if (match) answeredNumbers.add(parseInt(match[1]));
    }

    const missing = questions.filter(q => !answeredNumbers.has(q.number));

    if (missing.length > 0) {
      const langName = this.getLanguageName(language);

      const missingPrompt = `Answer these specific questions ONLY:

${missing.map(q => `${q.number}. ${q.text}`).join('\n')}

RULES:
- Answer each number directly.
- For true/false: use ✓ or ✗.
- For multiple choice: letter + answer.
- For explanation: 1-2 sentences.
- NO extra text.
- Respond in ${langName.toUpperCase()} language.`;

      try {
        const missingAnswers = await this.callAIWithFallback(missingPrompt, imageUrl);
        const cleanMissing = this.cleanResponse(missingAnswers);
        const withoutPrefix = cleanMissing.replace(/^(Answer|Sagot):\s*/i, '');
        if (withoutPrefix.trim()) verified += '\n' + withoutPrefix;
      } catch (e) {
        console.log('[Verify] Failed:', e.message);
      }
    }

    return verified;
  },

  extractAllQuestions(ocrText, contentType) {
    const questions = [];
    const lines = ocrText.split('\n');
    let section = 'general';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.match(/PART\s*I\b/i) && !trimmed.match(/PART\s*II/i)) section = 'part1';
      else if (trimmed.match(/PART\s*II\b/i) && !trimmed.match(/PART\s*III/i)) section = 'part2';
      else if (trimmed.match(/PART\s*III/i)) section = 'part3';
      else if (trimmed.match(/^I\.\s+/i)) section = 'part1';

      const match = trimmed.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        const num = parseInt(match[1]);
        const txt = match[2].trim();
        if (txt.length > 0) {
          questions.push({ number: num, text: txt, section: section });
        }
      }
    }

    return questions;
  },

  detectContentType(ocrText) {
    const lower = ocrText.toLowerCase();

    const hasLetterOptions = /[a-d]\)/gi.test(ocrText) || /[a-d]\./gi.test(ocrText);
    const mcKeywords = ['multiple choice', 'piliin', 'choose', 'select', 'panuto'];
    if (hasLetterOptions || mcKeywords.some(kw => lower.includes(kw))) return 'multiple_choice';

    if (lower.includes('part i') || lower.includes('part ii') || lower.includes('part iii') ||
        lower.includes('sequence it') || lower.includes('harvest or not') || lower.includes('explain why')) {
      return 'activity_sheet';
    }

    const logicKeywords = ['sons', 'sister', 'family', 'people', 'brothers', 'sisters', 'logic', 'puzzle', 'riddle'];
    for (const kw of logicKeywords) if (lower.includes(kw)) return 'logic';

    const pictureMathKeywords = ['bison', 'boar', 'apple', 'banana', 'orange', 'fruit'];
    for (const kw of pictureMathKeywords) if (lower.includes(kw)) return 'picture_math';
    if (lower.match(/\d+\s*[\+\-\*\/]\s*\d+\s*=\s*\d+/)) return 'picture_math';

    if (lower.includes('solve') || lower.includes('equation') || lower.includes('x =') ||
        lower.includes('calculate') || lower.includes('angle') || lower.includes('triangle')) {
      return 'math';
    }

    if (lower.includes('python') || lower.includes('java') || lower.includes('javascript') ||
        lower.includes('print(') || lower.includes('function')) {
      return 'coding';
    }

    return 'general';
  },

  finalCleanup(response, wantsSolution) {
    if (!response) return '';

    let cleaned = response;
    cleaned = cleaned.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');

    if (!wantsSolution) {
      cleaned = cleaned
        .replace(/EXPLANATION:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/Explanation:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/REASONING:[\s\S]*?(?=\n\d+\.|$)/gi, '')
        .replace(/SOLUTION:[\s\S]*?(?=\n\d+\.|$)/gi, '');
    }

    const lines = cleaned.split('\n');
    const seenNumbers = new Set();
    const result = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { result.push(''); continue; }

      const numMatch = trimmed.match(/^(\d+)\.\s*(.*)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        const content = numMatch[2].trim();
        if (seenNumbers.has(num)) continue;
        seenNumbers.add(num);
        result.push(`${num}. ${content}`);
      } else {
        const lastLine = result[result.length - 1];
        if (lastLine !== trimmed) result.push(trimmed);
      }
    }

    cleaned = result.join('\n');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    if (cleaned && !cleaned.match(/^(Answer|Sagot|ANSWER):/i)) {
      cleaned = 'Answer: ' + cleaned;
    }

    return cleaned;
  },

  detectSolutionRequest(userPrompt) {
    if (!userPrompt) return false;
    const lower = userPrompt.toLowerCase();
    return ['explain', 'why', 'how', 'solution', 'solve', 'step by step',
            'paliwanag', 'bakit', 'paano', 'ipaliwanag', 'show work',
            'show solution', 'detailed', 'reasoning'].some(kw => lower.includes(kw));
  },

  detectLanguageFromText(text) {
    if (!text) return 'english';
    const lower = text.toLowerCase();

    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'ni', 'para', 'dahil', 'kasi', 'kaya', 'ako', 'ikaw', 'siya', 'gusto', 'pwede', 'hindi', 'oo'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kini', 'unsa', 'ngano', 'asa', 'gusto', 'pwede', 'dili', 'salamat'];

    const codingKeywords = ['python', 'java', 'javascript', 'print', 'function', 'class'];
    const mathKeywords = ['solve', 'equation', 'formula', 'calculate'];

    for (const kw of codingKeywords) if (lower.includes(kw)) return 'english';
    for (const kw of mathKeywords) if (lower.includes(kw)) return 'english';

    let tagCount = 0, bisCount = 0;
    const words = lower.split(/\s+/);
    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagCount++;
      if (bisayaKeywords.includes(word)) bisCount++;
    }

    if (tagCount >= 3 && tagCount > bisCount) return 'tagalog';
    if (bisCount >= 3 && bisCount > tagCount) return 'bisaya';
    return 'english';
  },

  async callAIWithFallback(prompt, imageUrl) {
    try {
      const result = await this.callGeminiWithRetry(prompt, imageUrl);
      if (result && result.length > 10) return this.cleanResponse(result);
    } catch (error) {
      console.log('[AI] Gemini failed:', error.message);
    }

    try {
      const result = await this.callChippAI(prompt, imageUrl);
      if (result && result.length > 10) return this.cleanResponse(result);
    } catch (error) {
      console.log('[AI] Chipp AI failed:', error.message);
    }

    throw new Error('All AI services failed');
  },

  async callGeminiWithRetry(prompt, imageUrl) {
    let attempts = 0;
    const maxAttempts = 2;
    let lastError = null;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const encodedPrompt = encodeURIComponent(prompt);
        let url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}`;
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
        if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 3000));
      }
    }
    throw lastError || new Error('Gemini failed');
  },

  async callChippAI(prompt, imageUrl) {
    const url = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(prompt)}&url=${encodeURIComponent(imageUrl)}`;
    const response = await axios.get(url, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });
    if (response.data?.status === true && response.data?.response) {
      return response.data.response;
    }
    throw new Error('Chipp AI failed');
  },

  async callDirectVision(imageUrl, userPrompt, language, wantsSolution) {
    const langName = this.getLanguageName(language);

    const visionPrompt = `Analyze this image and answer ALL questions.

User question: ${userPrompt}

RULES:
- Answer directly.
- Show step-by-step for math/coding.
- For activity sheets: answer ALL items.
- NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Respond in ${langName.toUpperCase()} language.`;

    try {
      const encodedPrompt = encodeURIComponent(visionPrompt);
      const url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}&imageurl=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(url, {
        timeout: 120000,
        headers: { 'Accept': 'application/json' }
      });
      if (response.data?.response || response.data?.message) {
        return this.cleanResponse(response.data.response || response.data.message);
      }
    } catch (error) {
      console.log('[DirectVision] Gemini failed:', error.message);
    }

    try {
      const chippUrl = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(visionPrompt)}&url=${encodeURIComponent(imageUrl)}`;
      const chippResponse = await axios.get(chippUrl, {
        timeout: 60000,
        headers: { 'Accept': 'application/json' }
      });
      if (chippResponse.data?.status === true && chippResponse.data?.response) {
        return this.cleanResponse(chippResponse.data.response);
      }
    } catch (chippError) {
      console.log('[DirectVision] Chipp failed:', chippError.message);
    }

    throw new Error('All direct vision methods failed');
  },

  async extractTextFromImage(imageUrl) {
    try {
      const url = `https://api.ocr.space/parse/imageurl?apikey=${this.OCR_API_KEY}&url=${encodeURIComponent(imageUrl)}&language=eng,tgl&isOverlayRequired=false&OCREngine=2&scale=true&isTable=true`;
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

  cleanResponse(response) {
    let cleaned = response || '';

    const patterns = [
      /^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i,
      /^Here is my analysis.*?\n/i,
      /^Let me analyze.*?\n/i,
      /^Based on my analysis.*?\n/i,
      /^I can see that.*?\n/i,
      /^The image appears to be.*?\n/i,
      /^The image shows.*?\n/i,
      /^CRITICAL:.*?\n/i,
      /^EXTRACTED TEXT.*?\n/i,
      /^QUESTIONS.*?\n/i,
      /^RULES:.*?\n/i,
      /^INSTRUCTIONS FROM IMAGE.*?\n/i,
      /^FORMAT BASED.*?\n/i,
      /^\{"operator":.*?\n/i,
      /^\{/
    ];

    for (const pattern of patterns) cleaned = cleaned.replace(pattern, '');

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
      .replace(/[\u{FE00}-\u{FEFF}]/gu, '');

    return cleaned;
  },

  removePartIndicators(text) {
    if (!text) return text;
    return text.replace(/\[Part\s*\d+\/\d+\]\s*/gi, '');
  },

  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();

    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'ni', 'para', 'dahil', 'ako', 'ikaw', 'siya', 'gusto', 'pwede', 'hindi'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kini', 'unsa', 'ngano', 'asa', 'gusto', 'pwede', 'dili'];

    let tagCount = 0, bisCount = 0;
    const words = lower.split(/\s+/);
    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagCount++;
      if (bisayaKeywords.includes(word)) bisCount++;
    }

    if (tagCount >= 2 && tagCount >= bisCount) return 'tagalog';
    if (bisCount >= 2 && bisCount > tagCount) return 'bisaya';
    return 'english';
  },

  getLanguageName(code) {
    const names = { 'english': 'English', 'tagalog': 'Tagalog', 'bisaya': 'Bisaya' };
    return names[code] || 'English';
  },

  async extractImageUrl(event, token) {
    try {
      if (event?._scanImageUrl) return event._scanImageUrl;
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
      console.error('[Replied Image] Failed:', err.message);
      return null;
    }
  },

  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED') return 'Request timeout. Please try again.';
    if (error.response?.status === 429) return 'Rate limit. Please wait.';
    if (error.response?.status >= 500) return 'Server error. Please try again.';
    return 'Error analyzing image. Please try again.';
  }
};
