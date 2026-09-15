// ========== ai.js - FINAL WITH LATEX CLEANUP ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with clean responses',
  usage: 'ai [question] or weight [animal] [measurements]',
  version: '18.0.0',
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
        await this.sendContinuous(senderId, mathResult, token);
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

      // ===== DETECT REQUEST TYPE =====
      const requestType = this.detectRequestType(prompt);
      console.log('[AI] Request Type:', requestType);

      const finalPrompt = this.buildPrecisePrompt(prompt, previousResponse, previousPrompt, requestType);

      console.log('[AI] Sending request...');
      const response = await this.callAPI(finalPrompt);
      let aiResponse = this.cleanResponse(response || 'No response from API.');

      aiResponse = this.formatPreciseResponse(aiResponse, requestType);
      aiResponse = this.finalClean(aiResponse);
      aiResponse = this.ensureComplete(aiResponse);
      aiResponse = this.removePartIndicators(aiResponse);
      aiResponse = this.removeDuplicateAnswer(aiResponse);

      conversationHistory[senderId] = {
        lastPrompt: prompt,
        lastResponse: aiResponse,
        timestamp: Date.now()
      };
      this.cleanOldHistory();

      await this.sendContinuous(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // BUILD SIMPLE PROMPT
  // ============================================================
  buildPrecisePrompt(prompt, previousResponse, previousPrompt, requestType) {
    let finalPrompt = '';

    finalPrompt += `Answer the following question accurately and clearly.\n\n`;

    if (requestType === 'summarize') {
      finalPrompt += `Give a brief summary (3-5 sentences).\n`;
    } else if (requestType === 'short') {
      finalPrompt += `Give a short answer (1-3 sentences).\n`;
    } else if (requestType === 'translate') {
      finalPrompt += `Translate accurately.\n`;
    } else if (requestType === 'detailed') {
      finalPrompt += `Give a complete and detailed answer. Include the full process, steps, and equations if applicable. Use plain text only for equations. Do NOT use LaTeX or special symbols.\n`;
    } else {
      finalPrompt += `Give a clear and accurate answer.\n`;
    }

    finalPrompt += `\n`;

    if (previousResponse) {
      finalPrompt += `Previous conversation:\n`;
      finalPrompt += `User: ${previousPrompt || 'unknown'}\n`;
      finalPrompt += `Assistant: ${previousResponse}\n\n`;
    }

    finalPrompt += `Question: ${prompt}\n\n`;
    finalPrompt += `Answer:`;

    return finalPrompt;
  },

  // ============================================================
  // SEND CONTINUOUS
  // ============================================================
  async sendContinuous(senderId, text, token) {
    if (!text) return;

    if (text.length <= MAX_CHUNK) {
      await sendMessage(senderId, { text: text }, token);
      return;
    }

    const chunks = this.splitIntelligently(text);

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (!chunk) continue;

      if (i > 0) {
        chunk = chunk.replace(/^(Answer|Sagot):\s*/i, '');
        chunk = `[continue ${i + 1}/${chunks.length}]\n\n${chunk}`;
      } else if (chunks.length > 1) {
        chunk = `${chunk}\n\n[Part 1/${chunks.length}]`;
      }

      try {
        await sendMessage(senderId, { text: chunk }, token);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error('[Continuous] Error:', error.message);
      }
    }
  },

  splitIntelligently(text) {
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
      const breakPoints = ['\n\n', '. ', '! ', '? ', '\n', '; ', ', ', '.', ' '];

      let bestIndex = -1;
      for (const bp of breakPoints) {
        const idx = chunk.lastIndexOf(bp);
        if (idx > MAX_CHUNK * 0.3) { bestIndex = idx + bp.length; break; }
      }

      if (bestIndex === -1) bestIndex = MAX_CHUNK;

      chunks.push(remaining.substring(0, bestIndex).trim());
      remaining = remaining.substring(bestIndex).trim();
    }

    return chunks;
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
    if (/define|explain|describe|process|steps|how does|how do|full|complete|detailed|elaborate|paliwanag|ipaliwanag|ilarawan|buong|kompleto/i.test(lower)) return 'detailed';
    return 'general';
  },

  formatPreciseResponse(response, requestType) {
    let formatted = response;

    if (requestType === 'summarize') {
      if (!formatted.match(/^(Summary|Buod):/i)) formatted = 'Summary: ' + formatted;
    } else if (requestType === 'short') {
      const sentences = formatted.split(/(?<=[.!?])\s+/);
      if (sentences.length > 5) formatted = sentences.slice(0, 5).join(' ');
      if (!formatted.match(/^(Answer|Sagot):/i)) formatted = 'Answer: ' + formatted;
    } else if (requestType === 'translate') {
      if (!formatted.match(/^(Translation|Salin):/i)) formatted = 'Translation: ' + formatted;
    }

    return formatted;
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
      'about', 'tungkol', 'define', 'process', 'steps', 'full', 'complete'];

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
      let response = `Answer: ${result}\n\n`;
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

  // ========== REMOVE DUPLICATE "Answer:" ==========
  removeDuplicateAnswer(text) {
    if (!text) return text;
    const lines = text.split('\n');
    let newLines = [];
    let foundAnswer = false;

    for (const line of lines) {
      if (line.match(/^(Answer|Sagot):/i)) {
        if (!foundAnswer) { newLines.push(line); foundAnswer = true; }
      } else {
        newLines.push(line);
      }
    }

    if (!foundAnswer && newLines.length > 0) {
      const firstLine = newLines[0] || '';
      if (firstLine.trim()) newLines[0] = 'Answer: ' + firstLine;
    }

    return newLines.join('\n');
  },

  removePartIndicators(text) {
    if (!text) return text;
    return text.replace(/\[Part\s*\d+\/\d+\]\s*/gi, '');
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

  // ============================================================
  // WEIGHT ESTIMATION
  // ============================================================
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

      await this.sendContinuous(senderId, this.finalClean(result), token);
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

  // ========== OWNER ==========
  isOwnerQuestion(prompt) {
    const keywords = ['who is your owner', 'who created you', 'who made you',
      'sino gumawa sayo', 'sino may ari sayo', 'owner mo', 'sino owner mo',
      'who owns you', 'creator', 'developer'];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  // ========== USER INFO ==========
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
        response = userInfo.name ? 'Answer: Your name is ' + userInfo.name + '.' : 'Answer: I cannot tell you that because it is confidential.';
      }
      if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) {
        response += userInfo.birthday ? '\nAnswer: Your birthday is ' + userInfo.birthday + '.' : '\nAnswer: I cannot tell you that because it is confidential.';
      }
      if (!response) {
        const publicInfo = [];
        if (userInfo.name) publicInfo.push('Name: ' + userInfo.name);
        if (userInfo.birthday) publicInfo.push('Birthday: ' + userInfo.birthday);
        if (userInfo.gender) publicInfo.push('Gender: ' + userInfo.gender);
        if (userInfo.location) publicInfo.push('Location: ' + userInfo.location);
        response = publicInfo.length > 0
          ? 'Answer: Here is your public information:\n' + publicInfo.join('\n')
          : 'Answer: I cannot tell you that because it is confidential.';
      }
      await this.sendContinuous(senderId, this.finalClean(response), token);
    } catch (error) {
      console.error('[User Info] Failed:', error.message);
      await sendMessage(senderId, { text: 'Answer: Error fetching user info.' }, token);
    }
  },

  async getUserInfo(senderId, token) {
    try {
      const url = 'https://graph.facebook.com/' + senderId;
      const params = { access_token: token, fields: 'id,name,first_name,last_name,birthday,gender,location,email' };
      const response = await axios.get(url, { params });
      const data = response.data;
      return {
        id: data.id || null,
        name: data.name || null,
        birthday: data.birthday || null,
        gender: data.gender || null,
        location: data.location ? data.location.name : null,
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

  // ========== API CALL ==========
  async callAPI(prompt) {
    const apiConfigs = [
      { name: 'DeepAI', url: 'https://ceddsrestapi.vercel.app/ai/deepai', param: 'message', responsePath: 'result', timeout: 90000 },
      { name: 'Overchat Qwen', url: 'https://ceddsrestapi.vercel.app/ai/overchat-qwen', param: 'message', responsePath: 'result', successField: 'operator', successValue: 'Ioarkdev', timeout: 90000 },
      { name: 'Cedds ChatPlus', url: 'https://ceddsrestapi.vercel.app/ai/chatplus', param: 'message', responsePath: 'result', successField: 'operator', successValue: 'ceddsdev', timeout: 90000 },
      { name: 'Pollination AI', url: 'https://api-library-kohi-production.up.railway.app/api/pollination-ai', param: 'prompt', responsePath: 'data', successField: 'status', timeout: 90000 },
      { name: 'Opera AI', url: 'https://betadash-api-swordslush-production.up.railway.app/opera', param: 'ask', responsePath: 'message', successField: 'success', timeout: 90000 }
    ];

    let lastError = null;
    for (const config of apiConfigs) {
      try {
        const encodedPrompt = encodeURIComponent(prompt);
        const apiUrl = config.url + '?' + config.param + '=' + encodedPrompt;
        const response = await axios.get(apiUrl, { timeout: config.timeout, headers: { 'Accept': 'application/json' } });
        const data = response.data;
        if (config.successField && config.successValue !== undefined) {
          if (data[config.successField] !== config.successValue) continue;
        }
        const extracted = this.extractResponse(data, config);
        if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
          return this.standardizeResponse(extracted);
        }
      } catch (error) {
        lastError = error;
        console.log('[API] ' + config.name + ' failed: ' + error.message);
      }
    }
    throw lastError || new Error('All APIs failed');
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

  standardizeResponse(response) {
    return response
      .replace(/^I'?m?\s+a?\s*AI.*?model.*?\n\n?/i, '')
      .replace(/^As an AI.*?\n\n?/i, '')
      .trim();
  },

  // ============================================================
  // CLEAN RESPONSE - WITH LATEX CLEANUP
  // ============================================================
  cleanResponse(text) {
    if (!text) return 'No response.';
    let cleaned = text.trim();

    // ===== CONVERT LATEX TO PLAIN TEXT =====
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

    // ===== CONVERT SUBSCRIPTS TO NUMBERS =====
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

    // ===== CONVERT SUPERSCRIPTS =====
    cleaned = cleaned.replace(/²/g, '^2');
    cleaned = cleaned.replace(/³/g, '^3');
    cleaned = cleaned.replace(/⁴/g, '^4');
    cleaned = cleaned.replace(/⁵/g, '^5');

    // ===== CONVERT GREEK LETTERS =====
    cleaned = cleaned.replace(/ν/g, 'v');
    cleaned = cleaned.replace(/α/g, 'alpha');
    cleaned = cleaned.replace(/β/g, 'beta');
    cleaned = cleaned.replace(/γ/g, 'gamma');
    cleaned = cleaned.replace(/Δ/g, 'Delta');

    // ===== REMOVE MARKDOWN =====
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/[━═─]{3,}/g, '');
    cleaned = cleaned.replace(/[-_=]{5,}/g, '');
    cleaned = cleaned.replace(/\|/g, ' ');
    cleaned = cleaned.replace(/~~/g, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // ===== REMOVE EMOJIS =====
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

    // ===== CLEAN WHITESPACE =====
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/ +\n/g, '\n');
    cleaned = cleaned.replace(/\n +/g, '\n');

    return cleaned.trim() || 'No response.';
  },

  // ============================================================
  // FINAL CLEAN - WITH LATEX CLEANUP
  // ============================================================
  finalClean(text) {
    if (!text) return 'No response.';

    let cleaned = text;

    // ===== CONVERT LATEX =====
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

    // ===== SUBSCRIPTS =====
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

    // ===== SUPERSCRIPTS =====
    cleaned = cleaned.replace(/²/g, '^2');
    cleaned = cleaned.replace(/³/g, '^3');
    cleaned = cleaned.replace(/⁴/g, '^4');
    cleaned = cleaned.replace(/⁵/g, '^5');

    // ===== GREEK LETTERS =====
    cleaned = cleaned.replace(/ν/g, 'v');
    cleaned = cleaned.replace(/α/g, 'alpha');
    cleaned = cleaned.replace(/β/g, 'beta');
    cleaned = cleaned.replace(/γ/g, 'gamma');

    // ===== REMOVE EMOJIS =====
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

    // ===== REMOVE MARKDOWN =====
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/\[(.+?)\]\(.+?\)/g, '$1');
    cleaned = cleaned.replace(/_{2,}/g, '');
    cleaned = cleaned.replace(/={2,}/g, '');
    cleaned = cleaned.replace(/-{2,}/g, '');
    cleaned = cleaned.replace(/\*{2,}/g, '');
    cleaned = cleaned.replace(/\|/g, ' ');

    // ===== REMOVE INTRO PATTERNS =====
    cleaned = cleaned
      .replace(/^I'?m?\s+a?\s*AI.*?model.*?\n\n?/i, '')
      .replace(/^As an AI.*?\n\n?/i, '')
      .replace(/^Here is my response.*?\n/i, '')
      .replace(/^Let me answer.*?\n/i, '')
      .replace(/^Based on my knowledge.*?\n/i, '')
      .replace(/^I can help you.*?\n/i, '')
      .replace(/^I hope this helps.*?\n/i, '')
      .replace(/^Please let me know.*?\n/i, '');

    // ===== CLEAN WHITESPACE =====
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/ +\n/g, '\n');
    cleaned = cleaned.replace(/\n +/g, '\n');

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
