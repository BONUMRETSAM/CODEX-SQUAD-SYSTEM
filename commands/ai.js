// ========== ai.js - COMPLETE AI ASSISTANT v42.0.0 ==========
// 100% DYNAMIC | No Hardcoded Answers/Formats | Universal Instructions
// Handles ALL instruction types: encircle, underline, match, smile/sad, T/M, TRUE/FALSE, etc.
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

const NORCH_API = 'https://norch-project.gleeze.com/api/gemini';
const CHIPP_API = 'https://ceddsrestapi.vercel.app/ai/chipp';

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Universal AI assistant - dynamic, no hardcoded formats',
  usage: 'ai [question] | weight [animal] [measurements]',
  version: '42.0.0',
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
        const reply = this.buildConversationalReply(prompt, senderId);
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
          await sendMessage(senderId, { text: 'Walang previous response na ma-' + cleanPrompt + '.\n\nMag-reply sa isang AI response para ma-' + cleanPrompt + ' ko iyon.' }, token);
          return;
        }
        const action = this.getFollowUpAction(cleanPrompt);
        const followUpPrompt = this.buildFollowUpPrompt(action, previousResponse, prompt);
        const response = await this.callAIWithViceVersa(followUpPrompt, prompt, 'english', action);
        let cleaned = this.cleanOutput(response);
        cleaned = this.ensureComplete(cleaned);
        conversationHistory[senderId] = { lastPrompt: previousPrompt || 'previous', lastResponse: cleaned, timestamp: Date.now() };
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

      // STEP 6: COMPREHEND INPUT (dynamic analysis, walang hardcoded format)
      const analysis = this.comprehendInput(prompt);
      
      console.log('[AI] Type:', analysis.type, '| HasNumbers:', analysis.hasNumbers, '| Instructions:', analysis.extractedInstructions.length, '| Length:', prompt.length);

      // STEP 7: BUILD UNIVERSAL PROMPT (dynamic, walang hardcoded)
      const finalPrompt = this.buildUniversalPrompt(prompt, analysis, previousResponse, previousPrompt);

      // STEP 8: CALL API
      let aiResponse = await this.callAIWithViceVersa(finalPrompt, prompt, 'english', analysis.type);

      // STEP 9: VERIFY (kung may numbered items)
      if (analysis.hasNumbers) {
        aiResponse = await this.verifyCompleteness(aiResponse, prompt);
      }

      // STEP 10: LIGHT CLEAN
      aiResponse = this.cleanOutput(aiResponse);
      aiResponse = this.ensureComplete(aiResponse);

      conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: aiResponse, timestamp: Date.now() };
      this.cleanOldHistory();

      await this.sendComplete(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      let errorMsg = 'Hindi makapag-process ng request ngayon. Subukan ulit mamaya.';
      if (error.code === 'ECONNABORTED') errorMsg = 'Timeout ang request. Subukan ulit.';
      else if (error.response?.status === 429) errorMsg = 'Masyadong maraming request. Maghintay ng ilang segundo.';
      else if (error.response?.status >= 500) errorMsg = 'Server error ang AI provider. Subukan ulit mamaya.';
      await sendMessage(senderId, { text: errorMsg }, token);
    }
  },

  // ============================================================
  // COMPREHEND INPUT (dynamic, walang hardcoded format)
  // ============================================================
  comprehendInput(prompt) {
    if (!prompt) return { type: 'general', hasNumbers: false, extractedInstructions: [], language: 'english' };

    const lower = prompt.toLowerCase();
    const analysis = {
      type: 'general',
      hasNumbers: false,
      hasParts: false,
      hasABCD: false,
      hasInstructions: false,
      extractedInstructions: [],
      language: 'english',
    };

    // Structure detection
    const numberedMatches = prompt.match(/(^|\n)\s*(?:[_\-*\s]*)\d+\s*[\.\):\-–—]/g);
    analysis.hasNumbers = numberedMatches && numberedMatches.length >= 2;
    analysis.hasParts = /part\s+[IVX\d]+/i.test(prompt) || /(^|\n)\s*[IVX]+\.\s+/i.test(prompt);
    analysis.hasABCD = /(^|\n)\s*[A-D][\.\)]\s*\S/i.test(prompt);
    analysis.hasInstructions = /panuto|directions|instructions|piliin|isulat|sagutin|choose|write|answer|explain|solve|enumerate|fill|match|compute|calculate|list|define|describe|discuss|underline|encircle|draw|color|check|cross|star|smile|sad|tama|mali|true|false/i.test(lower);

    // ============================================================
    // EXTRACT ALL INSTRUCTIONS (dynamic, walang hardcoded format)
    // ============================================================
    
    // Pattern 1: "Directions: ...", "Panuto: ...", "Instructions: ...", "Gawin: ..."
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

    // Pattern 2: Specific instruction keywords (write, isulat, underline, encircle, match, etc.)
    const specificPatterns = [
      /(?:write|isulat|mark|lagyan|underline|encircle|draw|color|check|cross|star|match|choose|piliin|sagutin|fill\s+in|punan|write\s+the\s+letter|write\s+the\s+word|write\s+the\s+correct|write\s+the\s+answer|write\s+\w+\s+if|write\s+\w+\s+kung)\s+[^\n]+/gi,
    ];
    for (const pattern of specificPatterns) {
      const matches = prompt.match(pattern);
      if (matches) {
        for (const match of matches) {
          const trimmed = match.trim();
          // Only keep if it's a full sentence (has period or short enough)
          if (trimmed.length > 10 && trimmed.length < 300) {
            if (!analysis.extractedInstructions.some(i => i.includes(trimmed) || trimmed.includes(i))) {
              analysis.extractedInstructions.push(trimmed);
            }
          }
        }
      }
    }

    // ============================================================
    // DETECT CONTENT TYPE (structure-based)
    // ============================================================
    
    // Quiz/exam/activity sheet
    if (analysis.hasNumbers || analysis.hasParts || analysis.hasABCD) {
      if (analysis.hasInstructions) {
        if (/activity\s+sheet|worksheet|gawain/i.test(lower)) {
          analysis.type = 'activity_sheet';
        } else if (/exam|test|quiz|summative|assessment/i.test(lower)) {
          analysis.type = 'exam';
        } else {
          analysis.type = 'quiz';
        }
      } else {
        analysis.type = 'quiz';
      }
    }

    // Math (priority kung may equation)
    if (
      /^[\d\s\+\-\*\/\(\)\.\,×÷\^]+$/i.test(prompt.replace(/\s/g, '')) ||
      /\bsolve\s+for\b|\bfind\s+x\b|\bequation\b/i.test(lower) ||
      /[a-z]\s*\^\s*\d|\([^)]+\)\s*\^/i.test(prompt) ||
      /[a-z]\s*[\+\-\*\/]\s*\d|\d\s*[a-z]\s*[\+\-\*\/]/i.test(prompt) ||
      /\bcalculate\b|\bcompute\b|\bsimplify\b|\bevaluate\b|\bderivative\b|\bintegral\b|\bfactor\b/i.test(lower) ||
      /\bsin\b|\bcos\b|\btan\b|\blog\b|\bln\b|\bsqrt\b/i.test(lower) ||
      /\bpercent\b|\bpercentage\b|\bratio\b|\bproportion\b|\baverage\b/i.test(lower) ||
      /\barea\b|\bperimeter\b|\bvolume\b|\bcircumference\b/i.test(lower) ||
      (/\bhow\s+many\b/i.test(lower) && /\d/.test(prompt) && /\b(left|remain|total|are|is|were|will)\b/i.test(lower))
    ) {
      if (analysis.type === 'general') analysis.type = 'math';
    }

    // Logic
    if (
      /\blogic\b|\breasoning\b|\bpattern\b|\briddle\b|\bpuzzle\b|\bbugtong\b/i.test(lower) ||
      /\bhow\s+many\s+(people|sons|daughters|brothers|sisters|children|family|members)\b/i.test(lower) ||
      /\beach\s+(son|daughter|brother|sister|child)\b/i.test(lower) ||
      /\bhas\s+\d+\s+(sons?|daughters?|children?|brothers?|sisters?)\b/i.test(lower)
    ) {
      if (analysis.type === 'general') analysis.type = 'logic';
    }

    // Coding
    if (/\bpython\b|\bjava\b|\bjavascript\b|\bc\+\+\b|\bprint\s*\(|\bconsole\.log|\bfunction\s+\w+\s*\(/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'coding';
    }

    // Essay
    if (/\b(essay|sanaysay|write\s+an?\s+essay|composition|magsulat\s+ng)\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'essay';
    }

    // Science
    if (
      /\bphotosynthesis|respiration|cell|dna|rna\b/i.test(lower) ||
      /\batom|molecule|element|compound|chemical\s+reaction\b/i.test(lower) ||
      /\bgravity|force|motion|energy|velocity|acceleration\b/i.test(lower) ||
      /\becosystem|biome|evolution\b/i.test(lower)
    ) {
      if (analysis.type === 'general') analysis.type = 'science';
    }

    // Definition
    if (/^(what\s+is|what\s+are|define|definition\s+of|meaning\s+of|ano\s+ang|kahulugan\s+ng)\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'definition';
    }

    // Explanation
    if (/^(explain|describe|discuss|ipaliwanag|why\s+does|why\s+is|bakit\s+ang)\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'explanation';
    }

    return analysis;
  },

  // ============================================================
  // BUILD UNIVERSAL PROMPT (dynamic, walang hardcoded)
  // ============================================================
  buildUniversalPrompt(prompt, analysis, previousResponse, previousPrompt) {
    let finalPrompt = '';

    // Context (follow-up)
    if (previousResponse && previousPrompt) {
      finalPrompt += `CONTEXT:\n`;
      finalPrompt += `Previous question: ${previousPrompt.substring(0, 200)}\n`;
      finalPrompt += `Previous answer: ${previousResponse.substring(0, 300)}\n\n`;
    }

    // User's input
    finalPrompt += `=== USER'S INPUT ===\n`;
    finalPrompt += `${prompt}\n\n`;

    // Core task
    finalPrompt += `=== YOUR TASK ===\n`;
    finalPrompt += `Read the input above CAREFULLY. Understand every instruction. Answer completely and accurately.\n\n`;

    // Absolute rules
    finalPrompt += `=== ABSOLUTE RULES ===\n`;
    finalPrompt += `1. FOLLOW the instructions EXACTLY as written in the input.\n`;
    finalPrompt += `2. MIRROR the format. If input has "1.", answer "1.". If "A.", answer "A.". If "Part I", keep "Part I".\n`;
    finalPrompt += `3. Answer ONLY what is asked. NOTHING ADDED, NOTHING REMOVED.\n`;
    finalPrompt += `4. Do NOT add "Answer:", "Final Answer:", "Solution:", "Reasoning:", "Given:", "Formula:" labels unless the input has them.\n`;
    finalPrompt += `5. Do NOT add intro ("Here is...", "Let me...") or outro ("Hope this helps").\n`;
    finalPrompt += `6. Do NOT add sections like "I. DEFINITION", "II. KEY POINTS".\n`;
    finalPrompt += `7. Answer EVERY item. NO BLANKS. If a number appears, it MUST have an answer.\n`;
    finalPrompt += `8. NO emojis, NO markdown, NO LaTeX.\n`;
    finalPrompt += `9. Respond in the SAME LANGUAGE as the input.\n\n`;

    // ============================================================
    // HANDLING PHYSICAL / NON-TEXT ACTIONS (IMPORTANT!)
    // ============================================================
    finalPrompt += `=== HANDLING NON-TEXT ACTIONS (IMPORTANT) ===\n`;
    finalPrompt += `Some instructions ask for actions that cannot be done in text.\n`;
    finalPrompt += `DO NOT SKIP the question. Instead, provide the CORRECT ANSWER in an appropriate text form.\n\n`;
    finalPrompt += `HOW TO HANDLE:\n`;
    finalPrompt += `- "Encircle the correct answer" → write the correct answer (e.g., "C) 8")\n`;
    finalPrompt += `- "Underline the wrong word" → write the wrong word, then the correct word\n`;
    finalPrompt += `- "Draw a line to match" → write the match (e.g., "1-B")\n`;
    finalPrompt += `- "Color the..." → write the color name (e.g., "red")\n`;
    finalPrompt += `- "Check the box" → write [✓] or [ ]\n`;
    finalPrompt += `- "Cross out the wrong..." → write the crossed word\n`;
    finalPrompt += `- "Put a star on..." → write the correct answer\n`;
    finalPrompt += `- "Write SMILE if correct, SAD if wrong" → write SMILE or SAD\n`;
    finalPrompt += `- "Write HAPPY if tama, SAD if mali" → write HAPPY or SAD\n`;
    finalPrompt += `- "Write ✓ if proper, ✗ if improper" → write ✓ or ✗\n`;
    finalPrompt += `- "Write T if Tama, M if Mali" → write T or M\n`;
    finalPrompt += `- "Write TRUE if correct, FALSE if wrong" → write TRUE or FALSE\n`;
    finalPrompt += `- "Isulat ang TAMA kung tama, MALI kung mali" → write TAMA or MALI\n`;
    finalPrompt += `- "Write the letter of the correct answer" → write A, B, C, or D\n`;
    finalPrompt += `- "Write the correct word" → write the correct word\n`;
    finalPrompt += `- "Write YES if correct, NO if wrong" → write YES or NO\n`;
    finalPrompt += `- "Write O if tama, X if mali" → write O or X\n`;
    finalPrompt += `- "Put a check (/) if correct, cross (x) if wrong" → write / or x\n`;
    finalPrompt += `- "Arrange the steps in order by writing 1-5" → write numbers 1-5\n`;
    finalPrompt += `- "Write 1 if the statement is correct, 2 if wrong" → write 1 or 2\n`;
    finalPrompt += `- "Mark the correct answer with an asterisk (*)" → write * before the answer\n`;
    finalPrompt += `- "Box the correct answer" → write the answer in brackets [answer]\n`;
    finalPrompt += `- Any other instruction → FOLLOW IT EXACTLY using text-equivalent format.\n\n`;
    finalPrompt += `NEVER skip a question just because you cannot do the physical action.\n`;
    finalPrompt += `ALWAYS provide the CORRECT ANSWER in the appropriate text form.\n\n`;

    // ============================================================
    // EXACT INSTRUCTIONS FROM INPUT (dynamic)
    // ============================================================
    if (analysis.extractedInstructions.length > 0) {
      finalPrompt += `=== EXACT INSTRUCTIONS FROM INPUT (follow these EXACTLY) ===\n`;
      for (const instr of analysis.extractedInstructions) {
        finalPrompt += `- "${instr}"\n`;
      }
      finalPrompt += `\n`;
    }

    // ============================================================
    // FORMAT NOTE (kung walang numbered items)
    // ============================================================
    if (!analysis.hasNumbers) {
      finalPrompt += `=== FORMAT NOTE ===\n`;
      finalPrompt += `- There are NO numbered items in the input. Do NOT add "1.", "2.", "3." numbering unless the input already has them.\n`;
      finalPrompt += `- Answer in sentences or paragraphs.\n\n`;
    }

    finalPrompt += `NOW ANSWER:`;

    return finalPrompt;
  },

  // ============================================================
  // CALL AI - PRIORITY BASED (First success wins)
  // ============================================================
  async callAIWithViceVersa(prompt, originalPrompt, language, intent) {
    const safePrompt = prompt.length > 8000 ? prompt.substring(0, 8000) : prompt;

    const providers = [
      { name: 'Norch', call: () => this.callNorchAPI(safePrompt) },
      { name: 'Chipp', call: () => this.callChippAPI(safePrompt) },
      { name: 'DeepAI', call: () => this.callCeddsAPI(safePrompt, 'DeepAI', 'https://ceddsrestapi.vercel.app/ai/deepai', 'message', 'result') },
      { name: 'Overchat Qwen', call: () => this.callCeddsAPI(safePrompt, 'Overchat Qwen', 'https://ceddsrestapi.vercel.app/ai/overchat-qwen', 'message', 'result', 'operator', 'Ioarkdev') },
      { name: 'ChatPlus', call: () => this.callCeddsAPI(safePrompt, 'ChatPlus', 'https://ceddsrestapi.vercel.app/ai/chatplus', 'message', 'result', 'operator', 'ceddsdev') },
      { name: 'Opera AI', call: () => this.callCeddsAPI(safePrompt, 'Opera AI', 'https://betadash-api-swordslush-production.up.railway.app/opera', 'ask', 'message', 'success') }
    ];

    const failures = [];

    for (const provider of providers) {
      try {
        console.log(`[AI] Trying ${provider.name}...`);
        const result = await provider.call();

        if (!result || typeof result !== 'string' || result.trim().length < 3) {
          failures.push(`${provider.name}: empty`);
          continue;
        }

        const trimmed = result.trim();
        const lower = trimmed.toLowerCase();

        if (this.hasErrorKeyword(lower)) {
          failures.push(`${provider.name}: error keyword`);
          continue;
        }

        console.log(`[AI] ✓ Using ${provider.name} (${trimmed.length} chars)`);
        return trimmed;

      } catch (error) {
        failures.push(`${provider.name}: ${error.message}`);
        console.log(`[AI] ✗ ${provider.name}: ${error.message}`);
      }
    }

    console.error('[AI] All failed:', failures.join(' | '));
    throw new Error(`All AI providers failed. ${failures.join(' | ')}`);
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
        if (response.data?.response || response.data?.message) {
          return response.data.response || response.data.message;
        }
        throw new Error('Empty response');
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
        if (response.data?.status === true && response.data?.response) {
          return response.data.response;
        }
        throw new Error('Empty response');
      } catch (error) {
        if (attempts >= 2) throw error;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  },

  async callCeddsAPI(prompt, name, url, param, responsePath, successField, successValue) {
    const encodedPrompt = encodeURIComponent(prompt);
    const apiUrl = url + '?' + param + '=' + encodedPrompt;

    const response = await axios.get(apiUrl, {
      timeout: 90000,
      headers: { 'Accept': 'application/json' },
      validateStatus: function (status) { return status >= 200 && status < 600; }
    });

    const data = response.data;

    if (successField && successValue !== undefined) {
      if (data[successField] !== successValue) {
        throw new Error(`${name}: success mismatch`);
      }
    }

    let extracted = null;
    if (responsePath) {
      const path = responsePath.split('.');
      let value = data;
      for (const key of path) {
        if (value && typeof value === 'object' && key in value) value = value[key];
        else { value = null; break; }
      }
      if (value && typeof value === 'string') extracted = value;
    }

    if (!extracted) {
      const formats = ['result', 'data', 'response', 'message', 'text', 'content', 'output'];
      for (const f of formats) {
        if (data && typeof data === 'object' && data[f] && typeof data[f] === 'string') {
          extracted = data[f];
          break;
        }
      }
    }

    if (!extracted) {
      if (typeof data === 'string') extracted = data;
      else throw new Error(`${name}: No response`);
    }

    return extracted;
  },

  // ============================================================
  // LIGHT CLEAN (hindi aggressive, keep important symbols)
  // ============================================================
  cleanOutput(text) {
    if (!text) return '';
    let cleaned = text.trim();

    // Remove meta-info
    cleaned = cleaned.replace(/\[?\s*Quality\s*:?\s*\d+[^\]]*\]?/gi, '');
    cleaned = cleaned.replace(/\[?\s*Score\s*:?\s*\d+[^\]]*\]?/gi, '');
    cleaned = cleaned.replace(/\[(?:Quality|Score|Source|API|Model)[^\]]*\]/gi, '');

    // Remove AI artifacts
    cleaned = cleaned.replace(/^As an AI.*?\n/i, '');
    cleaned = cleaned.replace(/^As DeepSeek.*?\n/i, '');
    cleaned = cleaned.replace(/^As a language model.*?\n/i, '');
    cleaned = cleaned.replace(/^Here is.*?\n/i, '');
    cleaned = cleaned.replace(/^Here's.*?\n/i, '');
    cleaned = cleaned.replace(/^Let me.*?\n/i, '');
    cleaned = cleaned.replace(/^I hope.*?\n/i, '');
    cleaned = cleaned.replace(/^Hope this helps.*?\n/i, '');
    cleaned = cleaned.replace(/^Of course.*?\n/i, '');
    cleaned = cleaned.replace(/^Certainly.*?\n/i, '');
    cleaned = cleaned.replace(/^Absolutely.*?\n/i, '');
    cleaned = cleaned.replace(/^Sure,.*?\n/i, '');

    // Remove TITLE
    cleaned = cleaned.replace(/^(TITLE|Title):\s*\n[^\n]+\n+/i, '');

    // Whitespace
    cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.split('\n').map(l => l.trimEnd()).join('\n');

    // Markdown
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/__(.+?)__/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`{1,3}/g, '');

    // Emojis (pero KEEP important symbols: ✓ ✗ / x O * [ ] at SMILING/SAD/etc.)
    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
    // Keep ✓ (U+2713), ✗ (U+2717), ✘ (U+2718), / , x, O, *, [, ]

    // LaTeX
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

    // Final trim
    cleaned = cleaned.replace(/^\s+/, '').replace(/\s+$/, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  },

  // ============================================================
  // VERIFY COMPLETENESS
  // ============================================================
  async verifyCompleteness(response, originalPrompt) {
    const originalNumbers = this.extractAllItemNumbers(originalPrompt);
    if (originalNumbers.length === 0) return response;

    const answeredNumbers = this.extractAnsweredNumbers(response);
    const missing = originalNumbers.filter(n => !answeredNumbers.includes(n));
    const blanks = this.findBlankAnswers(response);
    const allMissing = [...new Set([...missing, ...blanks])].sort((a, b) => a - b);

    console.log('[Verify] Original:', originalNumbers.length, '| Answered:', answeredNumbers.length, '| Missing:', allMissing.length);

    if (allMissing.length === 0) return response;

    console.log('[Verify] Missing:', allMissing.join(', '));

    const missingItems = this.extractItemsByNumbers(originalPrompt, allMissing);
    if (missingItems.length === 0) return response;

    let retryPrompt = `=== ORIGINAL INPUT ===\n${originalPrompt.substring(0, 2000)}\n\n`;
    retryPrompt += `=== MISSING ITEMS ===\n`;
    retryPrompt += `The following items are MISSING or BLANK. Answer them EXACTLY following the same instructions:\n\n`;
    retryPrompt += missingItems.join('\n\n') + '\n\n';
    retryPrompt += `=== RULES ===\n`;
    retryPrompt += `- FOLLOW the same instructions as the original.\n`;
    retryPrompt += `- MIRROR the same format.\n`;
    retryPrompt += `- Keep the SAME number for each item.\n`;
    retryPrompt += `- NO BLANKS.\n`;
    retryPrompt += `- NO extra labels, NO intro.\n\n`;
    retryPrompt += `Answer:`;

    try {
      const retryResponse = await this.callAIWithViceVersa(retryPrompt, originalPrompt, 'english', 'verify');
      const cleaned = this.cleanOutput(retryResponse);
      if (cleaned && cleaned.length > 5) {
        console.log('[Verify] Appending missing...');
        return response + '\n' + cleaned;
      }
    } catch (e) {
      console.log('[Verify] Retry failed:', e.message);
    }

    return response;
  },

  extractAllItemNumbers(text) {
    const numbers = new Set();
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const patterns = [
        /^(?:[_\-*\s]*)(\d+)\s*[\.\):\-–—]\s*\S/,
        /^(?:Item|Number|No\.|#)\s*(\d+)/i,
      ];
      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const num = parseInt(match[1]);
          if (num >= 1 && num <= 200) numbers.add(num);
          break;
        }
      }
    }
    return Array.from(numbers).sort((a, b) => a - b);
  },

  extractAnsweredNumbers(text) {
    const numbers = new Set();
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const patterns = [
        /^(?:[_\-*\s]*)(\d+)\s*[\.\):\-–—]\s*\S+/,
        /^(?:Item|Number|No\.|#)\s*(\d+)[\.\):\-]?\s*\S+/i,
      ];
      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const num = parseInt(match[1]);
          if (num >= 1 && num <= 200) numbers.add(num);
          break;
        }
      }
    }
    return Array.from(numbers).sort((a, b) => a - b);
  },

  findBlankAnswers(text) {
    const blanks = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(?:[_\-*\s]*)(\d+)\s*[\.\):\-–—]?\s*$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num >= 1 && num <= 200) blanks.push(num);
      }
    }
    return blanks;
  },

  extractItemsByNumbers(text, numbers) {
    const items = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const match = line.match(/^(?:[_\-*\s]*)(\d+)\s*[\.\):\-–—]\s*(.*)$/);
      if (!match) continue;
      const num = parseInt(match[1]);
      if (!numbers.includes(num)) continue;
      let itemText = line;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (!nextLine) continue;
        if (/^(?:[_\-*\s]*)\d+\s*[\.\):\-–—]/.test(nextLine)) break;
        if (/^PART\s+[IVX\d]/i.test(nextLine)) break;
        if (/^(panuto|directions|instructions)/i.test(nextLine)) break;
        itemText += '\n' + nextLine;
      }
      items.push(itemText);
    }
    return items;
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
      /^another\s+term\s+(for|of)\s+/i,
      /^synonym(s)?\s+(for|of)\s+/i,
      /^antonym(s)?\s+(for|of)\s+/i,
      /^opposite\s+(of|word\s+for|term\s+for)\s+/i,
      /^kasingkahulugan\s+(ng|nang)\s+/i,
      /^kasalungat\s+(ng|nang)\s+/i,
      /^kabaligtaran\s+(ng|nang)\s+/i,
      /^kabaliktaran\s+(ng|nang)\s+/i,
      /^iba\s+pang\s+(salita|tawag|term)\s+(sa|para sa)\s+/i,
      /^ibang\s+(salita|tawag|term)\s+(sa|para sa)\s+/i,
      /^list\s+of\s+(terms?|words?|names?)\s+(for|of)\s+/i,
      /^all\s+(terms?|words?|names?)\s+(for|of)\s+/i
    ];
    return patterns.some(pattern => pattern.test(lower));
  },

  async handleWordList(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase().trim();
      let listType = 'synonym';
      if (/antonym|opposite|kasalungat|kabaligtaran|kabaliktaran/i.test(lower)) listType = 'antonym';

      let targetWord = '';
      const extractPatterns = [
        /^(?:other|another)\s+(?:term|word)s?\s+(?:for|of)\s+(.+)$/i,
        /^synonyms?\s+(?:for|of)\s+(.+)$/i,
        /^antonyms?\s+(?:for|of)\s+(.+)$/i,
        /^opposite\s+(?:of|word\s+for|term\s+for)\s+(.+)$/i,
        /^kasingkahulugan\s+(?:ng|nang)\s+(.+)$/i,
        /^kasalungat\s+(?:ng|nang)\s+(.+)$/i,
        /^kabaligtaran\s+(?:ng|nang)\s+(.+)$/i,
        /^kabaliktaran\s+(?:ng|nang)\s+(.+)$/i,
        /^iba\s+pang\s+(?:salita|tawag|term)\s+(?:sa|para sa)\s+(.+)$/i,
        /^ibang\s+(?:salita|tawag|term)\s+(?:sa|para sa)\s+(.+)$/i,
        /^list\s+of\s+(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i,
        /^all\s+(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i
      ];

      for (const pattern of extractPatterns) {
        const match = prompt.match(pattern);
        if (match) { targetWord = match[1].trim().replace(/[?.!]+$/, ''); break; }
      }

      if (!targetWord) return null;

      let actionLabel = listType === 'antonym' ? 'antonyms' : 'synonyms';
      let finalPrompt = `Give ALL common ${actionLabel.toUpperCase()} of the word below.\n\n`;
      finalPrompt += `RULES:\n`;
      finalPrompt += `- Output ONLY a NUMBERED LIST.\n`;
      finalPrompt += `- NO intro, NO explanation, NO essay.\n`;
      finalPrompt += `- Include a brief meaning for each item.\n`;
      finalPrompt += `- BE COMPREHENSIVE.\n`;
      finalPrompt += `- NO emojis, NO markdown.\n\n`;
      finalPrompt += `WORD: ${targetWord}\n\n`;
      finalPrompt += `LIST:`;

      const response = await this.callAIWithViceVersa(finalPrompt, prompt, 'english', 'wordlist');
      let cleaned = this.cleanOutput(response);
      if (!cleaned || cleaned.length < 5) return null;
      return cleaned;
    } catch (error) {
      console.error('[WordList] Error:', error.message);
      return null;
    }
  },

  // ============================================================
  // GREETINGS
  // ============================================================
  isGreetingOrConversational(prompt) {
    if (!prompt) return false;
    const p = prompt.trim().toLowerCase().replace(/[.:!?,\s]+$/g, '').trim();
    if (p.length > 60) return false;
    const patterns = [
      /^(hai|hi|hey|hello|helo|hallo|yo|sup|hola|bonjour|konnichiwa|annyeong|ni hao)$/i,
      /^(kumusta|kamusta|musta|musta na|kamusta ka|kumusta ka|kamusta po)$/i,
      /^(good\s*(morning|afternoon|evening|day|night))$/i,
      /^(magandang\s*(araw|umaga|hapon|gabi|tanghali))$/i,
      /^(help|tulong|tabang|saklolo|help me)$/i,
      /^(thank|thanks|thank you|salamat|salamat po|maraming salamat)$/i,
      /^(ok|okay|sige|sure|noted|gets|i see|i understand|naintindihan)$/i,
      /^(bye|goodbye|paalam|see you|ingat)$/i,
      /^(sorry|pasensya|paumanhin|patawad)$/i,
      /^(yes|oo|opo|yep|yup|yeah|no|nope|hindi)$/i,
      /^(good|nice|great|awesome|perfect|galing|ang galing|magaling)$/i,
      /^(sino|who)\s*(ka|ka po|kayo)$/i,
      /^(ano|what)\s*(pangalan mo|name mo)$/i
    ];
    return patterns.some(pattern => pattern.test(p));
  },

  buildConversationalReply(prompt, senderId) {
    const p = prompt.trim().toLowerCase().replace(/[.:!?,\s]+$/g, '').trim();
    if (/^(hai|hi|hey|hello|helo|hallo|yo|sup|hola|bonjour)$/i.test(p)) {
      return 'Hello! Ako si Teacher Arlene, ang iyong AI assistant.\n\nPaano kita matutulungan ngayon?\n\nI-type lang ang iyong tanong o i-paste ang activity sheet, quiz, o assignment.';
    }
    if (/^(kumusta|kamusta|musta|good\s*(morning|afternoon|evening)|magandang\s*(araw|umaga|hapon|gabi))$/i.test(p)) {
      return 'Kumusta! Ako si Teacher Arlene, handang tumulong sa iyong mga tanong.\n\nAno ang maitutulong ko sa iyo ngayon?';
    }
    if (/^(help|tulong|tabang)$/i.test(p)) {
      return 'HELP GUIDE\n\n1. AI - Magtanong ng kahit ano\n   Example: ai what is photosynthesis\n\n2. WEIGHT - Estimate ng timbang ng hayop\n   Example: get weight pig heart girth 34 length 31\n\n3. FOLLOW-UP - I-reply ang AI response\n   Example: elaborate, paraphrase, simplify, expand\n\n4. WORD LIST - Synonyms, Antonyms\n   Example: other term for happy\n\n5. MATH - Simpleng computation\n   Example: ai 25 + 30 * 2\n\n6. ACTIVITY SHEET / QUIZ - I-paste lang ang buong tanong';
    }
    if (/^(thank|thanks|salamat)/i.test(p)) return 'Walang anuman! Kung may iba ka pang tanong, magtanong ka lang.';
    if (/^(ok|okay|sige|sure|noted|gets|i see|i understand)/i.test(p)) return 'Sige! Kung may iba ka pang katanungan, magtanong ka lang.';
    if (/^(bye|goodbye|paalam|see you|ingat)$/i.test(p)) return 'Paalam! Salamat sa paggamit ng aking serbisyo.\n\nIngat palagi.';
    if (/^(sorry|pasensya|paumanhin|patawad)$/i.test(p)) return 'Walang problema! Kung may tanong ka, magtanong ka lang.';
    if (/^(yes|oo|opo)/i.test(p)) return 'Sige! Ano ang gusto mong itanong?';
    if (/^(no|hindi)/i.test(p)) return 'Okay, walang problema. Kung magbago ang isip mo, narito lang ako.';
    if (/^(good|nice|great|awesome|perfect|galing|magaling)/i.test(p)) return 'Salamat! Kung may iba ka pang tanong, magtanong ka lang.';
    if (/^(sino|who)\s*(ka|ka po|kayo)$/i.test(p)) return 'Ako si Teacher Arlene, isang AI assistant na ginawa ni GeoDevz69.';
    if (/^(ano|what)\s*(pangalan mo|name mo)$/i.test(p)) return 'Ang pangalan ko ay Teacher Arlene.\n\nAko ay isang AI assistant na ginawa ni GeoDevz69.';
    return 'Hello! Ako si Teacher Arlene, ang iyong AI assistant.\n\nPaano kita matutulungan ngayon?';
  },

  // ============================================================
  // FOLLOW-UP COMMANDS
  // ============================================================
  isFollowUpCommand(cleanPrompt) {
    if (!cleanPrompt) return false;
    const p = cleanPrompt.toLowerCase().trim();
    if (/^(elaborate|explain more|explain further|paliwanag|ipaliwanag|dagdag paliwanag)( more| further| pa| po)?$/i.test(p)) return true;
    if (/^(elaborate|explain)\s+(it|this|that|mo|po|nga)?$/i.test(p)) return true;
    if (/^(paraphrase|rephrase|rewrite|i-paraphrase|i-rephrase|i-rewrite|baguhin ang salita)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(simplify|simple|i-simplify|pasimplehin|gawing simple|madaliin)( it| this| that| mo| po| lang| naman)?$/i.test(p)) return true;
    if (/^(expand|i-expand|expand more|dagdagan|dagdagan mo|add more|more details)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(correct|fix|i-correct|i-fix|ayusin|itama)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(formalize|i-formalize|make it formal|gawing pormal|pormalin)( it| this| that| mo| po)?$/i.test(p)) return true;
    return false;
  },

  getFollowUpAction(cleanPrompt) {
    const p = cleanPrompt.toLowerCase().trim();
    if (/paraphrase|rephrase|rewrite|i-rewrite|i-paraphrase|i-rephrase|baguhin|palitan ang salita/i.test(p)) return 'paraphrase';
    if (/simplify|simple|pasimplehin|gawing simple|madali/i.test(p)) return 'simplify';
    if (/expand|dagdagan|dagdag|add more|more details|karagdagang/i.test(p)) return 'expand';
    if (/correct|fix|i-correct|i-fix|ayusin|tama|itama/i.test(p)) return 'correct';
    if (/formalize|i-formalize|pormal|academic/i.test(p)) return 'formalize';
    return 'elaborate';
  },

  buildFollowUpPrompt(action, previousResponse, userCommand) {
    const actionInstructions = {
      'elaborate': 'ELABORATE the following response. Add MORE DETAILS and examples. Keep the same structure but richer.',
      'paraphrase': 'PARAPHRASE the following. Rewrite in DIFFERENT WORDS with SAME MEANING.',
      'simplify': 'SIMPLIFY the following. Use SIMPLE WORDS and SHORT SENTENCES.',
      'expand': 'EXPAND the following. Add MORE INFORMATION and examples.',
      'correct': 'CORRECT the following. Fix grammar, spelling, punctuation.',
      'formalize': 'FORMALIZE the following. Make it more ACADEMIC and PROFESSIONAL.'
    };
    const instruction = actionInstructions[action] || actionInstructions['elaborate'];
    let prompt = 'You are a text transformation expert.\n\n';
    prompt += 'TASK: ' + instruction + '\n\n';
    prompt += 'CRITICAL RULES:\n';
    prompt += '- Do NOT explain what the command means.\n';
    prompt += '- Do NOT define any word.\n';
    prompt += '- Transform the ORIGINAL RESPONSE below.\n';
    prompt += '- Same language as original.\n';
    prompt += '- Be ACCURATE and COMPLETE.\n';
    prompt += '- NO emojis, NO markdown, NO LaTeX.\n\n';
    prompt += 'ORIGINAL RESPONSE:\n';
    prompt += '---START---\n';
    prompt += previousResponse;
    prompt += '\n---END---\n\n';
    prompt += 'Now write the ' + action.toUpperCase() + ' version:';
    return prompt;
  },

  // ============================================================
  // WEIGHT ESTIMATION
  // ============================================================
  shouldTriggerWeight(lowerPrompt, originalPrompt) {
    const hasWeightWord = /\b(weight|timbang|weigh|kilo|kg|lbs|pounds|estimate|tantiya|taya|sukat)\b/i.test(lowerPrompt);
    const hasGirthWord = /\b(heart\s*girth|girth|dibdib|chest|circumference)\b/i.test(lowerPrompt);
    const hasLengthWord = /\b(length|haba|body\s*length)\b/i.test(lowerPrompt);
    const hasGetWord = /^(get|kuha|kunin|compute|calculate|estimate|solve)\b/i.test(lowerPrompt);
    const hasNumbers = /\d+/.test(originalPrompt);
    const animalKeywords = ['pig', 'baboy', 'chicken', 'manok', 'cow', 'baka', 'kalabaw', 'carabao', 'goat', 'kambing', 'sheep', 'tupa', 'fish', 'isda', 'tilapia', 'bangus', 'duck', 'pato', 'itik', 'turkey', 'pabo', 'horse', 'kabayo', 'dog', 'aso', 'cat', 'pusa', 'wood', 'kahoy', 'tabla', 'rice', 'bigas', 'corn', 'mais', 'feeds', 'feed'];
    const hasAnimal = animalKeywords.some(a => lowerPrompt.includes(a));
    return (
      (hasWeightWord && hasNumbers) || (hasWeightWord && hasAnimal) ||
      (hasGirthWord && hasNumbers) || (hasLengthWord && hasNumbers && hasAnimal) ||
      (hasGetWord && hasAnimal && hasNumbers)
    );
  },

  async handleWeightEstimation(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase();
      let girth = null, length = null;
      const girthMatch = prompt.match(/(?:heart\s*girth|girth|dibdib|chest|circumference)\s*[:=]?\s*(\d+\.?\d*)/i);
      if (girthMatch) girth = parseFloat(girthMatch[1]);
      const lengthMatch = prompt.match(/(?:body\s*length|length|haba)\s*[:=]?\s*(\d+\.?\d*)/i);
      if (lengthMatch) length = parseFloat(lengthMatch[1]);
      const allNumbers = prompt.match(/\d+\.?\d*/g) || [];
      if (girth === null && allNumbers.length >= 1) girth = parseFloat(allNumbers[0]);
      if (length === null && allNumbers.length >= 2) length = parseFloat(allNumbers[1]);

      let result = '';
      if (lower.includes('pig') || lower.includes('baboy')) result = this.buildFormula('PIG', 'BABOY', 'inches', 'lbs', '(Heart Girth x Heart Girth x Body Length) / 400', girth, length, 400, 10);
      else if (lower.includes('chicken') || lower.includes('manok')) result = this.buildChickenFormula(girth);
      else if (lower.includes('cow') || lower.includes('baka')) result = this.buildFormula('COW', 'BAKA', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 11877', girth, length, 11877, 12);
      else if (lower.includes('carabao') || lower.includes('kalabaw')) result = this.buildFormula('CARABAO', 'KALABAW', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 11877', girth, length, 11877, 12);
      else if (lower.includes('goat') || lower.includes('kambing')) result = this.buildFormula('GOAT', 'KAMBING', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 10800', girth, length, 10800, 10);
      else if (lower.includes('sheep') || lower.includes('tupa')) result = this.buildFormula('SHEEP', 'TUPA', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 10800', girth, length, 10800, 10);
      else if (lower.includes('fish') || lower.includes('isda')) result = this.buildFishFormula(girth, length);
      else if (lower.includes('duck') || lower.includes('pato') || lower.includes('itik')) result = this.buildPowerFormula('DUCK', 'PATO', girth, 2.5, 0.0007, 10);
      else if (lower.includes('turkey') || lower.includes('pabo')) result = this.buildPowerFormula('TURKEY', 'PABO', girth, 2.5, 0.0009, 10);
      else if (lower.includes('horse') || lower.includes('kabayo')) result = this.buildFormula('HORSE', 'KABAYO', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 11900', girth, length, 11900, 10);
      else if (lower.includes('dog') || lower.includes('aso')) result = this.buildFormula('DOG', 'ASO', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 11800', girth, length, 11800, 12);
      else if (lower.includes('cat') || lower.includes('pusa')) result = this.buildFormula('CAT', 'PUSA', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 10800', girth, length, 10800, 10);
      else result = this.buildWeightGuide();

      await this.sendComplete(senderId, this.cleanOutput(result), token);
    } catch (error) {
      console.error('[Weight] Error:', error.message);
      await sendMessage(senderId, { text: 'Error calculating weight.' }, token);
    }
  },

  buildFormula(name, name2, unit, resultUnit, formulaStr, girth, length, divisor, accuracy) {
    if (girth === null || length === null) {
      return name + ' / ' + name2 + ' WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (' + unit + ')\n- Body Length (' + unit + ')\n\nExample: get weight ' + name.toLowerCase() + ' heart girth 34 length 31';
    }
    const gs = girth * girth;
    const product = gs * length;
    const result = product / divisor;
    return name + ' / ' + name2 + ' WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' ' + unit + '\nBody Length: ' + length + ' ' + unit + '\nFormula: ' + formulaStr + '\n\nSolution:\n' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\n' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' + product.toFixed(2) + ' / ' + divisor + ' = ' + result.toFixed(2) + ' ' + resultUnit + '\n\nFinal Answer: ' + result.toFixed(1) + ' ' + resultUnit + '\n\nAccuracy: +/- ' + accuracy + ' percent';
  },

  buildChickenFormula(girth) {
    if (girth === null) return 'CHICKEN / MANOK WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight chicken heart girth 30';
    const power = Math.pow(girth, 2.417);
    const kg = 0.001 * power;
    return 'CHICKEN / MANOK WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' cm\nFormula: 0.001 x (Heart Girth)^2.417\n\nSolution:\n' + girth + '^2.417 = ' + power.toFixed(4) + '\n0.001 x ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nFinal Answer: ' + kg.toFixed(2) + ' kg\n\nAccuracy: +/- 8 percent';
  },

  buildPowerFormula(name, name2, girth, power, multiplier, accuracy) {
    if (girth === null) return name + ' / ' + name2 + ' WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight ' + name.toLowerCase() + ' heart girth 35';
    const pow = Math.pow(girth, power);
    const kg = multiplier * pow;
    return name + ' / ' + name2 + ' WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' cm\nFormula: ' + multiplier + ' x (Heart Girth)^' + power + '\n\nSolution:\n' + girth + '^' + power + ' = ' + pow.toFixed(4) + '\n' + multiplier + ' x ' + pow.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nFinal Answer: ' + kg.toFixed(2) + ' kg\n\nAccuracy: +/- ' + accuracy + ' percent';
  },

  buildFishFormula(girth, length) {
    if (girth === null || length === null) return 'FISH / ISDA WEIGHT FORMULA\n\nPlease provide:\n- Total Length (cm)\n- Girth (cm)\n\nExample: get weight fish length 30 girth 20';
    const gs = girth * girth;
    const product = length * gs;
    const kg = product / 15000;
    return 'FISH / ISDA WEIGHT\n\nGiven:\nTotal Length: ' + length + ' cm\nGirth: ' + girth + ' cm\nFormula: (Total Length x Girth x Girth) / 15000\n\nSolution:\n' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\n' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' + product.toFixed(2) + ' / 15000 = ' + kg.toFixed(3) + ' kg\n\nFinal Answer: ' + kg.toFixed(2) + ' kg\n\nAccuracy: +/- 15 percent';
  },

  buildWeightGuide() {
    return 'WEIGHT ESTIMATION GUIDE\n\nPIG: (Girth x Girth x Length) / 400 (inches to lbs)\nCHICKEN: 0.001 x (Girth)^2.417 (cm to kg)\nCOW: (Girth x Girth x Length) / 11877 (cm to kg)\nGOAT: (Girth x Girth x Length) / 10800 (cm to kg)\nFISH: (Length x Girth x Girth) / 15000 (cm to kg)\nDUCK: 0.0007 x (Girth)^2.5\n\nExample: get weight pig heart girth 34 length 31';
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
    if (text.length <= MAX_CHUNK) {
      await sendMessage(senderId, { text: text }, token);
      return;
    }
    const chunks = this.splitComplete(text);
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (!chunk) continue;
      try {
        await sendMessage(senderId, { text: chunk }, token);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error('[sendComplete] Error:', error.message);
      }
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
  isOwnerQuestion(prompt) {
    const keywords = ['who is your owner', 'who created you', 'who made you', 'sino gumawa sayo', 'sino may ari sayo', 'owner mo', 'creator', 'developer'];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  isUserInfoQuestion(prompt) {
    const keywords = ['what is my name', 'ano pangalan ko', 'my name', 'pangalan ko', 'when is my birthday', 'kelan birthday ko', 'who am i', 'sino ako'];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  async handleUserInfo(senderId, prompt, token) {
    try {
      const userInfo = await this.getUserInfo(senderId, token);
      let response = '';
      if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) {
        response = userInfo.name ? 'Your name is ' + userInfo.name + '.' : 'I cannot tell you that because it is confidential.';
      }
      if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) {
        response += userInfo.birthday ? '\nYour birthday is ' + userInfo.birthday + '.' : '\nI cannot tell you that because it is confidential.';
      }
      if (!response) response = userInfo.name ? 'Name: ' + userInfo.name : 'I cannot tell you that because it is confidential.';
      await this.sendComplete(senderId, response, token);
    } catch (error) {
      await sendMessage(senderId, { text: 'Error fetching user info.' }, token);
    }
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
      const params = { access_token: token, fields: 'message,from' };
      const { data } = await axios.get(url, { params });
      return { message: data?.message || null, from: data?.from?.id || null };
    } catch (error) {
      return { message: null, from: null };
    }
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
