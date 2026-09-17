// ========== ai.js - CONSISTENT OUTPUT ACROSS ALL APIs ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with consistent output',
  usage: 'ai [question] or weight [animal] [measurements]',
  version: '28.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();

      // ===== WEIGHT ESTIMATION =====
      if (prompt.toLowerCase().startsWith('weight') || 
          prompt.toLowerCase().startsWith('timbang') ||
          prompt.toLowerCase().includes('estimate weight')) {
        await this.handleWeightEstimation(senderId, prompt, token);
        return;
      }

      // ===== CHECK IF PURE MATH =====
      const mathResult = this.tryMathCompute(prompt);
      if (mathResult) {
        await this.sendComplete(senderId, mathResult, token);
        return;
      }

      // ===== REGULAR AI =====
      let previousResponse = null;
      let isReply = false;
      let previousPrompt = null;

      if (event?.message?.reply_to?.mid) {
        isReply = true;
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        previousResponse = replyData.message;
        if (!prompt) prompt = 'Please respond to what I said.';
      }

      if (!isReply && prompt) {
        const history = conversationHistory[senderId];
        if (history && history.lastResponse) {
          const lowerPrompt = prompt.toLowerCase();
          const isFollowUp = this.isFollowUpRequest(lowerPrompt) ||
                            this.isContextualQuestion(lowerPrompt, history.lastPrompt);
          const isNewTopic = this.isNewTopic(lowerPrompt, history.lastPrompt);

          if (isFollowUp && !isNewTopic) {
            previousResponse = history.lastResponse;
            previousPrompt = history.lastPrompt;
            isReply = true;
          } else {
            delete conversationHistory[senderId];
          }
        }
      }

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

      // ===== DETECT CONTEXT =====
      const language = this.detectLanguage(prompt);
      const intent = this.detectIntent(prompt);
      const topic = this.extractTopic(prompt);
      const subject = this.detectSubject(prompt);
      const requestType = this.detectRequestType(prompt);

      console.log('[AI] Language:', language, '| Intent:', intent, '| Subject:', subject, '| Topic:', topic);

      const finalPrompt = this.buildDetailedPrompt(prompt, previousResponse, previousPrompt, language, intent, topic, subject, requestType);

      console.log('[AI] Sending request...');
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
  // CALL API WITH UNIVERSAL FORMATTING
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
        console.log('[API] Trying ' + config.name + '...');
        
        const encodedPrompt = encodeURIComponent(prompt);
        const apiUrl = config.url + '?' + config.param + '=' + encodedPrompt;
        
        const response = await axios.get(apiUrl, {
          timeout: config.timeout,
          headers: { 'Accept': 'application/json' }
        });

        const data = response.data;

        if (config.successField && config.successValue !== undefined) {
          if (data[config.successField] !== config.successValue) {
            console.log('[API] ' + config.name + ' invalid success field');
            continue;
          }
        }

        const extracted = this.extractResponse(data, config);
        
        if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
          // ===== APPLY UNIVERSAL FORMAT =====
          const formatted = this.applyUniversalFormat(
            extracted, originalPrompt, language, intent, topic, subject, requestType
          );
          
          // ===== QUALITY SCORE =====
          const quality = this.validateResponseQuality(formatted);
          
          console.log('[API] ' + config.name + ' quality: ' + quality.score + '/100');
          
          if (quality.isGood) {
            console.log('[API] ' + config.name + ' GOOD response!');
            return formatted;
          } else if (quality.score > bestScore) {
            bestScore = quality.score;
            bestResponse = formatted;
            console.log('[API] ' + config.name + ' saved as backup (score: ' + bestScore + ')');
          }
        }
      } catch (error) {
        lastError = error;
        console.log('[API] ' + config.name + ' failed: ' + error.message);
      }
    }

    if (bestResponse) {
      console.log('[API] Using best backup (score: ' + bestScore + ')');
      return bestResponse;
    }

    throw lastError || new Error('All APIs failed');
  },

  // ============================================================
  // APPLY UNIVERSAL FORMAT
  // ============================================================
  applyUniversalFormat(response, originalPrompt, language, intent, topic, subject, requestType) {
    let formatted = response;

    // ===== 1. CLEAN RESPONSE =====
    formatted = this.cleanResponse(formatted);

    // ===== 2. REMOVE ALL PREFIXES =====
    formatted = formatted.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');
    formatted = formatted.replace(/^As DeepSeek.*?\n/i, '');
    formatted = formatted.replace(/^As an AI.*?\n/i, '');
    formatted = formatted.replace(/^Here is.*?\n/i, '');
    formatted = formatted.replace(/^Let me.*?\n/i, '');
    formatted = formatted.replace(/^Based on.*?\n/i, '');
    formatted = formatted.replace(/^According to.*?\n/i, '');

    // ===== 3. ENSURE TITLE =====
    if (!formatted.match(/^(TITLE|Title):/i)) {
      const topicClean = topic || 'Response';
      formatted = `TITLE:\n${topicClean}\n\n` + formatted;
    }

    // ===== 4. ENSURE NUMBERED LISTS =====
    formatted = formatted.replace(/^[•·▪▫◦‣⁃]\s*/gm, '');

    // ===== 5. ENSURE SECTION HEADERS =====
    formatted = formatted.replace(/^(Introduction|Definition|Main Points|Analysis|Conclusion|Recommendations|Key Findings|Results|Process|Examples|Strengths|Weaknesses|Criticism|Verdict):/gm,
      (match, p1) => p1.toUpperCase() + ':');

    // ===== 6. CLEAN WHITESPACE =====
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    formatted = formatted.replace(/[ \t]+/g, ' ');
    formatted = formatted.replace(/ +\n/g, '\n');
    formatted = formatted.replace(/\n +/g, '\n');
    formatted = formatted.trim();

    return formatted;
  },

  // ============================================================
  // VALIDATE RESPONSE QUALITY
  // ============================================================
  validateResponseQuality(response) {
    let score = 0;

    // Length (10)
    if (response.length > 500) score += 10;
    else if (response.length > 200) score += 5;

    // Has structure (20)
    if (/(INTRODUCTION|DEFINITION|MAIN|CONCLUSION|ANALYSIS|RECOMMENDATIONS|KEY FINDINGS|RESULTS|PROCESS|EXAMPLES)/i.test(response)) score += 20;

    // Has numbered list (15)
    if (/\d+\.\s/.test(response)) score += 15;

    // Has examples (15)
    if (/example|halimbawa|for instance|such as|tulad ng/i.test(response)) score += 15;

    // Has complete sentences (10)
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length >= 5) score += 10;

    // Not cut-off (10)
    const lastChar = response.trim().slice(-1);
    if (['.', '!', '?'].includes(lastChar)) score += 10;

    // Not generic (20)
    const genericPatterns = /^(yes|no|okay|sure|i think|maybe|perhaps|i'm not sure)/i;
    if (!genericPatterns.test(response.trim())) score += 20;

    return {
      isGood: score >= 70,
      isAcceptable: score >= 40,
      score: score
    };
  },

  // ============================================================
  // DETECT LANGUAGE
  // ============================================================
  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();

    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'meron', 'mayroon', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'pakiusap', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'];
    const spanishKeywords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'con', 'por', 'para', 'que', 'como', 'donde', 'cuando', 'quien', 'porque', 'hola', 'gracias', 'si', 'no', 'muy', 'mas', 'pero', 'tambien', 'es', 'son'];
    const frenchKeywords = ['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'en', 'avec', 'pour', 'que', 'qui', 'comment', 'ou', 'quand', 'pourquoi', 'bonjour', 'merci', 'oui', 'non', 'tres', 'plus', 'mais', 'aussi', 'est', 'sont'];
    const japaneseKeywords = ['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'です', 'ます', 'ある', 'いる', 'する', 'なる', 'こんにちは', 'ありがとう', 'はい', 'いいえ'];
    const koreanKeywords = ['은', '는', '이', '가', '을', '를', '에', '에서', '와', '과', '도', '의', '입니다', '합니다', '있다', '없다', '안녕하세요', '감사합니다', '네', '아니요'];
    const chineseKeywords = ['的', '了', '在', '是', '我', '你', '他', '她', '它', '这', '那', '什么', '怎么', '为什么', '哪里', '谁', '你好', '谢谢', '请', '不是'];

    let tagCount = 0, bisCount = 0, spanCount = 0, frenchCount = 0, japCount = 0, korCount = 0, chiCount = 0;
    const words = lower.split(/\s+/);

    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagCount++;
      if (bisayaKeywords.includes(word)) bisCount++;
      if (spanishKeywords.includes(word)) spanCount++;
      if (frenchKeywords.includes(word)) frenchCount++;
      if (japaneseKeywords.includes(word)) japCount++;
      if (koreanKeywords.includes(word)) korCount++;
      if (chineseKeywords.includes(word)) chiCount++;
    }

    const scores = [
      { lang: 'tagalog', score: tagCount },
      { lang: 'bisaya', score: bisCount },
      { lang: 'spanish', score: spanCount },
      { lang: 'french', score: frenchCount },
      { lang: 'japanese', score: japCount },
      { lang: 'korean', score: korCount },
      { lang: 'chinese', score: chiCount }
    ];

    scores.sort((a, b) => b.score - a.score);

    if (scores[0].score >= 2) return scores[0].lang;
    return 'english';
  },

  getLanguageName(code) {
    const names = {
      'english': 'English', 'tagalog': 'Tagalog', 'bisaya': 'Bisaya',
      'spanish': 'Spanish', 'french': 'French', 'japanese': 'Japanese',
      'korean': 'Korean', 'chinese': 'Chinese', 'german': 'German',
      'italian': 'Italian', 'portuguese': 'Portuguese', 'russian': 'Russian',
      'arabic': 'Arabic', 'hindi': 'Hindi'
    };
    return names[code] || 'English';
  },

  // ============================================================
  // DETECT SUBJECT
  // ============================================================
  detectSubject(prompt) {
    const lower = prompt.toLowerCase();

    if (/^survey:/i.test(lower)) return 'survey';
    if (/^interview:/i.test(lower)) return 'interview';
    if (/^observation:/i.test(lower)) return 'observation';
    if (/^criticize:|^critique:/i.test(lower)) return 'critique';
    if (/^elaborate:/i.test(lower)) return 'elaborate';
    if (/^explain.*examples:/i.test(lower)) return 'explain_examples';
    if (/^difference:|^compare:/i.test(lower)) return 'comparison';
    if (/^research:/i.test(lower)) return 'research';

    if (/survey|interview|observation|questionnaire|research instrument|data collection|methodology/i.test(lower)) return 'research_tools';
    if (/criticize|critique|analyze|analysis|review|evaluate|assess/i.test(lower)) return 'critique';
    if (/research|thesis|study|dissertation|title|proposal/i.test(lower)) return 'research';
    if (/photosynthesis|cell|dna|protein|enzyme|organism|ecosystem|evolution|genetics|biology|chemistry|physics|atom|molecule|chemical|reaction|gravity|energy/i.test(lower)) return 'science';
    if (/solve|equation|formula|calculate|compute|x =|algebra|geometry|trigonometry|calculus/i.test(lower)) return 'math';
    if (/history|rizal|bonifacio|lapu-lapu|revolution|world war|kasaysayan|president|hero|bayani/i.test(lower)) return 'history';
    if (/noun|verb|adjective|grammar|sentence|paragraph|essay|literature|poem|novel|story/i.test(lower)) return 'english';
    if (/panghalip|pangngalan|pandiwa|pang-uri|pang-abay|tula|sanaysay|kwento|balarila/i.test(lower)) return 'filipino';
    if (/python|java|javascript|c\+\+|programming|code|function|variable|loop|array/i.test(lower)) return 'coding';
    if (/health|disease|symptom|treatment|medicine|doctor|nurse|nutrition|exercise/i.test(lower)) return 'health';
    if (/business|management|marketing|finance|accounting|entrepreneur|economics/i.test(lower)) return 'business';
    if (/logic|puzzle|riddle|reasoning/i.test(lower)) return 'logic';

    return 'general';
  },

  // ============================================================
  // DETECT INTENT
  // ============================================================
  detectIntent(prompt) {
    const lower = prompt.toLowerCase();

    if (/^survey:/i.test(lower)) return 'survey';
    if (/^interview:/i.test(lower)) return 'interview';
    if (/^observation:/i.test(lower)) return 'observation';
    if (/^criticize:|^critique:/i.test(lower)) return 'critique';
    if (/^elaborate:/i.test(lower)) return 'elaborate';
    if (/^explain.*examples:/i.test(lower)) return 'explain_examples';
    if (/^difference:|^compare:/i.test(lower)) return 'comparison';
    if (/^research:/i.test(lower)) return 'research';

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

  // ============================================================
  // DETECT REQUEST TYPE
  // ============================================================
  detectRequestType(prompt) {
    const lower = prompt.toLowerCase();

    if (/summarize|summary|buod|i-summarize|i-buod|shorten|paikliin/i.test(lower)) return 'summarize';
    if (/^make it short|^short|^concise|^brief|maikli|iklian/i.test(lower)) return 'short';
    if (/translate|isalin|salin|ipasalin|translation/i.test(lower)) return 'translate';
    if (/^[\d\s\+\-\*\/\(\)\.\,×÷]+$/.test(lower.replace(/\s/g, ''))) return 'math';
    if (/^survey:|^interview:|^observation:|^criticize:|^critique:|^elaborate:|^explain.*examples:|^difference:|^compare:|^research:/i.test(lower)) return 'detailed';
    if (/define|explain|describe|process|steps|how does|how do|full|complete|detailed|elaborate|paliwanag|ipaliwanag|ilarawan|buong|kompleto|examples|criticize|critique|observe|observation|analyze|analysis|review|evaluate|assess|comment|reflection|research|thesis|study|proposal|essay|sanaysay|difference|compare|contrast/i.test(lower)) {
      return 'detailed';
    }
    return 'general';
  },

  // ============================================================
  // EXTRACT TOPIC
  // ============================================================
  extractTopic(prompt) {
    if (!prompt) return 'the topic';

    let topic = prompt;
    topic = topic.replace(/^(ai|ask|chat|answer)\s+/i, '');
    topic = topic.replace(/^(survey|interview|observation|criticize|critique|elaborate|difference|compare|research):\s*/i, '');
    topic = topic.replace(/^explain\s+and\s+give\s+examples:\s*/i, '');

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
      /^(write|essay|sanaysay)\s+/i
    ];

    for (const pattern of actionPatterns) {
      topic = topic.replace(pattern, '');
    }

    topic = topic.replace(/[?.!]+$/, '').trim();
    if (!topic) return 'the topic';
    return topic;
  },

  // ============================================================
  // BUILD DETAILED PROMPT
  // ============================================================
  buildDetailedPrompt(prompt, previousResponse, previousPrompt, language, intent, topic, subject, requestType) {
    const langName = this.getLanguageName(language);
    let finalPrompt = '';

    finalPrompt += `You MUST respond in ${langName.toUpperCase()} language.\n`;
    finalPrompt += `Write a COMPLETE, DETAILED, and ORGANIZED response.\n`;
    finalPrompt += `Do NOT cut off. Complete the entire response.\n\n`;

    // SURVEY
    if (intent === 'survey') {
      finalPrompt += `Create a COMPLETE SURVEY REPORT about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. SURVEY METHODOLOGY\nIII. SURVEY QUESTIONNAIRE\nPART I: RESPONDENT PROFILE (Checklist)\nPART II: HABITS (Checklist)\nPART III: BEHAVIORS (Likert Scale)\nIV. SURVEY RESULTS\nV. KEY FINDINGS\nVI. ANALYSIS\nVII. CONCLUSION\nVIII. RECOMMENDATIONS\n\n`;
    }
    // INTERVIEW
    else if (intent === 'interview') {
      finalPrompt += `Create a COMPLETE INTERVIEW REPORT about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. INTERVIEW METHODOLOGY\nIII. INTERVIEW GUIDE QUESTIONS\nIV. INTERVIEW RESULTS\nV. KEY FINDINGS\nVI. ANALYSIS\nVII. CONCLUSION\nVIII. RECOMMENDATIONS\n\n`;
    }
    // OBSERVATION
    else if (intent === 'observation') {
      finalPrompt += `Create a COMPLETE OBSERVATION REPORT about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. OBSERVATION METHODOLOGY\nIII. OBSERVATION RESULTS\nIV. KEY FINDINGS\nV. ANALYSIS\nVI. CONCLUSION\nVII. RECOMMENDATIONS\n\n`;
    }
    // CRITIQUE
    else if (intent === 'critique') {
      finalPrompt += `Write a COMPLETE CRITIQUE about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\nCritique: ${topic}\n\nI. INTRODUCTION\nII. STRENGTHS\nIII. WEAKNESSES\nIV. CRITICISM\nV. RECOMMENDATIONS\nVI. IMPROVED VERSIONS\nVII. CONCLUSION\nVIII. FINAL VERDICT\n\n`;
    }
    // ELABORATE
    else if (intent === 'elaborate') {
      finalPrompt += `Write a COMPLETE ELABORATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. FACTORS AFFECTING\nIV. COMMON HABITS\nV. COMMON BEHAVIORS\nVI. EFFECTS\nVII. CHALLENGES\nVIII. RECOMMENDATIONS\nIX. CONCLUSION\n\n`;
    }
    // EXPLAIN WITH EXAMPLES
    else if (intent === 'explain_examples') {
      finalPrompt += `Write a COMPLETE EXPLANATION WITH EXAMPLES about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. WHAT IS [TOPIC]?\nIV. EXAMPLES OF [TOPIC]\nV. TYPES OF [TOPIC]\nVI. FACTORS AFFECTING\nVII. EFFECTS\nVIII. CONCLUSION\n\n`;
    }
    // COMPARISON
    else if (intent === 'comparison') {
      finalPrompt += `Write a COMPLETE COMPARISON about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION OF EACH\nIII. SIMILARITIES\nIV. DIFFERENCES\nV. COMPARISON TABLE\nVI. ADVANTAGES AND DISADVANTAGES\nVII. CONCLUSION\n\n`;
    }
    // RESEARCH
    else if (intent === 'research') {
      finalPrompt += `Write a COMPLETE RESEARCH ANALYSIS about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. ANALYSIS\nIII. RECOMMENDATIONS\nIV. IMPROVED VERSIONS\nV. CONCLUSION\n\n`;
    }
    // DEFINITION
    else if (intent === 'definition') {
      finalPrompt += `Write a COMPLETE DEFINITION AND EXPLANATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. KEY CHARACTERISTICS\nIV. TYPES\nV. EXAMPLES\nVI. IMPORTANCE\nVII. CONCLUSION\n\n`;
    }
    // PROCESS
    else if (intent === 'process') {
      finalPrompt += `Write a COMPLETE PROCESS EXPLANATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. FULL PROCESS\nIV. IMPORTANCE\nV. CONCLUSION\n\n`;
    }
    // BIOGRAPHY
    else if (intent === 'biography') {
      finalPrompt += `Write a COMPLETE BIOGRAPHY about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. BACKGROUND\nIII. EARLY LIFE\nIV. EDUCATION\nV. CAREER\nVI. MAJOR CONTRIBUTIONS\nVII. SIGNIFICANCE\nVIII. CONCLUSION\n\n`;
    }
    // LIST
    else if (intent === 'list') {
      finalPrompt += `Write a COMPLETE LIST about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. LIST\nIII. CONCLUSION\n\n`;
    }
    // EXPLANATION
    else if (intent === 'explanation') {
      finalPrompt += `Write a COMPLETE EXPLANATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DIRECT ANSWER\nIII. MAIN REASONS\nIV. CONCLUSION\n\n`;
    }
    // HOW TO
    else if (intent === 'howto') {
      finalPrompt += `Write a COMPLETE HOW-TO GUIDE about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. MATERIALS NEEDED\nIII. STEP-BY-STEP GUIDE\nIV. TIPS AND WARNINGS\nV. CONCLUSION\n\n`;
    }
    // PROS AND CONS
    else if (intent === 'proscons') {
      finalPrompt += `Write a COMPLETE PROS AND CONS about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. ADVANTAGES\nIII. DISADVANTAGES\nIV. BALANCED VIEW\nV. CONCLUSION\n\n`;
    }
    // IMPORTANCE
    else if (intent === 'importance') {
      finalPrompt += `Write a COMPLETE IMPORTANCE EXPLANATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DIRECT ANSWER\nIII. WHY IT MATTERS\nIV. IMPACT\nV. CONCLUSION\n\n`;
    }
    // EFFECTS
    else if (intent === 'effects') {
      finalPrompt += `Write a COMPLETE EFFECTS ANALYSIS about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. POSITIVE EFFECTS\nIII. NEGATIVE EFFECTS\nIV. BALANCED VIEW\nV. CONCLUSION\n\n`;
    }
    // ESSAY
    else if (intent === 'essay') {
      finalPrompt += `Write a COMPLETE ESSAY about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. BODY\nParagraph 1:\nParagraph 2:\nParagraph 3:\nIII. CONCLUSION\n\n`;
    }
    // GENERAL
    else {
      finalPrompt += `Write a COMPLETE, DETAILED, and ORGANIZED response about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. MAIN POINTS\nIV. EXAMPLES\nV. IMPORTANCE\nVI. CONCLUSION\n\n`;
    }

    if (previousResponse) {
      finalPrompt += `Previous conversation:\nUser: ${previousPrompt || 'unknown'}\nAssistant: ${previousResponse}\n\n`;
    }

    finalPrompt += `CRITICAL INSTRUCTIONS:\n`;
    finalPrompt += `1. Respond in ${langName.toUpperCase()} language.\n`;
    finalPrompt += `2. Do NOT start with "Answer:" or any prefix.\n`;
    finalPrompt += `3. Start directly with the TITLE.\n`;
    finalPrompt += `4. Complete ALL sections.\n`;
    finalPrompt += `5. Include SPECIFIC examples.\n`;
    finalPrompt += `6. Use NUMBERED lists.\n`;
    finalPrompt += `7. Use CAPITAL LETTERS for section headers.\n`;
    finalPrompt += `8. NO emojis, NO markdown, NO LaTeX.\n`;
    finalPrompt += `9. Do NOT cut off mid-sentence.\n`;
    finalPrompt += `10. Be detailed, organized, and easy to understand.\n\n`;

    finalPrompt += `Question: ${prompt}\n\n`;
    finalPrompt += `Write your COMPLETE response directly in ${langName}.`;

    return finalPrompt;
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

      if (i > 0) {
        chunk = chunk.replace(/^(Answer|Sagot|ANSWER):\s*/i, '');
      }

      try {
        await sendMessage(senderId, { text: chunk }, token);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error('[sendComplete] Error:', error.message);
      }
    }
  },

  // ============================================================
  // SPLIT COMPLETE
  // ============================================================
  splitComplete(text) {
    if (!text) return [];
    if (text.length <= MAX_CHUNK) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) {
        chunks.push(remaining);
        break;
      }

      let chunk = remaining.substring(0, MAX_CHUNK);

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
        if (idx > MAX_CHUNK * 0.3 && idx < MAX_CHUNK) {
          if (bestPriority < bp.priority) {
            bestPriority = bp.priority;
            bestIndex = idx + bp.char.length;
          }
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
  // STRICT MATH DETECTION
  // ============================================================
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
      'survey', 'interview', 'elaborate', 'difference', 'compare'];

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
      let response = `${result}\n\n`;
      for (let i = 0; i < steps.length; i++) response += `Step ${i + 1}: ${steps[i]}\n`;
      response += `\nFinal Answer: ${result}`;
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
        if (i === 0) steps.push(`${numbers[i]} = ${current}`);
        else steps.push(`${current - numbers[i]} + ${numbers[i]} = ${current}`);
      }
      return steps;
    }
    if (/^[\d\s\.\-]+$/.test(clean)) {
      const numbers = clean.match(/\d+\.?\d*/g).map(Number);
      let current = numbers[0];
      steps.push(`${numbers[0]} = ${current}`);
      for (let i = 1; i < numbers.length; i++) {
        current -= numbers[i];
        steps.push(`${current + numbers[i]} - ${numbers[i]} = ${current}`);
      }
      return steps;
    }
    return [`Compute: ${clean}`];
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

  // ========== WEIGHT ESTIMATION ==========
  async handleWeightEstimation(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase();
      let result = '';
      const numbers = prompt.match(/\d+\.?\d*/g) || [];

      if (lower.includes('pig') || lower.includes('baboy')) {
        if (numbers.length < 2) result = 'PIG WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (inches)\n- Body Length (inches)\n\nExample: weight pig 34 81\n\nFormula: (girth x girth x length) / 400 / 2.2 = kg';
        else {
          const girth = parseFloat(numbers[0]);
          const length = parseFloat(numbers[1]);
          const lbs = (girth * girth * length) / 400;
          const kg = lbs / 2.2;
          result = 'PIG WEIGHT ESTIMATE\n\nMeasurements:\n- Heart Girth: ' + girth + ' inches\n- Body Length: ' + length + ' inches\n\nResults:\n- ' + lbs.toFixed(1) + ' lbs\n- ' + kg.toFixed(1) + ' kg\n\nAccuracy: +/- 10 percent';
        }
      }
      else if (lower.includes('chicken') || lower.includes('manok')) {
        if (numbers.length < 1) result = 'CHICKEN WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: weight chicken 30\n\nFormula: 0.001 x (girth)^2.417 = kg';
        else {
          const girth = parseFloat(numbers[0]);
          const kg = 0.001 * Math.pow(girth, 2.417);
          result = 'CHICKEN WEIGHT ESTIMATE\n\nMeasurement:\n- Heart Girth: ' + girth + ' cm\n\nResult:\n- ' + kg.toFixed(2) + ' kg\n\nAccuracy: +/- 8 percent';
        }
      }
      else if (lower.includes('cow') || lower.includes('baka') || lower.includes('kalabaw')) {
        if (numbers.length < 2) result = 'COW/CARABAO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: weight cow 180 150\n\nFormula: (girth x girth x length) / 11877 = kg';
        else {
          const girth = parseFloat(numbers[0]);
          const length = parseFloat(numbers[1]);
          const kg = (girth * girth * length) / 11877;
          result = 'COW/CARABAO WEIGHT ESTIMATE\n\nMeasurements:\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nResult:\n- ' + kg.toFixed(1) + ' kg\n\nAccuracy: +/- 12 percent';
        }
      }
      else if (lower.includes('goat') || lower.includes('kambing') || lower.includes('sheep') || lower.includes('tupa')) {
        if (numbers.length < 2) result = 'GOAT/SHEEP WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: weight goat 80 70\n\nFormula: (girth x girth x length) / 10800 = kg';
        else {
          const girth = parseFloat(numbers[0]);
          const length = parseFloat(numbers[1]);
          const kg = (girth * girth * length) / 10800;
          result = 'GOAT/SHEEP WEIGHT ESTIMATE\n\nMeasurements:\n- Heart Girth: ' + girth + ' cm\n- Body Length: ' + length + ' cm\n\nResult:\n- ' + kg.toFixed(1) + ' kg\n\nAccuracy: +/- 10 percent';
        }
      }
      else if (lower.includes('fish') || lower.includes('isda') || lower.includes('tilapia') || lower.includes('bangus')) {
        if (numbers.length < 2) result = 'FISH WEIGHT FORMULA\n\nPlease provide:\n- Total Length (cm)\n- Girth (cm)\n\nExample: weight fish 30 20\n\nFormula: (length x girth x girth) / 15000 = kg';
        else {
          const length = parseFloat(numbers[0]);
          const girth = parseFloat(numbers[1]);
          const kg = (length * girth * girth) / 15000;
          result = 'FISH WEIGHT ESTIMATE\n\nMeasurements:\n- Total Length: ' + length + ' cm\n- Girth: ' + girth + ' cm\n\nResult:\n- ' + kg.toFixed(2) + ' kg\n\nAccuracy: +/- 15 percent';
        }
      }
      else if (lower.includes('wood') || lower.includes('kahoy') || lower.includes('tabla')) {
        if (numbers.length < 3) result = 'WOOD WEIGHT FORMULA\n\nPlease provide:\n- Length (cm)\n- Width (cm)\n- Thickness (cm)\n- Type (mahogany, narra, pine)\n\nExample: weight wood 200 30 5 mahogany\n\nFormula: (L x W x H x density) / 1000 = kg';
        else {
          const length = parseFloat(numbers[0]);
          const width = parseFloat(numbers[1]);
          const thickness = parseFloat(numbers[2]);
          let density = 0.55;
          if (lower.includes('narra')) density = 0.65;
          else if (lower.includes('pine')) density = 0.45;
          else if (lower.includes('molave')) density = 0.75;
          const kg = (length * width * thickness * density) / 1000;
          result = 'WOOD WEIGHT ESTIMATE\n\nMeasurements:\n- Length: ' + length + ' cm\n- Width: ' + width + ' cm\n- Thickness: ' + thickness + ' cm\n- Density: ' + density + '\n\nResult:\n- ' + kg.toFixed(2) + ' kg\n\nAccuracy: +/- 5 percent';
        }
      }
      else if (lower.includes('rice') || lower.includes('bigas') || lower.includes('corn') || lower.includes('mais') || lower.includes('feeds') || lower.includes('feed')) {
        if (numbers.length < 1) result = 'RICE/CORN/FEEDS WEIGHT FORMULA\n\nPlease provide:\n- Volume (liters)\n- Type (rice, corn, feeds)\n\nExample: weight rice 10\n\nFormulas:\n- Rice: liters x 0.80 = kg\n- Corn: liters x 0.75 = kg\n- Feeds: liters x 0.60 = kg';
        else {
          const liters = parseFloat(numbers[0]);
          let kg = 0, type = '';
          if (lower.includes('rice') || lower.includes('bigas')) { kg = liters * 0.80; type = 'Rice'; }
          else if (lower.includes('corn') || lower.includes('mais')) { kg = liters * 0.75; type = 'Corn'; }
          else if (lower.includes('feed')) { kg = liters * 0.60; type = 'Feeds'; }
          else { kg = liters * 0.75; type = 'Default (Corn)'; }
          result = type + ' WEIGHT ESTIMATE\n\nMeasurement:\n- Volume: ' + liters + ' liters\n\nResult:\n- ' + kg.toFixed(1) + ' kg\n\nAccuracy: +/- 5 percent';
        }
      }
      else result = 'WEIGHT ESTIMATION GUIDE\n\nAvailable options:\n\nPIG: weight pig [girth inches] [length inches]\nCHICKEN: weight chicken [girth cm]\nCOW/CARABAO: weight cow [girth cm] [length cm]\nGOAT/SHEEP: weight goat [girth cm] [length cm]\nFISH: weight fish [length cm] [girth cm]\nWOOD: weight wood [L cm] [W cm] [H cm] [type]\nRICE/CORN/FEEDS: weight rice [liters]\n\nExample: weight pig 34 81';

      await this.sendComplete(senderId, this.finalClean(result), token);
    } catch (error) {
      console.error('[Weight] Error:', error.message);
      await sendMessage(senderId, { text: 'Error calculating weight. Please check your input.' }, token);
    }
  },

  // ========== FOLLOW-UP ==========
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
