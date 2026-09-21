// ========== ai.js - COMPLETE AI ASSISTANT v55.0.0 ==========
// TRANSLATE FIXED | v53 Accuracy | v48 Simple | Conversational Follow-up
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
  description: 'Complete AI assistant - translate fixed + all functions',
  usage: 'ai [question] | weight [animal] [measurements]',
  version: '55.0.0',
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
        const followUpPrompt = this.buildFollowUpPrompt(action, previousResponse, prompt);
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
      
      console.log('[AI] Type:', analysis.type, '| HasNumbers:', analysis.hasNumbers, '| HasSequence:', analysis.hasSequence, '| HasStepByStep:', analysis.hasStepByStep, '| Length:', prompt.length);

      // STEP 7: BUILD UNIVERSAL PROMPT
      const finalPrompt = this.buildUniversalPrompt(prompt, analysis, previousResponse, previousPrompt);

      // STEP 8: CALL AI
      let aiResponse = await this.callAIWithViceVersa(finalPrompt, prompt, 'english', analysis.type);

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
  // COMPREHEND INPUT — v53 accuracy
  // ============================================================
  comprehendInput(prompt) {
    if (!prompt) return { type: 'general', hasNumbers: false, hasSequence: false, hasCheckX: false, extractedInstructions: [], language: 'english' };
    const lower = prompt.toLowerCase();
    const analysis = {
      type: 'general', hasNumbers: false, hasParts: false, hasABCD: false,
      hasInstructions: false, hasSequence: false, hasCheckX: false,
      hasTrueFalse: false, hasMatching: false, hasStepByStep: false,
      extractedInstructions: [], language: 'english',
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
    analysis.hasStepByStep = /\b(solve\s+step\s+by\s+step|show\s+solution|full\s+solution|complete\s+solution|with\s+solution|with\s+step|solve\s+and\s+solution)\b/i.test(lower);

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

    // MATH
    if (/^[\d\s\+\-\*\/\(\)\.\,×÷\^]+$/i.test(prompt.replace(/\s/g, '')) || 
        /\b(solve|compute|calculate|evaluate|find\s+x|find\s+the\s+value|equation|solution|derivative|integral|limit|what\s+is\s+the\s+value\s+of)\b/i.test(lower) ||
        analysis.hasStepByStep) {
      if (analysis.type === 'general') analysis.type = 'math';
    }

    // LOGIC
    if (/\bif\s+x\s+and\s+y\b/i.test(lower) ||
        /\breal\s+numbers\b/i.test(lower) ||
        /\blogic\b|\breasoning\b|\bpattern\b|\briddle\b|\bpuzzle\b|\bbugtong\b/i.test(lower) ||
        /\bhow\s+many\s+(people|sons|daughters|brothers|sisters|children|family|members)\b/i.test(lower) ||
        /\beach\s+(son|daughter|brother|sister|child)\b/i.test(lower)) {
      if (analysis.type === 'general') analysis.type = 'logic';
    }

    // CODING
    if (/\bpython\b|\bjava\b|\bjavascript\b|\bc\+\+\b|\bprint\s*\(|\bconsole\.log|\bprint\b/i.test(lower)) {
      if (analysis.type === 'general' || analysis.type === 'math') analysis.type = 'coding';
    }

    // QUIZ/EXAM/ACTIVITY
    if (analysis.hasNumbers || analysis.hasParts || analysis.hasABCD) {
      if (analysis.hasInstructions) {
        if (/activity\s+sheet|worksheet|gawain/i.test(lower)) analysis.type = 'activity_sheet';
        else if (/exam|test|quiz|summative|assessment/i.test(lower)) analysis.type = 'exam';
        else analysis.type = 'quiz';
      }
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
  // BUILD UNIVERSAL PROMPT
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
    finalPrompt += `Answer ONLY what is asked. Do NOT go beyond the topic.\n\n`;

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
    finalPrompt += `10. NO emojis, NO markdown, NO LaTeX.\n`;
    finalPrompt += `11. Respond in the SAME LANGUAGE as the input.\n\n`;

    finalPrompt += `=== ABSOLUTE PROHIBITIONS ===\n`;
    finalPrompt += `1. NO "Would you like...", "If you need...", "Feel free to ask..."\n`;
    finalPrompt += `2. NO intro, NO outro.\n`;
    finalPrompt += `3. NO extra explanations unless asked.\n`;
    finalPrompt += `4. NO related topics.\n`;
    finalPrompt += `5. NO follow-up questions.\n`;
    finalPrompt += `6. Output ONLY the answer, formatted as the input.\n\n`;

    // MATH
    if (analysis.type === 'math' || analysis.hasStepByStep) {
      finalPrompt += `=== FOR MATH (STRICT — SOLVE STEP BY STEP) ===\n`;
      finalPrompt += `1. Read the problem carefully.\n`;
      finalPrompt += `2. Identify GIVEN and ASKED.\n`;
      finalPrompt += `3. State the FORMULA or concept needed.\n`;
      finalPrompt += `4. Show ALL steps clearly.\n`;
      finalPrompt += `5. Include the equation for each step.\n`;
      finalPrompt += `6. VERIFY the answer by substitution.\n`;
      finalPrompt += `7. Give the FINAL ANSWER with units.\n`;
      finalPrompt += `8. For multiple choice: provide the LETTER and VALUE.\n\n`;
    }

    // CODING
    if (analysis.type === 'coding') {
      finalPrompt += `=== FOR CODING (STRICT) ===\n`;
      finalPrompt += `1. Identify the programming language.\n`;
      finalPrompt += `2. Explain what each line does.\n`;
      finalPrompt += `3. Trace the execution step-by-step.\n`;
      finalPrompt += `4. Give the EXACT OUTPUT.\n`;
      finalPrompt += `5. If multiple choice: provide the LETTER and VALUE.\n\n`;
    }

    // LOGIC
    if (analysis.type === 'logic') {
      finalPrompt += `=== FOR LOGIC (STRICT) ===\n`;
      finalPrompt += `1. Read the problem carefully.\n`;
      finalPrompt += `2. Identify ALL GIVEN facts.\n`;
      finalPrompt += `3. Identify what is ASKED.\n`;
      finalPrompt += `4. Draw conclusion STEP-BY-STEP.\n`;
      finalPrompt += `5. Show reasoning clearly.\n`;
      finalPrompt += `6. Verify the answer logically.\n`;
      finalPrompt += `7. Consider ALL interpretations.\n`;
      finalPrompt += `8. Give the FINAL ANSWER clearly.\n\n`;
    }

    if (analysis.hasSequence) {
      finalPrompt += `=== FOR SEQUENCE/ORDER QUESTIONS ===\n\n`;
      finalPrompt += `TASK: Arrange the steps in the CORRECT ORDER.\n\n`;
      finalPrompt += `HOW TO REASON STEP-BY-STEP:\n`;
      finalPrompt += `1. Read ALL steps carefully.\n`;
      finalPrompt += `2. Identify the STARTING step:\n`;
      finalPrompt += `   - Usually begins with "Gather", "Prepare", "Get", "Collect", "Choose"\n`;
      finalPrompt += `3. Identify the ENDING step:\n`;
      finalPrompt += `   - Usually begins with "Wait", "Finish", "Complete", "Harvest", "Use", "Filter"\n`;
      finalPrompt += `4. For EACH step, ask: "What MUST happen BEFORE this step?"\n`;
      finalPrompt += `5. Arrange in logical order.\n\n`;
      finalPrompt += `OUTPUT FORMAT:\n`;
      finalPrompt += `- KEEP the ORIGINAL item order\n`;
      finalPrompt += `- Write the CORRECT NUMBER next to each item\n`;
      finalPrompt += `- Format: "[correct number] [original text]"\n\n`;
    }

    if (analysis.hasCheckX) {
      finalPrompt += `=== FOR ✓/✗ (PROPER/IMPROPER) ITEMS ===\n`;
      finalPrompt += `- Is this a CORRECT/GOOD practice? → ✓ (Proper)\n`;
      finalPrompt += `- Is this a WRONG/BAD practice? → ✗ (Improper)\n`;
      finalPrompt += `- Format: "[number]. [✓ or ✗] [Proper/Improper]"\n`;
      finalPrompt += `- Example:\n  1. ✓ Proper\n  2. ✗ Improper\n\n`;
    }

    if (analysis.hasTrueFalse) {
      finalPrompt += `=== FOR TRUE/FALSE ITEMS ===\n`;
      finalPrompt += `- Write TRUE or FALSE for each item\n`;
      finalPrompt += `- Format: "[number]. [TRUE or FALSE] [optional brief reason]"\n\n`;
    }

    if (analysis.hasMatching) {
      finalPrompt += `=== FOR MATCHING ITEMS ===\n`;
      finalPrompt += `- Match Column A with Column B\n`;
      finalPrompt += `- Format: "[number]. [LETTER] - [matched item]"\n\n`;
    }

    finalPrompt += `=== HANDLING NON-TEXT ACTIONS ===\n`;
    finalPrompt += `- "Encircle" → write the answer\n`;
    finalPrompt += `- "Underline" → write the word + correction\n\n`;

    if (analysis.extractedInstructions.length > 0) {
      finalPrompt += `=== EXACT INSTRUCTIONS FROM INPUT ===\n`;
      for (const instr of analysis.extractedInstructions) {
        finalPrompt += `- "${instr}"\n`;
      }
      finalPrompt += `\n`;
    }

    if (!analysis.hasNumbers) {
      finalPrompt += `=== FORMAT NOTE ===\n`;
      finalPrompt += `- There are NO numbered items. Do NOT add "1.", "2.", "3." numbering.\n\n`;
    }

    finalPrompt += `NOW ANSWER:`;

    return finalPrompt;
  },

  // ============================================================
  // CALL AI — Priority based
  // ============================================================
  async callAIWithViceVersa(prompt, originalPrompt, language, intent) {
    const safePrompt = prompt.length > 8000 ? prompt.substring(0, 8000) : prompt;

    const providers = [
      { name: 'Overchat Claude', call: () => this.callCeddsAPI(safePrompt, OVERCHAT_CLAUDE) },
      { name: 'Overchat DeepSeek', call: () => this.callCeddsAPI(safePrompt, OVERCHAT_DEEPSEEK) },
      { name: 'Chipp', call: () => this.callChippAPI(safePrompt) },
      { name: 'Norch', call: () => this.callNorchAPI(safePrompt) }
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
  // CLEAN OUTPUT — strict cleaning
  // ============================================================
  cleanOutput(text) {
    if (!text) return '';
    let cleaned = text.trim();

    cleaned = cleaned.replace(/^As an AI.*?\n/i, '');
    cleaned = cleaned.replace(/^As a language model.*?\n/i, '');
    cleaned = cleaned.replace(/^Here is.*?\n/i, '');
    cleaned = cleaned.replace(/^Here are.*?\n/i, '');
    cleaned = cleaned.replace(/^Here'?s.*?\n/i, '');
    cleaned = cleaned.replace(/^Let me.*?\n/i, '');
    cleaned = cleaned.replace(/^The answers are.*?\n/i, '');
    cleaned = cleaned.replace(/^The following are.*?\n/i, '');
    cleaned = cleaned.replace(/^Below is.*?\n/i, '');
    cleaned = cleaned.replace(/^Below are.*?\n/i, '');
    cleaned = cleaned.replace(/^I'll.*?\n/i, '');
    cleaned = cleaned.replace(/^I will.*?\n/i, '');

    cleaned = cleaned.replace(/^Note:.*?\n/i, '');
    cleaned = cleaned.replace(/^TIP:.*?\n/i, '');
    cleaned = cleaned.replace(/^Tip:.*?\n/i, '');
    cleaned = cleaned.replace(/^REMINDER:.*?\n/i, '');
    cleaned = cleaned.replace(/^Reminder:.*?\n/i, '');
    cleaned = cleaned.replace(/^Important:.*?\n/i, '');
    cleaned = cleaned.replace(/^Remember:.*?\n/i, '');
    cleaned = cleaned.replace(/^Keep in mind:.*?\n/i, '');

    cleaned = cleaned.replace(/\n+(Would you like|If you need|If you want|If you have|If there'?s anything|Feel free to|Let me know|Do you want|Would you like me to|I can also|I could also|Additionally, I can|Also, I can|If you'?d like|Would you like me|Do you want me|Is there anything|Which language|Please specify|Please clarify).*$/is, '');
    cleaned = cleaned.replace(/\n+(Hope this helps|Hope that helps|Hope it helps|Good luck|Best of luck|Good luck with|Hope you|I hope this).*$/is, '');
    cleaned = cleaned.replace(/\n+(Please let me know|Let me know if|Let me know|Please let me|Please do not hesitate|Feel free).*$/is, '');
    cleaned = cleaned.replace(/\n+(Want me to|Should I|Can I|May I|Let me know).*$/is, '');

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
    if (/^(hai|hi|hey|hello|helo|hallo|yo|sup|hola)$/i.test(p)) return 'Hello! Ako si Teacher Arlene.\n\nI-type ang iyong tanong o i-paste ang activity sheet.\n\nPwede mo rin akong i-reply para sa: elaborate, explain more, full solution, step by step, examples, translate, at iba pa.';
    if (/^(kumusta|kamusta|musta)/i.test(p)) return 'Kumusta! Ano ang itatanong mo?';
    if (/^(help|tulong|tabang)$/i.test(p)) return 'HELP GUIDE\n\n1. AI - Magtanong ng kahit ano\n2. WEIGHT - Estimate ng timbang\n3. FOLLOW-UP - I-reply ang AI response para sa:\n   - elaborate, explain more, full solution\n   - step by step, examples, simplify\n   - summarize, humanize, translate (to bisaya, tagalog, etc.)\n   - evaluate, analyze, outline, at iba pa\n4. WORD LIST - Synonyms, Antonyms\n5. ACTIVITY SHEET / QUIZ - I-paste lang';
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
  // FOLLOW-UP — 60+ functions with translate fix
  // ============================================================
  isFollowUpCommand(cleanPrompt) {
    if (!cleanPrompt) return false;
    const p = cleanPrompt.toLowerCase().trim();

    // TRANSLATE (with or without target language)
    if (/^(translate|isalin|salin)\s+(to|sa)\s+\w+/i.test(p)) return true;
    if (/^(translate|isalin|salin)( it| this| that| mo| po| lang)?$/i.test(p)) return true;

    // CONVERSATIONAL
    if (/^(elaborate|explain more|explain further|explain it|paliwanag|ipaliwanag|dagdag paliwanag|explain)( it| this| that| mo| po| nga| more| further| pa)?$/i.test(p)) return true;
    if (/^(more explanation|more details|add more details|give more details|mas detalyado|mas malinaw)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(full solution|complete solution|show full solution|ipakita ang buong solution)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(step by step|step.?by.?step solution|show step by step|ipakita ang step by step)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(purpose|what is the purpose|purpose of this|ano ang purpose|ano ang layunin)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(example|give example|give examples|examples? of this|halimbawa|magbigay ng halimbawa)( it| this| that| mo| po| of)?$/i.test(p)) return true;

    // BASIC
    if (/^(simplify|simple|pasimplehin|gawing simple|simplify it|make it simple)( it| this| that| mo| po| lang| naman)?$/i.test(p)) return true;
    if (/^(correct|fix|ayusin|itama|proofread)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(define|definition|i-define|bigyan ng kahulugan|ano ang)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(describe|ilarawan|give description)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(solve|i-solve|solve it|ipakita ang solution)( it| this| that| mo| po)?$/i.test(p)) return true;

    // INTERMEDIATE
    if (/^(paraphrase|rephrase|rewrite|baguhin ang salita|ibang salita)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(expand|dagdagan|add more|more details)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(summarize|summary|buod|paikliin|shorten|brief)( it| this| that| mo| po| lang)?$/i.test(p)) return true;
    if (/^(humanize|make it natural|gawing natural|gawing tao)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(compare|contrast|ihambing|difference|kaibahan)( it| this| that| mo| po| with| to)?$/i.test(p)) return true;
    if (/^(bullet|bullet point|bullet form|list form)( it| this| that| mo| po| lang)?$/i.test(p)) return true;

    // ADVANCED
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

    // MATH
    if (/^(math solution|solve math|show math solution)( it| this| that| mo| po)?$/i.test(p)) return true;
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

    // PLAGIARISM
    if (/^(plagiarism check|check plagiarism|check originality)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(study schedule|make study schedule|plan study)( it| this| that| mo| po)?$/i.test(p)) return true;

    return false;
  },

  getFollowUpAction(cleanPrompt) {
    const p = cleanPrompt.toLowerCase().trim();

    // TRANSLATE (detect target language)
    const translateMatch = p.match(/^(?:translate|isalin|salin)\s+(?:to|sa)\s+(\w+)/i);
    if (translateMatch) return 'translate_to_' + translateMatch[1].toLowerCase();
    if (/^(translate|isalin|salin)/i.test(p)) return 'translate_to_english';

    // CONVERSATIONAL
    if (/purpose|what is the purpose|purpose of this|ano ang purpose|ano ang layunin/i.test(p)) return 'purpose';
    if (/example|give example|give examples|examples? of this|halimbawa|magbigay ng halimbawa/i.test(p)) return 'examples';
    if (/full solution|complete solution|show full solution|ipakita ang buong solution/i.test(p)) return 'math_solution';
    if (/step by step|step.?by.?step solution|show step by step|ipakita ang step by step/i.test(p)) return 'math_solution';
    if (/more explanation|more details|add more details|give more details|mas detalyado|mas malinaw/i.test(p)) return 'elaborate';
    if (/elaborate|explain more|explain further|explain it|paliwanag|ipaliwanag/i.test(p)) return 'elaborate';

    // SPECIFIC
    if (/plagiarism check|check plagiarism|check originality/i.test(p)) return 'plagiarism_check';
    if (/study schedule|make study schedule|plan study/i.test(p)) return 'study_schedule';
    if (/test reviewer|make reviewer|reviewer/i.test(p)) return 'test_reviewer';
    if (/answer key|make answer key|generate answer key/i.test(p)) return 'answer_key';
    if (/score calculator|compute score|calculate grade/i.test(p)) return 'score_calculator';
    if (/weakness analyzer|analyze weaknesses|identify weaknesses/i.test(p)) return 'weakness_analyzer';
    if (/essay outline|outline essay/i.test(p)) return 'essay_outline';
    if (/annotated bibliography|annotated bib/i.test(p)) return 'annotated_bib';
    if (/research paper|write research paper/i.test(p)) return 'research_paper';
    if (/essay draft|write essay|draft essay/i.test(p)) return 'essay_draft';
    if (/flashcards?|make flashcards?/i.test(p)) return 'flashcards';
    if (/quiz|generate quiz|make quiz|create quiz/i.test(p)) return 'quiz';
    if (/study guide|study plan|make study guide/i.test(p)) return 'study_guide';
    if (/summary notes?|summarize notes?|bullet notes?|note summary/i.test(p)) return 'summary_notes';
    if (/citation|generate citation|apa citation|mla citation/i.test(p)) return 'citation';
    if (/grammar check|check grammar|grammar/i.test(p)) return 'grammar_check';
    if (/sentence diagram|diagram sentence/i.test(p)) return 'sentence_diagram';
    if (/poem analysis|analyze poem|poetry/i.test(p)) return 'poem_analysis';
    if (/literary analysis|analyze literature|analyze text/i.test(p)) return 'literary_analysis';
    if (/vocabulary|word analysis|word root|etymology/i.test(p)) return 'vocabulary';
    if (/balance chemical|chemical equation|balance equation/i.test(p)) return 'balance_chemical';
    if (/periodic table|element info|atomic number|element details/i.test(p)) return 'periodic_table';
    if (/physics formula|physics solve|physics problem/i.test(p)) return 'physics_solve';
    if (/biology|biology diagram|biology process/i.test(p)) return 'biology';
    if (/lab report|lab format|write lab report/i.test(p)) return 'lab_report';
    if (/math solution|solve math|show math solution/i.test(p)) return 'math_solution';
    if (/graph|plot|i-graph|i-plot|describe graph/i.test(p)) return 'graph';
    if (/geometry|solve geometry|area|perimeter|volume|circumference/i.test(p)) return 'geometry';
    if (/statistics|stats|mean|median|mode|standard deviation|variance/i.test(p)) return 'statistics';
    if (/probability|compute probability|permutation|combination/i.test(p)) return 'probability';
    if (/equation solve|quadratic|system of equations|solve equation/i.test(p)) return 'equation_solve';
    if (/cite|citation|apa|mla/i.test(p)) return 'cite';
    if (/thesis statement|thesis outline/i.test(p)) return 'thesis';
    if (/literature review|rrl/i.test(p)) return 'literature_review';
    if (/research methodology|research design|methodology/i.test(p)) return 'methodology';
    if (/data analysis|statistical/i.test(p)) return 'data_analysis';
    if (/abstract|executive summary/i.test(p)) return 'abstract';
    if (/hypothesis/i.test(p)) return 'hypothesis';
    if (/research question/i.test(p)) return 'research_question';
    if (/discussion|conclusion|recommendation/i.test(p)) return 'conclusion';
    if (/summarize|summary|buod|paikliin|shorten|brief/i.test(p)) return 'summarize';
    if (/humanize|make it human|make it natural|gawing natural/i.test(p)) return 'humanize';
    if (/evaluate|assess|rate|suriin/i.test(p)) return 'evaluate';
    if (/criticize|critique|puna|punahin/i.test(p)) return 'criticize';
    if (/analyze|analysis|break down/i.test(p)) return 'analyze';
    if (/compare|contrast|ihambing/i.test(p)) return 'compare';
    if (/outline|balangkas/i.test(p)) return 'outline';
    if (/bullet|bullet point|bullet form|list form/i.test(p)) return 'bullet';
    if (/define|definition|bigyan ng kahulugan/i.test(p)) return 'define';
    if (/describe|ilarawan|give description/i.test(p)) return 'describe';
    if (/solve|i-solve|solve it|ipakita ang solution/i.test(p)) return 'solve';
    if (/refine|polish|improve|pagandahin/i.test(p)) return 'refine';
    if (/construct|build|create|make|gumawa|i-gawa/i.test(p)) return 'construct';
    if (/paraphrase|rephrase|rewrite|i-rewrite|i-paraphrase|baguhin/i.test(p)) return 'paraphrase';
    if (/simplify|simple|pasimplehin|gawing simple|madali/i.test(p)) return 'simplify';
    if (/expand|dagdagan|dagdag|add more|more details/i.test(p)) return 'expand';
    if (/correct|fix|i-correct|i-fix|ayusin|tama|itama|proofread/i.test(p)) return 'correct';
    if (/formalize|i-formalize|pormal|academic/i.test(p)) return 'formalize';
    return 'elaborate';
  },

  // ============================================================
  // BUILD FOLLOW-UP PROMPT — with userPrompt (TRANSLATE FIX)
  // ============================================================
  buildFollowUpPrompt(action, previousResponse, userPrompt) {
    const actionInstructions = {
      // CONVERSATIONAL
      'elaborate': 'ELABORATE. Add MORE DETAILS, more explanation, and deeper analysis. Keep the same structure.',
      'purpose': 'PURPOSE. Explain the PURPOSE of this content. Why is this important? What is it for? Give clear explanation.',
      'examples': 'GIVE EXAMPLES. Provide SPECIFIC, CONCRETE examples related to the content. Number them clearly.',
      'math_solution': 'FULL SOLUTION. Show the COMPLETE step-by-step solution. Include formulas, equations, and final answer.',
      
      // BASIC
      'simplify': 'SIMPLIFY. Use SIMPLE WORDS and SHORT SENTENCES.',
      'correct': 'CORRECT. Fix grammar, spelling, punctuation errors.',
      'define': 'DEFINE. Give clear definition with key characteristics.',
      'describe': 'DESCRIBE. Give detailed description with examples.',
      'solve': 'SOLVE STEP-BY-STEP. Show solution clearly, then final answer.',
      
      // INTERMEDIATE
      'paraphrase': 'PARAPHRASE. Rewrite in DIFFERENT WORDS with SAME MEANING.',
      'expand': 'EXPAND. Add MORE INFORMATION and examples.',
      'summarize': 'SUMMARIZE. Give a BRIEF summary. Keep ONLY the MAIN POINTS.',
      'humanize': 'HUMANIZE. Rewrite to sound more NATURAL and HUMAN.',
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
      
      // STUDY
      'flashcards': 'FLASHCARDS. Create Q&A flashcard pairs from the content.',
      'quiz': 'QUIZ. Generate quiz questions (multiple choice or short answer) from the content.',
      'study_guide': 'STUDY GUIDE. Create a study guide with key concepts and review questions.',
      'summary_notes': 'SUMMARY NOTES. Create bullet-point summary notes from the content.',
      'citation': 'CITATION. Generate proper citation in APA or MLA format.',
      
      // ACADEMIC
      'essay_outline': 'ESSAY OUTLINE. Create a detailed outline: I. Introduction, II. Body (3-5 points), III. Conclusion.',
      'annotated_bib': 'ANNOTATED BIBLIOGRAPHY. Create annotated bibliography entries with summary and evaluation.',
      'research_paper': 'RESEARCH PAPER. Draft a complete research paper with all standard sections.',
      'essay_draft': 'ESSAY DRAFT. Write a complete essay draft with intro, body, and conclusion.',
      
      // TEST
      'test_reviewer': 'TEST REVIEWER. Generate a comprehensive reviewer with key points and practice questions.',
      'answer_key': 'ANSWER KEY. Create an answer key for the given questions.',
      'score_calculator': 'SCORE CALCULATOR. Compute the score based on correct/incorrect answers.',
      'weakness_analyzer': 'WEAKNESS ANALYZER. Identify topics that need improvement based on the content.',
      
      // PLAGIARISM
      'plagiarism_check': 'PLAGIARISM CHECK. Analyze the content for potential plagiarism. Suggest improvements.',
      'study_schedule': 'STUDY SCHEDULE. Create a study schedule with time allocation for each subject.'
    };
    
    // Dynamic translate handling
    let instruction;
    if (action.startsWith('translate_to_')) {
      const targetLang = action.replace('translate_to_', '').toUpperCase();
      instruction = `TRANSLATE the ORIGINAL RESPONSE to ${targetLang}. Do NOT ask for clarification. Just translate.`;
    } else {
      instruction = actionInstructions[action] || actionInstructions['elaborate'];
    }
    
    let prompt = 'You are a text transformation expert.\n\n';
    prompt += '=== TASK ===\n';
    prompt += instruction + '\n\n';
    prompt += '=== USER REQUEST ===\n';
    prompt += (userPrompt || 'N/A') + '\n\n';
    prompt += '=== CRITICAL RULES ===\n';
    prompt += '1. Do NOT ask for clarification.\n';
    prompt += '2. Do NOT add intro or outro.\n';
    prompt += '3. Do NOT add "Would you like...", "If you need...", "Hope this helps".\n';
    prompt += '4. Transform the ORIGINAL RESPONSE below.\n';
    prompt += '5. Output ONLY the transformed text.\n';
    prompt += '6. NO emojis, NO markdown, NO LaTeX.\n\n';
    prompt += '=== ORIGINAL RESPONSE ===\n';
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
