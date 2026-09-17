// ========== ai.js - COMPLETE AI ASSISTANT WITH WEIGHT ESTIMATION ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with weight estimation, logic, and research',
  usage: 'ai [question] | weight [animal] [measurements]',
  version: '29.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      const lowerPrompt = prompt.toLowerCase();

      // ============================================================
      // FLEXIBLE WEIGHT ESTIMATION DETECTION
      // ============================================================
      const hasWeightWord = /\b(weight|timbang|weigh|kilo|kg|lbs|pounds)\b/i.test(lowerPrompt);
      const hasGirthWord = /\b(heart\s*girth|girth|dibdib|chest|circumference)\b/i.test(lowerPrompt);
      const hasLengthWord = /\b(length|haba|body\s*length)\b/i.test(lowerPrompt);
      const hasGetWord = /^(get|kuha|kunin|compute|calculate|estimate|i-|ipa)/i.test(lowerPrompt);
      const hasNumbers = /\d+/.test(prompt);

      const animalKeywords = [
        'pig', 'baboy', 'chicken', 'manok', 'cow', 'baka', 'kalabaw', 'carabao',
        'goat', 'kambing', 'sheep', 'tupa', 'fish', 'isda', 'tilapia', 'bangus',
        'duck', 'pato', 'itik', 'turkey', 'pabo', 'horse', 'kabayo', 'dog', 'aso',
        'cat', 'pusa', 'wood', 'kahoy', 'tabla', 'rice', 'bigas', 'corn', 'mais',
        'feeds', 'feed'
      ];
      const hasAnimal = animalKeywords.some(a => lowerPrompt.includes(a));

      const shouldTriggerWeight = (
        (hasWeightWord && hasNumbers) ||
        (hasWeightWord && hasAnimal) ||
        (hasGirthWord && hasNumbers) ||
        (hasLengthWord && hasNumbers && hasAnimal) ||
        (hasGetWord && hasAnimal && hasNumbers) ||
        (hasAnimal && hasGirthWord && hasLengthWord)
      );

      if (shouldTriggerWeight) {
        await this.handleWeightEstimation(senderId, prompt, token);
        return;
      }

      // ===== CHECK IF PURE MATH =====
      const mathResult = this.tryMathCompute(prompt);
      if (mathResult) {
        await this.sendComplete(senderId, mathResult, token);
        return;
      }

      // ===== CHECK IF LOGIC/RIDDLE/BUGTONG =====
      if (this.isLogicQuestion(prompt)) {
        const logicAnswer = await this.handleLogicAnswer(senderId, prompt, token);
        if (logicAnswer) {
          await this.sendComplete(senderId, logicAnswer, token);
          return;
        }
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
          const lower = prompt.toLowerCase();
          const isFollowUp = this.isFollowUpRequest(lower) ||
                            this.isContextualQuestion(lower, history.lastPrompt);
          const isNewTopic = this.isNewTopic(lower, history.lastPrompt);

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
  // WEIGHT ESTIMATION - MAIN HANDLER
  // ============================================================
  async handleWeightEstimation(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase();

      let girth = null;
      let length = null;
      let volume = null;

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

      if (lower.includes('pig') || lower.includes('baboy')) {
        result = this.buildPigFormula(girth, length);
      }
      else if (lower.includes('chicken') || lower.includes('manok')) {
        result = this.buildChickenFormula(girth);
      }
      else if (lower.includes('cow') || lower.includes('baka')) {
        result = this.buildCowFormula(girth, length);
      }
      else if (lower.includes('carabao') || lower.includes('kalabaw')) {
        result = this.buildCarabaoFormula(girth, length);
      }
      else if (lower.includes('goat') || lower.includes('kambing')) {
        result = this.buildGoatFormula(girth, length);
      }
      else if (lower.includes('sheep') || lower.includes('tupa')) {
        result = this.buildSheepFormula(girth, length);
      }
      else if (lower.includes('fish') || lower.includes('isda') || lower.includes('tilapia') || lower.includes('bangus')) {
        result = this.buildFishFormula(girth, length);
      }
      else if (lower.includes('duck') || lower.includes('pato') || lower.includes('itik')) {
        result = this.buildDuckFormula(girth);
      }
      else if (lower.includes('turkey') || lower.includes('pabo')) {
        result = this.buildTurkeyFormula(girth);
      }
      else if (lower.includes('horse') || lower.includes('kabayo')) {
        result = this.buildHorseFormula(girth, length);
      }
      else if (lower.includes('dog') || lower.includes('aso')) {
        result = this.buildDogFormula(girth, length);
      }
      else if (lower.includes('cat') || lower.includes('pusa')) {
        result = this.buildCatFormula(girth, length);
      }
      else if (lower.includes('wood') || lower.includes('kahoy') || lower.includes('tabla')) {
        result = this.buildWoodFormula(allNumbers, lower);
      }
      else if (lower.includes('rice') || lower.includes('bigas') || lower.includes('corn') || lower.includes('mais') || lower.includes('feeds') || lower.includes('feed')) {
        result = this.buildGrainFormula(volume, allNumbers, lower);
      }
      else {
        result = this.buildWeightGuide();
      }

      await this.sendComplete(senderId, this.finalClean(result), token);
    } catch (error) {
      console.error('[Weight] Error:', error.message);
      await sendMessage(senderId, { text: 'Error calculating weight. Please check your input.' }, token);
    }
  },

  // ===== 1. PIG / BABOY =====
  buildPigFormula(girth, length) {
    if (girth === null || length === null) {
      return 'PIG / BABOY WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (inches)\n- Body Length (inches)\n\nExample: get weight pig heart girth 34 length 31\n\nFORMULA:\nWeight (lbs) = (Heart Girth x Heart Girth x Body Length) / 400\nWeight (kg) = Weight (lbs) / 2.2\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from between ears to base of tail';
    }
    const girthSquared = girth * girth;
    const product = girthSquared * length;
    const lbs = product / 400;
    const kg = lbs / 2.2;

    return 'PIG / BABOY WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Heart Girth: ' + girth + ' inches\n' +
      '- Body Length: ' + length + ' inches\n\n' +
      'II. FORMULA\n' +
      'Weight (lbs) = (Heart Girth x Heart Girth x Body Length) / 400\n' +
      'Weight (kg) = Weight (lbs) / 2.2\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the heart girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by body length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 400 to get pounds\n' +
      '        ' + product.toFixed(2) + ' / 400 = ' + lbs.toFixed(2) + ' lbs\n' +
      'Step 4: Convert to kilograms\n' +
      '        ' + lbs.toFixed(2) + ' / 2.2 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + lbs.toFixed(1) + ' lbs\n' +
      '- ' + kg.toFixed(1) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 10 percent margin of error\n' +
      '- Best used for growing pigs (not for sows or very young piglets)\n\n' +
      'VI. NOTE\n' +
      'Make sure heart girth and body length are measured in INCHES.\n' +
      'If measured in cm, convert: inches = cm / 2.54';
  },

  // ===== 2. CHICKEN / MANOK =====
  buildChickenFormula(girth) {
    if (girth === null) {
      return 'CHICKEN / MANOK WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight chicken heart girth 30\n\nFORMULA:\nWeight (kg) = 0.001 x (Heart Girth)^2.417\n\nHOW TO MEASURE:\n- Heart Girth: circumference around the breast';
    }
    const power = Math.pow(girth, 2.417);
    const kg = 0.001 * power;

    return 'CHICKEN / MANOK WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENT\n' +
      '- Heart Girth: ' + girth + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = 0.001 x (Heart Girth)^2.417\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Raise girth to power of 2.417\n' +
      '        ' + girth + '^2.417 = ' + power.toFixed(4) + '\n' +
      'Step 2: Multiply by 0.001\n' +
      '        0.001 x ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(2) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 8 percent margin of error';
  },

  // ===== 3. COW / BAKA =====
  buildCowFormula(girth, length) {
    if (girth === null || length === null) {
      return 'COW / BAKA WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight cow heart girth 180 length 150\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11877\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from shoulder point to pin bone';
    }
    const girthSquared = girth * girth;
    const product = girthSquared * length;
    const kg = product / 11877;

    return 'COW / BAKA WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Heart Girth: ' + girth + ' cm\n' +
      '- Body Length: ' + length + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Heart Girth x Heart Girth x Body Length) / 11877\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the heart girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by body length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 11877\n' +
      '        ' + product.toFixed(2) + ' / 11877 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(1) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 12 percent margin of error';
  },

  // ===== 4. CARABAO / KALABAW =====
  buildCarabaoFormula(girth, length) {
    if (girth === null || length === null) {
      return 'CARABAO / KALABAW WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight carabao heart girth 200 length 160\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11877\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from shoulder point to pin bone';
    }
    const girthSquared = girth * girth;
    const product = girthSquared * length;
    const kg = product / 11877;

    return 'CARABAO / KALABAW WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Heart Girth: ' + girth + ' cm\n' +
      '- Body Length: ' + length + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Heart Girth x Heart Girth x Body Length) / 11877\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the heart girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by body length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 11877\n' +
      '        ' + product.toFixed(2) + ' / 11877 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(1) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 12 percent margin of error';
  },

  // ===== 5. GOAT / KAMBING =====
  buildGoatFormula(girth, length) {
    if (girth === null || length === null) {
      return 'GOAT / KAMBING WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight goat heart girth 80 length 70\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from shoulder to pin bone';
    }
    const girthSquared = girth * girth;
    const product = girthSquared * length;
    const kg = product / 10800;

    return 'GOAT / KAMBING WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Heart Girth: ' + girth + ' cm\n' +
      '- Body Length: ' + length + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the heart girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by body length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 10800\n' +
      '        ' + product.toFixed(2) + ' / 10800 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(1) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 10 percent margin of error';
  },

  // ===== 6. SHEEP / TUPA =====
  buildSheepFormula(girth, length) {
    if (girth === null || length === null) {
      return 'SHEEP / TUPA WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight sheep heart girth 70 length 65\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from shoulder to pin bone';
    }
    const girthSquared = girth * girth;
    const product = girthSquared * length;
    const kg = product / 10800;

    return 'SHEEP / TUPA WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Heart Girth: ' + girth + ' cm\n' +
      '- Body Length: ' + length + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the heart girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by body length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 10800\n' +
      '        ' + product.toFixed(2) + ' / 10800 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(1) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 10 percent margin of error';
  },

  // ===== 7. FISH / ISDA =====
  buildFishFormula(girth, length) {
    if (girth === null || length === null) {
      return 'FISH / ISDA WEIGHT FORMULA\n\nPlease provide:\n- Total Length (cm)\n- Girth (cm)\n\nExample: get weight fish length 30 girth 20\n\nFORMULA:\nWeight (kg) = (Total Length x Girth x Girth) / 15000\n\nHOW TO MEASURE:\n- Total Length: from snout to tip of tail\n- Girth: circumference at widest part';
    }
    const girthSquared = girth * girth;
    const product = length * girthSquared;
    const kg = product / 15000;

    return 'FISH / ISDA WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Total Length: ' + length + ' cm\n' +
      '- Girth: ' + girth + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Total Length x Girth x Girth) / 15000\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by total length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 15000\n' +
      '        ' + product.toFixed(2) + ' / 15000 = ' + kg.toFixed(3) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(2) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 15 percent margin of error';
  },

  // ===== 8. DUCK / PATO =====
  buildDuckFormula(girth) {
    if (girth === null) {
      return 'DUCK / PATO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight duck heart girth 35\n\nFORMULA:\nWeight (kg) = 0.0007 x (Heart Girth)^2.5\n\nHOW TO MEASURE:\n- Heart Girth: circumference around the breast';
    }
    const power = Math.pow(girth, 2.5);
    const kg = 0.0007 * power;

    return 'DUCK / PATO WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENT\n' +
      '- Heart Girth: ' + girth + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = 0.0007 x (Heart Girth)^2.5\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Raise girth to power of 2.5\n' +
      '        ' + girth + '^2.5 = ' + power.toFixed(4) + '\n' +
      'Step 2: Multiply by 0.0007\n' +
      '        0.0007 x ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(2) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 10 percent margin of error';
  },

  // ===== 9. TURKEY / PABO =====
  buildTurkeyFormula(girth) {
    if (girth === null) {
      return 'TURKEY / PABO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight turkey heart girth 50\n\nFORMULA:\nWeight (kg) = 0.0009 x (Heart Girth)^2.5\n\nHOW TO MEASURE:\n- Heart Girth: circumference around the breast';
    }
    const power = Math.pow(girth, 2.5);
    const kg = 0.0009 * power;

    return 'TURKEY / PABO WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENT\n' +
      '- Heart Girth: ' + girth + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = 0.0009 x (Heart Girth)^2.5\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Raise girth to power of 2.5\n' +
      '        ' + girth + '^2.5 = ' + power.toFixed(4) + '\n' +
      'Step 2: Multiply by 0.0009\n' +
      '        0.0009 x ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(2) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 10 percent margin of error';
  },

  // ===== 10. HORSE / KABAYO =====
  buildHorseFormula(girth, length) {
    if (girth === null || length === null) {
      return 'HORSE / KABAYO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight horse heart girth 180 length 200\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11900\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from point of shoulder to point of buttock';
    }
    const girthSquared = girth * girth;
    const product = girthSquared * length;
    const kg = product / 11900;

    return 'HORSE / KABAYO WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Heart Girth: ' + girth + ' cm\n' +
      '- Body Length: ' + length + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Heart Girth x Heart Girth x Body Length) / 11900\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the heart girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by body length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 11900\n' +
      '        ' + product.toFixed(2) + ' / 11900 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(1) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 10 percent margin of error';
  },

  // ===== 11. DOG / ASO =====
  buildDogFormula(girth, length) {
    if (girth === null || length === null) {
      return 'DOG / ASO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight dog heart girth 50 length 60\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 11800\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from base of neck to base of tail';
    }
    const girthSquared = girth * girth;
    const product = girthSquared * length;
    const kg = product / 11800;

    return 'DOG / ASO WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Heart Girth: ' + girth + ' cm\n' +
      '- Body Length: ' + length + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Heart Girth x Heart Girth x Body Length) / 11800\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the heart girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by body length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 11800\n' +
      '        ' + product.toFixed(2) + ' / 11800 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(1) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 12 percent margin of error\n' +
      '- Best for medium to large breeds';
  },

  // ===== 12. CAT / PUSA =====
  buildCatFormula(girth, length) {
    if (girth === null || length === null) {
      return 'CAT / PUSA WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: get weight cat heart girth 30 length 40\n\nFORMULA:\nWeight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\nHOW TO MEASURE:\n- Heart Girth: circumference behind front legs\n- Body Length: from base of neck to base of tail';
    }
    const girthSquared = girth * girth;
    const product = girthSquared * length;
    const kg = product / 10800;

    return 'CAT / PUSA WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Heart Girth: ' + girth + ' cm\n' +
      '- Body Length: ' + length + ' cm\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Heart Girth x Heart Girth x Body Length) / 10800\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Square the heart girth\n' +
      '        ' + girth + ' x ' + girth + ' = ' + girthSquared.toFixed(2) + '\n' +
      'Step 2: Multiply by body length\n' +
      '        ' + girthSquared.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\n' +
      'Step 3: Divide by 10800\n' +
      '        ' + product.toFixed(2) + ' / 10800 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(2) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 10 percent margin of error';
  },

  // ===== 13. WOOD / KAHOY =====
  buildWoodFormula(allNumbers, lower) {
    if (allNumbers.length < 3) {
      return 'WOOD / KAHOY WEIGHT FORMULA\n\nPlease provide:\n- Length (cm)\n- Width (cm)\n- Thickness (cm)\n- Type (mahogany, narra, pine, molave)\n\nExample: get weight wood length 200 width 30 thickness 5 mahogany\n\nFORMULA:\nWeight (kg) = (Length x Width x Thickness x Density) / 1000\n\nDENSITY (g/cm3):\n- Mahogany: 0.55\n- Narra: 0.65\n- Pine: 0.45\n- Molave: 0.75';
    }
    const woodLength = parseFloat(allNumbers[0]);
    const width = parseFloat(allNumbers[1]);
    const thickness = parseFloat(allNumbers[2]);
    let density = 0.55;
    let type = 'Default (Mahogany)';
    if (lower.includes('narra')) { density = 0.65; type = 'Narra'; }
    else if (lower.includes('pine')) { density = 0.45; type = 'Pine'; }
    else if (lower.includes('molave')) { density = 0.75; type = 'Molave'; }
    else if (lower.includes('mahogany')) { density = 0.55; type = 'Mahogany'; }

    const volume = woodLength * width * thickness;
    const grams = volume * density;
    const kg = grams / 1000;

    return 'WOOD / KAHOY WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENTS\n' +
      '- Length: ' + woodLength + ' cm\n' +
      '- Width: ' + width + ' cm\n' +
      '- Thickness: ' + thickness + ' cm\n' +
      '- Type: ' + type + '\n' +
      '- Density: ' + density + ' g/cm3\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = (Length x Width x Thickness x Density) / 1000\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Compute volume\n' +
      '        ' + woodLength + ' x ' + width + ' x ' + thickness + ' = ' + volume.toFixed(2) + ' cm3\n' +
      'Step 2: Multiply by density\n' +
      '        ' + volume.toFixed(2) + ' x ' + density + ' = ' + grams.toFixed(2) + ' g\n' +
      'Step 3: Convert to kg\n' +
      '        ' + grams.toFixed(2) + ' / 1000 = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(2) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 5 percent margin of error\n' +
      '- Density varies by moisture content';
  },

  // ===== 14. GRAINS / FEEDS =====
  buildGrainFormula(volume, allNumbers, lower) {
    const liters = volume !== null ? volume : (allNumbers.length >= 1 ? parseFloat(allNumbers[0]) : null);

    if (liters === null) {
      return 'RICE / CORN / FEEDS WEIGHT FORMULA\n\nPlease provide:\n- Volume (liters)\n- Type (rice, corn, feeds)\n\nExample: get weight rice 10 liters\n\nFORMULAS:\n- Rice: liters x 0.80 = kg\n- Corn: liters x 0.75 = kg\n- Feeds: liters x 0.60 = kg\n\nDENSITY (kg/L):\n- Rice: 0.80\n- Corn: 0.75\n- Feeds: 0.60';
    }

    let kg = 0, type = '', density = 0;
    if (lower.includes('rice') || lower.includes('bigas')) { density = 0.80; type = 'RICE / BIGAS'; }
    else if (lower.includes('corn') || lower.includes('mais')) { density = 0.75; type = 'CORN / MAIS'; }
    else if (lower.includes('feed')) { density = 0.60; type = 'FEEDS'; }
    else { density = 0.75; type = 'DEFAULT (CORN)'; }

    kg = liters * density;

    return type + ' WEIGHT ESTIMATE\n\n' +
      'I. MEASUREMENT\n' +
      '- Volume: ' + liters + ' liters\n' +
      '- Density: ' + density + ' kg/L\n\n' +
      'II. FORMULA\n' +
      'Weight (kg) = Volume (liters) x Density (kg/L)\n\n' +
      'III. SOLUTION\n' +
      'Step 1: Multiply volume by density\n' +
      '        ' + liters + ' x ' + density + ' = ' + kg.toFixed(2) + ' kg\n\n' +
      'IV. FINAL ANSWER\n' +
      '- ' + kg.toFixed(1) + ' kg\n\n' +
      'V. ACCURACY\n' +
      '- +/- 5 percent margin of error\n' +
      '- Density varies by grain size and moisture';
  },

  // ===== DEFAULT WEIGHT GUIDE =====
  buildWeightGuide() {
    return 'WEIGHT ESTIMATION GUIDE\n\n' +
      'All formulas use body measurements, NO SCALE NEEDED.\n\n' +
      'I. PIG / BABOY\n' +
      'Measure: Heart Girth + Body Length (inches)\n' +
      'Formula: (Girth x Girth x Length) / 400 = lbs\n' +
      'Prompt: get weight pig heart girth 34 length 31\n\n' +
      'II. CHICKEN / MANOK\n' +
      'Measure: Heart Girth (cm)\n' +
      'Formula: 0.001 x (Girth)^2.417 = kg\n' +
      'Prompt: get weight chicken heart girth 30\n\n' +
      'III. COW / BAKA\n' +
      'Measure: Heart Girth + Body Length (cm)\n' +
      'Formula: (Girth x Girth x Length) / 11877 = kg\n' +
      'Prompt: get weight cow heart girth 180 length 150\n\n' +
      'IV. CARABAO / KALABAW\n' +
      'Measure: Heart Girth + Body Length (cm)\n' +
      'Formula: (Girth x Girth x Length) / 11877 = kg\n' +
      'Prompt: get weight carabao heart girth 200 length 160\n\n' +
      'V. GOAT / KAMBING\n' +
      'Measure: Heart Girth + Body Length (cm)\n' +
      'Formula: (Girth x Girth x Length) / 10800 = kg\n' +
      'Prompt: get weight goat heart girth 80 length 70\n\n' +
      'VI. SHEEP / TUPA\n' +
      'Measure: Heart Girth + Body Length (cm)\n' +
      'Formula: (Girth x Girth x Length) / 10800 = kg\n' +
      'Prompt: get weight sheep heart girth 70 length 65\n\n' +
      'VII. FISH / ISDA\n' +
      'Measure: Total Length + Girth (cm)\n' +
      'Formula: (Length x Girth x Girth) / 15000 = kg\n' +
      'Prompt: get weight fish length 30 girth 20\n\n' +
      'VIII. DUCK / PATO\n' +
      'Measure: Heart Girth (cm)\n' +
      'Formula: 0.0007 x (Girth)^2.5 = kg\n' +
      'Prompt: get weight duck heart girth 35\n\n' +
      'IX. TURKEY / PABO\n' +
      'Measure: Heart Girth (cm)\n' +
      'Formula: 0.0009 x (Girth)^2.5 = kg\n' +
      'Prompt: get weight turkey heart girth 50\n\n' +
      'X. HORSE / KABAYO\n' +
      'Measure: Heart Girth + Body Length (cm)\n' +
      'Formula: (Girth x Girth x Length) / 11900 = kg\n' +
      'Prompt: get weight horse heart girth 180 length 200\n\n' +
      'XI. DOG / ASO\n' +
      'Measure: Heart Girth + Body Length (cm)\n' +
      'Formula: (Girth x Girth x Length) / 11800 = kg\n' +
      'Prompt: get weight dog heart girth 50 length 60\n\n' +
      'XII. CAT / PUSA\n' +
      'Measure: Heart Girth + Body Length (cm)\n' +
      'Formula: (Girth x Girth x Length) / 10800 = kg\n' +
      'Prompt: get weight cat heart girth 30 length 40\n\n' +
      'XIII. WOOD / KAHOY\n' +
      'Measure: Length + Width + Thickness + Type (cm)\n' +
      'Formula: (L x W x H x Density) / 1000 = kg\n' +
      'Prompt: get weight wood length 200 width 30 thickness 5 mahogany\n\n' +
      'XIV. RICE / CORN / FEEDS\n' +
      'Measure: Volume (liters)\n' +
      'Formula: Liters x Density = kg\n' +
      'Prompt: get weight rice 10 liters';
  },

  // ============================================================
  // LOGIC / RIDDLE / BUGTONG DETECTION
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

          let siblings = 0;
          if (sons > 0) siblings += sons;
          if (daughters > 0) siblings += daughters;

          const hasSharedSister = /each son has a sister/i.test(prompt);
          const hasSharedBrother = /each daughter has a brother/i.test(prompt);

          let totalChildren = siblings;
          if (hasSharedSister && daughters === 0) totalChildren += 1;
          if (hasSharedBrother && sons === 0) totalChildren += 1;

          const total = totalChildren + 2;

          let answer = 'TITLE:\nFamily Logic Puzzle\n\n';
          answer += 'I. GIVEN\n';
          answer += `- The father has ${count} ${type}.\n`;
          if (hasSharedSister) answer += `- Each ${type.replace(/s$/, '')} has a sister.\n`;
          if (hasSharedBrother) answer += `- Each ${type.replace(/s$/, '')} has a brother.\n`;
          answer += '\nII. REASONING\n';
          answer += `1. The ${count} ${type} are all brothers/sisters.\n`;
          answer += `2. Since each one has a sister, they all SHARE the same sister.\n`;
          answer += `3. There is only 1 sister, not ${count}.\n`;
          answer += `4. Total children = ${count} + 1 = ${totalChildren}.\n`;
          answer += `5. Add the father and mother = ${totalChildren} + 2 = ${total}.\n`;
          answer += '\nIII. ANSWER\n';
          answer += `There are ${total} people in the family.\n\n`;
          answer += `Breakdown: ${count} sons + 1 sister + 1 father + 1 mother = ${total} people.`;

          return answer;
        }
      }

      const logicPrompt = `You are a LOGIC and RIDDLE expert. Answer the following question ACCURATELY.

RULES:
1. Think step by step.
2. Do NOT invent facts not stated in the question.
3. If it is a trick question, explain the trick.
4. Give the FINAL ANSWER clearly at the end.
5. Answer in the SAME language as the question.
6. Keep it concise but complete.

FORMAT:
TITLE:
Logic Answer

I. REASONING
[step by step reasoning]

II. ANSWER
[final answer]

QUESTION: ${prompt}

Answer:`;

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
          const formatted = this.applyUniversalFormat(extracted, originalPrompt, language, intent, topic, subject, requestType);
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
    formatted = this.cleanResponse(formatted);

    formatted = formatted.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');
    formatted = formatted.replace(/^As DeepSeek.*?\n/i, '');
    formatted = formatted.replace(/^As an AI.*?\n/i, '');
    formatted = formatted.replace(/^Here is.*?\n/i, '');
    formatted = formatted.replace(/^Let me.*?\n/i, '');
    formatted = formatted.replace(/^Based on.*?\n/i, '');
    formatted = formatted.replace(/^According to.*?\n/i, '');

    if (subject !== 'logic' && intent !== 'logic') {
      if (!formatted.match(/^(TITLE|Title):/i)) {
        const topicClean = topic || 'Response';
        formatted = `TITLE:\n${topicClean}\n\n` + formatted;
      }
    }

    formatted = formatted.replace(/^[•·▪▫◦‣⁃]\s*/gm, '');

    formatted = formatted.replace(/^(Introduction|Definition|Main Points|Analysis|Conclusion|Recommendations|Key Findings|Results|Process|Examples|Strengths|Weaknesses|Criticism|Verdict|Reasoning|Answer|Given|Statement of the Problem|Background of the Study|Objectives|Hypothesis|Significance|Scope and Delimitation|Review of Related Literature|Methodology|Research Design|Respondents|Participants|Instrument|Data Gathering|Data Collection|Data Analysis|Statistical Treatment|Results and Discussion|Theoretical Framework|Research Questions|Variables|Materials|Procedure|Findings|Abstract|Literature Review|Conceptual Framework|Research Paradigm|Sampling|Ethical Considerations|Trustworthiness|Validity|Reliability|Limitations|Delimitations|Implications|Synthesis|Appendices|References|Measurements|Formula|Solution|Final Answer|Accuracy|Note|How to Measure):/gm,
      (match, p1) => p1.toUpperCase() + ':');

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
    if (response.length > 500) score += 10;
    else if (response.length > 200) score += 5;
    if (/(INTRODUCTION|DEFINITION|MAIN|CONCLUSION|ANALYSIS|RECOMMENDATIONS|KEY FINDINGS|RESULTS|PROCESS|EXAMPLES|REASONING|ANSWER|GIVEN|METHODOLOGY|HYPOTHESIS|STATEMENT OF THE PROBLEM|OBJECTIVES|SIGNIFICANCE|FINDINGS|SOLUTION|FORMULA)/i.test(response)) score += 20;
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
    if (this.isLogicQuestion(prompt)) return 'general';
    if (/qualitative|quantitative|thesis|dissertation|experimental|case study|correlational|descriptive|phenomenolog|ethnograph|grounded theory|mixed methods|action research/i.test(lower)) return 'detailed';
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
      /^(write|essay|sanaysay)\s+/i,
      /^(make|create|write)\s+(a\s+)?(qualitative|quantitative|experimental|descriptive|correlational|case study|phenomenological|ethnographic|mixed methods|action)\s+research\s+(about|on)\s+/i,
      /^(qualitative|quantitative|experimental|descriptive|correlational)\s+research\s+(about|on)\s+/i,
      /^(thesis|dissertation)\s+(about|on)\s+/i
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

    if (subject === 'logic' || intent === 'logic') {
      return this.buildLogicPrompt(prompt, langName);
    }

    let finalPrompt = '';
    finalPrompt += `You MUST respond in ${langName.toUpperCase()} language.\n`;
    finalPrompt += `Write a COMPLETE, DETAILED, and ORGANIZED response.\n`;
    finalPrompt += `Do NOT cut off. Complete the entire response.\n\n`;

    if (intent === 'qualitative') {
      finalPrompt += `Write a COMPLETE QUALITATIVE RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. BACKGROUND OF THE STUDY\nIII. STATEMENT OF THE PROBLEM\nIV. RESEARCH QUESTIONS\nV. THEORETICAL FRAMEWORK\nVI. CONCEPTUAL FRAMEWORK\nVII. METHODOLOGY\nVIII. RESEARCH DESIGN\nIX. PARTICIPANTS\nX. SAMPLING\nXI. DATA COLLECTION\nXII. DATA ANALYSIS\nXIII. ETHICAL CONSIDERATIONS\nXIV. TRUSTWORTHINESS\nXV. FINDINGS\nXVI. CONCLUSION\nXVII. RECOMMENDATIONS\nXVIII. REFERENCES\n\n`;
    }
    else if (intent === 'quantitative') {
      finalPrompt += `Write a COMPLETE QUANTITATIVE RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. BACKGROUND OF THE STUDY\nIII. STATEMENT OF THE PROBLEM\nIV. HYPOTHESIS\nV. SIGNIFICANCE OF THE STUDY\nVI. SCOPE AND DELIMITATION\nVII. REVIEW OF RELATED LITERATURE\nVIII. THEORETICAL FRAMEWORK\nIX. METHODOLOGY\nX. RESEARCH DESIGN\nXI. RESPONDENTS\nXII. SAMPLING\nXIII. INSTRUMENT\nXIV. VALIDITY AND RELIABILITY\nXV. DATA GATHERING\nXVI. STATISTICAL TREATMENT\nXVII. RESULTS AND FINDINGS\nXVIII. CONCLUSION\nXIX. RECOMMENDATIONS\nXX. REFERENCES\n\n`;
    }
    else if (intent === 'experimental') {
      finalPrompt += `Write a COMPLETE EXPERIMENTAL RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. OBJECTIVES\nIII. HYPOTHESIS\nIV. VARIABLES\nV. MATERIALS\nVI. PROCEDURE\nVII. RESULTS\nVIII. ANALYSIS\nIX. CONCLUSION\nX. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'quasi_experimental') {
      finalPrompt += `Write a COMPLETE QUASI-EXPERIMENTAL RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. OBJECTIVES\nIII. HYPOTHESIS\nIV. VARIABLES\nV. RESEARCH DESIGN\nVI. PARTICIPANTS\nVII. INSTRUMENT\nVIII. PROCEDURE\nIX. RESULTS\nX. ANALYSIS\nXI. LIMITATIONS\nXII. CONCLUSION\nXIII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'pre_experimental') {
      finalPrompt += `Write a COMPLETE PRE-EXPERIMENTAL RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. OBJECTIVES\nIII. HYPOTHESIS\nIV. VARIABLES\nV. RESEARCH DESIGN\nVI. PARTICIPANTS\nVII. PROCEDURE\nVIII. RESULTS\nIX. ANALYSIS\nX. LIMITATIONS\nXI. CONCLUSION\nXII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'thesis') {
      finalPrompt += `Write a COMPLETE THESIS about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. BACKGROUND OF THE STUDY\nIII. STATEMENT OF THE PROBLEM\nIV. OBJECTIVES\nV. SIGNIFICANCE\nVI. SCOPE AND DELIMITATION\nVII. REVIEW OF RELATED LITERATURE\nVIII. THEORETICAL FRAMEWORK\nIX. CONCEPTUAL FRAMEWORK\nX. METHODOLOGY\nXI. RESEARCH DESIGN\nXII. RESPONDENTS\nXIII. INSTRUMENT\nXIV. DATA GATHERING\nXV. DATA ANALYSIS\nXVI. RESULTS AND DISCUSSION\nXVII. CONCLUSION\nXVIII. RECOMMENDATIONS\nXIX. REFERENCES\n\n`;
    }
    else if (intent === 'case_study') {
      finalPrompt += `Write a COMPLETE CASE STUDY about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. BACKGROUND\nIII. STATEMENT OF THE PROBLEM\nIV. RESEARCH QUESTIONS\nV. METHODOLOGY\nVI. PARTICIPANT/S\nVII. DATA COLLECTION\nVIII. DATA ANALYSIS\nIX. FINDINGS\nX. DISCUSSION\nXI. CONCLUSION\nXII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'correlational') {
      finalPrompt += `Write a COMPLETE CORRELATIONAL RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. HYPOTHESIS\nIV. VARIABLES\nV. METHODOLOGY\nVI. RESEARCH DESIGN\nVII. RESPONDENTS\nVIII. INSTRUMENT\nIX. DATA GATHERING\nX. STATISTICAL TREATMENT\nXI. RESULTS\nXII. ANALYSIS\nXIII. CONCLUSION\nXIV. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'descriptive') {
      finalPrompt += `Write a COMPLETE DESCRIPTIVE RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. OBJECTIVES\nIV. METHODOLOGY\nV. RESEARCH DESIGN\nVI. RESPONDENTS\nVII. INSTRUMENT\nVIII. DATA GATHERING\nIX. STATISTICAL TREATMENT\nX. RESULTS\nXI. ANALYSIS\nXII. CONCLUSION\nXIII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'phenomenology') {
      finalPrompt += `Write a COMPLETE PHENOMENOLOGICAL RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. RESEARCH QUESTIONS\nIV. PHILOSOPHICAL FOUNDATION\nV. METHODOLOGY\nVI. PARTICIPANTS\nVII. DATA COLLECTION\nVIII. DATA ANALYSIS\nIX. THEMES\nX. FINDINGS\nXI. CONCLUSION\nXII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'ethnography') {
      finalPrompt += `Write a COMPLETE ETHNOGRAPHIC RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. RESEARCH QUESTIONS\nIV. CULTURAL CONTEXT\nV. METHODOLOGY\nVI. PARTICIPANTS\nVII. DATA COLLECTION\nVIII. DATA ANALYSIS\nIX. FINDINGS\nX. CONCLUSION\nXI. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'grounded_theory') {
      finalPrompt += `Write a COMPLETE GROUNDED THEORY RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. RESEARCH QUESTIONS\nIV. METHODOLOGY\nV. PARTICIPANTS\nVI. DATA COLLECTION\nVII. CODING PROCESS\nVIII. THEORETICAL SAMPLING\nIX. FINDINGS\nX. THEORY DEVELOPMENT\nXI. CONCLUSION\nXII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'mixed_methods') {
      finalPrompt += `Write a COMPLETE MIXED METHODS RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. STATEMENT OF THE PROBLEM\nIII. RESEARCH QUESTIONS\nIV. METHODOLOGY\nV. RESEARCH DESIGN\nVI. QUANTITATIVE PHASE\nVII. QUALITATIVE PHASE\nVIII. PARTICIPANTS\nIX. INSTRUMENT\nX. DATA COLLECTION\nXI. DATA ANALYSIS\nXII. INTEGRATION OF FINDINGS\nXIII. FINDINGS\nXIV. CONCLUSION\nXV. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'action_research') {
      finalPrompt += `Write a COMPLETE ACTION RESEARCH about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. CONTEXT AND RATIONALE\nIII. STATEMENT OF THE PROBLEM\nIV. OBJECTIVES\nV. METHODOLOGY\nVI. PARTICIPANTS\nVII. INTERVENTION\nVIII. DATA COLLECTION\nIX. DATA ANALYSIS\nX. RESULTS\nXI. REFLECTION\nXII. CONCLUSION\nXIII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'survey') {
      finalPrompt += `Create a COMPLETE SURVEY REPORT about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. SURVEY METHODOLOGY\nIII. SURVEY QUESTIONNAIRE\nPART I: RESPONDENT PROFILE (Checklist)\nPART II: HABITS (Checklist)\nPART III: BEHAVIORS (Likert Scale)\nIV. SURVEY RESULTS\nV. KEY FINDINGS\nVI. ANALYSIS\nVII. CONCLUSION\nVIII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'interview') {
      finalPrompt += `Create a COMPLETE INTERVIEW REPORT about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. INTERVIEW METHODOLOGY\nIII. INTERVIEW GUIDE QUESTIONS\nIV. INTERVIEW RESULTS\nV. KEY FINDINGS\nVI. ANALYSIS\nVII. CONCLUSION\nVIII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'observation') {
      finalPrompt += `Create a COMPLETE OBSERVATION REPORT about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. OBSERVATION METHODOLOGY\nIII. OBSERVATION RESULTS\nIV. KEY FINDINGS\nV. ANALYSIS\nVI. CONCLUSION\nVII. RECOMMENDATIONS\n\n`;
    }
    else if (intent === 'critique') {
      finalPrompt += `Write a COMPLETE CRITIQUE about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\nCritique: ${topic}\n\nI. INTRODUCTION\nII. STRENGTHS\nIII. WEAKNESSES\nIV. CRITICISM\nV. RECOMMENDATIONS\nVI. IMPROVED VERSIONS\nVII. CONCLUSION\nVIII. FINAL VERDICT\n\n`;
    }
    else if (intent === 'elaborate') {
      finalPrompt += `Write a COMPLETE ELABORATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. FACTORS AFFECTING\nIV. COMMON HABITS\nV. COMMON BEHAVIORS\nVI. EFFECTS\nVII. CHALLENGES\nVIII. RECOMMENDATIONS\nIX. CONCLUSION\n\n`;
    }
    else if (intent === 'explain_examples') {
      finalPrompt += `Write a COMPLETE EXPLANATION WITH EXAMPLES about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. WHAT IS [TOPIC]?\nIV. EXAMPLES OF [TOPIC]\nV. TYPES OF [TOPIC]\nVI. FACTORS AFFECTING\nVII. EFFECTS\nVIII. CONCLUSION\n\n`;
    }
    else if (intent === 'comparison') {
      finalPrompt += `Write a COMPLETE COMPARISON about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION OF EACH\nIII. SIMILARITIES\nIV. DIFFERENCES\nV. COMPARISON TABLE\nVI. ADVANTAGES AND DISADVANTAGES\nVII. CONCLUSION\n\n`;
    }
    else if (intent === 'research') {
      finalPrompt += `Write a COMPLETE RESEARCH ANALYSIS about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. ANALYSIS\nIII. RECOMMENDATIONS\nIV. IMPROVED VERSIONS\nV. CONCLUSION\n\n`;
    }
    else if (intent === 'definition') {
      finalPrompt += `Write a COMPLETE DEFINITION AND EXPLANATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. KEY CHARACTERISTICS\nIV. TYPES\nV. EXAMPLES\nVI. IMPORTANCE\nVII. CONCLUSION\n\n`;
    }
    else if (intent === 'process') {
      finalPrompt += `Write a COMPLETE PROCESS EXPLANATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DEFINITION\nIII. FULL PROCESS\nIV. IMPORTANCE\nV. CONCLUSION\n\n`;
    }
    else if (intent === 'biography') {
      finalPrompt += `Write a COMPLETE BIOGRAPHY about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. BACKGROUND\nIII. EARLY LIFE\nIV. EDUCATION\nV. CAREER\nVI. MAJOR CONTRIBUTIONS\nVII. SIGNIFICANCE\nVIII. CONCLUSION\n\n`;
    }
    else if (intent === 'list') {
      finalPrompt += `Write a COMPLETE LIST about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. LIST\nIII. CONCLUSION\n\n`;
    }
    else if (intent === 'explanation') {
      finalPrompt += `Write a COMPLETE EXPLANATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DIRECT ANSWER\nIII. MAIN REASONS\nIV. CONCLUSION\n\n`;
    }
    else if (intent === 'howto') {
      finalPrompt += `Write a COMPLETE HOW-TO GUIDE about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. MATERIALS NEEDED\nIII. STEP-BY-STEP GUIDE\nIV. TIPS AND WARNINGS\nV. CONCLUSION\n\n`;
    }
    else if (intent === 'proscons') {
      finalPrompt += `Write a COMPLETE PROS AND CONS about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. ADVANTAGES\nIII. DISADVANTAGES\nIV. BALANCED VIEW\nV. CONCLUSION\n\n`;
    }
    else if (intent === 'importance') {
      finalPrompt += `Write a COMPLETE IMPORTANCE EXPLANATION about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. DIRECT ANSWER\nIII. WHY IT MATTERS\nIV. IMPACT\nV. CONCLUSION\n\n`;
    }
    else if (intent === 'effects') {
      finalPrompt += `Write a COMPLETE EFFECTS ANALYSIS about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. POSITIVE EFFECTS\nIII. NEGATIVE EFFECTS\nIV. BALANCED VIEW\nV. CONCLUSION\n\n`;
    }
    else if (intent === 'essay') {
      finalPrompt += `Write a COMPLETE ESSAY about "${topic}" in ${langName}.\n\n`;
      finalPrompt += `FORMAT:\nTITLE:\n${topic}\n\nI. INTRODUCTION\nII. BODY\nParagraph 1:\nParagraph 2:\nParagraph 3:\nIII. CONCLUSION\n\n`;
    }
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

  buildLogicPrompt(prompt, langName) {
    let finalPrompt = '';
    finalPrompt += `You are a LOGIC and RIDDLE expert. Answer the following question ACCURATELY.\n\n`;
    finalPrompt += `CRITICAL RULES:\n`;
    finalPrompt += `1. Think STEP BY STEP before answering.\n`;
    finalPrompt += `2. Do NOT invent facts that are NOT stated in the question.\n`;
    finalPrompt += `3. If it is a TRICK question, explain the trick clearly.\n`;
    finalPrompt += `4. Do NOT repeat the question.\n`;
    finalPrompt += `5. Give the FINAL ANSWER clearly at the end.\n`;
    finalPrompt += `6. Respond in ${langName.toUpperCase()} language.\n`;
    finalPrompt += `7. Keep it CONCISE — no long essays.\n`;
    finalPrompt += `8. NO emojis, NO markdown, NO LaTeX.\n\n`;
    finalPrompt += `FORMAT:\n`;
    finalPrompt += `TITLE:\nLogic Answer\n\n`;
    finalPrompt += `I. REASONING\n`;
    finalPrompt += `[Step-by-step reasoning]\n\n`;
    finalPrompt += `II. ANSWER\n`;
    finalPrompt += `[Final answer with brief explanation]\n\n`;
    finalPrompt += `QUESTION: ${prompt}\n\n`;
    finalPrompt += `Write your COMPLETE response now:`;
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
  // MATH DETECTION
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
      'survey', 'interview', 'elaborate', 'difference', 'compare',
      'riddle', 'bugtong', 'puzzle', 'logic',
      'qualitative', 'quantitative', 'thesis', 'experimental', 'research',
      'weight', 'timbang', 'girth', 'length'];

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
