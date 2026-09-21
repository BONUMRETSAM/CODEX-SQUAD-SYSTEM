// ========== ai.js - COMPLETE AI ASSISTANT v38.0.0 ==========
// Strict Mirror Prompt | Large Models | 100% Clean Output
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

const NORCH_API = 'https://norch-project.gleeze.com/api/gemini';
const CHIPP_API = 'https://ceddsrestapi.vercel.app/ai/chipp';

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with strict mirror output',
  usage: 'ai [question] | weight [animal] [measurements]',
  version: '38.0.0',
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
        const response = await this.callAIWithViceVersa(followUpPrompt, prompt, 'english', action, action, 'followup');
        let cleaned = this.aggressiveClean(response);
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

      // STEP 5: MATH (simplified)
      const mathResult = this.tryMathCompute(prompt);
      if (mathResult) {
        await this.sendComplete(senderId, mathResult, token);
        conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: mathResult, timestamp: Date.now() };
        return;
      }

      // STEP 6: REGULAR AI
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

      // STEP 7: DETECT CONTENT TYPE + LANGUAGE
      const contentType = this.detectContentType(prompt);
      const language = this.detectLanguage(prompt);

      // SERVER-SIDE LOGS only
      console.log('[AI] ContentType:', contentType, '| Language:', language, '| Length:', prompt.length);

      // STEP 8: BUILD STRICT MIRROR PROMPT
      const finalPrompt = this.buildInstructionBasedPrompt(prompt, language, contentType, previousResponse, previousPrompt);

      // STEP 9: CALL API (Priority-based)
      let aiResponse = await this.callAIWithViceVersa(finalPrompt, prompt, language, contentType, contentType, 'general');

      // STEP 10: VERIFY COMPLETENESS (kung may numbered items)
      const hasNumberedItems = this.hasNumberedItems(prompt);
      if (hasNumberedItems) {
        aiResponse = await this.verifyCompleteness(aiResponse, prompt, language, contentType);
      }

      // STEP 11: FINAL CLEAN
      aiResponse = this.aggressiveClean(aiResponse);
      aiResponse = this.ensureComplete(aiResponse);

      conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: aiResponse, timestamp: Date.now() };
      this.cleanOldHistory();

      await this.sendComplete(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: 'Error processing request. Please try again.' }, token);
    }
  },

  // ============================================================
  // DETECT SPECIAL INSTRUCTION (solve, elaborate, explain, etc.)
  // ============================================================
  detectSpecialInstruction(prompt) {
    const lower = prompt.toLowerCase();
    return {
      solve: /\b(solve|compute|calculate|show\s+solution|step\s+by\s+step|with\s+solution|with\s+computation)\b/i.test(lower),
      elaborate: /\b(elaborate|more\s+details|expand|explain\s+further|explain\s+more|add\s+more\s+details|give\s+more\s+details)\b/i.test(lower),
      explainDetail: /\b(explain\s+in\s+detail|explain\s+well|explain\s+thoroughly|detailed\s+explanation|comprehensive\s+explanation)\b/i.test(lower),
      examples: /\b(give\s+examples?|provide\s+examples?|with\s+examples?|halimbawa|magbigay\s+ng\s+halimbawa|give\s+\d+\s+examples?|give\s+at\s+least)\b/i.test(lower),
      essay: /\b(essay|sanaysay|write\s+an?\s+essay|write\s+about|composition|magsulat\s+ng)\b/i.test(lower),
      compare: /\b(compare|difference|similarities|vs\.?|versus|contrast|kaibahan|pagkakaiba)\b/i.test(lower),
      process: /\b(process|stages?|cycle|phases?|steps?|procedure)\b/i.test(lower),
      reasoning: /\b(reasoning|reason|explain\s+why|with\s+reasoning|bakit)\b/i.test(lower),
      definition: /\b(define|definition|what\s+is|what\s+are|meaning|kahulugan|ano\s+ang)\b/i.test(lower),
      list: /\b(list|enumerate|isa-isahin|give\s+\d+|give\s+at\s+least)\b/i.test(lower),
      trueFalse: /\b(true\s+or\s+false|tama\s+o\s+mali)\b/i.test(lower),
      matching: /\b(match|matching\s+type|itapat|tugmain)\b/i.test(lower),
      fillBlank: /\b(fill\s+in\s+the\s+blank|fill\s+in\s+the\s+blanks|punan\s+ang\s+patlang)\b/i.test(lower),
    };
  },

  // ============================================================
  // DETECT CONTENT TYPE (structure-based)
  // ============================================================
  detectContentType(prompt) {
    const lower = prompt.toLowerCase();
    const hasNumberedItems = this.hasNumberedItems(prompt);
    const hasParts = /part\s+[IVX\d]+/i.test(prompt) || /(^|\n)\s*[IVX]+\.\s+/i.test(prompt);
    const hasQuizInstruction = /panuto|directions|instructions|piliin|isulat|sagutin|choose|write|answer|explain|solve|enumerate|fill|match/i.test(lower);

    if (hasNumberedItems && hasQuizInstruction) {
      if (/activity\s+sheet|worksheet|gawain/i.test(lower)) return 'activity_sheet';
      if (/exam|test|quiz|assessment|summative/i.test(lower)) return 'exam';
      if (hasParts) return 'activity_sheet';
      return 'quiz';
    }

    if (hasParts && hasNumberedItems) return 'activity_sheet';

    if (/logic|puzzle|riddle|bugtong|how\s+many\s+(people|sons|daughters|brothers|sisters|children)/i.test(lower)) {
      return 'logic_puzzle';
    }

    if (/python|java\b|javascript|print\(|console\.log|function\s+\w+\(/i.test(lower)) {
      return 'coding_problem';
    }

    if (/^[\d\s\+\-\*\/\(\)\.\,×÷]+$/.test(prompt.replace(/\s/g, ''))) {
      return 'math_computation';
    }

    if (this.isWordListQuestion(prompt)) {
      return 'wordlist';
    }

    return 'general';
  },

  // ============================================================
  // CHECK IF HAS NUMBERED ITEMS
  // ============================================================
  hasNumberedItems(text) {
    if (!text) return false;
    const matches = text.match(/(^|\n)\s*(?:[_\-*\s]*)\d+\s*[\.\):\-–—]/g);
    return matches && matches.length >= 2;
  },

  // ============================================================
  // BUILD INSTRUCTION-BASED PROMPT (Strict Mirror)
  // ============================================================
  buildInstructionBasedPrompt(prompt, language, contentType, previousResponse, previousPrompt) {
    const langName = this.getLanguageName(language);
    const special = this.detectSpecialInstruction(prompt);

    let finalPrompt = '';

    // Previous context (follow-up)
    if (previousResponse && previousPrompt) {
      finalPrompt += `PREVIOUS CONTEXT:\n`;
      finalPrompt += `Q: ${previousPrompt.substring(0, 200)}\n`;
      finalPrompt += `A: ${previousResponse.substring(0, 300)}\n\n`;
    }

    finalPrompt += `USER'S CONTENT:\n`;
    finalPrompt += `${prompt}\n\n`;

    finalPrompt += `=== YOUR TASK ===\n`;
    finalPrompt += `Answer the question(s) above.\n\n`;

    finalPrompt += `=== STRICT RULES (FOLLOW EXACTLY) ===\n`;
    finalPrompt += `1. MIRROR the user's format EXACTLY. If user writes "1.", answer "1.". If user writes "A.", answer "A.". If user writes "PART I", keep "PART I".\n`;
    finalPrompt += `2. Answer ONLY what is asked. NOTHING MORE.\n`;
    finalPrompt += `3. Do NOT add "Final Answer:", "Solution:", "Answer:", "Reasoning:", "Given:", "Formula:", or any label the user did not write.\n`;
    finalPrompt += `4. Do NOT add "Step 1:", "Step 2:" unless the user explicitly asked for step-by-step.\n`;
    finalPrompt += `5. Do NOT add introduction ("Here is...", "The answer is...") or conclusion ("Hope this helps", "In summary").\n`;
    finalPrompt += `6. Do NOT add sections like "I. DEFINITION", "II. KEY POINTS", "III. EXAMPLES".\n`;
    finalPrompt += `7. Do NOT re-number, re-format, or re-structure the user's items.\n`;
    finalPrompt += `8. Do NOT remove any label the user wrote (PART I, A, 1., etc.).\n`;
    finalPrompt += `9. If user wrote "1. What is 5+3?", answer "1. 8" — nothing more.\n`;
    finalPrompt += `10. If user wrote "A. Define photosynthesis", answer "A. [short definition]".\n`;
    finalPrompt += `11. NO BLANKS. Every number must have an answer.\n`;
    finalPrompt += `12. NO emojis, NO markdown (no **bold**), NO LaTeX.\n`;
    finalPrompt += `13. Respond in ${langName.toUpperCase()} language.\n\n`;

    finalPrompt += `=== EXAMPLES ===\n`;
    finalPrompt += `Example 1:\n`;
    finalPrompt += `USER: 1. What is 5+3?\n`;
    finalPrompt += `YOU: 1. 8\n\n`;
    finalPrompt += `Example 2:\n`;
    finalPrompt += `USER: 1. What is 5+3? 2. What is 10-4?\n`;
    finalPrompt += `YOU: 1. 8\n2. 6\n\n`;
    finalPrompt += `Example 3:\n`;
    finalPrompt += `USER: A. Define photosynthesis\n`;
    finalPrompt += `YOU: A. Photosynthesis is the process by which plants convert sunlight into food.\n\n`;

    // SPECIAL INSTRUCTIONS (dynamic, based sa detection)
    if (special.solve) {
      finalPrompt += `=== USER ASKED TO SOLVE ===\n`;
      finalPrompt += `Provide step-by-step computation using equations only (no "Step 1:" label).\n\n`;
    }
    if (special.elaborate) {
      finalPrompt += `=== USER ASKED TO ELABORATE ===\n`;
      finalPrompt += `Provide MORE DETAILS and deeper explanation. Still no added headers.\n\n`;
    }
    if (special.explainDetail) {
      finalPrompt += `=== USER ASKED FOR DETAILED EXPLANATION ===\n`;
      finalPrompt += `Provide comprehensive thorough explanation. Still no added headers.\n\n`;
    }
    if (special.examples) {
      finalPrompt += `=== USER ASKED FOR EXAMPLES ===\n`;
      finalPrompt += `Provide specific concrete examples. Numbered list if applicable.\n\n`;
    }
    if (special.essay) {
      finalPrompt += `=== USER ASKED FOR ESSAY ===\n`;
      finalPrompt += `Write a complete essay (intro, body, conclusion). No "TITLE:" or "I. INTRODUCTION" headers.\n\n`;
    }
    if (special.compare) {
      finalPrompt += `=== USER ASKED TO COMPARE ===\n`;
      finalPrompt += `Provide clear comparison with similarities and differences. Still no added headers.\n\n`;
    }
    if (special.process) {
      finalPrompt += `=== USER ASKED FOR PROCESS/STAGES ===\n`;
      finalPrompt += `Provide all stages or steps in order. Numbered list if applicable.\n\n`;
    }
    if (special.reasoning) {
      finalPrompt += `=== USER ASKED FOR REASONING ===\n`;
      finalPrompt += `Provide reasoning in the same format. No "REASONING:" header.\n\n`;
    }

    finalPrompt += `NOW ANSWER:`;

    return finalPrompt;
  },

  // ============================================================
  // CALL AI - PRIORITY-BASED (First success wins)
  // ============================================================
  async callAIWithViceVersa(prompt, originalPrompt, language, intent, topic, subject, requestType) {
    const providers = [
      { name: 'Norch', call: () => this.callNorchAPI(prompt) },
      { name: 'Chipp', call: () => this.callChippAPI(prompt) },
      { name: 'DeepAI', call: () => this.callCeddsAPI(prompt, 'DeepAI', 'https://ceddsrestapi.vercel.app/ai/deepai', 'message', 'result') },
      { name: 'Overchat Qwen', call: () => this.callCeddsAPI(prompt, 'Overchat Qwen', 'https://ceddsrestapi.vercel.app/ai/overchat-qwen', 'message', 'result', 'operator', 'Ioarkdev') },
      { name: 'ChatPlus', call: () => this.callCeddsAPI(prompt, 'ChatPlus', 'https://ceddsrestapi.vercel.app/ai/chatplus', 'message', 'result', 'operator', 'ceddsdev') },
      { name: 'Opera AI', call: () => this.callCeddsAPI(prompt, 'Opera AI', 'https://betadash-api-swordslush-production.up.railway.app/opera', 'ask', 'message', 'success') }
    ];

    const errorKeywords = [
      'not enough credits', 'low balance', 'insufficient', 'top up', 'top-up', 'topup',
      'credits', 'balance', 'quests', 'pollinations.ai', 'enter.pollinations.ai',
      'api key', 'quota', 'exceeded', 'limit reached', 'no more credits',
      'out of credits', 'contact whoever runs', 'complete a quest',
      'internal server error', 'service unavailable', 'bad gateway'
    ];

    let lastError = null;

    for (const provider of providers) {
      try {
        console.log(`[AI] Trying ${provider.name}...`);
        const result = await provider.call();

        if (!result || typeof result !== 'string') {
          console.log(`[AI] ${provider.name}: empty`);
          continue;
        }

        const trimmed = result.trim();
        if (trimmed.length < 5) {
          console.log(`[AI] ${provider.name}: too short`);
          continue;
        }

        const lower = trimmed.toLowerCase();
        if (errorKeywords.some(kw => lower.includes(kw))) {
          console.log(`[AI] ${provider.name}: error keyword`);
          continue;
        }

        const quality = this.validateResponseQuality(trimmed, intent);
        console.log(`[AI] ${provider.name}: quality ${quality.score}/100`);

        if (quality.score < 40) {
          console.log(`[AI] ${provider.name}: quality too low`);
          continue;
        }

        console.log(`[AI] Using ${provider.name} (score: ${quality.score})`);
        return this.aggressiveClean(trimmed);

      } catch (error) {
        console.log(`[AI] ${provider.name} failed: ${error.message}`);
        lastError = error;
      }
    }

    throw new Error('All providers failed: ' + (lastError?.message || 'unknown'));
  },

  async callNorchAPI(prompt) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        attempts++;
        let finalPrompt = prompt.length > 4000 ? prompt.substring(0, 4000) : prompt;
        const url = `${NORCH_API}?prompt=${encodeURIComponent(finalPrompt)}`;
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
        let finalPrompt = prompt.length > 4000 ? prompt.substring(0, 4000) : prompt;
        const url = `${CHIPP_API}?message=${encodeURIComponent(finalPrompt)}`;
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
        throw new Error(`${name}: success field mismatch`);
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
  // AGGRESSIVE CLEAN (minimal, kasi malinis na ang prompt)
  // ============================================================
  aggressiveClean(text) {
    if (!text) return '';
    let cleaned = text.trim();

    // Remove meta-info kung meron
    cleaned = cleaned.replace(/\[?\s*Quality\s*:?\s*\d+[^\]]*\]?/gi, '');
    cleaned = cleaned.replace(/\[?\s*Score\s*:?\s*\d+[^\]]*\]?/gi, '');
    cleaned = cleaned.replace(/\[?\s*(Source|API|Model|Provider)\s*:?\s*[^\n\]]+\]?/gi, '');
    cleaned = cleaned.replace(/\[?\s*(Norch|Chipp|DeepAI|Overchat|ChatPlus|Opera|Gemini|ChatGPT|Claude|GPT)\s*(AI)?\s*\]?/gi, '');
    cleaned = cleaned.replace(/\[?\s*(Fallback|Trying|Attempting|Retry|Retrying)\s*:?\s*[^\n\]]*\]?/gi, '');
    cleaned = cleaned.replace(/\[(?:Quality|Score|Source|API|Model|Fallback)[^\]]*\]/gi, '');

    // Remove common AI preambles
    cleaned = cleaned.replace(/^(Answer|Sagot|ANSWER|Response|Result):\s*/gim, '');
    cleaned = cleaned.replace(/^As an AI.*?\n/i, '');
    cleaned = cleaned.replace(/^As DeepSeek.*?\n/i, '');
    cleaned = cleaned.replace(/^As a language model.*?\n/i, '');
    cleaned = cleaned.replace(/^Here is.*?\n/i, '');
    cleaned = cleaned.replace(/^Here's.*?\n/i, '');
    cleaned = cleaned.replace(/^Let me.*?\n/i, '');
    cleaned = cleaned.replace(/^Based on.*?\n/i, '');
    cleaned = cleaned.replace(/^According to.*?\n/i, '');
    cleaned = cleaned.replace(/^I hope.*?\n/i, '');
    cleaned = cleaned.replace(/^Hope this helps.*?\n/i, '');
    cleaned = cleaned.replace(/^I will.*?\n/i, '');
    cleaned = cleaned.replace(/^I can.*?\n/i, '');
    cleaned = cleaned.replace(/^I'll.*?\n/i, '');
    cleaned = cleaned.replace(/^This is.*?\n/i, '');
    cleaned = cleaned.replace(/^Below is.*?\n/i, '');
    cleaned = cleaned.replace(/^The following is.*?\n/i, '');
    cleaned = cleaned.replace(/^Sure,?\s+here.*?\n/i, '');
    cleaned = cleaned.replace(/^Of course.*?\n/i, '');
    cleaned = cleaned.replace(/^Certainly.*?\n/i, '');
    cleaned = cleaned.replace(/^Absolutely.*?\n/i, '');
    cleaned = cleaned.replace(/^Okay,?\s+here.*?\n/i, '');
    cleaned = cleaned.replace(/^Note:.*?\n/i, '');
    cleaned = cleaned.replace(/^Disclaimer:.*?\n/i, '');

    // Remove TITLE
    cleaned = cleaned.replace(/^(TITLE|Title):\s*\n[^\n]+\n+/i, '');

    // Dedupe Final Answer (kung meron)
    const finalMatches = cleaned.match(/Final Answer:.*$/gim);
    if (finalMatches && finalMatches.length > 1) {
      cleaned = cleaned.replace(/Final Answer:.*$/gim, '');
      cleaned = cleaned.trim() + '\n\n' + finalMatches[finalMatches.length - 1].trim();
    }

    // Whitespace cleanup
    cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.split('\n').map(l => l.trimEnd()).join('\n');

    // Markdown
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/__(.+?)__/g, '$1');
    cleaned = cleaned.replace(/~~(.+?)~~/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`{1,3}/g, '');

    // Emojis
    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{24C2}-\u{1F251}]/gu, '');

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
  // VALIDATE QUALITY (server-side only)
  // ============================================================
  validateResponseQuality(response, intent) {
    let score = 0;
    const len = response.length;

    if (len > 50) score += 10;
    if (len > 200) score += 15;
    if (len > 500) score += 10;
    if (/\d+\.\s/.test(response)) score += 10;
    if (/^[A-Z].*[.!?]/m.test(response)) score += 10;

    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 15);
    if (sentences.length >= 3) score += 10;
    if (sentences.length >= 8) score += 10;

    const lastChar = response.trim().slice(-1);
    if (['.', '!', '?'].includes(lastChar)) score += 5;

    const genericPatterns = /^(yes|no|okay|sure|i think|maybe|perhaps|i'm not sure)/i;
    if (!genericPatterns.test(response.trim())) score += 10;

    if (intent === 'multiple_choice' || intent === 'quiz' || intent === 'exam') {
      const letters = response.match(/\b[A-D][\.\)]\s/g);
      if (letters && letters.length >= 2) score += 25;
      if (/Final Answer/i.test(response)) score += 15;
    }

    if (intent === 'wordlist') {
      const items = response.match(/^\d+\./gm);
      if (items && items.length >= 20) score += 20;
      else if (items && items.length >= 15) score += 15;
      else if (items && items.length >= 10) score += 5;
    }

    // PENALTIES
    if (/As an AI|As DeepSeek|language model/i.test(response)) score -= 30;
    if (/^\s*TITLE:/i.test(response)) score -= 10;
    if (/\\frac|\\sqrt/.test(response)) score -= 20;
    const newlineCount = (response.match(/\n/g) || []).length;
    if (newlineCount > len / 50) score -= 10;

    return { isGood: score >= 65, isAcceptable: score >= 40, score: Math.max(0, score) };
  },

  // ============================================================
  // VERIFY COMPLETENESS (dynamic)
  // ============================================================
  async verifyCompleteness(response, originalPrompt, language, contentType) {
    const originalNumbers = this.extractAllItemNumbers(originalPrompt);
    if (originalNumbers.length === 0) return response;

    const answeredNumbers = this.extractAnsweredNumbers(response);
    const missing = originalNumbers.filter(n => !answeredNumbers.includes(n));
    const blanks = this.findBlankAnswers(response);
    const allMissing = [...new Set([...missing, ...blanks])].sort((a, b) => a - b);

    console.log('[Verify] Original:', originalNumbers.length, '| Answered:', answeredNumbers.length, '| Missing/Blank:', allMissing.length);

    if (allMissing.length === 0) return response;

    console.log('[Verify] Missing/Blank:', allMissing.join(', '));

    const missingItems = this.extractItemsByNumbers(originalPrompt, allMissing);
    if (missingItems.length === 0) return response;

    const langName = this.getLanguageName(language);
    let retryPrompt = `USER'S CONTENT:\n${originalPrompt}\n\n`;
    retryPrompt += `=== MISSING ITEMS ===\n`;
    retryPrompt += `The following items are MISSING or BLANK. Answer them now:\n\n`;
    retryPrompt += missingItems.join('\n\n') + '\n\n';
    retryPrompt += `=== RULES ===\n`;
    retryPrompt += `1. MIRROR the same format as the original items.\n`;
    retryPrompt += `2. Keep the SAME number for each item.\n`;
    retryPrompt += `3. NO BLANKS.\n`;
    retryPrompt += `4. NO extra labels, NO introduction.\n`;
    retryPrompt += `5. Respond in ${langName.toUpperCase()}.\n\n`;
    retryPrompt += `Answer:`;

    try {
      const retryResponse = await this.callAIWithViceVersa(retryPrompt, originalPrompt, language, contentType, contentType, 'followup');
      const cleaned = this.aggressiveClean(retryResponse);
      if (cleaned && cleaned.length > 5) {
        console.log('[Verify] Appending missing answers...');
        return response + '\n' + cleaned;
      }
    } catch (e) {
      console.log('[Verify] Retry failed:', e.message);
    }

    return response;
  },

  // ============================================================
  // EXTRACT ALL ITEM NUMBERS
  // ============================================================
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
      finalPrompt += `1. Output ONLY a NUMBERED LIST.\n`;
      finalPrompt += `2. NO introduction, NO explanation, NO essay.\n`;
      finalPrompt += `3. Include a brief meaning for each item.\n`;
      finalPrompt += `4. BE COMPREHENSIVE.\n`;
      finalPrompt += `5. NO emojis, NO markdown.\n\n`;
      finalPrompt += `WORD: ${targetWord}\n\n`;
      finalPrompt += `Output ONLY the list:`;

      const response = await this.callAIWithViceVersa(finalPrompt, prompt, 'english', 'wordlist', 'wordlist', 'wordlist', 'general');
      let cleaned = this.aggressiveClean(response);
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
    prompt += '1. Do NOT explain what the command means.\n';
    prompt += '2. Do NOT define any word.\n';
    prompt += '3. Transform the ORIGINAL RESPONSE below.\n';
    prompt += '4. Same language as original.\n';
    prompt += '5. Be ACCURATE and COMPLETE.\n';
    prompt += '6. NO emojis, NO markdown, NO LaTeX.\n';
    prompt += '7. NO "Answer:", NO "Final Answer:" unless in original.\n\n';
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

      await this.sendComplete(senderId, this.aggressiveClean(result), token);
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
  // MATH (Simplified — result lang)
  // ============================================================
  tryMathCompute(prompt) {
    if (!prompt) return null;
    const lower = prompt.toLowerCase();
    const nonMathKeywords = ['summarize', 'summary', 'explain', 'paliwanag', 'what', 'ano', 'why', 'bakit', 'how', 'paano', 'who', 'sino', 'describe', 'list', 'enumerate', 'write', 'isulat', 'make', 'gawa', 'help', 'tulong', 'about', 'tungkol', 'define', 'process', 'examples', 'riddle', 'bugtong', 'puzzle', 'logic', 'research', 'weight', 'timbang', 'synonym', 'antonym'];
    for (const keyword of nonMathKeywords) {
      if (lower.includes(keyword)) return null;
    }
    if (!/^[\d\s\+\-\*\/\(\)\.\,×÷]+$/.test(prompt.replace(/\s/g, ''))) return null;
    let clean = prompt.replace(/,/g, '').replace(/[\+\-\*\/]+$/, '').trim();
    const numbers = clean.match(/\d+\.?\d*/g);
    if (!numbers || numbers.length < 2) return null;
    if (!/[\+\-\*\/×÷]/.test(clean)) return null;
    try {
      let expression = clean.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
      const result = Function('"use strict"; return (' + expression + ')')();
      if (typeof result !== 'number' || !isFinite(result)) return null;
      return result.toString();
    } catch (e) { return null; }
  },

  // ============================================================
  // LANGUAGE
  // ============================================================
  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'po', 'opo', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'dapat', 'kailangan', 'meron', 'wala', 'hindi', 'oo', 'salamat', 'tanong', 'sagot', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta', 'panuto', 'piliin', 'titik', 'isulat', 'sagutin', 'ipaliwanag'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kini', 'unsa', 'ngano', 'asa', 'gusto', 'pwede', 'dili', 'salamat', 'palihug', 'pangutana', 'tubag', 'tabang', 'tabangi', 'kumusta', 'kamusta'];
    let tagCount = 0, bisCount = 0;
    const words = lower.split(/\s+/);
    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagCount++;
      if (bisayaKeywords.includes(word)) bisCount++;
    }
    if (tagCount >= 2) return 'tagalog';
    if (bisCount >= 2) return 'bisaya';
    return 'english';
  },

  getLanguageName(code) {
    const names = { 'english': 'English', 'tagalog': 'Tagalog', 'bisaya': 'Bisaya' };
    return names[code] || 'English';
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
      await this.sendComplete(senderId, this.aggressiveClean(response), token);
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
    if (error.code === 'ECONNABORTED') return 'Request timeout. Please try again.';
    if (error.response?.status === 429) return 'Rate limit exceeded. Please wait.';
    if (error.response?.status >= 500) return 'Server error. Please try again later.';
    return 'Error processing request. Please try again.';
  }
};
