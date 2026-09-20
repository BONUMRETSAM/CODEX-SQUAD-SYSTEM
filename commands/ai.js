// ========== ai.js - COMPLETE AI ASSISTANT v30.2.0 ==========
// All-in-one: Greetings, Follow-up, Word Lists, Weight, Logic, Research, Math
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with all commands and functions',
  usage: 'ai [question] | weight [animal] [measurements]',
  version: '30.2.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      const lowerPrompt = prompt.toLowerCase();
      const cleanPrompt = lowerPrompt.replace(/[.:!?,\s]+$/g, '').trim();

      // ============================================================
      // STEP 1: GREETINGS & CONVERSATIONAL PHRASES
      // ============================================================
      if (this.isGreetingOrConversational(prompt)) {
        const reply = this.buildConversationalReply(prompt, senderId);
        await sendMessage(senderId, { text: reply }, token);
        conversationHistory[senderId] = {
          lastPrompt: prompt,
          lastResponse: reply,
          timestamp: Date.now()
        };
        return;
      }

      // ============================================================
      // STEP 2: FOLLOW-UP COMMANDS (FLEXIBLE)
      // ============================================================
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
          await sendMessage(senderId, {
            text: 'Walang previous response na ma-' + cleanPrompt + '.\n\nMag-reply sa isang AI response para ma-' + cleanPrompt + ' ko iyon.'
          }, token);
          return;
        }

        const action = this.getFollowUpAction(cleanPrompt);
        const followUpPrompt = this.buildFollowUpPrompt(action, previousResponse, prompt);
        const response = await this.callAPI(followUpPrompt, prompt, 'english', action, action, 'followup', 'detailed');
        let cleaned = this.finalClean(response);

        conversationHistory[senderId] = {
          lastPrompt: previousPrompt || 'previous',
          lastResponse: cleaned,
          timestamp: Date.now()
        };

        await this.sendComplete(senderId, cleaned, token);
        return;
      }

      // ============================================================
      // STEP 3: WORD LIST DETECTION (Synonyms, Antonyms, Other Terms)
      // ============================================================
      if (this.isWordListQuestion(prompt)) {
        const wordAnswer = await this.handleWordList(senderId, prompt, token);
        if (wordAnswer) {
          await this.sendComplete(senderId, wordAnswer, token);
          conversationHistory[senderId] = {
            lastPrompt: prompt,
            lastResponse: wordAnswer,
            timestamp: Date.now()
          };
          return;
        }
      }

      // ============================================================
      // STEP 4: WEIGHT ESTIMATION
      // ============================================================
      if (this.shouldTriggerWeight(lowerPrompt, prompt)) {
        await this.handleWeightEstimation(senderId, prompt, token);
        return;
      }

      // ============================================================
      // STEP 5: PURE MATH
      // ============================================================
      const mathResult = this.tryMathCompute(prompt);
      if (mathResult) {
        await this.sendComplete(senderId, mathResult, token);
        return;
      }

      // ============================================================
      // STEP 6: LOGIC / RIDDLE / BUGTONG
      // ============================================================
      if (this.isLogicQuestion(prompt)) {
        const logicAnswer = await this.handleLogicAnswer(senderId, prompt, token);
        if (logicAnswer) {
          await this.sendComplete(senderId, logicAnswer, token);
          return;
        }
      }

      // ============================================================
      // STEP 7: REGULAR AI
      // ============================================================
      if (!prompt && !isReply) {
        await sendMessage(senderId, {
          text: 'Hello. I am Teacher Arlene, your Complete AI Assistant.\n\nJust type: ai [your question]'
        }, token);
        return;
      }

      if (this.isOwnerQuestion(prompt)) {
        await sendMessage(senderId, {
          text: 'I was created by GeoDevz69. Visit here for more information: https://www.facebook.com/geotechph.net'
        }, token);
        return;
      }

      if (this.isUserInfoQuestion(prompt)) {
        await this.handleUserInfo(senderId, prompt, token);
        return;
      }

      const language = this.detectLanguage(prompt);
      const intent = this.detectIntent(prompt);
      const topic = this.extractTopic(prompt);
      const subject = this.detectSubject(prompt);
      const requestType = this.detectRequestType(prompt);

      console.log('[AI] Language:', language, '| Intent:', intent, '| Subject:', subject, '| Topic:', topic);

      const finalPrompt = this.buildDetailedPrompt(prompt, previousResponse, previousPrompt, language, intent, topic, subject, requestType);

      const response = await this.callAPI(finalPrompt, prompt, language, intent, topic, subject, requestType);
      let aiResponse = response;

      aiResponse = this.finalClean(aiResponse);
      aiResponse = this.ensureComplete(aiResponse);

      conversationHistory[senderId] = {
        lastPrompt: prompt,
        lastResponse: aiResponse,
        timestamp: Date.now()
      };
      this.cleanOldHistory();

      await this.sendComplete(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // WORD LIST DETECTION (Synonyms, Antonyms, Other Terms)
  // ============================================================
  isWordListQuestion(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase().trim();

    const patterns = [
      // Synonyms - English
      /^other\s+term(s)?\s+(for|of)\s+/i,
      /^other\s+word(s)?\s+(for|of)\s+/i,
      /^another\s+word\s+(for|of)\s+/i,
      /^another\s+term\s+(for|of)\s+/i,
      /^synonym(s)?\s+(for|of)\s+/i,
      /^synonyms?\s+of\s+/i,
      /^list\s+of\s+synonyms\s+(for|of)\s+/i,
      /^what\s+(are|is)\s+(the\s+)?(other|another)\s+(term|word|name)s?\s+(for|of)\s+/i,
      /^what\s+(are|is)\s+(the\s+)?synonym(s)?\s+(for|of)\s+/i,
      /^give\s+(me\s+)?(the\s+)?(other|another)\s+(term|word)s?\s+(for|of)\s+/i,
      /^give\s+(me\s+)?synonym(s)?\s+(for|of)\s+/i,
      /^another\s+name\s+(for|of)\s+/i,
      /^other\s+name(s)?\s+(for|of)\s+/i,

      // Antonyms - English
      /^opposite\s+(of|word\s+for|term\s+for)\s+/i,
      /^antonym(s)?\s+(for|of)\s+/i,
      /^antonyms?\s+of\s+/i,
      /^what\s+(is|are)\s+(the\s+)?opposite\s+(of|word\s+for)\s+/i,
      /^what\s+(is|are)\s+(the\s+)?antonym(s)?\s+(for|of)\s+/i,
      /^give\s+(me\s+)?(the\s+)?opposite\s+(of|word\s+for)\s+/i,
      /^give\s+(me\s+)?antonym(s)?\s+(for|of)\s+/i,

      // Synonyms - Tagalog
      /^kasingkahulugan\s+(ng|nang)\s+/i,
      /^kasing\s*kahulugan\s+(ng|nang)\s+/i,
      /^kaparehong\s+kahulugan\s+(ng|nang)\s+/i,
      /^kaparehas\s+ng\s+kahulugan\s+(ng|nang)\s+/i,
      /^iba\s+pang\s+(salita|tawag|term)\s+(sa|para sa)\s+/i,
      /^ibang\s+(salita|tawag|term)\s+(sa|para sa)\s+/i,
      /^ano\s+ang\s+(iba|ibang)\s+(salita|tawag|term)\s+(sa|para sa)\s+/i,
      /^ano\s+ang\s+kasingkahulugan\s+(ng|nang)\s+/i,
      /^iba\s+pang\s+pangalan\s+(ng|nang)\s+/i,
      /^ibang\s+pangalan\s+(ng|nang)\s+/i,

      // Antonyms - Tagalog
      /^kasalungat\s+(ng|nang)\s+/i,
      /^kabaligtaran\s+(ng|nang)\s+/i,
      /^kabaliktaran\s+(ng|nang)\s+/i,
      /^opposite\s+(ng|nang)\s+/i,
      /^ano\s+ang\s+kasalungat\s+(ng|nang)\s+/i,
      /^ano\s+ang\s+kabaligtaran\s+(ng|nang)\s+/i,

      // Synonyms - Bisaya
      /^kasing\s*kahulugan\s+sa\s+/i,
      /^parehas\s+ug\s+kahulugan\s+sa\s+/i,
      /^laing\s+nga\s+(pulong|tawag)\s+sa\s+/i,
      /^unsa\s+ang\s+kasingkahulugan\s+sa\s+/i,
      /^unsa\s+ang\s+laing\s+(pulong|tawag)\s+sa\s+/i,

      // List of terms
      /^list\s+of\s+(terms?|words?|names?)\s+(for|of)\s+/i,
      /^all\s+(terms?|words?|names?)\s+(for|of)\s+/i,
      /^give\s+(me\s+)?(all|the)\s+(terms?|words?|names?)\s+(for|of)\s+/i,
      /^enumerate\s+(all\s+)?(terms?|words?|names?)\s+(for|of)\s+/i
    ];

    return patterns.some(pattern => pattern.test(lower));
  },

  async handleWordList(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase().trim();

      let listType = 'synonym';
      if (/antonym|opposite|kasalungat|kabaligtaran|kabaliktaran/i.test(lower)) {
        listType = 'antonym';
      } else if (/all\s+(terms?|words?|names?)|list\s+of|enumerate/i.test(lower)) {
        listType = 'list';
      }

      let targetWord = '';
      const extractPatterns = [
        /^other\s+terms?\s+(?:for|of)\s+(.+)$/i,
        /^other\s+words?\s+(?:for|of)\s+(.+)$/i,
        /^another\s+word\s+(?:for|of)\s+(.+)$/i,
        /^another\s+term\s+(?:for|of)\s+(.+)$/i,
        /^synonyms?\s+(?:for|of)\s+(.+)$/i,
        /^antonyms?\s+(?:for|of)\s+(.+)$/i,
        /^opposite\s+(?:of|word\s+for|term\s+for)\s+(.+)$/i,
        /^what\s+(?:are|is)\s+(?:the\s+)?(?:other|another)\s+(?:term|word|name)s?\s+(?:for|of)\s+(.+)$/i,
        /^what\s+(?:are|is)\s+(?:the\s+)?synonym(?:s)?\s+(?:for|of)\s+(.+)$/i,
        /^what\s+(?:are|is)\s+(?:the\s+)?antonym(?:s)?\s+(?:for|of)\s+(.+)$/i,
        /^what\s+(?:is|are)\s+(?:the\s+)?opposite\s+(?:of|word\s+for)\s+(.+)$/i,
        /^give\s+(?:me\s+)?(?:the\s+)?(?:other|another)\s+(?:term|word)s?\s+(?:for|of)\s+(.+)$/i,
        /^give\s+(?:me\s+)?synonym(?:s)?\s+(?:for|of)\s+(.+)$/i,
        /^give\s+(?:me\s+)?antonym(?:s)?\s+(?:for|of)\s+(.+)$/i,
        /^another\s+name\s+(?:for|of)\s+(.+)$/i,
        /^other\s+name(?:s)?\s+(?:for|of)\s+(.+)$/i,
        /^kasingkahulugan\s+(?:ng|nang)\s+(.+)$/i,
        /^kaparehong\s+kahulugan\s+(?:ng|nang)\s+(.+)$/i,
        /^iba\s+pang\s+(?:salita|tawag|term)\s+(?:sa|para sa)\s+(.+)$/i,
        /^ibang\s+(?:salita|tawag|term)\s+(?:sa|para sa)\s+(.+)$/i,
        /^ano\s+ang\s+(?:iba|ibang)\s+(?:salita|tawag|term)\s+(?:sa|para sa)\s+(.+)$/i,
        /^ano\s+ang\s+kasingkahulugan\s+(?:ng|nang)\s+(.+)$/i,
        /^iba\s+pang\s+pangalan\s+(?:ng|nang)\s+(.+)$/i,
        /^kasalungat\s+(?:ng|nang)\s+(.+)$/i,
        /^kabaligtaran\s+(?:ng|nang)\s+(.+)$/i,
        /^kabaliktaran\s+(?:ng|nang)\s+(.+)$/i,
        /^ano\s+ang\s+kasalungat\s+(?:ng|nang)\s+(.+)$/i,
        /^ano\s+ang\s+kabaligtaran\s+(?:ng|nang)\s+(.+)$/i,
        /^kasing\s*kahulugan\s+sa\s+(.+)$/i,
        /^laing\s+nga\s+(?:pulong|tawag)\s+sa\s+(.+)$/i,
        /^unsa\s+ang\s+kasingkahulugan\s+sa\s+(.+)$/i,
        /^list\s+of\s+(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i,
        /^all\s+(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i,
        /^give\s+(?:me\s+)?(?:all|the)\s+(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i,
        /^enumerate\s+(?:all\s+)?(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i
      ];

      for (const pattern of extractPatterns) {
        const match = prompt.match(pattern);
        if (match) {
          targetWord = match[1].trim().replace(/[?.!]+$/, '');
          break;
        }
      }

      if (!targetWord) return null;

      let finalPrompt = '';

      if (listType === 'antonym') {
        finalPrompt += 'You are a dictionary expert. Give ALL common ANTONYMS (opposite words) of the word below.\n\n';
        finalPrompt += 'CRITICAL RULES:\n';
        finalPrompt += '1. Output ONLY a NUMBERED LIST of antonyms.\n';
        finalPrompt += '2. Do NOT write INTRODUCTION, DEFINITION, MAIN POINTS, EXAMPLES, IMPORTANCE, or CONCLUSION.\n';
        finalPrompt += '3. Do NOT write any essay or paragraph.\n';
        finalPrompt += '4. Do NOT explain what the word means.\n';
        finalPrompt += '5. Just list the antonyms directly.\n';
        finalPrompt += '6. Include brief meaning per antonym if needed.\n';
        finalPrompt += '7. NO emojis, NO markdown.\n\n';
        finalPrompt += 'WORD: ' + targetWord + '\n\n';
        finalPrompt += 'FORMAT:\n';
        finalPrompt += 'ANTONYMS OF "' + targetWord.toUpperCase() + '"\n\n';
        finalPrompt += '1. [antonym] - [brief meaning]\n';
        finalPrompt += '2. [antonym] - [brief meaning]\n';
        finalPrompt += '...\n\n';
        finalPrompt += 'Give at least 15 antonyms if possible.';
      } else if (listType === 'list') {
        finalPrompt += 'You are a dictionary expert. Give ALL common TERMS/WORDS for the word below.\n\n';
        finalPrompt += 'CRITICAL RULES:\n';
        finalPrompt += '1. Output ONLY a NUMBERED LIST.\n';
        finalPrompt += '2. Do NOT write INTRODUCTION, DEFINITION, MAIN POINTS, EXAMPLES, IMPORTANCE, or CONCLUSION.\n';
        finalPrompt += '3. Do NOT write any essay or paragraph.\n';
        finalPrompt += '4. Just list the terms directly.\n';
        finalPrompt += '5. NO emojis, NO markdown.\n\n';
        finalPrompt += 'WORD: ' + targetWord + '\n\n';
        finalPrompt += 'FORMAT:\n';
        finalPrompt += 'ALL TERMS FOR "' + targetWord.toUpperCase() + '"\n\n';
        finalPrompt += '1. [term] - [brief meaning]\n';
        finalPrompt += '2. [term] - [brief meaning]\n';
        finalPrompt += '...\n\n';
        finalPrompt += 'Give at least 20 terms if possible.';
      } else {
        finalPrompt += 'You are a dictionary expert. Give ALL common SYNONYMS (other terms/words) of the word below.\n\n';
        finalPrompt += 'CRITICAL RULES:\n';
        finalPrompt += '1. Output ONLY a NUMBERED LIST of synonyms.\n';
        finalPrompt += '2. Do NOT write INTRODUCTION, DEFINITION, MAIN POINTS, EXAMPLES, IMPORTANCE, or CONCLUSION.\n';
        finalPrompt += '3. Do NOT write any essay or paragraph.\n';
        finalPrompt += '4. Do NOT explain what the word means.\n';
        finalPrompt += '5. Just list the synonyms directly.\n';
        finalPrompt += '6. Include brief meaning per synonym if needed.\n';
        finalPrompt += '7. Group them by category (General, Related, Grammar, Filipino, Bisaya) if applicable.\n';
        finalPrompt += '8. NO emojis, NO markdown.\n\n';
        finalPrompt += 'WORD: ' + targetWord + '\n\n';
        finalPrompt += 'FORMAT:\n';
        finalPrompt += 'OTHER TERMS FOR "' + targetWord.toUpperCase() + '"\n\n';
        finalPrompt += 'I. GENERAL SYNONYMS\n';
        finalPrompt += '1. [synonym] - [brief meaning]\n';
        finalPrompt += '2. [synonym] - [brief meaning]\n';
        finalPrompt += '...\n\n';
        finalPrompt += 'II. RELATED TERMS\n';
        finalPrompt += '1. [term] - [brief meaning]\n';
        finalPrompt += '...\n\n';
        finalPrompt += 'III. FILIPINO TERMS\n';
        finalPrompt += '1. [term] - [brief meaning]\n';
        finalPrompt += '...\n\n';
        finalPrompt += 'IV. BISAYA TERMS\n';
        finalPrompt += '1. [term] - [brief meaning]\n';
        finalPrompt += '...\n\n';
        finalPrompt += 'Give at least 30 synonyms if possible.';
      }

      const response = await this.callAPI(finalPrompt, prompt, 'english', 'wordlist', 'wordlist', 'wordlist', 'general');
      let cleaned = this.finalClean(response);

      if (!cleaned || cleaned.length < 10) return null;

      return cleaned;
    } catch (error) {
      console.error('[WordList] Error:', error.message);
      return null;
    }
  },

  // ============================================================
  // GREETINGS & CONVERSATIONAL DETECTION
  // ============================================================
  isGreetingOrConversational(prompt) {
    if (!prompt) return false;
    const p = prompt.trim().toLowerCase().replace(/[.:!?,\s]+$/g, '').trim();
    if (p.length > 60) return false;

    const patterns = [
      /^(hai|hi|hey|hello|helo|hallo|yo|sup|hola|bonjour|konnichiwa|annyeong|ni hao)$/i,
      /^(kumusta|kamusta|musta|musta na|kamusta ka|kumusta ka|kamusta po|kumusta kayo)$/i,
      /^(good\s*(morning|afternoon|evening|day|night))$/i,
      /^(magandang\s*(araw|umaga|hapon|gabi|tanghali))$/i,
      /^(hai|hi|hello|hey|helo|yo)[\s,]+(can|may|pwede|puwede|pwedi|puede)?\s*(i|ako|po|mo)?\s*(ask|tanong|tanungin|hingi|hiling|request|magtanong)?\s*(for|ng|nang|about|tungkol)?\s*(help|tulong|advice|payo|suggestion|assistance)$/i,
      /^(can|may|pwede|puwede|pwedi|puede)\s*(i|ako|po)?\s*(ask|tanong|hingi|hiling|request|magtanong)\s*(for|ng|nang)?\s*(help|tulong|advice|payo|suggestion)?$/i,
      /^(i|ako|po)?\s*(need|want|gusto|kailangan|kailangan ko|gusto ko)\s*(help|tulong|advice|payo|suggestion|assistance)$/i,
      /^(pwede|puwede|pwedi)\s*(po)?\s*(ba)?\s*(magtanong|magtanong po|humingi ng tulong)$/i,
      /^(help|tulong|tabang|saklolo|sakolo|help me|tulungan mo ako|tulongan mo ako|tabangi ko|tabangi ako)$/i,
      /^(thank|thanks|thank you|thank u|thanks po|thank you po|salamat|salamat po|maraming salamat|maraming salamat po|daghang salamat|salamat kaayo)$/i,
      /^(ok|okay|ok po|okay po|sige|sige po|sure|noted|gets|i see|i understand|naintindihan|naintindihan ko|alright|fine|ayos|ayos lang|ge|gihapon)$/i,
      /^(bye|bye po|goodbye|paalam|see you|see you soon|ingat|ingat ka|hanggang sa muli)$/i,
      /^(sorry|sorry po|pasensya|pasensya na|pasensya na po|paumanhin|excuse me|patawad|patawad po)$/i,
      /^(yes|yes po|oo|oo po|opo|yep|yup|yeah|sige oo|no|nope|hindi|hindi po|hindi ko alam|wala)$/i,
      /^(good|nice|great|awesome|perfect|excellent|wow|galing|ang galing|magaling)$/i,
      /^(ano|what)\s*(ito|ito po|ito ba|ba ito|po ito)$/i,
      /^(sino|who)\s*(ka|ka po|po kayo|kayo)$/i,
      /^(ano|what)\s*(pangalan mo|name mo|pangalan mo po|ang pangalan mo)$/i
    ];

    return patterns.some(pattern => pattern.test(p));
  },

  buildConversationalReply(prompt, senderId) {
    const p = prompt.trim().toLowerCase().replace(/[.:!?,\s]+$/g, '').trim();

    if (/^(hai|hi|hey|hello|helo|hallo|yo|sup|hola|bonjour|konnichiwa|annyeong|ni hao)$/i.test(p)) {
      return 'Hello! Ako si Teacher Arlene, ang iyong AI assistant.\n\nPaano kita matutulungan ngayon?\n\nMaaari kang magtanong tungkol sa:\n- Araling Panlipunan\n- Math at Science\n- Research at Thesis\n- Weight estimation ng hayop\n- Logic at Bugtong\n- Synonyms at Antonyms\n\nI-type lang ang iyong tanong o sabihin ang "help" para sa listahan ng commands.';
    }

    if (/^(kumusta|kamusta|musta|musta na|kamusta ka|kumusta ka|kamusta po|kumusta kayo|good\s*(morning|afternoon|evening|day|night)|magandang\s*(araw|umaga|hapon|gabi|tanghali))$/i.test(p)) {
      return 'Kumusta! Ako si Teacher Arlene, handang tumulong sa iyong mga tanong.\n\nAno ang maitutulong ko sa iyo ngayon?\n\nMaaari kang magtanong tungkol sa:\n- Araling Panlipunan\n- Math at Science\n- Research at Thesis\n- Weight estimation ng hayop\n- Logic at Bugtong\n- Synonyms at Antonyms';
    }

    if (/(ask|tanong|tanungin|hingi|hiling|request|magtanong)/i.test(p) && /(help|tulong|advice|payo|suggestion|assistance)/i.test(p)) {
      return 'Hello! Siyempre, puwede kang magtanong o humingi ng tulong sa akin.\n\nAko si Teacher Arlene, at handa akong tumulong sa:\n\n1. Araling Panlipunan - kasaysayan, heograpiya, ekonomiya\n2. Math at Science - algebra, geometry, biology, chemistry, physics\n3. Research at Thesis - qualitative, quantitative, experimental\n4. Weight estimation - baboy, baka, kambing, manok, at iba pa\n5. Logic at Bugtong - mga palaisipan at bugtong\n6. Pagsusulat - essay, sanaysay, talata\n7. Pagsasalin - English to Tagalog at vice versa\n8. Synonyms at Antonyms - kasingkahulugan at kasalungat\n\nI-type lang ang iyong tanong o sabihin ang "help" para sa kumpletong listahan ng commands.';
    }

    if (/^(can|may|pwede|puwede|pwedi|puede)\s*(i|ako|po)?\s*(ask|tanong|hingi|hiling|request|magtanong)/i.test(p)) {
      return 'Oo, siyempre! Puwede kang magtanong ng kahit ano.\n\nAko si Teacher Arlene, at handa akong tumulong sa iyo. I-type lang ang iyong tanong.';
    }

    if (/(need|want|gusto|kailangan|kailangan ko|gusto ko)\s*(help|tulong|advice|payo|suggestion|assistance)/i.test(p)) {
      return 'Sige! Ako si Teacher Arlene, handang tumulong sa iyo.\n\nAno ang gusto mong itanong o ipagawa sa akin?';
    }

    if (/^(help|tulong|tabang|saklolo|sakolo|help me|tulungan mo ako|tulongan mo ako|tabangi ko|tabangi ako)$/i.test(p)) {
      return 'HELP GUIDE\n\nNarito ang mga commands na maaari mong gamitin:\n\n1. AI - Magtanong ng kahit ano\n   Example: ai what is photosynthesis\n\n2. WEIGHT - Estimate ng timbang ng hayop\n   Example: get weight pig heart girth 34 length 31\n\n3. LOGIC - Mga bugtong at palaisipan\n   Example: ai a man has 9 sons each son has a sister\n\n4. FOLLOW-UP - I-reply ang AI response\n   Example: elaborate, summarize, make it short and concise, paraphrase\n\n5. WORD LIST - Synonyms, Antonyms, Other Terms\n   Example: other term for uncountable\n   Example: kasingkahulugan ng maganda\n   Example: kasalungat ng malaki\n\n6. RESEARCH - Qualitative, quantitative, thesis\n   Example: ai qualitative research about social media\n\n7. MATH - Simpleng computation\n   Example: ai 25 + 30 * 2\n\n8. TRANSLATE - Isalin ang text\n   Example: ai translate Good morning\n\nAvailable animals for weight estimation:\n- Pig, Chicken, Cow, Carabao, Goat, Sheep\n- Fish, Duck, Turkey, Horse, Dog, Cat\n- Wood, Rice/Corn/Feeds\n\nI-type lang ang iyong tanong at sasagutin kita.';
    }

    if (/^(thank|thanks|thank you|thank u|thanks po|thank you po|salamat|salamat po|maraming salamat|maraming salamat po|daghang salamat|salamat kaayo)$/i.test(p)) {
      return 'Walang anuman! Natutuwa akong makatulong sa iyo.\n\nKung may iba ka pang tanong, huwag mag-atubiling magtanong. Ako si Teacher Arlene, laging handang tumulong.';
    }

    if (/^(ok|okay|ok po|okay po|sige|sige po|sure|noted|gets|i see|i understand|naintindihan|naintindihan ko|alright|fine|ayos|ayos lang|ge|gihapon)$/i.test(p)) {
      return 'Sige! Kung may iba ka pang katanungan, magtanong ka lang.\n\nHanda akong tumulong anumang oras.';
    }

    if (/^(bye|bye po|goodbye|paalam|see you|see you soon|ingat|ingat ka|hanggang sa muli)$/i.test(p)) {
      return 'Paalam! Salamat sa paggamit ng aking serbisyo.\n\nIngat palagi at babalik ka kung may kailangan ka pang tulong. Ako si Teacher Arlene, laging nandito para sa iyo.';
    }

    if (/^(sorry|sorry po|pasensya|pasensya na|pasensya na po|paumanhin|excuse me|patawad|patawad po)$/i.test(p)) {
      return 'Walang problema! Hindi mo kailangang mag-sorry.\n\nKung may tanong ka, magtanong ka lang. Handa akong tumulong.';
    }

    if (/^(yes|yes po|oo|oo po|opo|yep|yup|yeah|sige oo)$/i.test(p)) {
      return 'Sige! Ano ang gusto mong itanong o ipagawa sa akin?\n\nMaaari kang magtanong tungkol sa Araling Panlipunan, Math, Science, Research, o Weight estimation.';
    }

    if (/^(no|nope|hindi|hindi po|hindi ko alam|wala)$/i.test(p)) {
      return 'Okay, walang problema.\n\nKung magbago ang isip mo, narito lang ako para tumulong. I-type mo lang ang iyong tanong.';
    }

    if (/^(good|nice|great|awesome|perfect|excellent|wow|galing|ang galing|magaling)$/i.test(p)) {
      return 'Salamat! Natutuwa akong nasiyahan ka.\n\nKung may iba ka pang tanong, magtanong ka lang.';
    }

    if (/^(ano|what)\s*(ito|ito po|ito ba|ba ito|po ito)$/i.test(p)) {
      return 'Ako si Teacher Arlene, isang AI assistant na handang tumulong sa iyo.\n\nMaaari kang magtanong ng kahit ano tungkol sa Araling Panlipunan, Math, Science, Research, at iba pa.';
    }

    if (/^(sino|who)\s*(ka|ka po|po kayo|kayo)$/i.test(p)) {
      return 'Ako si Teacher Arlene, isang AI assistant na ginawa ni GeoDevz69.\n\nNarito ako para tumulong sa iyong mga tanong tungkol sa Araling Panlipunan, Math, Science, Research, at iba pa.';
    }

    if (/^(ano|what)\s*(pangalan mo|name mo|pangalan mo po|ang pangalan mo)$/i.test(p)) {
      return 'Ang pangalan ko ay Teacher Arlene.\n\nAko ay isang AI assistant na ginawa ni GeoDevz69 para tumulong sa iyong mga tanong.';
    }

    return 'Hello! Ako si Teacher Arlene, ang iyong AI assistant.\n\nPaano kita matutulungan ngayon?\n\nI-type lang ang iyong tanong at sasagutin kita.';
  },

  // ============================================================
  // FOLLOW-UP COMMANDS (FLEXIBLE)
  // ============================================================
  isFollowUpCommand(cleanPrompt) {
    if (!cleanPrompt) return false;
    const p = cleanPrompt.toLowerCase().trim();

    if (/^(make it |make |gawing |gawin |i-)?(short|brief|concise|maikli|maiksi|iklian|paikliin|paikli|shorten)( and (short|brief|concise|simple))?$/i.test(p)) return true;
    if (/^(make it|make|gawing|gawin)\s+(short|brief|concise|maikli|maiksi|iklian|simple)\s+(and|at)\s+(short|brief|concise|simple|maikli|maiksi)$/i.test(p)) return true;
    if (/^(shorten|summarize|summary|buod|sum up|sum it up|i-summarize|i-buod)$/i.test(p)) return true;
    if (/^(make it|make)\s+(short|brief|concise|simple)$/i.test(p)) return true;
    if (/^(short|brief|concise)\s+(version|lang|po|nalang|na lang)$/i.test(p)) return true;
    if (/^(make|gawing|gawin)\s+(it|mo|po)?\s*(short|brief|concise|simple|maikli|maiksi)$/i.test(p)) return true;
    if (/^(make it|make)\s+(short|brief|concise)\s+(and|at)\s+(simple|madali)$/i.test(p)) return true;
    if (/^(short|brief|concise|maikli|maiksi)\s+lang\s*(po|nga)?$/i.test(p)) return true;

    if (/^(elaborate|explain more|explain further|explain in detail|explain deeply|more explanation|add explanation|paliwanag|ipaliwanag|paliwanagin|magpaliwanag|paliwanag pa|dagdag paliwanag|higit pang paliwanag)( more| further| pa| po)?$/i.test(p)) return true;
    if (/^(elaborate|explain)\s+(it|this|that|mo|po|nga)?$/i.test(p)) return true;
    if (/^(elaborate|explain)\s+(more|further|pa|po)\s+(nga|naman)?$/i.test(p)) return true;

    if (/^(paraphrase|rephrase|rewrite|i-paraphrase|i-rephrase|i-rewrite|baguhin ang salita|iba ang salita|ibang salita|palitan ang salita|bagong salita)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(construct|rebuild|reorganize|i-construct|i-reorganize|ayusin|i-ayos|ayusin ang structure|ayusin ang format)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(simplify|simple|i-simplify|pasimplehin|gawing simple|gawing madali|madaliin|simple version|easy version|easy to understand|madaling maintindihan)( it| this| that| mo| po| lang| naman)?$/i.test(p)) return true;
    if (/^(expand|i-expand|expand more|dagdagan|dagdagan mo|dagdag pa|add more|add more details|more details|more info|more information|karagdagang impormasyon|karagdagang detalye)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(translate|i-translate|isalin|isalin mo|salin|ipasalin|salihin|isalin sa tagalog|isalin sa english|i-translate sa tagalog|i-translate sa english)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(correct|fix|i-correct|i-fix|ayusin ang grammar|ayusin ang spelling|ayusin ang mali|tama|itama|itama mo)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(humanize|i-humanize|make it natural|make it conversational|gawing natural|gawing tao|gawing parang tao)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(formalize|i-formalize|make it formal|make it academic|gawing pormal|pormalin|i-pormal)( it| this| that| mo| po)?$/i.test(p)) return true;

    return false;
  },

  getFollowUpAction(cleanPrompt) {
    const p = cleanPrompt.toLowerCase().trim();
    if (/short|brief|concise|maikli|maiksi|iklian|paikli|shorten|summar|buod|sum up/i.test(p)) return 'summarize';
    if (/paraphrase|rephrase|rewrite|i-rewrite|i-paraphrase|i-rephrase|baguhin|ibang salita|palitan ang salita/i.test(p)) return 'paraphrase';
    if (/simplify|simple|pasimplehin|gawing simple|madali/i.test(p)) return 'simplify';
    if (/expand|dagdagan|dagdag|add more|more details|karagdagang/i.test(p)) return 'expand';
    if (/translate|isalin|salin|ipasalin/i.test(p)) return 'translate';
    if (/correct|fix|i-correct|i-fix|ayusin|tama|itama/i.test(p)) return 'correct';
    if (/humanize|i-humanize|natural|conversational|gawing natural|gawing tao/i.test(p)) return 'humanize';
    if (/formalize|i-formalize|pormal|academic/i.test(p)) return 'formalize';
    if (/construct|i-construct|rebuild|reorganize|i-reorganize|ayusin ang structure|ayusin ang format/i.test(p)) return 'construct';
    if (/elaborate|explain more|explain further|paliwanag|ipaliwanag|dagdag paliwanag/i.test(p)) return 'elaborate';
    return 'elaborate';
  },

  buildFollowUpPrompt(action, previousResponse, userCommand) {
    const actionInstructions = {
      'elaborate': 'ELABORATE the following response. Add MORE DETAILS, examples, explanations, and deeper analysis. Keep the same structure but make it richer and more comprehensive.',
      'summarize': 'SUMMARIZE the following response. Make it SHORT and CONCISE. Keep ONLY the key points. Use a MAXIMUM of 200 words. Remove all unnecessary details. Do NOT explain what summarize means.',
      'paraphrase': 'PARAPHRASE the following response. Rewrite it in DIFFERENT WORDS while keeping the SAME MEANING. Change sentence structure but preserve the message.',
      'simplify': 'SIMPLIFY the following response. Use SIMPLE WORDS and SHORT SENTENCES. Make it easy to understand for a Grade 6 student.',
      'expand': 'EXPAND the following response. Add MORE INFORMATION, examples, and sub-points. Make it longer and more thorough.',
      'translate': 'TRANSLATE the following response into TAGALOG. Keep the same structure and meaning.',
      'correct': 'CORRECT the following response. Fix grammar, spelling, and punctuation errors. Improve clarity.',
      'humanize': 'HUMANIZE the following response. Make it sound more NATURAL and CONVERSATIONAL. Remove robotic or AI-sounding phrases.',
      'formalize': 'FORMALIZE the following response. Make it more ACADEMIC and PROFESSIONAL. Use formal language.',
      'construct': 'CONSTRUCT a new response based on the following. Reorganize it into a clear, well-structured format with proper sections.'
    };

    const instruction = actionInstructions[action] || actionInstructions['elaborate'];

    let prompt = 'You are a text transformation expert.\n\n';
    prompt += 'TASK: ' + instruction + '\n\n';
    prompt += 'CRITICAL RULES:\n';
    prompt += '1. Do NOT explain what the command means.\n';
    prompt += '2. Do NOT define any word.\n';
    prompt += '3. Do NOT add a new TITLE unless necessary.\n';
    prompt += '4. If you keep the TITLE, use the ORIGINAL topic title. Do NOT repeat it twice.\n';
    prompt += '5. Transform the ORIGINAL RESPONSE below. Do NOT create a new topic.\n';
    prompt += '6. Preserve the original meaning and structure where applicable.\n';
    prompt += '7. Respond in the SAME language as the original response.\n';
    prompt += '8. NO emojis, NO markdown, NO LaTeX.\n\n';

    if (action === 'summarize') {
      prompt += 'IMPORTANT FOR SUMMARIZE:\n';
      prompt += '- Output ONLY the summary, nothing else.\n';
      prompt += '- Do NOT write "TITLE:", "INTRODUCTION:", or any section headers unless the original had them.\n';
      prompt += '- Just write the short version directly.\n';
      prompt += '- Maximum 200 words.\n\n';
    }

    prompt += 'ORIGINAL RESPONSE:\n';
    prompt += '---START---\n';
    prompt += previousResponse;
    prompt += '\n---END---\n\n';
    prompt += 'Now write the ' + action.toUpperCase() + ' version:';

    return prompt;
  },

  // ============================================================
  // WEIGHT DETECTION
  // ============================================================
  shouldTriggerWeight(lowerPrompt, originalPrompt) {
    const hasWeightWord = /\b(weight|timbang|weigh|kilo|kg|lbs|pounds|estimate|tantiya|taya|sukat)\b/i.test(lowerPrompt);
    const hasGirthWord = /\b(heart\s*girth|girth|dibdib|chest|circumference|bilog ng dibdib)\b/i.test(lowerPrompt);
    const hasLengthWord = /\b(length|haba|body\s*length|haba ng katawan)\b/i.test(lowerPrompt);
    const hasGetWord = /^(get|kuha|kunin|compute|calculate|estimate|i-|ipa|solve|solve for)\b/i.test(lowerPrompt);
    const hasNumbers = /\d+/.test(originalPrompt);
    const animalKeywords = [
      'pig', 'baboy', 'chicken', 'manok', 'cow', 'baka', 'kalabaw', 'carabao',
      'goat', 'kambing', 'sheep', 'tupa', 'fish', 'isda', 'tilapia', 'bangus',
      'duck', 'pato', 'itik', 'turkey', 'pabo', 'horse', 'kabayo', 'dog', 'aso',
      'cat', 'pusa', 'wood', 'kahoy', 'tabla', 'rice', 'bigas', 'corn', 'mais',
      'feeds', 'feed', 'hayop', 'alaga'
    ];
    const hasAnimal = animalKeywords.some(a => lowerPrompt.includes(a));

    return (
      (hasWeightWord && hasNumbers) ||
      (hasWeightWord && hasAnimal) ||
      (hasGirthWord && hasNumbers) ||
      (hasLengthWord && hasNumbers && hasAnimal) ||
      (hasGetWord && hasAnimal && hasNumbers) ||
      (hasAnimal && hasGirthWord && hasLengthWord) ||
      (hasWeightWord && hasGirthWord)
    );
  },

  async handleWeightEstimation(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase();
      let girth = null, length = null, volume = null;

      const girthMatch = prompt.match(/(?:heart\s*girth|girth|dibdib|chest|circumference)\s*[:=]?\s*(\d+\.?\d*)/i);
      if (girthMatch) girth = parseFloat(girthMatch[1]);

      const lengthMatch = prompt.match(/(?:body\s*length|length|haba)\s*[:=]?\s*(\d+\.?\d*)/i);
      if (lengthMatch) length = parseFloat(lengthMatch[1]);

      const volumeMatch = prompt.match(/(?:volume|liters?|l)\s*[:=]?\s*(\d+\.?\d*)/i);
      if (volumeMatch) volume = parseFloat(volumeMatch[1]);

      const allNumbers = prompt.match(/\d+\.?\d*/g) || [];
      if (girth === null && allNumbers.length >= 1) girth = parseFloat(allNumbers[0]);
      if (length === null && allNumbers.length >= 2) length = parseFloat(allNumbers[1]);
      if (volume === null && allNumbers.length >= 1) volume = parseFloat(allNumbers[0]);

      let result = '';

      if (lower.includes('pig') || lower.includes('baboy')) result = this.buildPigFormula(girth, length);
      else if (lower.includes('chicken') || lower.includes('manok')) result = this.buildChickenFormula(girth);
      else if (lower.includes('cow') || lower.includes('baka')) result = this.buildCowFormula(girth, length);
      else if (lower.includes('carabao') || lower.includes('kalabaw')) result = this.buildCarabaoFormula(girth, length);
      else if (lower.includes('goat') || lower.includes('kambing')) result = this.buildGoatFormula(girth, length);
      else if (lower.includes('sheep') || lower.includes('tupa')) result = this.buildSheepFormula(girth, length);
      else if (lower.includes('fish') || lower.includes('isda') || lower.includes('tilapia') || lower.includes('bangus')) result = this.buildFishFormula(girth, length);
      else if (lower.includes('duck') || lower.includes('pato') || lower.includes('itik')) result = this.buildDuckFormula(girth);
      else if (lower.includes('turkey') || lower.includes('pabo')) result = this.buildTurkeyFormula(girth);
      else if (lower.includes('horse') || lower.includes('kabayo')) result = this.buildHorseFormula(girth, length);
      else if (lower.includes('dog') || lower.includes('aso')) result = this.buildDogFormula(girth, length);
      else if (lower.includes('cat') || lower.includes('pusa')) result = this.buildCatFormula(girth, length);
      else if (lower.includes('wood') || lower.includes('kahoy') || lower.includes('tabla')) result = this.buildWoodFormula(allNumbers, lower);
      else if (lower.includes('rice') || lower.includes('bigas') || lower.includes('corn') || lower.includes('mais') || lower.includes('feeds') || lower.includes('feed')) result = this.buildGrainFormula(volume, allNumbers, lower);
      else result = this.buildWeightGuide();

      await this.sendComplete(senderId, this.finalClean(result), token);
    } catch (error) {
      console.error('[Weight] Error:', error.message);
      await sendMessage(senderId, { text: 'Error calculating weight. Please check your input.' }, token);
    }
  },

  buildPigFormula(girth, length) {
    if (girth === null || length === null) {
      return 'PIG / BABOY WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (inches)\n- Body Length (inches)\n\nExample: get weight pig heart girth 34 length 31\n\nFORMULA:\nWeight (lbs) = (Heart Girth x Heart Girth x Body Length) / 400\nWeight (kg) = Weight (lbs) / 2.2\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from between ears to base of tail';
    }
    const gs = girth * girth;
    const product = gs * length;
    const lbs = product / 400;
    const kg = lbs / 2.2;
    return 'PIG / BABOY WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' inches\n- Body Length: ' + length + ' inches\n\nII. FORMULA\nWeight (lbs) = (Heart Girth x Heart Girth x Body Length) / 400\nWeight (kg) = Weight (lbs) / 2.2\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 400 to get pounds\n        ' + product.toFixed(2) + ' / 400 = ' + lbs.toFixed(2) + ' lbs\nStep 4: Convert to kilograms\n        ' + lbs.toFixed(2) + ' / 2.2 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + lbs.toFixed(1) + ' lbs\n- ' + kg.toFixed(1) + ' kg\n\nV. ACCURACY\n- +/- 10 percent margin of error\n\nVI. NOTE\nMake sure heart girth and body length are measured in INCHES.\nIf measured in cm, convert: inches = cm / 2.54';
  },

  buildChickenFormula(girth) {
    if (girth === null) {
      return 'CHICKEN / MANOK WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight chicken heart girth 30\n\nFORMULA:\nWeight (kg) = 0.001 x (Heart Girth)^2.417\n\nHOW TO MEASURE:\n- Heart Girth: circumference around the breast';
    }
    const power = Math.pow(girth, 2.417);
    const kg = 0.001 * power;
    return 'CHICKEN / MANOK WEIGHT ESTIMATE\n\nI. MEASUREMENT\n- Heart Girth: ' + girth + ' cm\n\nII. FORMULA\nWeight (kg) = 0.001 x (Heart Girth)^2.417\n\nIII. SOLUTION\nStep 1: Raise girth to power of 2.417\n        ' + girth + '^2.417 = ' + power.toFixed(4) + '\nStep 2: Multiply by 0.001\n        0.001 x ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- 8 percent margin of error';
  },

  buildCowFormula(girth, length) {
    if (girth === null || length === null) {
      return 'COW / BAKA WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight cow heart girth 180 length 150\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11877\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from shoulder point to pin bone';
    }
    const gs = girth * girth;
    const product = gs * length;
    const kg = product / 11877;
    return 'COW / BAKA WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nII. FORMULA\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11877\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 11877\n        ' + product.toFixed(2) + ' / 11877 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(1) + ' kg\n\nV. ACCURACY\n- +/- 12 percent margin of error';
  },

  buildCarabaoFormula(girth, length) {
    if (girth === null || length === null) {
      return 'CARABAO / KALABAW WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight carabao heart girth 200 length 160\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11877\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from shoulder point to pin bone';
    }
    const gs = girth * girth;
    const product = gs * length;
    const kg = product / 11877;
    return 'CARABAO / KALABAW WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nII. FORMULA\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11877\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 11877\n        ' + product.toFixed(2) + ' / 11877 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(1) + ' kg\n\nV. ACCURACY\n- +/- 12 percent margin of error';
  },

  buildGoatFormula(girth, length) {
    if (girth === null || length === null) {
      return 'GOAT / KAMBING WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight goat heart girth 80 length 70\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from shoulder to pin bone';
    }
    const gs = girth * girth;
    const product = gs * length;
    const kg = product / 10800;
    return 'GOAT / KAMBING WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nII. FORMULA\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 10800\n        ' + product.toFixed(2) + ' / 10800 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(1) + ' kg\n\nV. ACCURACY\n- +/- 10 percent margin of error';
  },

  buildSheepFormula(girth, length) {
    if (girth === null || length === null) {
      return 'SHEEP / TUPA WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight sheep heart girth 70 length 65\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from shoulder to pin bone';
    }
    const gs = girth * girth;
    const product = gs * length;
    const kg = product / 10800;
    return 'SHEEP / TUPA WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nII. FORMULA\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 10800\n        ' + product.toFixed(2) + ' / 10800 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(1) + ' kg\n\nV. ACCURACY\n- +/- 10 percent margin of error';
  },

  buildFishFormula(girth, length) {
    if (girth === null || length === null) {
      return 'FISH / ISDA WEIGHT FORMULA\n\nPlease provide:\n- Total Length (cm)\n- Girth (cm)\n\nExample: get weight fish length 30 girth 20\n\nFORMULA:\nWeight (kg) = (Total Length x Girth x Girth) / 15000\n\nHOW TO MEASURE:\n- Total Length: from snout to tip of tail\n- Girth: circumference at widest part';
    }
    const gs = girth * girth;
    const product = length * gs;
    const kg = product / 15000;
    return 'FISH / ISDA WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Total Length: ' + length + ' cm\n- Girth: ' + girth + ' cm\n\nII. FORMULA\nWeight (kg) = (Total Length x Girth x Girth) / 15000\n\nIII. SOLUTION\nStep 1: Square the girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by total length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 15000\n        ' + product.toFixed(2) + ' / 15000 = ' + kg.toFixed(3) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- 15 percent margin of error';
  },

  buildDuckFormula(girth) {
    if (girth === null) {
      return 'DUCK / PATO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight duck heart girth 35\n\nFORMULA:\nWeight (kg) = 0.0007 x (Heart Girth)^2.5\n\nHOW TO MEASURE:\n- Heart Girth: circumference around the breast';
    }
    const power = Math.pow(girth, 2.5);
    const kg = 0.0007 * power;
    return 'DUCK / PATO WEIGHT ESTIMATE\n\nI. MEASUREMENT\n- Heart Girth: ' + girth + ' cm\n\nII. FORMULA\nWeight (kg) = 0.0007 x (Heart Girth)^2.5\n\nIII. SOLUTION\nStep 1: Raise girth to power of 2.5\n        ' + girth + '^2.5 = ' + power.toFixed(4) + '\nStep 2: Multiply by 0.0007\n        0.0007 x ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- 10 percent margin of error';
  },

  buildTurkeyFormula(girth) {
    if (girth === null) {
      return 'TURKEY / PABO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight turkey heart girth 50\n\nFORMULA:\nWeight (kg) = 0.0009 x (Heart Girth)^2.5\n\nHOW TO MEASURE:\n- Heart Girth: circumference around the breast';
    }
    const power = Math.pow(girth, 2.5);
    const kg = 0.0009 * power;
    return 'TURKEY / PABO WEIGHT ESTIMATE\n\nI. MEASUREMENT\n- Heart Girth: ' + girth + ' cm\n\nII. FORMULA\nWeight (kg) = 0.0009 x (Heart Girth)^2.5\n\nIII. SOLUTION\nStep 1: Raise girth to power of 2.5\n        ' + girth + '^2.5 = ' + power.toFixed(4) + '\nStep 2: Multiply by 0.0009\n        0.0009 x ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- 10 percent margin of error';
  },

  buildHorseFormula(girth, length) {
    if (girth === null || length === null) {
      return 'HORSE / KABAYO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight horse heart girth 180 length 200\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11900\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from point of shoulder to point of buttock';
    }
    const gs = girth * girth;
    const product = gs * length;
    const kg = product / 11900;
    return 'HORSE / KABAYO WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nII. FORMULA\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11900\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 11900\n        ' + product.toFixed(2) + ' / 11900 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(1) + ' kg\n\nV. ACCURACY\n- +/- 10 percent margin of error';
  },

  buildDogFormula(girth, length) {
    if (girth === null || length === null) {
      return 'DOG / ASO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight dog heart girth 50 length 60\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11800\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from base of neck to base of tail';
    }
    const gs = girth * girth;
    const product = gs * length;
    const kg = product / 11800;
    return 'DOG / ASO WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nII. FORMULA\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11800\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 11800\n        ' + product.toFixed(2) + ' / 11800 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(1) + ' kg\n\nV. ACCURACY\n- +/- 12 percent margin of error\n- Best for medium to large breeds';
  },

  buildCatFormula(girth, length) {
    if (girth === null || length === null) {
      return 'CAT / PUSA WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight cat heart girth 30 length 40\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from base of neck to base of tail';
    }
    const gs = girth * girth;
    const product = gs * length;
    const kg = product / 10800;
    return 'CAT / PUSA WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nII. FORMULA\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 10800\n        ' + product.toFixed(2) + ' / 10800 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- 10 percent margin of error';
  },

  buildWoodFormula(allNumbers, lower) {
    if (allNumbers.length < 3) {
      return 'WOOD / KAHOY WEIGHT FORMULA\n\nPlease provide:\n- Length (cm)\n- Width (cm)\n- Thickness (cm)\n- Type (mahogany, narra, pine, molave)\n\nExample: get weight wood length 200 width 30 thickness 5 mahogany\n\nFORMULA:\nWeight (kg) = (Length x Width x Thickness x Density) / 1000\n\nDENSITY (g/cm3):\n- Mahogany: 0.55\n- Narra: 0.65\n- Pine: 0.45\n- Molave: 0.75';
    }
    const wl = parseFloat(allNumbers[0]);
    const width = parseFloat(allNumbers[1]);
    const thickness = parseFloat(allNumbers[2]);
    let density = 0.55;
    let type = 'Default (Mahogany)';
    if (lower.includes('narra')) { density = 0.65; type = 'Narra'; }
    else if (lower.includes('pine')) { density = 0.45; type = 'Pine'; }
    else if (lower.includes('molave')) { density = 0.75; type = 'Molave'; }
    else if (lower.includes('mahogany')) { density = 0.55; type = 'Mahogany'; }
    const volume = wl * width * thickness;
    const grams = volume * density;
    const kg = grams / 1000;
    return 'WOOD / KAHOY WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Length: ' + wl + ' cm\n- Width: ' + width + ' cm\n- Thickness: ' + thickness + ' cm\n- Type: ' + type + '\n- Density: ' + density + ' g/cm3\n\nII. FORMULA\nWeight (kg) = (Length x Width x Thickness x Density) / 1000\n\nIII. SOLUTION\nStep 1: Compute volume\n        ' + wl + ' x ' + width + ' x ' + thickness + ' = ' + volume.toFixed(2) + ' cm3\nStep 2: Multiply by density\n        ' + volume.toFixed(2) + ' x ' + density + ' = ' + grams.toFixed(2) + ' g\nStep 3: Convert to kg\n        ' + grams.toFixed(2) + ' / 1000 = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- 5 percent margin of error';
  },

  buildGrainFormula(volume, allNumbers, lower) {
    const liters = volume !== null ? volume : (allNumbers.length >= 1 ? parseFloat(allNumbers[0]) : null);
    if (liters === null) {
      return 'RICE / CORN / FEEDS WEIGHT FORMULA\n\nPlease provide:\n- Volume (liters)\n- Type (rice, corn, feeds)\n\nExample: get weight rice 10 liters\n\nFORMULAS:\n- Rice: liters x 0.80 = kg\n- Corn: liters x 0.75 = kg\n- Feeds: liters x 0.60 = kg';
    }
    let kg = 0, type = '', density = 0;
    if (lower.includes('rice') || lower.includes('bigas')) { density = 0.80; type = 'RICE / BIGAS'; }
    else if (lower.includes('corn') || lower.includes('mais')) { density = 0.75; type = 'CORN / MAIS'; }
    else if (lower.includes('feed')) { density = 0.60; type = 'FEEDS'; }
    else { density = 0.75; type = 'DEFAULT (CORN)'; }
    kg = liters * density;
    return type + ' WEIGHT ESTIMATE\n\nI. MEASUREMENT\n- Volume: ' + liters + ' liters\n- Density: ' + density + ' kg/L\n\nII. FORMULA\nWeight (kg) = Volume (liters) x Density (kg/L)\n\nIII. SOLUTION\nStep 1: Multiply volume by density\n        ' + liters + ' x ' + density + ' = ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(1) + ' kg\n\nV. ACCURACY\n- +/- 5 percent margin of error';
  },

  buildWeightGuide() {
    return 'WEIGHT ESTIMATION GUIDE\n\nAll formulas use body measurements, NO SCALE NEEDED.\n\nI. PIG / BABOY\nMeasure: Heart Girth + Body Length (inches)\nFormula: (Girth x Girth x Length) / 400 = lbs\nPrompt: get weight pig heart girth 34 length 31\n\nII. CHICKEN / MANOK\nMeasure: Heart Girth (cm)\nFormula: 0.001 x (Girth)^2.417 = kg\nPrompt: get weight chicken heart girth 30\n\nIII. COW / BAKA\nMeasure: Heart Girth + Body Length (cm)\nFormula: (Girth x Girth x Length) / 11877 = kg\nPrompt: get weight cow heart girth 180 length 150\n\nIV. CARABAO / KALABAW\nMeasure: Heart Girth + Body Length (cm)\nFormula: (Girth x Girth x Length) / 11877 = kg\nPrompt: get weight carabao heart girth 200 length 160\n\nV. GOAT / KAMBING\nMeasure: Heart Girth + Body Length (cm)\nFormula: (Girth x Girth x Length) / 10800 = kg\nPrompt: get weight goat heart girth 80 length 70\n\nVI. SHEEP / TUPA\nMeasure: Heart Girth + Body Length (cm)\nFormula: (Girth x Girth x Length) / 10800 = kg\nPrompt: get weight sheep heart girth 70 length 65\n\nVII. FISH / ISDA\nMeasure: Total Length + Girth (cm)\nFormula: (Length x Girth x Girth) / 15000 = kg\nPrompt: get weight fish length 30 girth 20\n\nVIII. DUCK / PATO\nMeasure: Heart Girth (cm)\nFormula: 0.0007 x (Girth)^2.5 = kg\nPrompt: get weight duck heart girth 35\n\nIX. TURKEY / PABO\nMeasure: Heart Girth (cm)\nFormula: 0.0009 x (Girth)^2.5 = kg\nPrompt: get weight turkey heart girth 50\n\nX. HORSE / KABAYO\nMeasure: Heart Girth + Body Length (cm)\nFormula: (Girth x Girth x Length) / 11900 = kg\nPrompt: get weight horse heart girth 180 length 200\n\nXI. DOG / ASO\nMeasure: Heart Girth + Body Length (cm)\nFormula: (Girth x Girth x Length) / 11800 = kg\nPrompt: get weight dog heart girth 50 length 60\n\nXII. CAT / PUSA\nMeasure: Heart Girth + Body Length (cm)\nFormula: (Girth x Girth x Length) / 10800 = kg\nPrompt: get weight cat heart girth 30 length 40\n\nXIII. WOOD / KAHOY\nMeasure: Length + Width + Thickness + Type (cm)\nFormula: (L x W x H x Density) / 1000 = kg\nPrompt: get weight wood length 200 width 30 thickness 5 mahogany\n\nXIV. RICE / CORN / FEEDS\nMeasure: Volume (liters)\nFormula: Liters x Density = kg\nPrompt: get weight rice 10 liters';
  },

  // ============================================================
  // LOGIC / RIDDLE / BUGTONG
  // ============================================================
  isLogicQuestion(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    const logicKeywords = [
      'riddle', 'bugtong', 'puzzle', 'logic', 'trick question',
      'how many people', 'how many are', 'how many in the family',
      'each son has', 'each daughter has', 'each brother has', 'each sister has',
      'ilang tao', 'ilan ang tao', 'ilang miyembro', 'ilan ang pamilya'
    ];
    if (logicKeywords.some(k => lower.includes(k))) return true;
    if (/a (man|woman|father|mother|person) has \d+ (sons?|daughters?|children?|brothers?|sisters?)/i.test(prompt)) return true;
    if (/each (son|daughter|brother|sister|child) has a (sister|brother)/i.test(prompt)) return true;
    if (/\bhow many (people|members|persons|siblings|brothers|sisters)\b/i.test(prompt) && /\b(family|sons?|daughters?|brothers?|sisters?|children?)\b/i.test(prompt)) return true;
    if (/^(bugtong|sagot|ano ito|ano ang bagay|hulaan)/i.test(lower)) return true;
    if (/\bhow many\b/i.test(lower) && /\b(each|every|per)\b/i.test(lower)) return true;
    return false;
  },

  async handleLogicAnswer(senderId, prompt, token) {
    try {
      const familyMatch = prompt.match(/a (man|woman|father|mother|person) has (\d+) (sons?|daughters?|children?|brothers?|sisters?)/i);
      if (familyMatch) {
        const count = parseInt(familyMatch[2]);
        const type = familyMatch[3].toLowerCase();
        if (/each (son|daughter|brother|sister|child) has a (sister|brother)/i.test(prompt)) {
          const sons = type.startsWith('son') ? count : 0;
          const daughters = type.startsWith('daughter') ? count : 0;
          let siblings = sons + daughters;
          const hasSharedSister = /each son has a sister/i.test(prompt);
          const hasSharedBrother = /each daughter has a brother/i.test(prompt);
          let totalChildren = siblings;
          if (hasSharedSister && daughters === 0) totalChildren += 1;
          if (hasSharedBrother && sons === 0) totalChildren += 1;
          const total = totalChildren + 2;
          let answer = 'TITLE:\nFamily Logic Puzzle\n\nI. GIVEN\n';
          answer += '- The father has ' + count + ' ' + type + '.\n';
          if (hasSharedSister) answer += '- Each ' + type.replace(/s$/, '') + ' has a sister.\n';
          if (hasSharedBrother) answer += '- Each ' + type.replace(/s$/, '') + ' has a brother.\n';
          answer += '\nII. REASONING\n';
          answer += '1. The ' + count + ' ' + type + ' are all brothers/sisters.\n';
          answer += '2. Since each one has a sister, they all SHARE the same sister.\n';
          answer += '3. There is only 1 sister, not ' + count + '.\n';
          answer += '4. Total children = ' + count + ' + 1 = ' + totalChildren + '.\n';
          answer += '5. Add the father and mother = ' + totalChildren + ' + 2 = ' + total + '.\n';
          answer += '\nIII. ANSWER\nThere are ' + total + ' people in the family.\n\n';
          answer += 'Breakdown: ' + count + ' sons + 1 sister + 1 father + 1 mother = ' + total + ' people.';
          return answer;
        }
      }

      const logicPrompt = 'You are a LOGIC and RIDDLE expert. Answer the following question ACCURATELY.\n\nRULES:\n1. Think step by step.\n2. Do NOT invent facts not stated in the question.\n3. If it is a trick question, explain the trick.\n4. Give the FINAL ANSWER clearly at the end.\n5. Answer in the SAME language as the question.\n6. Keep it concise but complete.\n\nFORMAT:\nTITLE:\nLogic Answer\n\nI. REASONING\n[step by step reasoning]\n\nII. ANSWER\n[final answer]\n\nQUESTION: ' + prompt + '\n\nAnswer:';

      const response = await this.callAPI(logicPrompt, prompt, 'english', 'logic', 'logic', 'logic', 'general');
      let cleaned = this.finalClean(response);
      if (!cleaned || cleaned.length < 10) {
        cleaned = 'TITLE:\nLogic Answer\n\nI. REASONING\nAnalyze the given facts carefully.\n\nII. ANSWER\nPlease rephrase the question for a clearer answer.';
      }
      return cleaned;
    } catch (error) {
      console.error('[Logic] Error:', error.message);
      return null;
    }
  },

  // ============================================================
  // CALL API
  // ============================================================
  async callAPI(prompt, originalPrompt, language, intent, topic, subject, requestType) {
    const apiConfigs = [
      { name: 'DeepAI', url: 'https://ceddsrestapi.vercel.app/ai/deepai', param: 'message', responsePath: 'result', timeout: 90000 },
      { name: 'Overchat Qwen', url: 'https://ceddsrestapi.vercel.app/ai/overchat-qwen', param: 'message', responsePath: 'result', successField: 'operator', successValue: 'Ioarkdev', timeout: 90000 },
      { name: 'Cedds ChatPlus', url: 'https://ceddsrestapi.vercel.app/ai/chatplus', param: 'message', responsePath: 'result', successField: 'operator', successValue: 'ceddsdev', timeout: 90000 },
      { name: 'Pollination AI', url: 'https://api-library-kohi-production.up.railway.app/api/pollination-ai', param: 'prompt', responsePath: 'data', successField: 'status', timeout: 90000 },
      { name: 'Opera AI', url: 'https://betadash-api-swordslush-production.up.railway.app/opera', param: 'ask', responsePath: 'message', successField: 'success', timeout: 90000 }
    ];

    let lastError = null;
    let bestResponse = null;
    let bestScore = 0;

    for (const config of apiConfigs) {
      try {
        const encodedPrompt = encodeURIComponent(prompt);
        const apiUrl = config.url + '?' + config.param + '=' + encodedPrompt;
        const response = await axios.get(apiUrl, {
          timeout: config.timeout,
          headers: { 'Accept': 'application/json' }
        });
        const data = response.data;
        if (config.successField && config.successValue !== undefined) {
          if (data[config.successField] !== config.successValue) continue;
        }
        const extracted = this.extractResponse(data, config);
        if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
          const formatted = this.applyUniversalFormat(extracted, originalPrompt, language, intent, topic, subject, requestType);
          const quality = this.validateResponseQuality(formatted);
          if (quality.isGood) return formatted;
          else if (quality.score > bestScore) {
            bestScore = quality.score;
            bestResponse = formatted;
          }
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (bestResponse) return bestResponse;
    throw lastError || new Error('All APIs failed');
  },

  // ============================================================
  // APPLY UNIVERSAL FORMAT
  // ============================================================
  applyUniversalFormat(response, originalPrompt, language, intent, topic, subject, requestType) {
    let formatted = response;
    formatted = this.cleanResponse(formatted);

    formatted = formatted.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');
    formatted = formatted.replace(/^As DeepSeek.*?\n/i, '');
    formatted = formatted.replace(/^As an AI.*?\n/i, '');
    formatted = formatted.replace(/^Here is.*?\n/i, '');
    formatted = formatted.replace(/^Let me.*?\n/i, '');
    formatted = formatted.replace(/^Based on.*?\n/i, '');
    formatted = formatted.replace(/^According to.*?\n/i, '');

    formatted = formatted.replace(/^(TITLE|Title):\s*\n([^\n]+)\n+\2\s*\n/gi, 'TITLE:\n$2\n\n');

    const followUpIntents = ['elaborate', 'summarize', 'paraphrase', 'simplify', 'expand', 'translate', 'correct', 'humanize', 'formalize', 'construct', 'followup', 'wordlist'];
    const isFollowUp = followUpIntents.includes(intent);

    if (!isFollowUp && subject !== 'logic' && intent !== 'logic') {
      if (!formatted.match(/^(TITLE|Title):/i)) {
        const topicClean = topic || 'Response';
        const firstLine = formatted.split('\n')[0].trim();
        if (firstLine.toLowerCase() !== topicClean.toLowerCase()) {
          formatted = 'TITLE:\n' + topicClean + '\n\n' + formatted;
        }
      }
    }

    formatted = formatted.replace(/^[•·▪▫◦‣⁃]\s*/gm, '');
    formatted = formatted.replace(/^(Introduction|Definition|Main Points|Analysis|Conclusion|Recommendations|Key Findings|Results|Process|Examples|Strengths|Weaknesses|Criticism|Verdict|Reasoning|Answer|Given|Statement of the Problem|Background of the Study|Objectives|Hypothesis|Significance|Scope and Delimitation|Review of Related Literature|Methodology|Research Design|Respondents|Participants|Instrument|Data Gathering|Data Collection|Data Analysis|Statistical Treatment|Results and Discussion|Theoretical Framework|Research Questions|Variables|Materials|Procedure|Findings|Abstract|Literature Review|Conceptual Framework|Research Paradigm|Sampling|Ethical Considerations|Trustworthiness|Validity|Reliability|Limitations|Delimitations|Implications|Synthesis|Appendices|References|Measurements|Formula|Solution|Final Answer|Accuracy|Note|How to Measure|Summary|Paraphrase|Simplified Version|Expanded Version|Translation|Corrected Version|Humanized Version|Formal Version|Elaborated Version|General Synonyms|Related Terms|Filipino Terms|Bisaya Terms|Grammar Terms|Math Terms|Antonyms|Synonyms):/gm,
      (match, p1) => p1.toUpperCase() + ':');

    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    formatted = formatted.replace(/[ \t]+/g, ' ');
    formatted = formatted.replace(/ +\n/g, '\n');
    formatted = formatted.replace(/\n +/g, '\n');
    return formatted.trim();
  },

  validateResponseQuality(response) {
    let score = 0;
    if (response.length > 500) score += 10;
    else if (response.length > 200) score += 5;
    if (/(INTRODUCTION|DEFINITION|MAIN|CONCLUSION|ANALYSIS|RECOMMENDATIONS|KEY FINDINGS|RESULTS|PROCESS|EXAMPLES|REASONING|ANSWER|GIVEN|METHODOLOGY|HYPOTHESIS|STATEMENT OF THE PROBLEM|OBJECTIVES|SIGNIFICANCE|FINDINGS|SOLUTION|FORMULA|SYNONYMS|ANTONYMS|GENERAL|RELATED)/i.test(response)) score += 20;
    if (/\d+\.\s/.test(response)) score += 15;
    if (/example|halimbawa|for instance|such as|tulad ng/i.test(response)) score += 15;
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length >= 5) score += 10;
    const lastChar = response.trim().slice(-1);
    if (['.', '!', '?'].includes(lastChar)) score += 10;
    const genericPatterns = /^(yes|no|okay|sure|i think|maybe|perhaps|i'm not sure)/i;
    if (!genericPatterns.test(response.trim())) score += 20;
    return { isGood: score >= 70, isAcceptable: score >= 40, score: score };
  },

  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'meron', 'mayroon', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'pakiusap', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'];
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

  detectSubject(prompt) {
    const lower = prompt.toLowerCase();
    if (this.isWordListQuestion(prompt)) return 'wordlist';
    if (/^survey:/i.test(lower)) return 'survey';
    if (/^interview:/i.test(lower)) return 'interview';
    if (/^observation:/i.test(lower)) return 'observation';
    if (/^criticize:|^critique:/i.test(lower)) return 'critique';
    if (/^elaborate:/i.test(lower)) return 'elaborate';
    if (/^explain.*examples:/i.test(lower)) return 'explain_examples';
    if (/^difference:|^compare:/i.test(lower)) return 'comparison';
    if (/^research:/i.test(lower)) return 'research';
    if (this.isLogicQuestion(prompt)) return 'logic';
    if (/qualitative research/i.test(lower)) return 'qualitative';
    if (/quantitative research/i.test(lower)) return 'quantitative';
    if (/thesis|dissertation/i.test(lower)) return 'thesis';
    if (/true experimental/i.test(lower)) return 'experimental';
    if (/quasi-experimental/i.test(lower)) return 'quasi_experimental';
    if (/pre-experimental/i.test(lower)) return 'pre_experimental';
    if (/experimental/i.test(lower)) return 'experimental';
    if (/case study/i.test(lower)) return 'case_study';
    if (/correlational/i.test(lower)) return 'correlational';
    if (/descriptive/i.test(lower)) return 'descriptive';
    if (/phenomenolog/i.test(lower)) return 'phenomenology';
    if (/ethnograph/i.test(lower)) return 'ethnography';
    if (/grounded theory/i.test(lower)) return 'grounded_theory';
    if (/mixed methods/i.test(lower)) return 'mixed_methods';
    if (/action research/i.test(lower)) return 'action_research';
    if (/survey|interview|observation|questionnaire|research instrument|data collection|methodology/i.test(lower)) return 'research_tools';
    if (/criticize|critique|analyze|analysis|review|evaluate|assess/i.test(lower)) return 'critique';
    if (/research|study|proposal/i.test(lower)) return 'research';
    if (/photosynthesis|cell|dna|protein|enzyme|organism|ecosystem|evolution|genetics|biology|chemistry|physics|atom|molecule|chemical|reaction|gravity|energy/i.test(lower)) return 'science';
    if (/solve|equation|formula|calculate|compute|x =|algebra|geometry|trigonometry|calculus/i.test(lower)) return 'math';
    if (/history|rizal|bonifacio|lapu-lapu|revolution|world war|kasaysayan|president|hero|bayani/i.test(lower)) return 'history';
    if (/noun|verb|adjective|grammar|sentence|paragraph|essay|literature|poem|novel|story/i.test(lower)) return 'english';
    if (/panghalip|pangngalan|pandiwa|pang-uri|pang-abay|tula|sanaysay|kwento|balarila/i.test(lower)) return 'filipino';
    if (/python|java|javascript|c\+\+|programming|code|function|variable|loop|array/i.test(lower)) return 'coding';
    if (/health|disease|symptom|treatment|medicine|doctor|nurse|nutrition|exercise/i.test(lower)) return 'health';
    if (/business|management|marketing|finance|accounting|entrepreneur|economics/i.test(lower)) return 'business';
    if (/logic|puzzle|riddle/i.test(lower)) return 'logic';
    return 'general';
  },

  detectIntent(prompt) {
    const lower = prompt.toLowerCase();
    if (this.isWordListQuestion(prompt)) return 'wordlist';
    if (/^survey:/i.test(lower)) return 'survey';
    if (/^interview:/i.test(lower)) return 'interview';
    if (/^observation:/i.test(lower)) return 'observation';
    if (/^criticize:|^critique:/i.test(lower)) return 'critique';
    if (/^elaborate:/i.test(lower)) return 'elaborate';
    if (/^explain.*examples:/i.test(lower)) return 'explain_examples';
    if (/^difference:|^compare:/i.test(lower)) return 'comparison';
    if (/^research:/i.test(lower)) return 'research';
    if (this.isLogicQuestion(prompt)) return 'logic';
    if (/qualitative research/i.test(lower)) return 'qualitative';
    if (/quantitative research/i.test(lower)) return 'quantitative';
    if (/true experimental/i.test(lower)) return 'experimental';
    if (/quasi-experimental/i.test(lower)) return 'quasi_experimental';
    if (/pre-experimental/i.test(lower)) return 'pre_experimental';
    if (/experimental/i.test(lower)) return 'experimental';
    if (/case study/i.test(lower)) return 'case_study';
    if (/correlational/i.test(lower)) return 'correlational';
    if (/descriptive/i.test(lower)) return 'descriptive';
    if (/phenomenolog/i.test(lower)) return 'phenomenology';
    if (/ethnograph/i.test(lower)) return 'ethnography';
    if (/grounded theory/i.test(lower)) return 'grounded_theory';
    if (/mixed methods/i.test(lower)) return 'mixed_methods';
    if (/action research/i.test(lower)) return 'action_research';
    if (/thesis|dissertation/i.test(lower)) return 'thesis';
    if (/difference|compare|contrast|vs|versus|kaibahan|pagkakaiba/i.test(lower)) return 'comparison';
    if (/criticize|critique|observe|observation|analyze|analysis|review|evaluate|assess/i.test(lower)) return 'critique';
    if (/research|thesis|study|dissertation|research title|proposal|methodology/i.test(lower)) return 'research';
    if (/what is|what are|define|definition|meaning of|ano ang|kahulugan/i.test(lower)) return 'definition';
    if (/process|steps|how does|how do|procedure|paano|cycle/i.test(lower)) return 'process';
    if (/who is|who are|biography|life of|sino si|sino ang/i.test(lower)) return 'biography';
    if (/solve|calculate|compute|equation|formula/i.test(lower)) return 'math';
    if (/list|enumerate|examples of|types of|kinds of/i.test(lower)) return 'list';
    if (/why|bakit|reason|cause/i.test(lower)) return 'explanation';
    if (/how to|paano gawin|tutorial|guide/i.test(lower)) return 'howto';
    if (/advantage|disadvantage|benefit|drawback|pros|cons/i.test(lower)) return 'proscons';
    if (/important|importance|significance|kahalagahan/i.test(lower)) return 'importance';
    if (/effect|impact|influence|epekto|impluwensya/i.test(lower)) return 'effects';
    if (/essay|sanaysay|composition/i.test(lower)) return 'essay';
    return 'general';
  },

  detectRequestType(prompt) {
    const lower = prompt.toLowerCase();
    if (this.isWordListQuestion(prompt)) return 'general';
    if (/summarize|summary|buod|i-summarize|i-buod|shorten|paikliin/i.test(lower)) return 'summarize';
    if (/^make it short|^short|^concise|^brief|maikli|iklian/i.test(lower)) return 'short';
    if (/translate|isalin|salin|ipasalin|translation/i.test(lower)) return 'translate';
    if (/^[\d\s\+\-\*\/\(\)\.\,×÷]+$/.test(lower.replace(/\s/g, ''))) return 'math';
    if (/^survey:|^interview:|^observation:|^criticize:|^critique:|^elaborate:|^explain.*examples:|^difference:|^compare:|^research:/i.test(lower)) return 'detailed';
    if (this.isLogicQuestion(prompt)) return 'general';
    if (/qualitative|quantitative|thesis|dissertation|experimental|case study|correlational|descriptive|phenomenolog|ethnograph|grounded theory|mixed methods|action research/i.test(lower)) return 'detailed';
    if (/define|explain|describe|process|steps|how does|how do|full|complete|detailed|elaborate|paliwanag|ipaliwanag|ilarawan|buong|kompleto|examples|criticize|critique|observe|observation|analyze|analysis|review|evaluate|assess|comment|reflection|research|thesis|study|proposal|essay|sanaysay|difference|compare|contrast/i.test(lower)) return 'detailed';
    return 'general';
  },

  extractTopic(prompt) {
    if (!prompt) return 'the topic';
    if (this.isWordListQuestion(prompt)) return 'Response';

    let topic = prompt;
    topic = topic.replace(/^(ai|ask|chat|answer)\s+/i, '');
    topic = topic.replace(/^(survey|interview|observation|criticize|critique|elaborate|difference|compare|research):\s*/i, '');
    topic = topic.replace(/^explain\s+and\s+give\s+examples:\s*/i, '');

    const followUpOnly = /^(elaborate|summarize|summary|buod|paraphrase|rewrite|rephrase|construct|simplify|expand|shorten|brief|concise|translate|isalin|correct|fix|humanize|formalize|make it short|make it brief|make it short and concise|dagdagan)\.?$/i;
    if (followUpOnly.test(topic.trim())) return 'Response';

    const greetingOnly = /^(hai|hi|hey|hello|helo|hallo|yo|sup|kumusta|kamusta|musta|good\s*(morning|afternoon|evening|day)|magandang\s*(araw|umaga|hapon|gabi)|help|tulong|thanks|thank you|salamat|ok|okay|sige|sure|noted|bye|goodbye|paalam|sorry|pasensya|yes|oo|opo|no|hindi)[\s!.,]*$/i;
    if (greetingOnly.test(prompt.trim())) return 'Response';

    const actionPatterns = [
      /^(criticize|critique|observe|observation|analyze|analysis|review|evaluate|assess|comment on|react to|reflection on)\s+/i,
      /^(about|tungkol sa|regarding)\s+/i,
      /^(define|explain|describe|discuss|what is|what are)\s+/i,
      /^(who is|who are|sino si|sino ang)\s+/i,
      /^(how does|how do|paano)\s+/i,
      /^(give|list|enumerate|examples of|types of|kinds of)\s+/i,
      /^(compare|contrast|difference between|similarities between|kaibahan ng|pagkakaiba ng)\s+/i,
      /^(why|bakit)\s+/i,
      /^(how to|paano gawin)\s+/i,
      /^(write|essay|sanaysay)\s+/i,
      /^(make|create|write)\s+(a\s+)?(qualitative|quantitative|experimental|descriptive|correlational|case study|phenomenological|ethnographic|mixed methods|action)\s+research\s+(about|on)\s+/i,
      /^(qualitative|quantitative|experimental|descriptive|correlational)\s+research\s+(about|on)\s+/i,
      /^(thesis|dissertation)\s+(about|on)\s+/i
    ];

    for (const pattern of actionPatterns) {
      topic = topic.replace(pattern, '');
    }
    topic = topic.replace(/[?.!]+$/, '').trim();
    if (!topic) return 'Response';
    return topic;
  },

  buildDetailedPrompt(prompt, previousResponse, previousPrompt, language, intent, topic, subject, requestType) {
    const langName = this.getLanguageName(language);
    if (subject === 'logic' || intent === 'logic') return this.buildLogicPrompt(prompt, langName);
    if (subject === 'wordlist' || intent === 'wordlist') return this.buildWordListPrompt(prompt, langName);

    let finalPrompt = '';
    finalPrompt += 'You MUST respond in ' + langName.toUpperCase() + ' language.\n';
    finalPrompt += 'Write a COMPLETE, DETAILED, and ORGANIZED response.\n';
    finalPrompt += 'Do NOT cut off. Complete the entire response.\n\n';

    if (intent === 'qualitative') finalPrompt += this.researchQualitative(topic, langName);
    else if (intent === 'quantitative') finalPrompt += this.researchQuantitative(topic, langName);
    else if (intent === 'experimental') finalPrompt += this.researchExperimental(topic, langName);
    else if (intent === 'quasi_experimental') finalPrompt += this.researchQuasi(topic, langName);
    else if (intent === 'pre_experimental') finalPrompt += this.researchPre(topic, langName);
    else if (intent === 'thesis') finalPrompt += this.researchThesis(topic, langName);
    else if (intent === 'case_study') finalPrompt += this.researchCaseStudy(topic, langName);
    else if (intent === 'correlational') finalPrompt += this.researchCorrelational(topic, langName);
    else if (intent === 'descriptive') finalPrompt += this.researchDescriptive(topic, langName);
    else if (intent === 'phenomenology') finalPrompt += this.researchPhenomenology(topic, langName);
    else if (intent === 'ethnography') finalPrompt += this.researchEthnography(topic, langName);
    else if (intent === 'grounded_theory') finalPrompt += this.researchGroundedTheory(topic, langName);
    else if (intent === 'mixed_methods') finalPrompt += this.researchMixedMethods(topic, langName);
    else if (intent === 'action_research') finalPrompt += this.researchAction(topic, langName);
    else if (intent === 'survey') finalPrompt += this.formatSurvey(topic, langName);
    else if (intent === 'interview') finalPrompt += this.formatInterview(topic, langName);
    else if (intent === 'observation') finalPrompt += this.formatObservation(topic, langName);
    else if (intent === 'critique') finalPrompt += this.formatCritique(topic, langName);
    else if (intent === 'elaborate') finalPrompt += this.formatElaborate(topic, langName);
    else if (intent === 'explain_examples') finalPrompt += this.formatExplainExamples(topic, langName);
    else if (intent === 'comparison') finalPrompt += this.formatComparison(topic, langName);
    else if (intent === 'research') finalPrompt += this.formatResearch(topic, langName);
    else if (intent === 'definition') finalPrompt += this.formatDefinition(topic, langName);
    else if (intent === 'process') finalPrompt += this.formatProcess(topic, langName);
    else if (intent === 'biography') finalPrompt += this.formatBiography(topic, langName);
    else if (intent === 'list') finalPrompt += this.formatList(topic, langName);
    else if (intent === 'explanation') finalPrompt += this.formatExplanation(topic, langName);
    else if (intent === 'howto') finalPrompt += this.formatHowTo(topic, langName);
    else if (intent === 'proscons') finalPrompt += this.formatProsCons(topic, langName);
    else if (intent === 'importance') finalPrompt += this.formatImportance(topic, langName);
    else if (intent === 'effects') finalPrompt += this.formatEffects(topic, langName);
    else if (intent === 'essay') finalPrompt += this.formatEssay(topic, langName);
    else finalPrompt += this.formatGeneral(topic, langName);

    if (previousResponse) {
      finalPrompt += 'Previous conversation:\nUser: ' + (previousPrompt || 'unknown') + '\nAssistant: ' + previousResponse + '\n\n';
    }

    finalPrompt += 'CRITICAL INSTRUCTIONS:\n';
    finalPrompt += '1. Respond in ' + langName.toUpperCase() + ' language.\n';
    finalPrompt += '2. Do NOT start with "Answer:" or any prefix.\n';
    finalPrompt += '3. Complete ALL sections.\n';
    finalPrompt += '4. Include SPECIFIC examples.\n';
    finalPrompt += '5. Use NUMBERED lists.\n';
    finalPrompt += '6. Use CAPITAL LETTERS for section headers.\n';
    finalPrompt += '7. NO emojis, NO markdown, NO LaTeX.\n';
    finalPrompt += '8. Do NOT cut off mid-sentence.\n';
    finalPrompt += '9. Be detailed, organized, and easy to understand.\n\n';
    finalPrompt += 'Question: ' + prompt + '\n\n';
    finalPrompt += 'Write your COMPLETE response directly in ' + langName + '.';
    return finalPrompt;
  },

  buildWordListPrompt(prompt, langName) {
    let finalPrompt = '';
    finalPrompt += 'You are a dictionary expert. Give ALL common synonyms/terms for the word in the question.\n\n';
    finalPrompt += 'CRITICAL RULES:\n';
    finalPrompt += '1. Output ONLY a NUMBERED LIST.\n';
    finalPrompt += '2. Do NOT write INTRODUCTION, DEFINITION, MAIN POINTS, EXAMPLES, IMPORTANCE, or CONCLUSION.\n';
    finalPrompt += '3. Do NOT write any essay or paragraph.\n';
    finalPrompt += '4. Just list the terms directly.\n';
    finalPrompt += '5. Respond in ' + langName.toUpperCase() + ' language.\n';
    finalPrompt += '6. NO emojis, NO markdown.\n\n';
    finalPrompt += 'QUESTION: ' + prompt + '\n\n';
    finalPrompt += 'Give the list directly:';
    return finalPrompt;
  },

  researchQualitative(topic, lang) { return 'Write a COMPLETE QUALITATIVE RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. BACKGROUND OF THE STUDY\nIII. STATEMENT OF THE PROBLEM\nIV. RESEARCH QUESTIONS\nV. THEORETICAL FRAMEWORK\nVI. CONCEPTUAL FRAMEWORK\nVII. METHODOLOGY\nVIII. RESEARCH DESIGN\nIX. PARTICIPANTS\nX. SAMPLING\nXI. DATA COLLECTION\nXII. DATA ANALYSIS\nXIII. ETHICAL CONSIDERATIONS\nXIV. TRUSTWORTHINESS\nXV. FINDINGS\nXVI. CONCLUSION\nXVII. RECOMMENDATIONS\nXVIII. REFERENCES\n\n'; },
  researchQuantitative(topic, lang) { return 'Write a COMPLETE QUANTITATIVE RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. BACKGROUND OF THE STUDY\nIII. STATEMENT OF THE PROBLEM\nIV. HYPOTHESIS\nV. SIGNIFICANCE OF THE STUDY\nVI. SCOPE AND DELIMITATION\nVII. REVIEW OF RELATED LITERATURE\nVIII. THEORETICAL FRAMEWORK\nIX. METHODOLOGY\nX. RESEARCH DESIGN\nXI. RESPONDENTS\nXII. SAMPLING\nXIII. INSTRUMENT\nXIV. VALIDITY AND RELIABILITY\nXV. DATA GATHERING\nXVI. STATISTICAL TREATMENT\nXVII. RESULTS AND FINDINGS\nXVIII. CONCLUSION\nXIX. RECOMMENDATIONS\nXX. REFERENCES\n\n'; },
  researchExperimental(topic, lang) { return 'Write a COMPLETE EXPERIMENTAL RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. OBJECTIVES\nIII. HYPOTHESIS\nIV. VARIABLES\nV. MATERIALS\nVI. PROCEDURE\nVII. RESULTS\nVIII. ANALYSIS\nIX. CONCLUSION\nX. RECOMMENDATIONS\n\n'; },
  researchQuasi(topic, lang) { return 'Write a COMPLETE QUASI-EXPERIMENTAL RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. OBJECTIVES\nIII. HYPOTHESIS\nIV. VARIABLES\nV. RESEARCH DESIGN\nVI. PARTICIPANTS\nVII. INSTRUMENT\nVIII. PROCEDURE\nIX. RESULTS\nX. ANALYSIS\nXI. LIMITATIONS\nXII. CONCLUSION\nXIII. RECOMMENDATIONS\n\n'; },
  researchPre(topic, lang) { return 'Write a COMPLETE PRE-EXPERIMENTAL RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. OBJECTIVES\nIII. HYPOTHESIS\nIV. VARIABLES\nV. RESEARCH DESIGN\nVI. PARTICIPANTS\nVII. PROCEDURE\nVIII. RESULTS\nIX. ANALYSIS\nX. LIMITATIONS\nXI. CONCLUSION\nXII. RECOMMENDATIONS\n\n'; },
  researchThesis(topic, lang) { return 'Write a COMPLETE THESIS about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. BACKGROUND OF THE STUDY\nIII. STATEMENT OF THE PROBLEM\nIV. OBJECTIVES\nV. SIGNIFICANCE\nVI. SCOPE AND DELIMITATION\nVII. REVIEW OF RELATED LITERATURE\nVIII. THEORETICAL FRAMEWORK\nIX. CONCEPTUAL FRAMEWORK\nX. METHODOLOGY\nXI. RESEARCH DESIGN\nXII. RESPONDENTS\nXIII. INSTRUMENT\nXIV. DATA GATHERING\nXV. DATA ANALYSIS\nXVI. RESULTS AND DISCUSSION\nXVII. CONCLUSION\nXVIII. RECOMMENDATIONS\nXIX. REFERENCES\n\n'; },
  researchCaseStudy(topic, lang) { return 'Write a COMPLETE CASE STUDY about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. BACKGROUND\nIII. STATEMENT OF THE PROBLEM\nIV. RESEARCH QUESTIONS\nV. METHODOLOGY\nVI. PARTICIPANT/S\nVII. DATA COLLECTION\nVIII. DATA ANALYSIS\nIX. FINDINGS\nX. DISCUSSION\nXI. CONCLUSION\nXII. RECOMMENDATIONS\n\n'; },
  researchCorrelational(topic, lang) { return 'Write a COMPLETE CORRELATIONAL RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. HYPOTHESIS\nIV. VARIABLES\nV. METHODOLOGY\nVI. RESEARCH DESIGN\nVII. RESPONDENTS\nVIII. INSTRUMENT\nIX. DATA GATHERING\nX. STATISTICAL TREATMENT\nXI. RESULTS\nXII. ANALYSIS\nXIII. CONCLUSION\nXIV. RECOMMENDATIONS\n\n'; },
  researchDescriptive(topic, lang) { return 'Write a COMPLETE DESCRIPTIVE RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. OBJECTIVES\nIV. METHODOLOGY\nV. RESEARCH DESIGN\nVI. RESPONDENTS\nVII. INSTRUMENT\nVIII. DATA GATHERING\nIX. STATISTICAL TREATMENT\nX. RESULTS\nXI. ANALYSIS\nXII. CONCLUSION\nXIII. RECOMMENDATIONS\n\n'; },
  researchPhenomenology(topic, lang) { return 'Write a COMPLETE PHENOMENOLOGICAL RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. RESEARCH QUESTIONS\nIV. PHILOSOPHICAL FOUNDATION\nV. METHODOLOGY\nVI. PARTICIPANTS\nVII. DATA COLLECTION\nVIII. DATA ANALYSIS\nIX. THEMES\nX. FINDINGS\nXI. CONCLUSION\nXII. RECOMMENDATIONS\n\n'; },
  researchEthnography(topic, lang) { return 'Write a COMPLETE ETHNOGRAPHIC RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. RESEARCH QUESTIONS\nIV. CULTURAL CONTEXT\nV. METHODOLOGY\nVI. PARTICIPANTS\nVII. DATA COLLECTION\nVIII. DATA ANALYSIS\nIX. FINDINGS\nX. CONCLUSION\nXI. RECOMMENDATIONS\n\n'; },
  researchGroundedTheory(topic, lang) { return 'Write a COMPLETE GROUNDED THEORY RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. RESEARCH QUESTIONS\nIV. METHODOLOGY\nV. PARTICIPANTS\nVI. DATA COLLECTION\nVII. CODING PROCESS\nVIII. THEORETICAL SAMPLING\nIX. FINDINGS\nX. THEORY DEVELOPMENT\nXI. CONCLUSION\nXII. RECOMMENDATIONS\n\n'; },
  researchMixedMethods(topic, lang) { return 'Write a COMPLETE MIXED METHODS RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. RESEARCH QUESTIONS\nIV. METHODOLOGY\nV. RESEARCH DESIGN\nVI. QUANTITATIVE PHASE\nVII. QUALITATIVE PHASE\nVIII. PARTICIPANTS\nIX. INSTRUMENT\nX. DATA COLLECTION\nXI. DATA ANALYSIS\nXII. INTEGRATION OF FINDINGS\nXIII. FINDINGS\nXIV. CONCLUSION\nXV. RECOMMENDATIONS\n\n'; },
  researchAction(topic, lang) { return 'Write a COMPLETE ACTION RESEARCH about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. CONTEXT AND RATIONALE\nIII. STATEMENT OF THE PROBLEM\nIV. OBJECTIVES\nV. METHODOLOGY\nVI. PARTICIPANTS\nVII. INTERVENTION\nVIII. DATA COLLECTION\nIX. DATA ANALYSIS\nX. RESULTS\nXI. REFLECTION\nXII. CONCLUSION\nXIII. RECOMMENDATIONS\n\n'; },
  formatSurvey(topic, lang) { return 'Create a COMPLETE SURVEY REPORT about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. SURVEY METHODOLOGY\nIII. SURVEY QUESTIONNAIRE\nPART I: RESPONDENT PROFILE (Checklist)\nPART II: HABITS (Checklist)\nPART III: BEHAVIORS (Likert Scale)\nIV. SURVEY RESULTS\nV. KEY FINDINGS\nVI. ANALYSIS\nVII. CONCLUSION\nVIII. RECOMMENDATIONS\n\n'; },
  formatInterview(topic, lang) { return 'Create a COMPLETE INTERVIEW REPORT about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. INTERVIEW METHODOLOGY\nIII. INTERVIEW GUIDE QUESTIONS\nIV. INTERVIEW RESULTS\nV. KEY FINDINGS\nVI. ANALYSIS\nVII. CONCLUSION\nVIII. RECOMMENDATIONS\n\n'; },
  formatObservation(topic, lang) { return 'Create a COMPLETE OBSERVATION REPORT about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. OBSERVATION METHODOLOGY\nIII. OBSERVATION RESULTS\nIV. KEY FINDINGS\nV. ANALYSIS\nVI. CONCLUSION\nVII. RECOMMENDATIONS\n\n'; },
  formatCritique(topic, lang) { return 'Write a COMPLETE CRITIQUE about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\nCritique: ' + topic + '\n\nI. INTRODUCTION\nII. STRENGTHS\nIII. WEAKNESSES\nIV. CRITICISM\nV. RECOMMENDATIONS\nVI. IMPROVED VERSIONS\nVII. CONCLUSION\nVIII. FINAL VERDICT\n\n'; },
  formatElaborate(topic, lang) { return 'Write a COMPLETE ELABORATION about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. DEFINITION\nIII. FACTORS AFFECTING\nIV. COMMON HABITS\nV. COMMON BEHAVIORS\nVI. EFFECTS\nVII. CHALLENGES\nVIII. RECOMMENDATIONS\nIX. CONCLUSION\n\n'; },
  formatExplainExamples(topic, lang) { return 'Write a COMPLETE EXPLANATION WITH EXAMPLES about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. DEFINITION\nIII. WHAT IS [TOPIC]?\nIV. EXAMPLES OF [TOPIC]\nV. TYPES OF [TOPIC]\nVI. FACTORS AFFECTING\nVII. EFFECTS\nVIII. CONCLUSION\n\n'; },
  formatComparison(topic, lang) { return 'Write a COMPLETE COMPARISON about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. DEFINITION OF EACH\nIII. SIMILARITIES\nIV. DIFFERENCES\nV. COMPARISON TABLE\nVI. ADVANTAGES AND DISADVANTAGES\nVII. CONCLUSION\n\n'; },
  formatResearch(topic, lang) { return 'Write a COMPLETE RESEARCH ANALYSIS about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. ANALYSIS\nIII. RECOMMENDATIONS\nIV. IMPROVED VERSIONS\nV. CONCLUSION\n\n'; },
  formatDefinition(topic, lang) { return 'Write a COMPLETE DEFINITION AND EXPLANATION about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. DEFINITION\nIII. KEY CHARACTERISTICS\nIV. TYPES\nV. EXAMPLES\nVI. IMPORTANCE\nVII. CONCLUSION\n\n'; },
  formatProcess(topic, lang) { return 'Write a COMPLETE PROCESS EXPLANATION about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. DEFINITION\nIII. FULL PROCESS\nIV. IMPORTANCE\nV. CONCLUSION\n\n'; },
  formatBiography(topic, lang) { return 'Write a COMPLETE BIOGRAPHY about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. BACKGROUND\nIII. EARLY LIFE\nIV. EDUCATION\nV. CAREER\nVI. MAJOR CONTRIBUTIONS\nVII. SIGNIFICANCE\nVIII. CONCLUSION\n\n'; },
  formatList(topic, lang) { return 'Write a COMPLETE LIST about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. LIST\nIII. CONCLUSION\n\n'; },
  formatExplanation(topic, lang) { return 'Write a COMPLETE EXPLANATION about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. DIRECT ANSWER\nIII. MAIN REASONS\nIV. CONCLUSION\n\n'; },
  formatHowTo(topic, lang) { return 'Write a COMPLETE HOW-TO GUIDE about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. MATERIALS NEEDED\nIII. STEP-BY-STEP GUIDE\nIV. TIPS AND WARNINGS\nV. CONCLUSION\n\n'; },
  formatProsCons(topic, lang) { return 'Write a COMPLETE PROS AND CONS about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. ADVANTAGES\nIII. DISADVANTAGES\nIV. BALANCED VIEW\nV. CONCLUSION\n\n'; },
  formatImportance(topic, lang) { return 'Write a COMPLETE IMPORTANCE EXPLANATION about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. DIRECT ANSWER\nIII. WHY IT MATTERS\nIV. IMPACT\nV. CONCLUSION\n\n'; },
  formatEffects(topic, lang) { return 'Write a COMPLETE EFFECTS ANALYSIS about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. POSITIVE EFFECTS\nIII. NEGATIVE EFFECTS\nIV. BALANCED VIEW\nV. CONCLUSION\n\n'; },
  formatEssay(topic, lang) { return 'Write a COMPLETE ESSAY about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. BODY\nParagraph 1:\nParagraph 2:\nParagraph 3:\nIII. CONCLUSION\n\n'; },
  formatGeneral(topic, lang) { return 'Write a COMPLETE, DETAILED, and ORGANIZED response about "' + topic + '" in ' + lang + '.\n\nFORMAT:\nTITLE:\n' + topic + '\n\nI. INTRODUCTION\nII. DEFINITION\nIII. MAIN POINTS\nIV. EXAMPLES\nV. IMPORTANCE\nVI. CONCLUSION\n\n'; },

  buildLogicPrompt(prompt, langName) {
    let finalPrompt = '';
    finalPrompt += 'You are a LOGIC and RIDDLE expert. Answer the following question ACCURATELY.\n\n';
    finalPrompt += 'CRITICAL RULES:\n';
    finalPrompt += '1. Think STEP BY STEP before answering.\n';
    finalPrompt += '2. Do NOT invent facts that are NOT stated in the question.\n';
    finalPrompt += '3. If it is a TRICK question, explain the trick clearly.\n';
    finalPrompt += '4. Do NOT repeat the question.\n';
    finalPrompt += '5. Give the FINAL ANSWER clearly at the end.\n';
    finalPrompt += '6. Respond in ' + langName.toUpperCase() + ' language.\n';
    finalPrompt += '7. Keep it CONCISE.\n';
    finalPrompt += '8. NO emojis, NO markdown, NO LaTeX.\n\n';
    finalPrompt += 'FORMAT:\nTITLE:\nLogic Answer\n\nI. REASONING\n[Step-by-step reasoning]\n\nII. ANSWER\n[Final answer]\n\n';
    finalPrompt += 'QUESTION: ' + prompt + '\n\nWrite your COMPLETE response now:';
    return finalPrompt;
  },

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
      if (i > 0) chunk = chunk.replace(/^(Answer|Sagot|ANSWER):\s*/i, '');
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

  tryMathCompute(prompt) {
    if (!prompt) return null;
    const lower = prompt.toLowerCase();
    const nonMathKeywords = ['summarize', 'summary', 'buod', 'shorten', 'paikliin', 'brief', 'concise',
      'short', 'maikli', 'translate', 'isalin', 'salin', 'explain', 'paliwanag', 'ipaliwanag',
      'detail', 'elaborate', 'what', 'ano', 'why', 'bakit', 'how', 'paano', 'who', 'sino',
      'when', 'kailan', 'where', 'saan', 'which', 'alin', 'describe', 'ilarawan', 'give', 'bigay',
      'list', 'enumerate', 'tell', 'sabi', 'write', 'isulat', 'make', 'gawa', 'help', 'tulong',
      'about', 'tungkol', 'define', 'process', 'steps', 'full', 'complete', 'examples',
      'criticize', 'critique', 'observe', 'observation', 'analyze', 'analysis',
      'survey', 'interview', 'elaborate', 'difference', 'compare',
      'riddle', 'bugtong', 'puzzle', 'logic',
      'qualitative', 'quantitative', 'thesis', 'experimental', 'research',
      'weight', 'timbang', 'girth', 'length',
      'synonym', 'antonym', 'other term', 'another word', 'kasingkahulugan', 'kasalungat'];
    for (const keyword of nonMathKeywords) {
      if (lower.includes(keyword)) return null;
    }
    if (!/^[\d\s\+\-\*\/\(\)\.\,×÷]+$/.test(prompt.replace(/\s/g, ''))) return null;
    let clean = prompt.replace(/,/g, '').replace(/[\+\-\*\/]+$/, '').trim();
    const numbers = clean.match(/\d+\.?\d*/g);
    if (!numbers || numbers.length < 2) return null;
    if (!/[\+\-\*\/×÷]/.test(clean)) return null;
    if (numbers.length === 1 && /^\d{4}$/.test(clean)) return null;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(clean)) return null;
    if (numbers.length === 1 && /^\d{7,15}$/.test(clean)) return null;
    try {
      let expression = clean.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
      const result = Function('"use strict"; return (' + expression + ')')();
      if (typeof result !== 'number' || !isFinite(result)) return null;
      const steps = this.buildMathSteps(clean);
      let response = result + '\n\n';
      for (let i = 0; i < steps.length; i++) response += 'Step ' + (i + 1) + ': ' + steps[i] + '\n';
      response += '\nFinal Answer: ' + result;
      return response;
    } catch (e) { return null; }
  },

  buildMathSteps(clean) {
    const steps = [];
    if (/^[\d\s\.\+]+$/.test(clean)) {
      const numbers = clean.match(/\d+\.?\d*/g).map(Number);
      let current = 0;
      for (let i = 0; i < numbers.length; i++) {
        current += numbers[i];
        if (i === 0) steps.push(numbers[i] + ' = ' + current);
        else steps.push((current - numbers[i]) + ' + ' + numbers[i] + ' = ' + current);
      }
      return steps;
    }
    if (/^[\d\s\.\-]+$/.test(clean)) {
      const numbers = clean.match(/\d+\.?\d*/g).map(Number);
      let current = numbers[0];
      steps.push(numbers[0] + ' = ' + current);
      for (let i = 1; i < numbers.length; i++) {
        current -= numbers[i];
        steps.push((current + numbers[i]) + ' - ' + numbers[i] + ' = ' + current);
      }
      return steps;
    }
    return ['Compute: ' + clean];
  },

  ensureComplete(text) {
    if (!text) return text;
    if (text.trim().endsWith('...')) text = text.replace(/\.\.\.$/, '');
    const lastChar = text.trim().slice(-1);
    if (!['.', '!', '?'].includes(lastChar) && text.length > 50) {
      const sentences = text.match(/[^.!?]+[.!?]/g);
      if (sentences && sentences.length > 0) text = sentences.join(' ');
    }
    return text;
  },

  isFollowUpRequest(prompt) {
    const keywords = ['elaborate', 'explain more', 'paki elaborate', 'paliwanag', 'ipaliwanag',
      'detail', 'further', 'more details', 'summarize', 'summary', 'brief', 'short', 'concise',
      'simplify', 'simple', 'example', 'sample', 'halimbawa', 'correct', 'fix', 'tama',
      'add', 'dagdagan', 'more', 'humanize', 'translate', 'isalin', 'ulit', 'repeat'];
    return keywords.some(keyword => prompt.includes(keyword));
  },

  isContextualQuestion(prompt, previousPrompt) {
    if (!previousPrompt) return false;
    const patterns = ['so yan', 'so ito', 'tama ba', 'so tungkol', 'so ibig sabihin',
      'paano naman', 'what about', 'bakit', 'why', 'paano', 'how', 'sino', 'who',
      'alin', 'which', 'ano', 'what', 'gets', 'ok', 'sige', 'talaga', 'sure'];
    const isRelated = patterns.some(pattern => prompt.includes(pattern));
    const prevWords = previousPrompt.split(' ').filter(w => w.length > 2);
    const currentWords = prompt.split(' ').filter(w => w.length > 2);
    return isRelated || prevWords.some(w => currentWords.some(cw => cw.includes(w) || w.includes(cw)));
  },

  isNewTopic(prompt, previousPrompt) {
    if (!previousPrompt) return true;
    const indicators = ['hello', 'hi', 'hey', 'kamusta', 'musta', 'ask', 'tanong', 'question',
      'new topic', 'bagong topic', 'change topic', 'ibang topic', 'what is', 'ano ang',
      'tell me about', 'explain', 'define', 'describe'];
    if (prompt.length < 10 && !this.isFollowUpRequest(prompt)) return true;
    return indicators.some(indicator => prompt.includes(indicator));
  },

  isOwnerQuestion(prompt) {
    const keywords = ['who is your owner', 'who created you', 'who made you',
      'sino gumawa sayo', 'sino may ari sayo', 'owner mo', 'sino owner mo',
      'who owns you', 'creator', 'developer'];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  isUserInfoQuestion(prompt) {
    const keywords = ['what is my name', 'ano pangalan ko', 'my name', 'pangalan ko',
      'when is my birthday', 'kelan birthday ko', 'my birthday', 'who am i',
      'sino ako', 'whats my name'];
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
      if (!response) {
        const publicInfo = [];
        if (userInfo.name) publicInfo.push('Name: ' + userInfo.name);
        if (userInfo.birthday) publicInfo.push('Birthday: ' + userInfo.birthday);
        if (userInfo.gender) publicInfo.push('Gender: ' + userInfo.gender);
        if (userInfo.location) publicInfo.push('Location: ' + userInfo.location);
        response = publicInfo.length > 0
          ? 'Here is your public information:\n' + publicInfo.join('\n')
          : 'I cannot tell you that because it is confidential.';
      }
      await this.sendComplete(senderId, this.finalClean(response), token);
    } catch (error) {
      console.error('[User Info] Failed:', error.message);
      await sendMessage(senderId, { text: 'Error fetching user info.' }, token);
    }
  },

  async getUserInfo(senderId, token) {
    try {
      const url = 'https://graph.facebook.com/' + senderId;
      const params = { access_token: token, fields: 'id,name,first_name,last_name,birthday,gender,location,email' };
      const response = await axios.get(url, { params });
      const data = response.data;
      return {
        id: data.id || null, name: data.name || null, birthday: data.birthday || null,
        gender: data.gender || null, location: data.location ? data.location.name : null,
        email: data.email || null
      };
    } catch (error) {
      console.error('[Graph API] Error:', error.message);
      return {};
    }
  },

  async getRepliedMessageData(mid, token) {
    try {
      const url = 'https://graph.facebook.com/v21.0/' + mid;
      const params = { access_token: token, fields: 'message,from' };
      const { data } = await axios.get(url, { params });
      return { message: data?.message || null, from: data?.from?.id || null };
    } catch (error) {
      console.error('[Get Replied Message] Failed:', error.message);
      return { message: null, from: null };
    }
  },

  extractResponse(data, config) {
    if (config.responsePath) {
      const path = config.responsePath.split('.');
      let value = data;
      for (const key of path) {
        if (value && typeof value === 'object' && key in value) value = value[key];
        else { value = null; break; }
      }
      if (value && typeof value === 'string' && value.trim()) return value;
    }
    const formats = ['result', 'data', 'response', 'message', 'text', 'content', 'output'];
    for (const format of formats) {
      if (data && typeof data === 'object' && data[format] && typeof data[format] === 'string') return data[format];
    }
    if (typeof data === 'string' && data.trim()) return data;
    return null;
  },

  cleanResponse(text) {
    if (!text) return 'No response.';
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');
    cleaned = cleaned.replace(/^As DeepSeek.*?\n/i, '');
    cleaned = cleaned.replace(/^As an AI.*?\n/i, '');
    cleaned = cleaned.replace(/^I am.*?assistant.*?\n/i, '');
    cleaned = cleaned.replace(/^Here is.*?\n/i, '');
    cleaned = cleaned.replace(/^Let me.*?\n/i, '');
    cleaned = cleaned.replace(/^Based on.*?\n/i, '');
    cleaned = cleaned.replace(/^According to.*?\n/i, '');
    cleaned = cleaned.replace(/^I can.*?\n/i, '');
    cleaned = cleaned.replace(/^I will.*?\n/i, '');
    cleaned = cleaned.replace(/^I hope.*?\n/i, '');
    cleaned = cleaned.replace(/\\\[/g, '');
    cleaned = cleaned.replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\\(/g, '');
    cleaned = cleaned.replace(/\\\)/g, '');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/\\rightarrow/g, '->');
    cleaned = cleaned.replace(/\\times/g, 'x');
    cleaned = cleaned.replace(/\\cdot/g, '*');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');
    cleaned = cleaned.replace(/\$\$/g, '');
    cleaned = cleaned.replace(/\$/g, '');
    cleaned = cleaned.replace(/₂/g, '2');
    cleaned = cleaned.replace(/₃/g, '3');
    cleaned = cleaned.replace(/₄/g, '4');
    cleaned = cleaned.replace(/₅/g, '5');
    cleaned = cleaned.replace(/₆/g, '6');
    cleaned = cleaned.replace(/₇/g, '7');
    cleaned = cleaned.replace(/₈/g, '8');
    cleaned = cleaned.replace(/₉/g, '9');
    cleaned = cleaned.replace(/₀/g, '0');
    cleaned = cleaned.replace(/₁/g, '1');
    cleaned = cleaned.replace(/²/g, '^2');
    cleaned = cleaned.replace(/³/g, '^3');
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/~~/g, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F700}-\u{1F77F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F780}-\u{1F7FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F800}-\u{1F8FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F900}-\u{1F9FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1FA00}-\u{1FAFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{24C2}-\u{1F251}]/gu, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/ +\n/g, '\n');
    cleaned = cleaned.replace(/\n +/g, '\n');
    return cleaned.trim() || 'No response.';
  },

  finalClean(text) {
    if (!text) return 'No response.';
    let cleaned = text;
    cleaned = cleaned.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');
    cleaned = cleaned.replace(/^As DeepSeek.*?\n/i, '');
    cleaned = cleaned.replace(/^As an AI.*?\n/i, '');
    cleaned = cleaned.replace(/^Here is.*?\n/i, '');
    cleaned = cleaned.replace(/^Let me.*?\n/i, '');
    cleaned = cleaned.replace(/^Based on.*?\n/i, '');
    cleaned = cleaned.replace(/\\\[/g, '');
    cleaned = cleaned.replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/\\rightarrow/g, '->');
    cleaned = cleaned.replace(/\\times/g, 'x');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');
    cleaned = cleaned.replace(/\$\$/g, '');
    cleaned = cleaned.replace(/\$/g, '');
    cleaned = cleaned.replace(/₂/g, '2');
    cleaned = cleaned.replace(/₃/g, '3');
    cleaned = cleaned.replace(/₄/g, '4');
    cleaned = cleaned.replace(/₅/g, '5');
    cleaned = cleaned.replace(/₆/g, '6');
    cleaned = cleaned.replace(/²/g, '^2');
    cleaned = cleaned.replace(/³/g, '^3');
    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    return cleaned.trim() || 'No response.';
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
