// ========== ai.js - COMPLETE AI ASSISTANT v53.0.0 ==========
// 80+ FUNCTIONS | Logic/Math/Science/Language Enhancement | Mirror Output | Internal Consensus
// Priority: Overchat Claude → Overchat DeepSeek → Chipp → Norch
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

const OVERCHAT_CLAUDE = 'https://ceddsrestapi.vercel.app/ai/overchat-claude';
const OVERCHAT_DEEPSEEK = 'https://ceddsrestapi.vercel.app/ai/overchat-deepseek';
const CHIPP_API = 'https://ceddsrestapi.vercel.app/ai/chipp';
const NORCH_API = 'https://norch-project.gleeze.com/api/gemini';

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with 80+ functions',
  usage: 'ai [question] | weight [animal] [measurements]',
  version: '53.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      const lowerPrompt = prompt.toLowerCase();
      const cleanPrompt = lowerPrompt.replace(/[.:!?,\s]+$/g, '').trim();

      // STEP 1: GREETINGS
      if (this.isGreetingOrConversational(prompt)) {
        const reply = this.buildConversationalReply(prompt);
        await sendMessage(senderId, { text: reply }, token);
        conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: reply, timestamp: Date.now() };
        return;
      }

      // STEP 2: FOLLOW-UP
      const isFollowUpCommand = this.isFollowUpCommand(cleanPrompt);
      let previousResponse = null;
      let previousPrompt = null;
      let isReply = false;

      if (event?.message?.reply_to?.mid) {
        isReply = true;
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        previousResponse = replyData.message;
      }

      if (!previousResponse && conversationHistory[senderId]) {
        const history = conversationHistory[senderId];
        if (history.lastResponse && Date.now() - history.timestamp < 30 * 60 * 1000) {
          previousResponse = history.lastResponse;
          previousPrompt = history.lastPrompt;
        }
      }

      if (isFollowUpCommand) {
        if (!previousResponse) {
          await sendMessage(senderId, { text: 'Walang previous response na ma-' + cleanPrompt + '.' }, token);
          return;
        }
        const action = this.getFollowUpAction(cleanPrompt);
        const followUpPrompt = this.buildFollowUpPrompt(action, previousResponse);
        const response = await this.callAIWithViceVersa(followUpPrompt, prompt, 'english', action);
        let cleaned = this.cleanOutput(response);
        cleaned = this.ensureComplete(cleaned);
        cleaned = this.removeDuplicates(cleaned);
        cleaned = this.organizeOutput(cleaned);
        conversationHistory[senderId] = { lastPrompt: previousPrompt || 'previous', lastResponse: cleaned, timestamp: Date.now() };
        this.cleanOldHistory();
        await this.sendComplete(senderId, cleaned, token);
        return;
      }

      // STEP 3: WORD LIST
      if (this.isWordListQuestion(prompt)) {
        const wordAnswer = await this.handleWordList(senderId, prompt, token);
        if (wordAnswer) {
          await this.sendComplete(senderId, wordAnswer, token);
          conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: wordAnswer, timestamp: Date.now() };
          return;
        }
      }

      // STEP 4: WEIGHT
      if (this.shouldTriggerWeight(lowerPrompt, prompt)) {
        await this.handleWeightEstimation(senderId, prompt, token);
        return;
      }

      // STEP 5: REGULAR AI
      if (!prompt && !isReply) {
        await sendMessage(senderId, { text: 'Hello. I am Teacher Arlene, your Complete AI Assistant.\n\nJust type: ai [your question]' }, token);
        return;
      }

      if (this.isOwnerQuestion(prompt)) {
        await sendMessage(senderId, { text: 'I was created by GeoDevz69. Visit here for more information: https://www.facebook.com/geotechph.net' }, token);
        return;
      }

      if (this.isUserInfoQuestion(prompt)) {
        await this.handleUserInfo(senderId, prompt, token);
        return;
      }

      // STEP 6: COMPREHEND INPUT
      const analysis = this.comprehendInput(prompt);
      
      console.log('[AI] Type:', analysis.type, '| HasNumbers:', analysis.hasNumbers, '| HasSequence:', analysis.hasSequence, '| Length:', prompt.length);

      // STEP 7: BUILD MIRROR PROMPT (with specialized enhancements)
      const finalPrompt = this.buildMirrorPrompt(prompt, analysis);

      // STEP 8: CALL AI WITH INTERNAL CONSENSUS
      let aiResponse = await this.callAIWithConsensus(finalPrompt, prompt, 'english', analysis.type);

      // STEP 9: CLEAN
      aiResponse = this.cleanOutput(aiResponse);

      // STEP 10: REMOVE DUPLICATES
      aiResponse = this.removeDuplicates(aiResponse);

      // STEP 11: ORGANIZE OUTPUT
      aiResponse = this.organizeOutput(aiResponse);

      // STEP 12: ENSURE COMPLETE
      aiResponse = this.ensureComplete(aiResponse);

      conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: aiResponse, timestamp: Date.now() };
      this.cleanOldHistory();

      await this.sendComplete(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // BUILD MIRROR PROMPT — WITH SPECIALIZED ENHANCEMENTS
  // ============================================================
  buildMirrorPrompt(prompt, analysis) {
    let finalPrompt = '';

    finalPrompt += `=== YOUR TASK ===\n`;
    finalPrompt += `Answer the input BELOW. Output ONLY the answer in the SAME structure as the input.\n\n`;

    finalPrompt += `=== ABSOLUTE RULES ===\n`;
    finalPrompt += `1. MIRROR the input EXACTLY — same headings, same numbering, same format.\n`;
    finalPrompt += `2. KEEP all headings, section titles, sub-headings, and labels.\n`;
    finalPrompt += `3. KEEP the original numbering (1, 2, 3, A, B, C).\n`;
    finalPrompt += `4. KEEP the original text of each item.\n`;
    finalPrompt += `5. FILL IN the blank/underline with the correct answer.\n`;
    finalPrompt += `6. If "Write 1-5" → put number. If "Write ✓/✗" → put symbol. If "Explain" → write answer.\n`;
    finalPrompt += `7. Output must be the SAME structure as input, but WITH ANSWERS FILLED IN.\n\n`;

    finalPrompt += `=== ABSOLUTE PROHIBITIONS (STRICT) ===\n`;
    finalPrompt += `1. NO "Would you like..." or any follow-up question.\n`;
    finalPrompt += `2. NO "If you need help..." or any offer.\n`;
    finalPrompt += `3. NO "Feel free to ask..." or similar.\n`;
    finalPrompt += `4. NO intro ("Here are the answers...", "The answers are...").\n`;
    finalPrompt += `5. NO outro ("Hope this helps", "Good luck").\n`;
    finalPrompt += `6. NO extra explanations unless the input asks for it.\n`;
    finalPrompt += `7. NO related topics or additional info.\n`;
    finalPrompt += `8. NO "Let me know if..." or similar phrases.\n`;
    finalPrompt += `9. NO "If you want more..." or similar.\n`;
    finalPrompt += `10. Output ONLY the answer, formatted as the input.\n\n`;

    // ==================== SPECIALIZED ENHANCEMENTS ====================

    // LOGIC ENHANCEMENT
    if (analysis.type === 'logic' || /logic|riddle|puzzle|bugtong|palaisipan|reasoning/i.test(prompt)) {
      finalPrompt += `=== FOR LOGIC PROBLEMS (STRICT FRAMEWORK) ===\n`;
      finalPrompt += `1. Read the problem carefully.\n`;
      finalPrompt += `2. Identify ALL GIVEN facts (underline them mentally).\n`;
      finalPrompt += `3. Identify what is ASKED.\n`;
      finalPrompt += `4. Draw conclusion STEP-BY-STEP.\n`;
      finalPrompt += `5. Show reasoning clearly.\n`;
      finalPrompt += `6. Verify the answer logically.\n`;
      finalPrompt += `7. Consider ALL interpretations (if ambiguous).\n`;
      finalPrompt += `8. Give the FINAL ANSWER clearly at the end.\n`;
      finalPrompt += `9. Do NOT invent facts not stated.\n`;
      finalPrompt += `10. Consider all cases (base = 1, base = -1, exponent = 0, etc.).\n\n`;
    }

    // ADVANCED MATH ENHANCEMENT
    if (analysis.type === 'math' && /calculus|integral|derivative|limit|differential|advanced/i.test(prompt)) {
      finalPrompt += `=== FOR ADVANCED MATH (STRICT FRAMEWORK) ===\n`;
      finalPrompt += `1. Read the problem carefully.\n`;
      finalPrompt += `2. Identify GIVEN and ASKED.\n`;
      finalPrompt += `3. State the FORMULA or concept needed.\n`;
      finalPrompt += `4. Show ALL steps clearly (use "Step X:" if applicable).\n`;
      finalPrompt += `5. Include the equation for each step.\n`;
      finalPrompt += `6. VERIFY the answer by substitution or alternative method.\n`;
      finalPrompt += `7. Consider ALL edge cases (0, 1, -1, undefined, etc.).\n`;
      finalPrompt += `8. Give the FINAL ANSWER with units.\n\n`;
    }

    // SCIENCE ENHANCEMENT
    if (analysis.type === 'science' || /photosynthesis|respiration|cell|dna|chemistry|physics|biology|equation/i.test(prompt)) {
      finalPrompt += `=== FOR SCIENCE (STRICT FRAMEWORK) ===\n`;
      finalPrompt += `1. Give a CLEAR definition.\n`;
      finalPrompt += `2. Explain the PROCESS/STAGES clearly.\n`;
      finalPrompt += `3. Include the FORMULA or equation (if applicable).\n`;
      finalPrompt += `4. Show units clearly.\n`;
      finalPrompt += `5. Give SPECIFIC examples.\n`;
      finalPrompt += `6. Be ACCURATE — do NOT hallucinate.\n`;
      finalPrompt += `7. Use arrows (→) for cycles/processes.\n\n`;
    }

    // LANGUAGE ENHANCEMENT
    if (analysis.type === 'essay' || /grammar|sentence|literary|poem|vocabulary|paragraph/i.test(prompt)) {
      finalPrompt += `=== FOR LANGUAGE (STRICT FRAMEWORK) ===\n`;
      finalPrompt += `1. Follow grammar rules strictly.\n`;
      finalPrompt += `2. Use correct sentence structure.\n`;
      finalPrompt += `3. Follow the required length (sentences, paragraphs).\n`;
      finalPrompt += `4. Use appropriate vocabulary.\n`;
      finalPrompt += `5. Be clear and organized.\n\n`;
    }

    // ESSAY ENHANCEMENT
    if (analysis.type === 'essay') {
      finalPrompt += `=== FOR ESSAY (STRICT FRAMEWORK) ===\n`;
      finalPrompt += `1. Introduction — clear thesis statement.\n`;
      finalPrompt += `2. Body — 3-5 paragraphs with supporting details.\n`;
      finalPrompt += `3. Conclusion — summarize and give final thought.\n`;
      finalPrompt += `4. Follow the required length (sentences, paragraphs).\n`;
      finalPrompt += `5. Do NOT add "TITLE:" header unless asked.\n\n`;
    }

    finalPrompt += `=== CLOSING RULES ===\n`;
    finalPrompt += `- Your response MUST END with the last answer.\n`;
    finalPrompt += `- Do NOT add ANYTHING after the last answer.\n\n`;

    finalPrompt += `=== NOW ANSWER THE FOLLOWING (MIRROR THE STRUCTURE) ===\n\n`;
    finalPrompt += prompt;

    return finalPrompt;
  },

  // ============================================================
  // CALL AI WITH INTERNAL CONSENSUS
  // ============================================================
  async callAIWithConsensus(prompt, originalPrompt, language, intent) {
    const safePrompt = prompt.length > 8000 ? prompt.substring(0, 8000) : prompt;
    const answers = [];

    try {
      console.log('[AI] Collecting: Overchat Claude...');
      const a = await this.callCeddsAPI(safePrompt, OVERCHAT_CLAUDE);
      if (a && a.trim().length > 3 && !this.hasErrorKeyword(a.toLowerCase())) {
        answers.push({ source: 'Claude', text: a.trim() });
        console.log('[AI] ✓ Claude responded');
      }
    } catch (e) { console.log('[AI] ✗ Claude:', e.message); }

    try {
      console.log('[AI] Collecting: Overchat DeepSeek...');
      const b = await this.callCeddsAPI(safePrompt, OVERCHAT_DEEPSEEK);
      if (b && b.trim().length > 3 && !this.hasErrorKeyword(b.toLowerCase())) {
        answers.push({ source: 'DeepSeek', text: b.trim() });
        console.log('[AI] ✓ DeepSeek responded');
      }
    } catch (e) { console.log('[AI] ✗ DeepSeek:', e.message); }

    if (answers.length >= 2) {
      const sim = this.calculateSimilarity(answers[0].text, answers[1].text);
      console.log(`[AI] Similarity: ${sim}%`);
      if (sim >= 75) {
        console.log('[AI] ✓ Consensus — using primary');
        return answers[0].text;
      }
    }

    if (answers.length < 2 || (answers.length >= 2 && this.calculateSimilarity(answers[0].text, answers[1].text) < 75)) {
      try {
        console.log('[AI] Collecting: Chipp...');
        const c = await this.callChippAPI(safePrompt);
        if (c && c.trim().length > 3 && !this.hasErrorKeyword(c.toLowerCase())) {
          answers.push({ source: 'Chipp', text: c.trim() });
          console.log('[AI] ✓ Chipp responded');
        }
      } catch (e) { console.log('[AI] ✗ Chipp:', e.message); }
    }

    if (answers.length === 1) {
      console.log(`[AI] Only ${answers[0].source}`);
      return answers[0].text;
    }

    if (answers.length >= 2) {
      const consensus = this.findConsensus(answers);
      console.log(`[AI] Consensus: ${consensus.source} (${consensus.confidence}%)`);
      return consensus.text;
    }

    try {
      const d = await this.callNorchAPI(safePrompt);
      if (d && d.trim().length > 3) return d.trim();
    } catch (e) {}

    throw new Error('All AI providers failed');
  },

  findConsensus(answers) {
    if (answers.length === 1) {
      return { text: answers[0].text, source: answers[0].source, confidence: 100 };
    }
    let bestIndex = 0, bestAvg = 0;
    for (let i = 0; i < answers.length; i++) {
      let sum = 0;
      for (let j = 0; j < answers.length; j++) {
        if (i !== j) sum += this.calculateSimilarity(answers[i].text, answers[j].text);
      }
      const avg = sum / (answers.length - 1);
      if (avg > bestAvg) { bestAvg = avg; bestIndex = i; }
    }
    return { text: answers[bestIndex].text, source: answers[bestIndex].source, confidence: Math.round(bestAvg) };
  },

  calculateSimilarity(strA, strB) {
    if (!strA || !strB) return 0;
    const a = strA.toLowerCase().trim();
    const b = strB.toLowerCase().trim();
    if (a === b) return 100;
    const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    if (lenRatio < 0.3) return 0;
    const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
    let common = 0;
    for (const word of wordsA) if (wordsB.has(word)) common++;
    const total = Math.max(wordsA.size, wordsB.size);
    if (total === 0) return 0;
    return Math.round((common / total) * 100);
  },

  // ============================================================
  // REMOVE DUPLICATES
  // ============================================================
  removeDuplicates(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const result = [];
    const seenKeys = new Set();
    let currentPart = '';
    let lastWasBlank = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (!lastWasBlank) { result.push(''); lastWasBlank = true; }
        continue;
      }
      lastWasBlank = false;
      const partMatch = trimmed.match(/^PART\s+[IVX\d]+/i);
      if (partMatch) {
        currentPart = partMatch[0].toUpperCase();
        result.push(line);
        continue;
      }
      const itemMatch = trimmed.match(/^([✓✗\s_\-*]*)(\d+)[\.\)]\s/);
      if (itemMatch) {
        const key = currentPart + '::' + itemMatch[2];
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        result.push(line);
        continue;
      }
      const letterMatch = trimmed.match(/^([A-Z])[\.\)]\s/);
      if (letterMatch) {
        const key = currentPart + '::' + letterMatch[1];
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        result.push(line);
        continue;
      }
      result.push(line);
    }
    let cleaned = result.join('\n');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  },

  // ============================================================
  // ORGANIZE OUTPUT
  // ============================================================
  organizeOutput(output) {
    if (!output) return output;
    let organized = output;
    organized = organized.replace(/^\n+/, '').replace(/\n+$/, '');
    organized = organized.replace(/\n{3,}/g, '\n\n');
    organized = organized.split('\n').map(l => l.trimEnd()).join('\n');
    organized = organized.replace(/(PART\s+[IVX\d]+[^\n]*)\n(?=[^\n])/gi, '$1\n\n');
    organized = organized.replace(/^(\d+[\.\)])(?=[^\s])/gm, '$1 ');
    organized = organized.replace(/\n\n(\d+[\.\)])/g, '\n$1');
    organized = organized.replace(/\n{3,}/g, '\n\n');
    return organized.trim();
  },

  // ============================================================
  // COMPREHEND INPUT
  // ============================================================
  comprehendInput(prompt) {
    if (!prompt) return { type: 'general', hasNumbers: false, hasSequence: false, hasCheckX: false, extractedInstructions: [], language: 'english' };
    const lower = prompt.toLowerCase();
    const analysis = {
      type: 'general', hasNumbers: false, hasParts: false, hasABCD: false,
      hasInstructions: false, hasSequence: false, hasCheckX: false,
      hasTrueFalse: false, hasMatching: false, extractedInstructions: [], language: 'english',
    };
    const numberedMatches = prompt.match(/(^|\n)\s*(?:[_\-*\s]*)\d+\s*[\.\):\-–—]/g);
    analysis.hasNumbers = numberedMatches && numberedMatches.length >= 2;
    analysis.hasParts = /part\s+[IVX\d]+/i.test(prompt) || /(^|\n)\s*[IVX]+\.\s+/i.test(prompt);
    analysis.hasABCD = /(^|\n)\s*[A-D][\.\)]\s*\S/i.test(prompt);
    analysis.hasInstructions = /panuto|directions|instructions|piliin|isulat|sagutin|choose|write|answer|explain|solve|enumerate|fill|match|compute|calculate|list|define|describe|discuss|underline|encircle|draw|color|check|cross|star|smile|sad|tama|mali|true|false/i.test(lower);
    analysis.hasSequence = /sequence|arrange\s+in\s+(the\s+)?correct\s+order|write\s+1-\d+|number\s+the\s+steps|arrange\s+the\s+steps|correct\s+order|put\s+in\s+order/i.test(lower);
    analysis.hasCheckX = /[✓✗]|proper.*improper|improper.*proper|check.*x\s+if|write.*[✓✗]/i.test(prompt) || (/proper/i.test(lower) && /improper/i.test(lower));
    analysis.hasTrueFalse = /true\s+or\s+false|tama\s+o\s+mali|write\s+true|write\s+false|isulat\s+ang\s+tama|isulat\s+ang\s+mali/i.test(lower);
    analysis.hasMatching = /match\s+column|matching\s+type|itapat|tugmain|draw\s+a\s+line/i.test(lower);

    const dirPatterns = [
      /(?:directions?|panuto|instructions?|gawin|gawain)\s*:?\s*([^\n]+(?:\n(?!\s*(?:part\s+[ivx\d]|\d+[\.\)]|[A-Z]\.))[^\n]+)*)/gi,
    ];
    for (const pattern of dirPatterns) {
      const matches = prompt.match(pattern);
      if (matches) {
        for (const match of matches) {
          const trimmed = match.trim();
          if (trimmed.length > 5 && trimmed.length < 500) {
            if (!analysis.extractedInstructions.includes(trimmed)) {
              analysis.extractedInstructions.push(trimmed);
            }
          }
        }
      }
    }

    if (analysis.hasNumbers || analysis.hasParts || analysis.hasABCD) {
      if (analysis.hasInstructions) {
        if (/activity\s+sheet|worksheet|gawain/i.test(lower)) analysis.type = 'activity_sheet';
        else if (/exam|test|quiz|summative|assessment/i.test(lower)) analysis.type = 'exam';
        else analysis.type = 'quiz';
      } else {
        analysis.type = 'quiz';
      }
    }
    if (/^[\d\s\+\-\*\/\(\)\.\,×÷\^]+$/i.test(prompt.replace(/\s/g, '')) || /\bsolve\s+for\b|\bfind\s+x\b|\bequation\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'math';
    }
    if (/\blogic\b|\breasoning\b|\bpattern\b|\briddle\b|\bpuzzle\b|\bbugtong\b/i.test(lower) || /\bhow\s+many\s+(people|sons|daughters|brothers|sisters|children|family|members)\b/i.test(lower) || /\beach\s+(son|daughter|brother|sister|child)\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'logic';
    }
    if (/\bpython\b|\bjava\b|\bjavascript\b|\bprint\s*\(|\bconsole\.log/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'coding';
    }
    if (/\b(essay|sanaysay|write\s+an?\s+essay|composition)\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'essay';
    }
    if (/\bphotosynthesis|respiration|cell|dna|lifecycle|life\s*cycle|cycle|process|stages|phases\b/i.test(lower) ||
        /\batom|molecule|gravity|force|energy|ecosystem|biome|evolution|mitosis|meiosis\b/i.test(lower) ||
        /\bwater\s+cycle|carbon\s+cycle|nitrogen\s+cycle|rock\s+cycle|menstrual\s+cycle\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'science';
    }
    if (/^(what\s+is|what\s+are|define|definition\s+of|meaning\s+of|ano\s+ang|kahulugan\s+ng)\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'definition';
    }
    if (/^(explain|describe|discuss|ipaliwanag|why\s+does|why\s+is|bakit\s+ang)\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'explanation';
    }
    return analysis;
  },

  // ============================================================
  // CALL AI — single provider
  // ============================================================
  async callAIWithViceVersa(prompt, originalPrompt, language, intent) {
    const safePrompt = prompt.length > 8000 ? prompt.substring(0, 8000) : prompt;
    const providers = [
      { name: 'Overchat Claude', call: () => this.callCeddsAPI(safePrompt, OVERCHAT_CLAUDE) },
      { name: 'Overchat DeepSeek', call: () => this.callCeddsAPI(safePrompt, OVERCHAT_DEEPSEEK) },
      { name: 'Chipp', call: () => this.callChippAPI(safePrompt) },
      { name: 'Norch', call: () => this.callNorchAPI(safePrompt) }
    ];
    for (const provider of providers) {
      try {
        const result = await provider.call();
        if (!result || result.trim().length < 3) continue;
        if (this.hasErrorKeyword(result.toLowerCase())) continue;
        return result.trim();
      } catch (error) { }
    }
    throw new Error('All AI providers failed');
  },

  hasErrorKeyword(lower) {
    const keywords = [
      'not enough credits', 'low balance', 'insufficient', 'top up', 'top-up',
      'credits', 'balance', 'quests', 'pollinations.ai',
      'api key', 'quota', 'exceeded', 'limit reached', 'no more credits',
      'out of credits', 'contact whoever runs', 'complete a quest',
      'internal server error', 'service unavailable', 'bad gateway',
      'rate limit', 'too many requests'
    ];
    return keywords.some(kw => lower.includes(kw));
  },

  async callNorchAPI(prompt) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        attempts++;
        const url = `${NORCH_API}?prompt=${encodeURIComponent(prompt)}`;
        const response = await axios.get(url, { timeout: 90000, headers: { 'Accept': 'application/json' } });
        if (response.data?.response || response.data?.message) return response.data.response || response.data.message;
        throw new Error('Empty');
      } catch (error) {
        if (attempts >= 2) throw error;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  },

  async callChippAPI(prompt) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        attempts++;
        const url = `${CHIPP_API}?message=${encodeURIComponent(prompt)}`;
        const response = await axios.get(url, { timeout: 90000, headers: { 'Accept': 'application/json' } });
        if (response.data?.status === true && response.data?.response) return response.data.response;
        throw new Error('Empty');
      } catch (error) {
        if (attempts >= 2) throw error;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  },

  async callCeddsAPI(prompt, url) {
    const apiUrl = `${url}?message=${encodeURIComponent(prompt)}`;
    const response = await axios.get(apiUrl, {
      timeout: 90000,
      headers: { 'Accept': 'application/json' },
      validateStatus: function (status) { return status >= 200 && status < 600; }
    });
    const data = response.data;
    let extracted = null;
    if (data?.result) extracted = data.result;
    if (!extracted && data?.response) extracted = data.response;
    if (!extracted && data?.message) extracted = data.message;
    if (!extracted && typeof data === 'string') extracted = data;
    if (!extracted) throw new Error('No response');
    return extracted;
  },

  // ============================================================
  // CLEAN OUTPUT
  // ============================================================
  cleanOutput(text) {
    if (!text) return '';
    let cleaned = text.trim();

    cleaned = cleaned.replace(/^As an AI.*?\n/i, '');
    cleaned = cleaned.replace(/^Here is.*?\n/i, '');
    cleaned = cleaned.replace(/^Here are.*?\n/i, '');
    cleaned = cleaned.replace(/^Here's.*?\n/i, '');
    cleaned = cleaned.replace(/^Let me.*?\n/i, '');
    cleaned = cleaned.replace(/^The answers are.*?\n/i, '');
    cleaned = cleaned.replace(/^The following are.*?\n/i, '');
    cleaned = cleaned.replace(/^Below is.*?\n/i, '');
    cleaned = cleaned.replace(/^Below are.*?\n/i, '');

    cleaned = cleaned.replace(/\n+(Would you like|If you need|If you want|If you have|If there'?s anything|Feel free to|Let me know|Do you want|Would you like me to|I can also|I could also|Additionally, I can|Also, I can|If you'?d like|Would you like me|Do you want me|Is there anything).*$/is, '');
    cleaned = cleaned.replace(/\n+(Hope this helps|Hope that helps|Hope it helps|Good luck|Best of luck|Good luck with|Hope you|I hope this).*$/is, '');
    cleaned = cleaned.replace(/\n+(Please let me know|Let me know if|Let me know|Please let me|Please do not hesitate).*$/is, '');
    cleaned = cleaned.replace(/\s*[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]+\s*$/gu, '');

    cleaned = cleaned.replace(/^(TITLE|Title):\s*\n[^\n]+\n+/i, '');
    cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.split('\n').map(l => l.trimEnd()).join('\n');

    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/__(.+?)__/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`{1,3}/g, '');

    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');

    cleaned = cleaned.replace(/\\rightarrow/g, '→');
    cleaned = cleaned.replace(/\\to\b/g, '→');
    cleaned = cleaned.replace(/\\Rightarrow/g, '⇒');
    cleaned = cleaned.replace(/\\leftarrow/g, '←');
    cleaned = cleaned.replace(/\\uparrow/g, '↑');
    cleaned = cleaned.replace(/\\downarrow/g, '↓');

    cleaned = cleaned.replace(/\\\[/g, '').replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\\(/g, '').replace(/\\\)/g, '');
    cleaned = cleaned.replace(/\$\$/g, '').replace(/\$/g, '');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

    cleaned = cleaned.replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4');
    cleaned = cleaned.replace(/₅/g, '5').replace(/₆/g, '6').replace(/₇/g, '7');
    cleaned = cleaned.replace(/₈/g, '8').replace(/₉/g, '9').replace(/₀/g, '0').replace(/₁/g, '1');
    cleaned = cleaned.replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/⁵/g, '^5');

    cleaned = cleaned.replace(/^\s+/, '').replace(/\s+$/, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  },

  // ============================================================
  // WORD LIST
  // ============================================================
  isWordListQuestion(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase().trim();
    const patterns = [
      /^other\s+term(s)?\s+(for|of)\s+/i,
      /^other\s+word(s)?\s+(for|of)\s+/i,
      /^another\s+word\s+(for|of)\s+/i,
      /^synonym(s)?\s+(for|of)\s+/i,
      /^antonym(s)?\s+(for|of)\s+/i,
      /^opposite\s+(of|word\s+for)\s+/i,
      /^kasingkahulugan\s+(ng|nang)\s+/i,
      /^kasalungat\s+(ng|nang)\s+/i,
      /^kabaligtaran\s+(ng|nang)\s+/i,
      /^iba\s+pang\s+(salita|tawag|term)\s+(sa|para sa)\s+/i,
      /^list\s+of\s+(terms?|words?|names?)\s+(for|of)\s+/i
    ];
    return patterns.some(pattern => pattern.test(lower));
  },

  async handleWordList(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase().trim();
      let listType = 'synonym';
      if (/antonym|opposite|kasalungat|kabaligtaran/i.test(lower)) listType = 'antonym';
      let targetWord = '';
      const extractPatterns = [
        /^(?:other|another)\s+(?:term|word)s?\s+(?:for|of)\s+(.+)$/i,
        /^synonyms?\s+(?:for|of)\s+(.+)$/i,
        /^antonyms?\s+(?:for|of)\s+(.+)$/i,
        /^opposite\s+(?:of|word\s+for)\s+(.+)$/i,
        /^kasingkahulugan\s+(?:ng|nang)\s+(.+)$/i,
        /^kasalungat\s+(?:ng|nang)\s+(.+)$/i,
        /^list\s+of\s+(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i
      ];
      for (const pattern of extractPatterns) {
        const match = prompt.match(pattern);
        if (match) { targetWord = match[1].trim().replace(/[?.!]+$/, ''); break; }
      }
      if (!targetWord) return null;
      let actionLabel = listType === 'antonym' ? 'antonyms' : 'synonyms';
      let finalPrompt = `Give ALL common ${actionLabel.toUpperCase()} of the word below.\n\nRULES:\n- Output ONLY a NUMBERED LIST.\n- NO intro, NO explanation.\n- Include a brief meaning for each item.\n- BE COMPREHENSIVE.\n- NO emojis, NO markdown.\n\nWORD: ${targetWord}\n\nLIST:`;
      const response = await this.callAIWithViceVersa(finalPrompt, prompt, 'english', 'wordlist');
      let cleaned = this.cleanOutput(response);
      if (!cleaned || cleaned.length < 5) return null;
      return cleaned;
    } catch (error) { return null; }
  },

  // ============================================================
  // GREETINGS
  // ============================================================
  isGreetingOrConversational(prompt) {
    if (!prompt) return false;
    const p = prompt.trim().toLowerCase().replace(/[.:!?,\s]+$/g, '').trim();
    if (p.length > 60) return false;
    const patterns = [
      /^(hai|hi|hey|hello|helo|hallo|yo|sup|hola)$/i,
      /^(kumusta|kamusta|musta|musta na)$/i,
      /^(good\s*(morning|afternoon|evening|day|night))$/i,
      /^(magandang\s*(araw|umaga|hapon|gabi|tanghali))$/i,
      /^(help|tulong|tabang)$/i,
      /^(thank|thanks|thank you|salamat|salamat po)$/i,
      /^(ok|okay|sige|sure|noted)$/i,
      /^(bye|goodbye|paalam|ingat)$/i,
      /^(sorry|pasensya|paumanhin)$/i,
      /^(yes|oo|opo|no|hindi)$/i,
      /^(good|nice|great|galing|magaling)$/i,
      /^(sino|who)\s*(ka|ka po|kayo)$/i,
      /^(ano|what)\s*(pangalan mo|name mo)$/i
    ];
    return patterns.some(pattern => pattern.test(p));
  },

  buildConversationalReply(prompt) {
    const p = prompt.trim().toLowerCase().replace(/[.:!?,\s]+$/g, '').trim();
    if (/^(hai|hi|hey|hello|helo|hallo|yo|sup|hola)$/i.test(p)) return 'Hello! Ako si Teacher Arlene.\n\nI-type ang iyong tanong o i-paste ang activity sheet.';
    if (/^(kumusta|kamusta|musta)/i.test(p)) return 'Kumusta! Ano ang itatanong mo?';
    if (/^(help|tulong|tabang)$/i.test(p)) return 'HELP GUIDE\n\n1. AI - Magtanong ng kahit ano\n2. WEIGHT - Estimate ng timbang\n3. FOLLOW-UP - I-reply ang AI response (80+ functions)\n4. WORD LIST - Synonyms, Antonyms\n5. ACTIVITY SHEET / QUIZ - I-paste lang';
    if (/^(thank|thanks|salamat)/i.test(p)) return 'Walang anuman!';
    if (/^(ok|okay|sige|sure|noted)/i.test(p)) return 'Sige!';
    if (/^(bye|goodbye|paalam|ingat)$/i.test(p)) return 'Paalam!';
    if (/^(sorry|pasensya|paumanhin)$/i.test(p)) return 'Walang problema!';
    if (/^(yes|oo|opo)/i.test(p)) return 'Sige! Ano ang itatanong mo?';
    if (/^(no|hindi)/i.test(p)) return 'Okay.';
    if (/^(good|nice|great|galing|magaling)/i.test(p)) return 'Salamat!';
    if (/^(sino|who)\s*(ka|ka po|kayo)$/i.test(p)) return 'Ako si Teacher Arlene.';
    if (/^(ano|what)\s*(pangalan mo|name mo)$/i.test(p)) return 'Ang pangalan ko ay Teacher Arlene.';
    return 'Hello! Ako si Teacher Arlene.\n\nPaano kita matutulungan?';
  },

  // ============================================================
  // FOLLOW-UP COMMANDS — 80+ FUNCTIONS
  // ============================================================
  isFollowUpCommand(cleanPrompt) {
    if (!cleanPrompt) return false;
    const p = cleanPrompt.toLowerCase().trim();

    // BASIC (K-6)
    if (/^(simplify|simple|pasimplehin|gawing simple|simplify it|make it simple)( it| this| that| mo| po| lang| naman)?$/i.test(p)) return true;
    if (/^(correct|fix|ayusin|itama|proofread)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(define|definition|i-define|bigyan ng kahulugan|ano ang)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(describe|ilarawan|give description)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(examples?|give examples?|magbigay ng halimbawa|halimbawa)( it| this| that| mo| po| of)?$/i.test(p)) return true;
    if (/^(solve|i-solve|solve it|ipakita ang solution)( it| this| that| mo| po)?$/i.test(p)) return true;

    // INTERMEDIATE (7-10)
    if (/^(elaborate|explain more|explain further|paliwanag|ipaliwanag|explain it)( it| this| that| mo| po| nga| more| further| pa)?$/i.test(p)) return true;
    if (/^(paraphrase|rephrase|rewrite|baguhin ang salita|ibang salita)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(expand|dagdagan|add more|more details)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(summarize|summary|buod|paikliin|shorten|brief)( it| this| that| mo| po| lang)?$/i.test(p)) return true;
    if (/^(humanize|make it natural|gawing natural|gawing tao)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(translate|isalin|salin)/i.test(p)) return true;
    if (/^(compare|contrast|ihambing|difference|kaibahan)( it| this| that| mo| po| with| to)?$/i.test(p)) return true;
    if (/^(bullet|bullet point|bullet form|list form)( it| this| that| mo| po| lang)?$/i.test(p)) return true;

    // ADVANCED (11-12)
    if (/^(formalize|i-formalize|gawing pormal|pormalin|make it academic)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(evaluate|assess|rate|suriin|i-rate)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(analyze|analysis|break down|suriin|i-analyze)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(criticize|critique|puna|punahin|comment on)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(construct|build|create|make|gumawa|i-gawa)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(outline|balangkas|make an outline)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(refine|polish|improve|pagandahin)( it| this| that| mo| po)?$/i.test(p)) return true;

    // COLLEGE
    if (/^(cite|citation|apa|mla|cite it|gumawa ng citation)/i.test(p)) return true;
    if (/^(thesis|thesis statement|thesis outline|gumawa ng thesis)/i.test(p)) return true;
    if (/^(literature review|review of related literature|rrl|gumawa ng rrl)/i.test(p)) return true;
    if (/^(research methodology|research design|methodology)/i.test(p)) return true;
    if (/^(data analysis|statistical analysis|analyze data)/i.test(p)) return true;
    if (/^(abstract|executive summary|gumawa ng abstract)/i.test(p)) return true;
    if (/^(hypothesis|formulate hypothesis|gumawa ng hypothesis)/i.test(p)) return true;
    if (/^(research question|formulate research question)/i.test(p)) return true;
    if (/^(discussion|conclusion|recommendation)/i.test(p)) return true;

    // ADVANCED MATH
    if (/^(solve step.?by.?step|show solution|math solution|solve math)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(graph|plot|i-graph|i-plot|describe graph)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(geometry|solve geometry|area|perimeter|volume|circumference)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(statistics|stats|mean|median|mode|standard deviation|variance)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(probability|probability of|compute probability|permutation|combination)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(equation solve|quadratic|system of equations|solve equation)( it| this| that| mo| po)?$/i.test(p)) return true;

    // SCIENCE
    if (/^(balance chemical|chemical equation|balance equation)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(periodic table|element info|atomic number|element details)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(physics formula|physics solve|physics problem)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(biology|biology diagram|biology process)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(lab report|lab format|write lab report)( it| this| that| mo| po)?$/i.test(p)) return true;

    // LANGUAGE
    if (/^(grammar check|check grammar|grammar)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(sentence diagram|diagram sentence)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(poem analysis|analyze poem|poetry)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(literary analysis|analyze literature|analyze text)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(vocabulary|word analysis|word root|etymology)( it| this| that| mo| po)?$/i.test(p)) return true;

    // STUDY HELPERS
    if (/^(flashcards?|make flashcards?|generate flashcards?)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(quiz|generate quiz|make quiz|create quiz)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(study guide|make study guide|study plan)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(summary notes?|summarize notes?|bullet notes?|note summary)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(citation|generate citation|apa citation|mla citation)( it| this| that| mo| po)?$/i.test(p)) return true;

    // ACADEMIC WRITING
    if (/^(essay outline|outline essay|make essay outline)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(annotated bibliography|annotated bib)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(research paper|write research paper|draft research paper)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(essay draft|write essay|draft essay)( it| this| that| mo| po)?$/i.test(p)) return true;

    // TEST / EXAM
    if (/^(test reviewer|make reviewer|reviewer)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(answer key|make answer key|generate answer key)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(score calculator|compute score|calculate grade)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(weakness analyzer|analyze weaknesses|identify weaknesses)( it| this| that| mo| po)?$/i.test(p)) return true;

    // PLAGIARISM + STUDY SCHEDULE (NEW)
    if (/^(plagiarism check|check plagiarism|check originality)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(study schedule|make study schedule|plan study)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(translate to|isalin sa|i-translate sa)/i.test(p)) return true;

    return false;
  },

  getFollowUpAction(cleanPrompt) {
    const p = cleanPrompt.toLowerCase().trim();

    // PLAGIARISM + SCHEDULE
    if (/plagiarism check|check plagiarism|check originality/i.test(p)) return 'plagiarism_check';
    if (/study schedule|make study schedule|plan study/i.test(p)) return 'study_schedule';
    if (/translate to|isalin sa|i-translate sa/i.test(p)) return 'translate_specific';

    // TEST / EXAM
    if (/test reviewer|make reviewer|reviewer/i.test(p)) return 'test_reviewer';
    if (/answer key|make answer key|generate answer key/i.test(p)) return 'answer_key';
    if (/score calculator|compute score|calculate grade/i.test(p)) return 'score_calculator';
    if (/weakness analyzer|analyze weaknesses|identify weaknesses/i.test(p)) return 'weakness_analyzer';

    // ACADEMIC WRITING
    if (/essay outline|outline essay/i.test(p)) return 'essay_outline';
    if (/annotated bibliography|annotated bib/i.test(p)) return 'annotated_bib';
    if (/research paper|write research paper/i.test(p)) return 'research_paper';
    if (/essay draft|write essay|draft essay/i.test(p)) return 'essay_draft';

    // STUDY HELPERS
    if (/flashcards?|make flashcards?/i.test(p)) return 'flashcards';
    if (/quiz|generate quiz|make quiz|create quiz/i.test(p)) return 'quiz';
    if (/study guide|study plan|make study guide/i.test(p)) return 'study_guide';
    if (/summary notes?|summarize notes?|bullet notes?|note summary/i.test(p)) return 'summary_notes';
    if (/citation|generate citation|apa citation|mla citation/i.test(p)) return 'citation';

    // LANGUAGE
    if (/grammar check|check grammar|grammar/i.test(p)) return 'grammar_check';
    if (/sentence diagram|diagram sentence/i.test(p)) return 'sentence_diagram';
    if (/poem analysis|analyze poem|poetry/i.test(p)) return 'poem_analysis';
    if (/literary analysis|analyze literature|analyze text/i.test(p)) return 'literary_analysis';
    if (/vocabulary|word analysis|word root|etymology/i.test(p)) return 'vocabulary';

    // SCIENCE
    if (/balance chemical|chemical equation|balance equation/i.test(p)) return 'balance_chemical';
    if (/periodic table|element info|atomic number|element details/i.test(p)) return 'periodic_table';
    if (/physics formula|physics solve|physics problem/i.test(p)) return 'physics_solve';
    if (/biology|biology diagram|biology process/i.test(p)) return 'biology';
    if (/lab report|lab format|write lab report/i.test(p)) return 'lab_report';

    // MATH
    if (/solve step.?by.?step|show solution|math solution|solve math/i.test(p)) return 'math_solution';
    if (/graph|plot|i-graph|i-plot|describe graph/i.test(p)) return 'graph';
    if (/geometry|solve geometry|area|perimeter|volume|circumference/i.test(p)) return 'geometry';
    if (/statistics|stats|mean|median|mode|standard deviation|variance/i.test(p)) return 'statistics';
    if (/probability|compute probability|permutation|combination/i.test(p)) return 'probability';
    if (/equation solve|quadratic|system of equations|solve equation/i.test(p)) return 'equation_solve';

    // COLLEGE
    if (/cite|citation|apa|mla/i.test(p)) return 'cite';
    if (/thesis statement|thesis outline/i.test(p)) return 'thesis';
    if (/literature review|rrl/i.test(p)) return 'literature_review';
    if (/research methodology|research design|methodology/i.test(p)) return 'methodology';
    if (/data analysis|statistical/i.test(p)) return 'data_analysis';
    if (/abstract|executive summary/i.test(p)) return 'abstract';
    if (/hypothesis/i.test(p)) return 'hypothesis';
    if (/research question/i.test(p)) return 'research_question';
    if (/discussion|conclusion|recommendation/i.test(p)) return 'conclusion';

    // ADVANCED
    if (/summarize|summary|buod|paikliin|shorten|brief/i.test(p)) return 'summarize';
    if (/humanize|make it human|make it natural|gawing natural/i.test(p)) return 'humanize';
    if (/translate|isalin|salin/i.test(p)) return 'translate';
    if (/evaluate|assess|rate|suriin/i.test(p)) return 'evaluate';
    if (/criticize|critique|puna|punahin/i.test(p)) return 'criticize';
    if (/analyze|analysis|break down/i.test(p)) return 'analyze';
    if (/compare|contrast|ihambing/i.test(p)) return 'compare';
    if (/outline|balangkas/i.test(p)) return 'outline';
    if (/bullet|bullet point|bullet form|list form/i.test(p)) return 'bullet';
    if (/define|definition|bigyan ng kahulugan/i.test(p)) return 'define';
    if (/describe|ilarawan|give description/i.test(p)) return 'describe';
    if (/give examples?|provide examples?|magbigay ng halimbawa|examples?|halimbawa/i.test(p)) return 'examples';
    if (/solve step.?by.?step|show solution|i-solve|ipakita ang solution/i.test(p)) return 'solve';
    if (/refine|polish|improve|pagandahin/i.test(p)) return 'refine';
    if (/construct|build|create|make|gumawa|i-gawa/i.test(p)) return 'construct';
    if (/paraphrase|rephrase|rewrite|i-rewrite|i-paraphrase|baguhin/i.test(p)) return 'paraphrase';
    if (/simplify|simple|pasimplehin|gawing simple|madali/i.test(p)) return 'simplify';
    if (/expand|dagdagan|dagdag|add more|more details/i.test(p)) return 'expand';
    if (/correct|fix|i-correct|i-fix|ayusin|tama|itama|proofread/i.test(p)) return 'correct';
    if (/formalize|i-formalize|pormal|academic/i.test(p)) return 'formalize';
    return 'elaborate';
  },

  buildFollowUpPrompt(action, previousResponse) {
    const actionInstructions = {
      // BASIC
      'simplify': 'SIMPLIFY. Use SIMPLE WORDS and SHORT SENTENCES.',
      'correct': 'CORRECT. Fix grammar, spelling, punctuation errors.',
      'define': 'DEFINE. Give clear definition with key characteristics.',
      'describe': 'DESCRIBE. Give detailed description with examples.',
      'examples': 'GIVE EXAMPLES. Provide specific concrete examples.',
      'solve': 'SOLVE STEP-BY-STEP. Show solution clearly, then final answer.',
      // INTERMEDIATE
      'elaborate': 'ELABORATE. Add MORE DETAILS and examples.',
      'paraphrase': 'PARAPHRASE. Rewrite in DIFFERENT WORDS with SAME MEANING.',
      'expand': 'EXPAND. Add MORE INFORMATION and examples.',
      'summarize': 'SUMMARIZE. Give a BRIEF summary. Keep ONLY the MAIN POINTS.',
      'humanize': 'HUMANIZE. Rewrite to sound more NATURAL and HUMAN.',
      'translate': 'TRANSLATE. Translate the text to the requested language.',
      'compare': 'COMPARE. Show similarities and differences clearly.',
      'bullet': 'BULLET POINTS. Convert to clear bullet points.',
      // ADVANCED
      'formalize': 'FORMALIZE. Make it more ACADEMIC and PROFESSIONAL.',
      'evaluate': 'EVALUATE. Assess the quality, accuracy, and effectiveness.',
      'analyze': 'ANALYZE. Break down into parts. Explain each part.',
      'criticize': 'CRITICIZE. Provide constructive criticism.',
      'construct': 'CONSTRUCT. Build or create a NEW version.',
      'outline': 'OUTLINE. Create a structured outline with main points.',
      'refine': 'REFINE. Polish and improve the quality.',
      // COLLEGE
      'cite': 'CITE. Create a proper citation in APA or MLA format.',
      'thesis': 'THESIS. Create a clear thesis statement and outline.',
      'literature_review': 'LITERATURE REVIEW. Create a review of related literature.',
      'methodology': 'METHODOLOGY. Create a research methodology section.',
      'data_analysis': 'DATA ANALYSIS. Analyze data using appropriate statistical methods.',
      'abstract': 'ABSTRACT. Create a concise abstract of the research.',
      'hypothesis': 'HYPOTHESIS. Formulate a clear, testable hypothesis.',
      'research_question': 'RESEARCH QUESTION. Formulate clear, focused research questions.',
      'conclusion': 'CONCLUSION. Create a strong conclusion with recommendations.',
      // MATH
      'math_solution': 'MATH SOLUTION. Show step-by-step solution clearly. Include formulas and final answer.',
      'graph': 'GRAPH. Describe the graph clearly. Include key points, shape, and behavior.',
      'geometry': 'GEOMETRY. Solve the geometry problem. Show formula and steps.',
      'statistics': 'STATISTICS. Compute the required statistics. Show formula and steps.',
      'probability': 'PROBABILITY. Compute the probability. Show formula and steps.',
      'equation_solve': 'EQUATION SOLVE. Solve the equation step-by-step. Show all work.',
      // SCIENCE
      'balance_chemical': 'BALANCE CHEMICAL EQUATION. Show the balanced equation with coefficients.',
      'periodic_table': 'PERIODIC TABLE. Give element info: symbol, atomic number, mass, group, period.',
      'physics_solve': 'PHYSICS SOLVE. Show formula, substitution, and final answer.',
      'biology': 'BIOLOGY. Explain the biology concept or process clearly.',
      'lab_report': 'LAB REPORT. Format the lab report: Title, Objective, Materials, Procedure, Results, Conclusion.',
      // LANGUAGE
      'grammar_check': 'GRAMMAR CHECK. Identify and fix grammar errors. Show corrected version.',
      'sentence_diagram': 'SENTENCE DIAGRAM. Show the sentence structure (subject, verb, object, etc.).',
      'poem_analysis': 'POEM ANALYSIS. Analyze theme, meter, rhyme, and literary devices.',
      'literary_analysis': 'LITERARY ANALYSIS. Analyze theme, symbolism, characters, and plot.',
      'vocabulary': 'VOCABULARY. Analyze the word: root, prefix, suffix, meaning, usage.',
      // STUDY HELPERS
      'flashcards': 'FLASHCARDS. Create Q&A flashcard pairs from the content.',
      'quiz': 'QUIZ. Generate quiz questions (multiple choice or short answer) from the content.',
      'study_guide': 'STUDY GUIDE. Create a study guide with key concepts and review questions.',
      'summary_notes': 'SUMMARY NOTES. Create bullet-point summary notes from the content.',
      'citation': 'CITATION. Generate proper citation in APA or MLA format.',
      // ACADEMIC WRITING
      'essay_outline': 'ESSAY OUTLINE. Create a detailed outline: I. Introduction, II. Body (3-5 points), III. Conclusion.',
      'annotated_bib': 'ANNOTATED BIBLIOGRAPHY. Create annotated bibliography entries with summary and evaluation.',
      'research_paper': 'RESEARCH PAPER. Draft a complete research paper with all standard sections.',
      'essay_draft': 'ESSAY DRAFT. Write a complete essay draft with intro, body, and conclusion.',
      // TEST / EXAM
      'test_reviewer': 'TEST REVIEWER. Generate a comprehensive reviewer with key points and practice questions.',
      'answer_key': 'ANSWER KEY. Create an answer key for the given questions.',
      'score_calculator': 'SCORE CALCULATOR. Compute the score based on correct/incorrect answers.',
      'weakness_analyzer': 'WEAKNESS ANALYZER. Identify topics that need improvement based on the content.',
      // PLAGIARISM + SCHEDULE
      'plagiarism_check': 'PLAGIARISM CHECK. Analyze the content for potential plagiarism. Suggest improvements.',
      'study_schedule': 'STUDY SCHEDULE. Create a study schedule with time allocation for each subject.',
      'translate_specific': 'TRANSLATE. Translate the text to the specific language requested. Keep meaning.'
    };
    const instruction = actionInstructions[action] || actionInstructions['elaborate'];
    let prompt = 'You are a text transformation expert.\n\n';
    prompt += 'TASK: ' + instruction + '\n\n';
    prompt += 'CRITICAL RULES:\n';
    prompt += '- Do NOT explain what the command means.\n';
    prompt += '- Do NOT add intro or outro.\n';
    prompt += '- Do NOT add "Would you like...", "If you need...", "Hope this helps".\n';
    prompt += '- Transform the ORIGINAL RESPONSE below.\n';
    prompt += '- Same language as original (unless translate).\n';
    prompt += '- NO emojis, NO markdown, NO LaTeX.\n';
    prompt += '- Output ONLY the transformed text.\n\n';
    prompt += 'ORIGINAL RESPONSE:\n';
    prompt += '---START---\n';
    prompt += previousResponse;
    prompt += '\n---END---\n\n';
    prompt += 'Now write the ' + action.toUpperCase() + ' version:';
    return prompt;
  },

  // ============================================================
  // WEIGHT
  // ============================================================
  shouldTriggerWeight(lowerPrompt, originalPrompt) {
    const hasWeightWord = /\b(weight|timbang|weigh|estimate)\b/i.test(lowerPrompt);
    const hasGirthWord = /\b(heart\s*girth|girth|dibdib|chest)\b/i.test(lowerPrompt);
    const hasLengthWord = /\b(length|haba)\b/i.test(lowerPrompt);
    const hasGetWord = /^(get|kuha|kunin|compute|calculate|estimate|solve)\b/i.test(lowerPrompt);
    const hasNumbers = /\d+/.test(originalPrompt);
    const animalKeywords = ['pig', 'baboy', 'chicken', 'manok', 'cow', 'baka', 'kalabaw', 'carabao', 'goat', 'kambing', 'sheep', 'tupa', 'fish', 'isda', 'duck', 'pato', 'turkey', 'pabo', 'horse', 'kabayo', 'dog', 'aso', 'cat', 'pusa'];
    const hasAnimal = animalKeywords.some(a => lowerPrompt.includes(a));
    return (hasWeightWord && hasNumbers) || (hasWeightWord && hasAnimal) || (hasGirthWord && hasNumbers) || (hasLengthWord && hasNumbers && hasAnimal) || (hasGetWord && hasAnimal && hasNumbers);
  },

  async handleWeightEstimation(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase();
      let girth = null, length = null;
      const girthMatch = prompt.match(/(?:heart\s*girth|girth|dibdib|chest)\s*[:=]?\s*(\d+\.?\d*)/i);
      if (girthMatch) girth = parseFloat(girthMatch[1]);
      const lengthMatch = prompt.match(/(?:body\s*length|length|haba)\s*[:=]?\s*(\d+\.?\d*)/i);
      if (lengthMatch) length = parseFloat(lengthMatch[1]);
      const allNumbers = prompt.match(/\d+\.?\d*/g) || [];
      if (girth === null && allNumbers.length >= 1) girth = parseFloat(allNumbers[0]);
      if (length === null && allNumbers.length >= 2) length = parseFloat(allNumbers[1]);
      let result = '';
      if (lower.includes('pig') || lower.includes('baboy')) result = this.buildFormula('PIG / BABOY', 'inches', 'lbs', '(Girth × Girth × Length) / 400', girth, length, 400, 10);
      else if (lower.includes('chicken') || lower.includes('manok')) result = this.buildChickenFormula(girth);
      else if (lower.includes('cow') || lower.includes('baka') || lower.includes('carabao') || lower.includes('kalabaw')) result = this.buildFormula('CATTLE', 'cm', 'kg', '(Girth × Girth × Length) / 11877', girth, length, 11877, 12);
      else if (lower.includes('goat') || lower.includes('kambing') || lower.includes('sheep') || lower.includes('tupa')) result = this.buildFormula('SMALL RUMINANT', 'cm', 'kg', '(Girth × Girth × Length) / 10800', girth, length, 10800, 10);
      else if (lower.includes('fish') || lower.includes('isda')) result = this.buildFishFormula(girth, length);
      else if (lower.includes('duck') || lower.includes('pato') || lower.includes('itik') || lower.includes('turkey') || lower.includes('pabo')) result = this.buildPowerFormula('POULTRY', girth, 2.5, 0.0007, 10);
      else if (lower.includes('horse') || lower.includes('kabayo')) result = this.buildFormula('HORSE', 'cm', 'kg', '(Girth × Girth × Length) / 11900', girth, length, 11900, 10);
      else if (lower.includes('dog') || lower.includes('aso')) result = this.buildFormula('DOG', 'cm', 'kg', '(Girth × Girth × Length) / 11800', girth, length, 11800, 12);
      else if (lower.includes('cat') || lower.includes('pusa')) result = this.buildFormula('CAT', 'cm', 'kg', '(Girth × Girth × Length) / 10800', girth, length, 10800, 10);
      else result = 'Please specify animal. Supported: pig, chicken, cow, carabao, goat, sheep, fish, duck, turkey, horse, dog, cat.';
      await this.sendComplete(senderId, this.cleanOutput(result), token);
    } catch (error) { await sendMessage(senderId, { text: 'Error calculating weight.' }, token); }
  },

  buildFormula(name, unit, resultUnit, formulaStr, girth, length, divisor, accuracy) {
    if (girth === null || length === null) return name + ' WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (' + unit + ')\n- Body Length (' + unit + ')\n\nExample: get weight pig heart girth 34 length 31';
    const gs = girth * girth, product = gs * length, result = product / divisor;
    return name + ' WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' ' + unit + '\nBody Length: ' + length + ' ' + unit + '\nFormula: ' + formulaStr + '\n\nSolution:\n' + girth + ' × ' + girth + ' = ' + gs.toFixed(2) + '\n' + gs.toFixed(2) + ' × ' + length + ' = ' + product.toFixed(2) + '\n' + product.toFixed(2) + ' / ' + divisor + ' = ' + result.toFixed(2) + ' ' + resultUnit + '\n\nAnswer: ' + result.toFixed(1) + ' ' + resultUnit + ' (± ' + accuracy + '%)';
  },

  buildChickenFormula(girth) {
    if (girth === null) return 'CHICKEN WEIGHT FORMULA\n\nPlease provide Heart Girth (cm).';
    const power = Math.pow(girth, 2.417), kg = 0.001 * power;
    return 'CHICKEN WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' cm\nFormula: 0.001 × (Girth)^2.417\n\nSolution:\n' + girth + '^2.417 = ' + power.toFixed(4) + '\n0.001 × ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nAnswer: ' + kg.toFixed(2) + ' kg (± 8%)';
  },

  buildPowerFormula(name, girth, power, multiplier, accuracy) {
    if (girth === null) return name + ' WEIGHT FORMULA\n\nPlease provide Heart Girth (cm).';
    const pow = Math.pow(girth, power), kg = multiplier * pow;
    return name + ' WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' cm\nFormula: ' + multiplier + ' × (Girth)^' + power + '\n\nSolution:\n' + girth + '^' + power + ' = ' + pow.toFixed(4) + '\n' + multiplier + ' × ' + pow.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nAnswer: ' + kg.toFixed(2) + ' kg (± ' + accuracy + '%)';
  },

  buildFishFormula(girth, length) {
    if (girth === null || length === null) return 'FISH WEIGHT FORMULA\n\nPlease provide:\n- Total Length (cm)\n- Girth (cm)';
    const gs = girth * girth, product = length * gs, kg = product / 15000;
    return 'FISH WEIGHT\n\nGiven:\nLength: ' + length + ' cm\nGirth: ' + girth + ' cm\nFormula: (Length × Girth × Girth) / 15000\n\nSolution:\n' + girth + ' × ' + girth + ' = ' + gs.toFixed(2) + '\n' + gs.toFixed(2) + ' × ' + length + ' = ' + product.toFixed(2) + '\n' + product.toFixed(2) + ' / 15000 = ' + kg.toFixed(3) + ' kg\n\nAnswer: ' + kg.toFixed(2) + ' kg (± 15%)';
  },

  // ============================================================
  // ENSURE COMPLETE
  // ============================================================
  ensureComplete(text) {
    if (!text) return text;
    if (text.trim().endsWith('...')) text = text.replace(/\.\.\.$/, '');
    let cleaned = text.trim();
    const finalAnswerMatches = cleaned.match(/Final Answer:.*$/gim);
    if (finalAnswerMatches && finalAnswerMatches.length > 1) {
      cleaned = cleaned.replace(/Final Answer:.*$/gim, '');
      cleaned = cleaned.trim() + '\n\n' + finalAnswerMatches[finalAnswerMatches.length - 1].trim();
    }
    return cleaned;
  },

  // ============================================================
  // SEND COMPLETE
  // ============================================================
  async sendComplete(senderId, text, token) {
    if (!text) return;
    if (text.length <= MAX_CHUNK) { await sendMessage(senderId, { text: text }, token); return; }
    const chunks = this.splitComplete(text);
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (!chunk) continue;
      try {
        await sendMessage(senderId, { text: chunk }, token);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
      } catch (error) { console.error('[sendComplete] Error:', error.message); }
    }
  },

  splitComplete(text) {
    if (!text) return [];
    if (text.length <= MAX_CHUNK) return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) { chunks.push(remaining); break; }
      let chunk = remaining.substring(0, MAX_CHUNK);
      const breakPoints = [
        { char: '\n\n', priority: 10 }, { char: '. ', priority: 9 },
        { char: '! ', priority: 8 }, { char: '? ', priority: 8 },
        { char: '\n', priority: 7 }, { char: '; ', priority: 6 },
        { char: ', ', priority: 5 }, { char: '.', priority: 4 },
        { char: ' ', priority: 1 }
      ];
      let bestIndex = -1, bestPriority = -1;
      for (const bp of breakPoints) {
        const idx = chunk.lastIndexOf(bp.char);
        if (idx > MAX_CHUNK * 0.3 && idx < MAX_CHUNK) {
          if (bestPriority < bp.priority) { bestPriority = bp.priority; bestIndex = idx + bp.char.length; }
        }
      }
      if (bestIndex === -1) {
        const spaceIdx = chunk.lastIndexOf(' ');
        if (spaceIdx > MAX_CHUNK * 0.3) bestIndex = spaceIdx + 1;
        else bestIndex = MAX_CHUNK;
      }
      bestIndex = Math.min(bestIndex, MAX_CHUNK);
      const chunkText = remaining.substring(0, bestIndex).trim();
      if (chunkText) chunks.push(chunkText);
      remaining = remaining.substring(bestIndex).trim();
    }
    return chunks;
  },

  // ============================================================
  // USER / OWNER
  // ============================================================
  isOwnerQuestion(prompt) { return /who (is your owner|created you|made you)|sino (gumawa|may ari) sayo|creator|developer/i.test(prompt); },
  isUserInfoQuestion(prompt) { return /what is my name|ano pangalan ko|my name|pangalan ko|when is my birthday|kelan birthday ko|who am i|sino ako/i.test(prompt); },

  async handleUserInfo(senderId, prompt, token) {
    try {
      const userInfo = await this.getUserInfo(senderId, token);
      let response = '';
      if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) response = userInfo.name ? 'Your name is ' + userInfo.name + '.' : 'Confidential.';
      if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) response += userInfo.birthday ? '\nYour birthday is ' + userInfo.birthday + '.' : '\nConfidential.';
      if (!response) response = userInfo.name ? 'Name: ' + userInfo.name : 'Confidential.';
      await this.sendComplete(senderId, response, token);
    } catch (error) { await sendMessage(senderId, { text: 'Error fetching user info.' }, token); }
  },

  async getUserInfo(senderId, token) {
    try {
      const url = 'https://graph.facebook.com/' + senderId;
      const params = { access_token: token, fields: 'id,name,first_name,last_name,birthday,gender,location,email' };
      const response = await axios.get(url, { params });
      const data = response.data;
      return { id: data.id || null, name: data.name || null, birthday: data.birthday || null, gender: data.gender || null, location: data.location ? data.location.name : null, email: data.email || null };
    } catch (error) { return {}; }
  },

  async getRepliedMessageData(mid, token) {
    try {
      const url = 'https://graph.facebook.com/v21.0/' + mid;
      const params = { access_token: token, fields: 'message' };
      const { data } = await axios.get(url, { params });
      return { message: data?.message || null };
    } catch (error) { return { message: null }; }
  },

  cleanOldHistory() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    for (const [userId, data] of Object.entries(conversationHistory)) {
      if (now - data.timestamp > maxAge) delete conversationHistory[userId];
    }
  },

  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED') return 'Timeout. Subukan ulit.';
    if (error.response?.status === 429) return 'Masyadong maraming request. Maghintay muna.';
    if (error.response?.status >= 500) return 'Server error. Subukan ulit mamaya.';
    return 'Hindi makapag-process. Subukan ulit.';
  }
};
