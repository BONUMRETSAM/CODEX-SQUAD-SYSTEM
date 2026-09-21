// ========== ai.js - COMPLETE AI ASSISTANT v44.1.0 ==========
// SAME detection | BETTER output | No duplicates | Organized | Arrows
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

const NORCH_API = 'https://norch-project.gleeze.com/api/gemini';
const CHIPP_API = 'https://ceddsrestapi.vercel.app/ai/chipp';

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Universal AI assistant - clean, organized, no duplicates',
  usage: 'ai [question] | weight [animal] [measurements]',
  version: '44.1.0',
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

      // STEP 6: COMPREHEND INPUT (same detection — accurate)
      const analysis = this.comprehendInput(prompt);
      
      console.log('[AI] Type:', analysis.type, '| HasNumbers:', analysis.hasNumbers, '| Instructions:', analysis.extractedInstructions.length, '| Length:', prompt.length);

      // STEP 7: BUILD UNIVERSAL PROMPT
      const finalPrompt = this.buildUniversalPrompt(prompt, analysis, previousResponse, previousPrompt);

      // STEP 8: CALL API
      let aiResponse = await this.callAIWithViceVersa(finalPrompt, prompt, 'english', analysis.type);

      // STEP 9: CLEAN (with arrows)
      aiResponse = this.cleanOutput(aiResponse);

      // STEP 10: REMOVE DUPLICATES (BAGONG version)
      aiResponse = this.removeDuplicates(aiResponse);

      // STEP 11: ORGANIZE OUTPUT (BAGONG version)
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
  // REMOVE DUPLICATES (BAGONG version — accurate)
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
      
      // Blank line — keep max 1
      if (!trimmed) {
        if (!lastWasBlank) {
          result.push('');
          lastWasBlank = true;
        }
        continue;
      }
      lastWasBlank = false;
      
      // PART header — reset numbering scope
      const partMatch = trimmed.match(/^PART\s+[IVX\d]+/i);
      if (partMatch) {
        currentPart = partMatch[0].toUpperCase();
        result.push(line);
        continue;
      }
      
      // Numbered item (with optional prefix ✓ ✗ spaces _ - *)
      const itemMatch = trimmed.match(/^([✓✗\s_\-*]*)(\d+)[\.\)]\s/);
      if (itemMatch) {
        const key = currentPart + '::' + itemMatch[2];
        if (seenKeys.has(key)) {
          console.log('[Dedup] Skip:', key);
          continue;
        }
        seenKeys.add(key);
        result.push(line);
        continue;
      }
      
      // Lettered item (A., B., etc.)
      const letterMatch = trimmed.match(/^([A-Z])[\.\)]\s/);
      if (letterMatch) {
        const key = currentPart + '::' + letterMatch[1];
        if (seenKeys.has(key)) {
          console.log('[Dedup] Skip letter:', key);
          continue;
        }
        seenKeys.add(key);
        result.push(line);
        continue;
      }
      
      // Non-numbered — keep
      result.push(line);
    }
    
    let cleaned = result.join('\n');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  },

  // ============================================================
  // ORGANIZE OUTPUT (BAGONG version — mirror input structure)
  // ============================================================
  organizeOutput(output) {
    if (!output) return output;
    
    let organized = output;
    
    // 1. Remove leading/trailing newlines
    organized = organized.replace(/^\n+/, '').replace(/\n+$/, '');
    
    // 2. Collapse multiple blank lines
    organized = organized.replace(/\n{3,}/g, '\n\n');
    
    // 3. Remove trailing spaces per line
    organized = organized.split('\n').map(l => l.trimEnd()).join('\n');
    
    // 4. Ensure PARTS have blank line after
    organized = organized.replace(/(PART\s+[IVX\d]+[^\n]*)\n(?=[^\n])/gi, '$1\n\n');
    
    // 5. Ensure numbered items have space after number
    organized = organized.replace(/^(\d+[\.\)])(?=[^\s])/gm, '$1 ');
    
    // 6. Fix double blank lines around numbered items
    organized = organized.replace(/\n\n(\d+[\.\)])/g, '\n$1');
    
    // 7. Final cleanup
    organized = organized.replace(/\n{3,}/g, '\n\n');
    
    return organized.trim();
  },

  // ============================================================
  // COMPREHEND INPUT (SAME detection — accurate)
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

    const numberedMatches = prompt.match(/(^|\n)\s*(?:[_\-*\s]*)\d+\s*[\.\):\-–—]/g);
    analysis.hasNumbers = numberedMatches && numberedMatches.length >= 2;
    analysis.hasParts = /part\s+[IVX\d]+/i.test(prompt) || /(^|\n)\s*[IVX]+\.\s+/i.test(prompt);
    analysis.hasABCD = /(^|\n)\s*[A-D][\.\)]\s*\S/i.test(prompt);
    analysis.hasInstructions = /panuto|directions|instructions|piliin|isulat|sagutin|choose|write|answer|explain|solve|enumerate|fill|match|compute|calculate|list|define|describe|discuss|underline|encircle|draw|color|check|cross|star|smile|sad|tama|mali|true|false/i.test(lower);

    // Extract instructions
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

    const specificPatterns = [
      /(?:write|isulat|mark|lagyan|underline|encircle|draw|color|check|cross|star|match|choose|piliin|sagutin|fill\s+in|punan)\s+[^\n]+/gi,
    ];
    for (const pattern of specificPatterns) {
      const matches = prompt.match(pattern);
      if (matches) {
        for (const match of matches) {
          const trimmed = match.trim();
          if (trimmed.length > 10 && trimmed.length < 300) {
            if (!analysis.extractedInstructions.some(i => i.includes(trimmed) || trimmed.includes(i))) {
              analysis.extractedInstructions.push(trimmed);
            }
          }
        }
      }
    }

    // Content types (SAME detection — accurate)
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

    if (
      /\bphotosynthesis|respiration|cell|dna|lifecycle|life\s*cycle|cycle|process|stages|phases\b/i.test(lower) ||
      /\batom|molecule|gravity|force|energy|ecosystem|biome|evolution|mitosis|meiosis\b/i.test(lower) ||
      /\bwater\s+cycle|carbon\s+cycle|nitrogen\s+cycle|rock\s+cycle|menstrual\s+cycle\b/i.test(lower)
    ) {
      if (analysis.type === 'general') analysis.type = 'science';
    }

    if (
      /\bpractices?|guidelines?|procedures?|steps?\s+(in|of|for)\b/i.test(lower) ||
      /\bhow\s+to\b|\bpaano\s+gawin\b/i.test(lower)
    ) {
      if (analysis.type === 'general') analysis.type = 'guidelines';
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
  // BUILD UNIVERSAL PROMPT (STRICT — direct answers only)
  // ============================================================
  buildUniversalPrompt(prompt, analysis, previousResponse, previousPrompt) {
    let finalPrompt = '';

    if (previousResponse && previousPrompt) {
      finalPrompt += `CONTEXT:\n`;
      finalPrompt += `Previous Q: ${previousPrompt.substring(0, 200)}\n`;
      finalPrompt += `Previous A: ${previousResponse.substring(0, 300)}\n\n`;
    }

    finalPrompt += `=== USER'S INPUT ===\n`;
    finalPrompt += `${prompt}\n\n`;

    finalPrompt += `=== YOUR TASK ===\n`;
    finalPrompt += `Answer the input above. READ the instructions carefully. FOLLOW them EXACTLY.\n`;
    finalPrompt += `Answer ONLY what is asked. Do NOT go beyond the topic. Do NOT add extra explanations unless asked.\n\n`;

    finalPrompt += `=== STRICT RULES ===\n`;
    finalPrompt += `1. FOLLOW the instructions EXACTLY as written.\n`;
    finalPrompt += `2. MIRROR the format. If "1.", answer "1.". If "A.", answer "A.". If "Part I", keep "Part I".\n`;
    finalPrompt += `3. Answer ONLY what is asked. NOTHING ADDED, NOTHING REMOVED.\n`;
    finalPrompt += `4. Do NOT add labels unless the input has them.\n`;
    finalPrompt += `5. Do NOT add intro or outro.\n`;
    finalPrompt += `6. Do NOT add sections unless the input has them.\n`;
    finalPrompt += `7. Answer EVERY item. NO BLANKS.\n`;
    finalPrompt += `8. NO DUPLICATES. Each item appears EXACTLY ONCE.\n`;
    finalPrompt += `9. ORGANIZED OUTPUT. Same structure as input.\n`;
    finalPrompt += `10. For cycles/processes/sequences: use arrows (→) to show flow.\n`;
    finalPrompt += `11. For math: show solution step-by-step, final answer at end.\n`;
    finalPrompt += `12. For definitions: give clear definition + brief explanation.\n`;
    finalPrompt += `13. For logic: show reasoning, then final answer.\n`;
    finalPrompt += `14. NO emojis, NO markdown, NO LaTeX.\n`;
    finalPrompt += `15. Respond in the SAME LANGUAGE as the input.\n\n`;

    finalPrompt += `=== HANDLING NON-TEXT ACTIONS ===\n`;
    finalPrompt += `- "Encircle" → write the answer\n`;
    finalPrompt += `- "Underline" → write the word + correction\n`;
    finalPrompt += `- "Match" → write the match (e.g., "1-B")\n`;
    finalPrompt += `- "Write ✓/✗" → write ✓ or ✗\n`;
    finalPrompt += `- "Write SMILE/SAD" → write SMILE or SAD\n`;
    finalPrompt += `- "Write T/M" → write T or M\n`;
    finalPrompt += `- "Write TRUE/FALSE" → write TRUE or FALSE\n`;
    finalPrompt += `- "Isulat ang TAMA/MALI" → write TAMA or MALI\n`;
    finalPrompt += `- "Arrange 1-5" → write numbers\n`;
    finalPrompt += `- Any other instruction → FOLLOW IT EXACTLY.\n\n`;

    if (analysis.extractedInstructions.length > 0) {
      finalPrompt += `=== EXACT INSTRUCTIONS FROM INPUT ===\n`;
      for (const instr of analysis.extractedInstructions) {
        finalPrompt += `- "${instr}"\n`;
      }
      finalPrompt += `\n`;
    }

    if (!analysis.hasNumbers) {
      finalPrompt += `=== FORMAT NOTE ===\n`;
      finalPrompt += `- There are NO numbered items. Do NOT add "1.", "2.", "3." numbering.\n`;
      finalPrompt += `- Answer in sentences or paragraphs.\n\n`;
    }

    finalPrompt += `NOW ANSWER:`;

    return finalPrompt;
  },

  // ============================================================
  // CALL AI
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
  // CLEAN OUTPUT (with ALL arrow conversions)
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

    // Emojis (keep important symbols ✓ ✗ / x O * [ ])
    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');

    // ============================================================
    // ARROW CONVERSIONS (BAGO ang generic LaTeX removal)
    // ============================================================
    cleaned = cleaned.replace(/\\rightarrow/g, '→');
    cleaned = cleaned.replace(/\\to\b/g, '→');
    cleaned = cleaned.replace(/\\Rightarrow/g, '⇒');
    cleaned = cleaned.replace(/\\leftarrow/g, '←');
    cleaned = cleaned.replace(/\\Leftarrow/g, '⇐');
    cleaned = cleaned.replace(/\\leftrightarrow/g, '↔');
    cleaned = cleaned.replace(/\\Leftrightarrow/g, '⇔');
    cleaned = cleaned.replace(/\\uparrow/g, '↑');
    cleaned = cleaned.replace(/\\downarrow/g, '↓');
    cleaned = cleaned.replace(/\\longrightarrow/g, '→');
    cleaned = cleaned.replace(/\\longleftarrow/g, '←');
    cleaned = cleaned.replace(/\\Longrightarrow/g, '⇒');
    cleaned = cleaned.replace(/\\Longleftarrow/g, '⇐');

    // LaTeX cleanup
    cleaned = cleaned.replace(/\\\[/g, '').replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\\(/g, '').replace(/\\\)/g, '');
    cleaned = cleaned.replace(/\$\$/g, '').replace(/\$/g, '');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

    // Subscripts / superscripts
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
      let finalPrompt = `Give ALL common ${actionLabel.toUpperCase()} of the word below.\n\n`;
      finalPrompt += `RULES:\n`;
      finalPrompt += `- Output ONLY a NUMBERED LIST.\n`;
      finalPrompt += `- NO intro, NO explanation.\n`;
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
    if (/^(hai|hi|hey|hello|helo|hallo|yo|sup|hola)$/i.test(p)) {
      return 'Hello! Ako si Teacher Arlene, ang iyong AI assistant.\n\nPaano kita matutulungan ngayon?\n\nI-type lang ang iyong tanong o i-paste ang activity sheet.';
    }
    if (/^(kumusta|kamusta|musta)/i.test(p)) {
      return 'Kumusta! Ako si Teacher Arlene, handang tumulong.\n\nAno ang itatanong mo?';
    }
    if (/^(help|tulong|tabang)$/i.test(p)) {
      return 'HELP GUIDE\n\n1. AI - Magtanong ng kahit ano\n2. WEIGHT - Estimate ng timbang\n3. FOLLOW-UP - I-reply ang AI response\n4. WORD LIST - Synonyms, Antonyms\n5. ACTIVITY SHEET / QUIZ - I-paste lang';
    }
    if (/^(thank|thanks|salamat)/i.test(p)) return 'Walang anuman!';
    if (/^(ok|okay|sige|sure|noted)/i.test(p)) return 'Sige!';
    if (/^(bye|goodbye|paalam|ingat)$/i.test(p)) return 'Paalam! Ingat palagi.';
    if (/^(sorry|pasensya|paumanhin)$/i.test(p)) return 'Walang problema!';
    if (/^(yes|oo|opo)/i.test(p)) return 'Sige! Ano ang gusto mong itanong?';
    if (/^(no|hindi)/i.test(p)) return 'Okay, narito lang ako kung kailangan mo.';
    if (/^(good|nice|great|galing|magaling)/i.test(p)) return 'Salamat!';
    if (/^(sino|who)\s*(ka|ka po|kayo)$/i.test(p)) return 'Ako si Teacher Arlene, AI assistant na ginawa ni GeoDevz69.';
    if (/^(ano|what)\s*(pangalan mo|name mo)$/i.test(p)) return 'Ang pangalan ko ay Teacher Arlene.';
    return 'Hello! Ako si Teacher Arlene.\n\nPaano kita matutulungan?';
  },

  // ============================================================
  // FOLLOW-UP
  // ============================================================
  isFollowUpCommand(cleanPrompt) {
    if (!cleanPrompt) return false;
    const p = cleanPrompt.toLowerCase().trim();
    if (/^(elaborate|explain more|explain further|paliwanag|ipaliwanag|dagdag paliwanag)( more| further| pa| po)?$/i.test(p)) return true;
    if (/^(elaborate|explain)\s+(it|this|that|mo|po|nga)?$/i.test(p)) return true;
    if (/^(paraphrase|rephrase|rewrite|i-paraphrase|baguhin ang salita)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(simplify|simple|i-simplify|pasimplehin|gawing simple)( it| this| that| mo| po| lang)?$/i.test(p)) return true;
    if (/^(expand|i-expand|expand more|dagdagan|dagdagan mo|add more|more details)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(correct|fix|i-correct|i-fix|ayusin|itama)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(formalize|i-formalize|gawing pormal|pormalin)( it| this| that| mo| po)?$/i.test(p)) return true;
    return false;
  },

  getFollowUpAction(cleanPrompt) {
    const p = cleanPrompt.toLowerCase().trim();
    if (/paraphrase|rephrase|rewrite|i-rewrite|i-paraphrase|baguhin/i.test(p)) return 'paraphrase';
    if (/simplify|simple|pasimplehin|gawing simple|madali/i.test(p)) return 'simplify';
    if (/expand|dagdagan|dagdag|add more|more details/i.test(p)) return 'expand';
    if (/correct|fix|i-correct|i-fix|ayusin|tama|itama/i.test(p)) return 'correct';
    if (/formalize|i-formalize|pormal|academic/i.test(p)) return 'formalize';
    return 'elaborate';
  },

  buildFollowUpPrompt(action, previousResponse) {
    const actionInstructions = {
      'elaborate': 'ELABORATE. Add MORE DETAILS and examples. Keep the same structure.',
      'paraphrase': 'PARAPHRASE. Rewrite in DIFFERENT WORDS with SAME MEANING.',
      'simplify': 'SIMPLIFY. Use SIMPLE WORDS and SHORT SENTENCES.',
      'expand': 'EXPAND. Add MORE INFORMATION and examples.',
      'correct': 'CORRECT. Fix grammar, spelling, punctuation.',
      'formalize': 'FORMALIZE. Make it more ACADEMIC and PROFESSIONAL.'
    };
    const instruction = actionInstructions[action] || actionInstructions['elaborate'];
    let prompt = 'You are a text transformation expert.\n\n';
    prompt += 'TASK: ' + instruction + '\n\n';
    prompt += 'CRITICAL RULES:\n';
    prompt += '- Do NOT explain what the command means.\n';
    prompt += '- Do NOT define any word.\n';
    prompt += '- Transform the ORIGINAL RESPONSE below.\n';
    prompt += '- Same language as original.\n';
    prompt += '- NO emojis, NO markdown, NO LaTeX.\n\n';
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
    } catch (error) {
      console.error('[Weight] Error:', error.message);
      await sendMessage(senderId, { text: 'Error calculating weight.' }, token);
    }
  },

  buildFormula(name, unit, resultUnit, formulaStr, girth, length, divisor, accuracy) {
    if (girth === null || length === null) {
      return name + ' WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (' + unit + ')\n- Body Length (' + unit + ')\n\nExample: get weight pig heart girth 34 length 31';
    }
    const gs = girth * girth;
    const product = gs * length;
    const result = product / divisor;
    return name + ' WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' ' + unit + '\nBody Length: ' + length + ' ' + unit + '\nFormula: ' + formulaStr + '\n\nSolution:\n' + girth + ' × ' + girth + ' = ' + gs.toFixed(2) + '\n' + gs.toFixed(2) + ' × ' + length + ' = ' + product.toFixed(2) + '\n' + product.toFixed(2) + ' / ' + divisor + ' = ' + result.toFixed(2) + ' ' + resultUnit + '\n\nAnswer: ' + result.toFixed(1) + ' ' + resultUnit + ' (± ' + accuracy + '%)';
  },

  buildChickenFormula(girth) {
    if (girth === null) return 'CHICKEN WEIGHT FORMULA\n\nPlease provide Heart Girth (cm).\nExample: get weight chicken heart girth 30';
    const power = Math.pow(girth, 2.417);
    const kg = 0.001 * power;
    return 'CHICKEN WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' cm\nFormula: 0.001 × (Girth)^2.417\n\nSolution:\n' + girth + '^2.417 = ' + power.toFixed(4) + '\n0.001 × ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nAnswer: ' + kg.toFixed(2) + ' kg (± 8%)';
  },

  buildPowerFormula(name, girth, power, multiplier, accuracy) {
    if (girth === null) return name + ' WEIGHT FORMULA\n\nPlease provide Heart Girth (cm).';
    const pow = Math.pow(girth, power);
    const kg = multiplier * pow;
    return name + ' WEIGHT\n\nGiven:\nHeart Girth: ' + girth + ' cm\nFormula: ' + multiplier + ' × (Girth)^' + power + '\n\nSolution:\n' + girth + '^' + power + ' = ' + pow.toFixed(4) + '\n' + multiplier + ' × ' + pow.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nAnswer: ' + kg.toFixed(2) + ' kg (± ' + accuracy + '%)';
  },

  buildFishFormula(girth, length) {
    if (girth === null || length === null) return 'FISH WEIGHT FORMULA\n\nPlease provide:\n- Total Length (cm)\n- Girth (cm)';
    const gs = girth * girth;
    const product = length * gs;
    const kg = product / 15000;
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
    return /who (is your owner|created you|made you)|sino (gumawa|may ari) sayo|creator|developer/i.test(prompt);
  },

  isUserInfoQuestion(prompt) {
    return /what is my name|ano pangalan ko|my name|pangalan ko|when is my birthday|kelan birthday ko|who am i|sino ako/i.test(prompt);
  },

  async handleUserInfo(senderId, prompt, token) {
    try {
      const userInfo = await this.getUserInfo(senderId, token);
      let response = '';
      if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) {
        response = userInfo.name ? 'Your name is ' + userInfo.name + '.' : 'Confidential.';
      }
      if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) {
        response += userInfo.birthday ? '\nYour birthday is ' + userInfo.birthday + '.' : '\nConfidential.';
      }
      if (!response) response = userInfo.name ? 'Name: ' + userInfo.name : 'Confidential.';
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
      const params = { access_token: token, fields: 'message' };
      const { data } = await axios.get(url, { params });
      return { message: data?.message || null };
    } catch (error) {
      return { message: null };
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
