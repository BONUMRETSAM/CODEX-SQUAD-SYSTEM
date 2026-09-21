const { sendMessage } = require('../handles/sendMessage');
const axios = require('axios');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['translate', 'translator', 'isalin', 'salin', 'i-translate', 'translate to', 'isalin sa'],
  description: 'Translate text to different languages',
  usage: 'translate [target language]: [text] or reply to a message with translate [language]',
  version: '4.0.0',
  author: 'codex',
  category: 'Utility',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      const prompt = args.join(' ').trim();

      if (!prompt) {
        await sendMessage(senderId, {
          text: 'TRANSLATOR\n\nUsage:\ntranslate to tagalog: [text]\nisalin sa english: [text]\ntranslate to bisaya: [text]\n\nOr reply to a message:\ntranslate to tagalog\nisalin sa english'
        }, token);
        return;
      }

      let textToTranslate = '';
      let targetLanguage = '';

      // Check if replying to a message
      if (event?.message?.reply_to?.mid) {
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        textToTranslate = replyData.message || '';
        targetLanguage = this.detectTargetLanguage(prompt);
      } else {
        const result = this.parseTranslationRequest(prompt);
        textToTranslate = result.text;
        targetLanguage = result.targetLanguage;
      }

      if (!textToTranslate) {
        await sendMessage(senderId, {
          text: 'Walang text na i-translate.\n\nUsage:\ntranslate to tagalog: [text]\nisalin sa english: [text]\n\nOr reply to a message:\ntranslate to tagalog'
        }, token);
        return;
      }

      if (!targetLanguage) {
        targetLanguage = 'English';
      }

      await sendMessage(senderId, { text: 'Translating to ' + targetLanguage + '...' }, token);

      const translated = await this.translateText(textToTranslate, targetLanguage);

      await this.sendChunks(senderId, translated, token);

    } catch (error) {
      console.error('[translate] Error:', error.message);
      await sendMessage(senderId, { text: 'Error: ' + error.message }, token);
    }
  },

  parseTranslationRequest(prompt) {
    let targetLanguage = this.detectTargetLanguage(prompt);
    let text = '';

    const colonMatch = prompt.match(/[:：]\s*([\s\S]+)$/);
    if (colonMatch && colonMatch[1]) {
      text = colonMatch[1].trim();
    } else {
      const langWords = ['tagalog', 'filipino', 'bisaya', 'cebuano', 'english', 'spanish', 'japanese', 'korean', 'chinese', 'french', 'german', 'italian', 'portuguese', 'russian', 'arabic', 'hindi', 'vietnamese', 'thai', 'indonesian', 'malay', 'ilocano', 'waray', 'hiligaynon', 'kapampangan'];

      for (const lang of langWords) {
        const pattern = new RegExp(lang + '\\s+(.+)$', 'i');
        const match = prompt.match(pattern);
        if (match && match[1]) {
          text = match[1].trim();
          break;
        }
      }
    }

    return { text, targetLanguage };
  },

  detectTargetLanguage(prompt) {
    const lower = prompt.toLowerCase();
    const languages = {
      'tagalog': 'Tagalog', 'filipino': 'Filipino',
      'bisaya': 'Bisaya', 'cebuano': 'Cebuano',
      'ilocano': 'Ilocano', 'waray': 'Waray',
      'hiligaynon': 'Hiligaynon', 'kapampangan': 'Kapampangan',
      'english': 'English', 'spanish': 'Spanish',
      'japanese': 'Japanese', 'korean': 'Korean',
      'chinese': 'Chinese', 'mandarin': 'Mandarin',
      'french': 'French', 'german': 'German',
      'italian': 'Italian', 'portuguese': 'Portuguese',
      'russian': 'Russian', 'arabic': 'Arabic',
      'hindi': 'Hindi', 'vietnamese': 'Vietnamese',
      'thai': 'Thai', 'indonesian': 'Indonesian',
      'malay': 'Malay'
    };
    for (const [key, value] of Object.entries(languages)) {
      if (lower.includes(key)) return value;
    }
    return '';
  },

  async translateText(text, targetLanguage) {
    try {
      const translatePrompt = 'You are a professional translator.\n\n' +
        'Translate the TEXT CONTENT to ' + targetLanguage + '.\n\n' +
        'ABSOLUTE PRESERVATION RULES:\n\n' +
        '1. PRESERVE ALL SPECIAL CHARACTERS:\n' +
        '   - Separator lines: ─────\n' +
        '   - Bullet points: · • ● ○ ▪ ▫\n' +
        '   - Dashes: – — ―\n' +
        '   - Arrows: → ← ↑ ↓ ↔ ⇒ ⇐ ⇔\n' +
        '   - Checkmarks: ✓ ✔ ☑\n' +
        '   - X marks: X ✗ ✘\n' +
        '   - Stars: * ★ ☆\n' +
        '   - Hearts: ♥ ❤\n' +
        '   - Currency: ₱ $ € £ ¥\n' +
        '   - Math: + - = × ÷ %\n' +
        '   - Parentheses: ( ) [ ] { }\n' +
        '   - Quotes: " \' \'\n' +
        '   - Ampersand: &\n' +
        '   - At sign: @\n' +
        '   - Hash: #\n' +
        '   - Slash: / \\\n\n' +
        '2. PRESERVE ALL FORMATTING:\n' +
        '   - Line breaks\n' +
        '   - Blank lines between sections\n' +
        '   - UPPERCASE text\n' +
        '   - lowercase text\n' +
        '   - Capitalized Words\n' +
        '   - Indentation\n' +
        '   - Tab characters\n' +
        '   - Multiple spaces\n\n' +
        '3. PRESERVE ALL STRUCTURAL ELEMENTS:\n' +
        '   - Section headers\n' +
        '   - Sub-headers\n' +
        '   - Numbered lists (1. 2. 3.)\n' +
        '   - Bulleted lists\n' +
        '   - Tables (if any)\n' +
        '   - Columns (if any)\n\n' +
        '4. DO NOT CHANGE:\n' +
        '   - Names of people\n' +
        '   - Company names\n' +
        '   - School names\n' +
        '   - Organization names\n' +
        '   - Email addresses\n' +
        '   - Phone numbers\n' +
        '   - Dates\n' +
        '   - Years\n' +
        '   - Addresses\n' +
        '   - URLs\n' +
        '   - Abbreviations\n' +
        '   - Acronyms\n\n' +
        '5. DO NOT SKIP ANY CONTENT:\n' +
        '   - Translate EVERY section\n' +
        '   - Translate EVERY bullet point\n' +
        '   - Complete ALL paragraphs\n' +
        '   - Do NOT truncate\n' +
        '   - Do NOT skip\n' +
        '   - Do NOT summarize\n\n' +
        '6. TRANSLATE ONLY:\n' +
        '   - Body text\n' +
        '   - Descriptions\n' +
        '   - Explanations\n' +
        '   - Section headers (if common words)\n\n' +
        '7. OUTPUT FORMAT:\n' +
        '   - Return ONLY the translated text\n' +
        '   - NO introduction\n' +
        '   - NO explanation\n' +
        '   - NO notes\n' +
        '   - Just the translated text\n\n' +
        'TEXT TO TRANSLATE:\n' + text;

      const response = await this.callAPI(translatePrompt);

      if (!response) return text;

      return this.cleanTranslatedResponse(response);

    } catch (error) {
      console.error('[translate] Failed:', error.message);
      return text;
    }
  },

  // ============================================================
  // 4 WORKING APIs — same as ai.js (no dead Pollinations)
  // ============================================================
  async callAPI(prompt) {
    const apiConfigs = [
      { name: 'DeepAI', url: 'https://ceddsrestapi.vercel.app/ai/deepai', param: 'message', responsePath: 'result', timeout: 90000 },
      { name: 'Overchat Qwen', url: 'https://ceddsrestapi.vercel.app/ai/overchat-qwen', param: 'message', responsePath: 'result', successField: 'operator', successValue: 'Ioarkdev', timeout: 90000 },
      { name: 'Cedds ChatPlus', url: 'https://ceddsrestapi.vercel.app/ai/chatplus', param: 'message', responsePath: 'result', successField: 'operator', successValue: 'ceddsdev', timeout: 90000 },
      { name: 'Opera AI', url: 'https://betadash-api-swordslush-production.up.railway.app/opera', param: 'ask', responsePath: 'message', timeout: 90000 }
    ];

    const errorKeywords = [
      'not enough credits', 'low balance', 'insufficient', 'top up', 'top-up',
      'credits', 'balance', 'quests', 'pollinations.ai', 'enter.pollinations.ai',
      'api key', 'quota', 'exceeded', 'limit reached'
    ];

    for (const config of apiConfigs) {
      try {
        const encodedPrompt = encodeURIComponent(prompt);
        const apiUrl = config.url + '?' + config.param + '=' + encodedPrompt;
        const response = await axios.get(apiUrl, {
          timeout: config.timeout,
          headers: { 'Accept': 'application/json' },
          validateStatus: function (status) { return status >= 200 && status < 600; }
        });

        const data = response.data;
        const dataStr = JSON.stringify(data).toLowerCase();

        if (errorKeywords.some(kw => dataStr.includes(kw))) continue;

        // FLEXIBLE success check — accepts true (boolean) or "true" (string)
        if (config.successField && config.successValue !== undefined) {
          const val = data[config.successField];
          if (val !== config.successValue && String(val) !== String(config.successValue)) continue;
        }

        const extracted = this.extractResponse(data, config);
        if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
          const extractedLower = extracted.toLowerCase();
          if (errorKeywords.some(kw => extractedLower.includes(kw))) continue;
          console.log('[translate] ✅ Success via ' + config.name);
          return extracted;
        }
      } catch (error) {
        console.log('[translate] ❌ ' + config.name + ' failed: ' + error.message);
      }
    }

    throw new Error('All translation APIs failed');
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

  cleanTranslatedResponse(text) {
    if (!text) return text;

    let cleaned = text;

    // Remove AI introductions
    cleaned = cleaned
      .replace(/^Here is the translation.*?\n/i, '')
      .replace(/^Translation:.*?\n/i, '')
      .replace(/^Here's the translation.*?\n/i, '')
      .replace(/^Narito ang salin.*?\n/i, '')
      .replace(/^Ito ang salin.*?\n/i, '')
      .replace(/^Here is the translated text.*?\n/i, '')
      .replace(/^The translation is.*?\n/i, '')
      .replace(/^Sure! Here.*?\n/i, '')
      .replace(/^Of course! Here.*?\n/i, '')
      .replace(/^Here you go.*?\n/i, '')
      .replace(/^I have translated.*?\n/i, '')
      .replace(/^Here is my translation.*?\n/i, '')
      .replace(/^Here is the translation of.*?\n/i, '')
      .replace(/^Here is the text translated.*?\n/i, '')
      .replace(/^I've translated.*?\n/i, '')
      .replace(/^As an AI.*?\n/i, '')
      .replace(/^Sure,.*?\n/i, '')
      .replace(/^Certainly.*?\n/i, '')
      .replace(/^Translation:\s*/i, '')
      .trim();

    return cleaned;
  },

  async getRepliedMessageData(mid, token) {
    try {
      const url = 'https://graph.facebook.com/v23.0/' + mid;
      const params = { access_token: token, fields: 'message,from,attachments' };
      const { data } = await axios.get(url, { params });
      return { message: data?.message || '' };
    } catch (error) {
      return { message: '' };
    }
  },

  splitMessage(text) {
    if (!text) return [];
    if (text.length <= MAX_CHUNK) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) {
        chunks.push(remaining);
        break;
      }

      let cutAt = remaining.lastIndexOf('\n', MAX_CHUNK);
      if (cutAt < MAX_CHUNK * 0.3) cutAt = remaining.lastIndexOf(' ', MAX_CHUNK);
      if (cutAt < MAX_CHUNK * 0.3) cutAt = MAX_CHUNK;

      chunks.push(remaining.substring(0, cutAt).trim());
      remaining = remaining.substring(cutAt).trim();
    }

    return chunks;
  },

  async sendChunks(senderId, text, token) {
    const chunks = this.splitMessage(text);
    for (let i = 0; i < chunks.length; i++) {
      await sendMessage(senderId, { text: chunks[i] }, token);
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
    }
  }
};
