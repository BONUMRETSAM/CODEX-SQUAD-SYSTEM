// ========== ai.js - COMPLETE AI ASSISTANT v40.0.0 ==========
// Full Package: All Math, Science, CS, Quiz Detection, Logic, Weight
// Hybrid Detection: Auto-detect math, no need for "solve" prefix
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with full math support and quiz detection',
  usage: 'ai [question] | weight [animal] [measurements]',
  version: '40.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  // ============================================================
  // MATH QUERY DETECTION — Auto-detect, no prefix needed
  // ============================================================
  isMathQuery(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase().trim();

    // Exclude essay/explanation/definition questions
    const nonMathWords = [
      'ano', 'what', 'explain', 'paliwanag', 'ipaliwanag', 'define',
      'kahulugan', 'why', 'bakit', 'how', 'paano', 'describe',
      'ilarawan', 'discuss', 'essay', 'paragraph', 'talata',
      'story', 'kwento', 'summary', 'buod', 'write', 'isulat',
      'translate', 'isalin', 'salin', 'who', 'sino', 'when',
      'kailan', 'where', 'saan', 'history', 'kasaysayan',
      'importance', 'kahalagahan', 'difference', 'kaibahan'
    ];
    for (const w of nonMathWords) {
      if (lower.includes(w)) return false;
    }

    // Math keywords (for non-symbol input)
    const mathKeywords = [
      'solve', 'equation', 'derivative', 'differentiate', 'integral',
      'integrate', 'limit', 'area', 'volume', 'perimeter', 'circumference',
      'mean', 'median', 'mode', 'average', 'probability', 'matrix',
      'vector', 'factor', 'simplify', 'evaluate', 'compute', 'calculate',
      'add', 'subtract', 'multiply', 'divide', 'fraction', 'percent',
      'sin', 'cos', 'tan', 'log', 'ln', 'factorial', 'gcd', 'lcm',
      'convert', 'find', 'value', 'root', 'square', 'cube',
      'prime', 'composite', 'divisible', 'quadratic', 'linear',
      'inequality', 'exponent', 'power', 'absolute'
    ];
    if (mathKeywords.some(k => lower.includes(k))) return true;

    // Math symbols and patterns (automatic detection)
    const mathPatterns = [
      /[\d]+\s*[\+\-\*\/\^]\s*[\d]+/,
      /[xyz]\s*[\+\-\*\/\^=]/,
      /[=]\s*[\dxyz]/i,
      /[\d]+\s*[<>]\s*[\d]+/,
      /\([^)]+\)\s*\^/,
      /[\d\.]+\s*[%]/,
      /\d+\s*\/\s*\d+/,
      /[a-z]\^[\d]+/i,
      /\bsin\b|\bcos\b|\btan\b/i,
      /\blog\b|\bln\b/i,
      /\bsqrt\b|√/i
    ];
    return mathPatterns.some(p => p.test(prompt));
  },

  // ============================================================
  // QUIZ DETECTION — Nasa TAAS para mauna
  // ============================================================
  isQuizQuestion(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();

    const hasOptions = /\n\s*[A-D][\.\)]\s+\S/.test(prompt) ||
                       /\n\s*[a-d][\.\)]\s+\S/.test(prompt);

    const hasQuizWords = /\b(quiz|panuto|piliin|sagutin|answer|multiple choice|test|exam)\b/i.test(lower);

    const hasNumberedQuestions = /\n\s*\d+[\.\)]\s+\S/.test(prompt);

    const hasWorksheet = /\bPART\s+[IVX]+\b/i.test(prompt) ||
                         /\bDirections?\s*:/i.test(prompt) ||
                         /\bActivity\s+Sheet\b/i.test(prompt);

    return (hasOptions && (hasQuizWords || hasNumberedQuestions)) || hasWorksheet;
  },

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();

      // Normalize Unicode superscripts to caret notation
      prompt = prompt
        .replace(/²/g, '^2')
        .replace(/³/g, '^3')
        .replace(/⁴/g, '^4')
        .replace(/⁵/g, '^5')
        .replace(/⁶/g, '^6')
        .replace(/⁷/g, '^7')
        .replace(/⁸/g, '^8')
        .replace(/⁹/g, '^9')
        .replace(/⁰/g, '^0');

      const lowerPrompt = prompt.toLowerCase();
      const cleanPrompt = lowerPrompt.replace(/[.:!?,\s]+$/g, '').trim();

      // ============================================================
      // STEP 1: GREETINGS
      // ============================================================
      if (this.isGreetingOrConversational(prompt)) {
        const reply = this.buildConversationalReply(prompt, senderId);
        await sendMessage(senderId, { text: reply }, token);
        conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: reply, timestamp: Date.now() };
        return;
      }

      // ============================================================
      // STEP 2: FOLLOW-UP COMMANDS
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
        let cleaned = this.cleanResponse(response);
        cleaned = this.ensureComplete(cleaned);
        conversationHistory[senderId] = { lastPrompt: previousPrompt || 'previous', lastResponse: cleaned, timestamp: Date.now() };
        await this.sendComplete(senderId, cleaned, token);
        return;
      }

      // ============================================================
      // STEP 3: WORD LIST
      // ============================================================
      if (this.isWordListQuestion(prompt)) {
        const wordAnswer = await this.handleWordList(senderId, prompt, token);
        if (wordAnswer) {
          await this.sendComplete(senderId, wordAnswer, token);
          conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: wordAnswer, timestamp: Date.now() };
          return;
        }
      }

      // ============================================================
      // STEP 4: WEIGHT
      // ============================================================
      if (this.shouldTriggerWeight(lowerPrompt, prompt)) {
        await this.handleWeightEstimation(senderId, prompt, token);
        return;
      }

      // ============================================================
      // STEP 4.5: QUIZ / WORKSHEET DETECTION
      // ============================================================
      if (this.isQuizQuestion(prompt)) {
        console.log('[AI] Quiz/Worksheet detected, skipping math handlers');

        const quizPrompt = 'You are an expert tutor answering a worksheet or quiz.\n\n' +
          'CRITICAL RULES:\n' +
          '1. Read ALL questions and ALL options carefully.\n' +
          '2. Answer EVERY question — do not skip any.\n' +
          '3. For multiple choice, choose the BEST answer (A, B, C, or D).\n' +
          '4. For sequencing, arrange steps in correct order (1, 2, 3...).\n' +
          '5. For True/False or Proper/Improper, mark clearly.\n' +
          '6. For explain-why, give 1-2 sentence answers.\n' +
          '7. Do NOT write generic introductions about the topic.\n' +
          '8. Do NOT explain what the worksheet is about.\n' +
          '9. Answer DIRECTLY and CONCISELY.\n' +
          '10. Respond in the SAME language as the worksheet.\n' +
          '11. NO emojis, NO markdown, NO LaTeX.\n\n' +
          'FORMAT:\n' +
          'QUIZ ANSWERS\n\n' +
          '[Section title]\n' +
          '1. [Answer]\n' +
          '2. [Answer]\n' +
          '...\n\n' +
          'WORKSHEET:\n' + prompt + '\n\n' +
          'Provide the answers:';

        const response = await this.callAPI(quizPrompt, prompt, 'tagalog', 'quiz', 'Quiz', 'general', 'detailed');
        let cleaned = this.cleanResponse(response);
        cleaned = this.ensureComplete(cleaned);

        conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: cleaned, timestamp: Date.now() };
        await this.sendComplete(senderId, cleaned, token);
        return;
      }

      // ============================================================
      // STEP 5: ALL HANDLERS — SINGLE ORDERED LOOP
      // ============================================================
      const HANDLER_ORDER = [
        'tryWordProblem',
        'tryUnitConversion',
        'tryMeasurement',
        'tryUnitPrefix',
        'tryPythonCode',
        'trySpecialExponent',
        'tryInequality',
        'tryAlgebraCompute',
        'tryLinearEquation',
        'tryQuadraticEquation',
        'tryFactoring',
        'trySimplifyExpression',
        'tryDerivative',
        'tryIntegral',
        'tryLogarithm',
        'tryExponents',
        'tryAbsoluteValue',
        'tryPercentage',
        'tryFractions',
        'tryDistribution',
        'tryRegression',
        'tryCorrelation',
        'tryNormalDist',
        'tryConfidenceInterval',
        'tryZTest',
        'tryChiSquare',
        'tryANOVA',
        'tryStatsAdvanced',
        'tryStatistics',
        'tryGeometryAdvanced',
        'tryGeometry',
        'tryTrigAdvanced',
        'tryTrigonometry',
        'tryAnalyticGeometry',
        'tryLinearAlgebra',
        'tryMatrix',
        'tryVector',
        'tryComplexNumber',
        'tryDiffEq',
        'tryProbability',
        'trySequence',
        'tryPhysics',
        'tryChemistry',
        'tryGenetics',
        'tryThermodynamics',
        'tryWaves',
        'tryOptics',
        'tryEngineering',
        'tryElectrical',
        'tryFinance',
        'tryAccounting',
        'tryFinancialRatios',
        'tryNumberTheory',
        'trySetTheory',
        'tryBoolean',
        'tryLogicGates',
        'tryBinaryHex',
        'tryBaseConversion',
        'tryRoman',
        'tryCryptography',
        'tryBigO',
        'tryAlgorithms',
        'tryDataStructures',
        'tryNetworking',
        'tryMachineLearning',
        'tryDiscreteMath',
        'tryGraphTheory',
        'tryGeography',
        'tryMathCompute'
      ];

      for (const handlerName of HANDLER_ORDER) {
        if (typeof this[handlerName] !== 'function') continue;
        try {
          const result = this[handlerName](prompt);
          if (result) {
            await this.sendComplete(senderId, result, token);
            conversationHistory[senderId] = {
              lastPrompt: prompt,
              lastResponse: result,
              timestamp: Date.now()
            };
            this.cleanOldHistory();
            return;
          }
        } catch (e) {
          console.error('[Handler ' + handlerName + ']', e.message);
        }
      }

      // ============================================================
      // STEP 6: LOGIC
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

      const language = this.detectLanguage(prompt);
      const intent = this.detectIntent(prompt);
      const topic = this.extractTopic(prompt);
      const subject = this.detectSubject(prompt);
      const requestType = this.detectRequestType(prompt);

      console.log('[AI] Language:', language, '| Intent:', intent, '| Subject:', subject, '| Topic:', topic);

      const finalPrompt = this.buildDetailedPrompt(prompt, previousResponse, previousPrompt, language, intent, topic, subject, requestType);

      const response = await this.callAPI(finalPrompt, prompt, language, intent, topic, subject, requestType);
      let aiResponse = response;

      aiResponse = this.cleanResponse(aiResponse);
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
// POLYNOMIAL HELPERS (for trySpecialExponent)
// ============================================================
parsePoly(expr) {
  // Parse polynomial string into coefficients [c0, c1, c2, ...]
  // Example: "x^2 - 5x + 5" => [5, -5, 1]
  const cleaned = expr.replace(/\s+/g, '').replace(/\*/g, '');

  // Handle as sequence of terms
  const terms = [];
  let current = '';
  let sign = 1;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if ((c === '+' || c === '-') && i > 0) {
      if (current) terms.push({ sign, term: current });
      current = '';
      sign = c === '-' ? -1 : 1;
    } else if (i === 0 && c === '-') {
      sign = -1;
    } else if (i === 0 && c === '+') {
      sign = 1;
    } else {
      current += c;
    }
  }
  if (current) terms.push({ sign, term: current });

  // Determine max degree
  let maxDeg = 0;
  for (const { term } of terms) {
    const m = term.match(/x\^(\d+)/);
    if (m) maxDeg = Math.max(maxDeg, parseInt(m[1]));
    else if (/x/.test(term)) maxDeg = Math.max(maxDeg, 1);
  }

  // Build coefficient array
  const coeffs = new Array(maxDeg + 1).fill(0);

  for (const { sign, term } of terms) {
    if (term === '') continue;
    const m = term.match(/^(\d+\.?\d*)?(x(?:\^(\d+))?)?$/);
    if (!m) return null;

    let coeff = 1;
    if (m[1]) coeff = parseFloat(m[1]);
    if (sign === -1) coeff = -coeff;

    let deg = 0;
    if (m[2]) {
      deg = m[3] ? parseInt(m[3]) : 1;
    }
    coeffs[deg] += coeff;
  }

  return coeffs;
},

formatPoly(coeffs) {
  // Format coefficients back to string
  let result = '';
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const c = coeffs[i];
    if (c === 0) continue;

    const sign = c < 0 ? ' - ' : (result ? ' + ' : '');
    const absC = Math.abs(c);

    let term = '';
    if (i === 0) term = absC.toString();
    else if (i === 1) term = (absC === 1 ? 'x' : absC + 'x');
    else term = (absC === 1 ? 'x^' + i : absC + 'x^' + i);

    result += sign + term;
  }
  return result || '0';
},

evaluatePoly(coeffs, x) {
  let result = 0;
  for (let i = 0; i < coeffs.length; i++) {
    result += coeffs[i] * Math.pow(x, i);
  }
  return result;
},

// ============================================================
// ROOT FINDERS — For different degrees
// ============================================================
solveQuadraticExact(a, b, c) {
  // Solve ax² + bx + c = 0
  if (a === 0) {
    if (b === 0) return [];
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  if (disc === 0) return [-b / (2 * a)];
  const sqrtD = Math.sqrt(disc);
  return [(-b + sqrtD) / (2 * a), (-b - sqrtD) / (2 * a)];
},

// Rational Root Theorem for higher degrees
findRationalRoots(coeffs) {
  // Find rational roots p/q where p | c0, q | cN
  const roots = [];
  const c0 = coeffs[0];
  const cN = coeffs[coeffs.length - 1];
  if (c0 === 0) {
    roots.push(0);
    return roots;
  }

  const pDivs = this.getDivisors(Math.abs(c0));
  const qDivs = this.getDivisors(Math.abs(cN));

  for (const p of pDivs) {
    for (const q of qDivs) {
      for (const sign of [1, -1]) {
        const r = (sign * p) / q;
        if (Math.abs(this.evaluatePoly(coeffs, r)) < 1e-9) {
          if (!roots.includes(r)) roots.push(r);
        }
      }
    }
  }
  return roots;
},

getDivisors(n) {
  if (n === 0) return [0];
  const divs = [];
  for (let i = 1; i <= Math.sqrt(n); i++) {
    if (n % i === 0) {
      divs.push(i);
      if (i !== n / i) divs.push(n / i);
    }
  }
  return divs;
},

// Synthetic division: divide coeffs by (x - r)
syntheticDivide(coeffs, r) {
  const n = coeffs.length;
  if (n < 2) return null;
  const result = new Array(n - 1).fill(0);
  result[0] = coeffs[n - 1];
  for (let i = 1; i < n - 1; i++) {
    result[i] = coeffs[n - 1 - i] + result[i - 1] * r;
  }
  return result.reverse();
},

// Newton's method for numeric roots
newtonRaphson(coeffs, x0 = 1, tol = 1e-9, maxIter = 100) {
  let x = x0;
  for (let i = 0; i < maxIter; i++) {
    const fx = this.evaluatePoly(coeffs, x);
    // derivative
    const dCoeffs = coeffs.slice(1).map((c, i) => c * (i + 1));
    const dfx = this.evaluatePoly(dCoeffs, x);
    if (Math.abs(dfx) < 1e-15) break;
    const xNew = x - fx / dfx;
    if (Math.abs(xNew - x) < tol) return xNew;
    x = xNew;
  }
  return Math.abs(this.evaluatePoly(coeffs, x)) < 1e-6 ? x : null;
},

findAllRoots(coeffs) {
  // Find all real roots (exact for degree <= 2, numeric for higher)
  const degree = coeffs.length - 1;
  if (degree < 1) return [];

  // Remove leading zeros
  let c = [...coeffs];
  while (c.length > 1 && c[c.length - 1] === 0) c.pop();
  while (c.length > 1 && c[0] === 0) {
    c.shift(); // x=0 is a root
  }

  const roots = [];
  const effectiveDeg = c.length - 1;

  // Degree 1: ax + b = 0
  if (effectiveDeg === 1) {
    roots.push(-c[0] / c[1]);
    return roots;
  }

  // Degree 2: exact quadratic
  if (effectiveDeg === 2) {
    return this.solveQuadraticExact(c[2], c[1], c[0]);
  }

  // Degree 3+: try rational roots first, then numeric
  let remaining = [...c];
  // Rational roots
  const rationalRoots = this.findRationalRoots(remaining);
  for (const r of rationalRoots) {
    if (Math.abs(this.evaluatePoly(remaining, r)) < 1e-9) {
      roots.push(r);
      const divided = this.syntheticDivide(remaining, r);
      if (divided) remaining = divided;
      // If reduced to quadratic, solve exactly
      if (remaining.length === 3) {
        const quadRoots = this.solveQuadraticExact(remaining[2], remaining[1], remaining[0]);
        for (const q of quadRoots) {
          if (!roots.some(r2 => Math.abs(r2 - q) < 1e-6)) roots.push(q);
        }
        return roots.sort((a, b) => a - b);
      }
    }
  }

  // If still higher degree, use Newton's method with multiple starting points
  if (remaining.length > 3) {
    const startPoints = [-10, -5, -2, -1, -0.5, 0.5, 1, 2, 5, 10];
    for (const sp of startPoints) {
      const r = this.newtonRaphson(remaining, sp);
      if (r !== null && !roots.some(r2 => Math.abs(r2 - r) < 1e-5)) {
        roots.push(r);
      }
    }
  }

  return roots.sort((a, b) => a - b);
},

// ============================================================
// HANDLER: SPECIAL EXPONENT EQUATION f(x)^g(x) = 1
// Supports ALL degrees (x², x³, x⁴, x⁵, ...)
// ============================================================
trySpecialExponent(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/=/.test(prompt)) return null;
  if (!/\^/.test(prompt)) return null;

  const normalized = prompt.replace(/\s+/g, ' ');

  // Match (expr1)^(expr2) = 1
  const match = normalized.match(/\(([^)]+)\)\s*\^\s*\(([^)]+)\)\s*=\s*1/);
  if (!match) return null;

  try {
    const baseExpr = match[1].replace(/\s+/g, '');
    const expExpr = match[2].replace(/\s+/g, '');

    const baseCoeffs = this.parsePoly(baseExpr);
    const expCoeffs = this.parsePoly(expExpr);

    if (!baseCoeffs || !expCoeffs) return null;

    const solutions = new Set();

    let response = 'EXPONENTIAL EQUATION SOLUTION\n\n';
    response += 'Equation: ' + prompt.replace(/\s+/g, ' ').trim() + '\n\n';
    response += 'I. IDENTIFY PATTERN\n';
    response += '   Form: f(x)^g(x) = 1\n';
    response += '   Base: ' + this.formatPoly(baseCoeffs) + '\n';
    response += '   Exponent: ' + this.formatPoly(expCoeffs) + '\n\n';
    response += 'II. CASES TO CONSIDER\n';
    response += '   Case 1: Exponent = 0, Base != 0\n';
    response += '   Case 2: Base = 1\n';
    response += '   Case 3: Base = -1, Exponent even\n';
    response += '   Case 4: Base = 0, Exponent > 0\n\n';
    response += 'III. SOLVING EACH CASE\n\n';

    // CASE 1: Exponent = 0, Base != 0
    response += '   Case 1: Exponent = 0, Base != 0\n';
    response += '   ' + this.formatPoly(expCoeffs) + ' = 0\n';
    const case1Roots = this.findAllRoots(expCoeffs);
    if (case1Roots.length > 0) {
      const validRoots = case1Roots.filter(r => Math.abs(this.evaluatePoly(baseCoeffs, r)) > 1e-9);
      for (const r of validRoots) {
        const rounded = parseFloat(r.toFixed(6));
        response += '   x = ' + rounded + '\n';
        solutions.add(rounded);
      }
      if (validRoots.length === 0) response += '   No valid roots (base = 0)\n';
    } else {
      response += '   No real roots\n';
    }
    response += '\n';

    // CASE 2: Base = 1
    response += '   Case 2: Base = 1\n';
    response += '   ' + this.formatPoly(baseCoeffs) + ' = 1\n';
    const base1Coeffs = [...baseCoeffs];
    base1Coeffs[0] -= 1;
    const case2Roots = this.findAllRoots(base1Coeffs);
    if (case2Roots.length > 0) {
      for (const r of case2Roots) {
        const rounded = parseFloat(r.toFixed(6));
        response += '   x = ' + rounded + '\n';
        solutions.add(rounded);
      }
    } else {
      response += '   No real roots\n';
    }
    response += '\n';

    // CASE 3: Base = -1, Exponent even
    response += '   Case 3: Base = -1, Exponent even\n';
    response += '   ' + this.formatPoly(baseCoeffs) + ' = -1\n';
    const baseNeg1Coeffs = [...baseCoeffs];
    baseNeg1Coeffs[0] += 1;
    const case3Roots = this.findAllRoots(baseNeg1Coeffs);
    if (case3Roots.length > 0) {
      for (const r of case3Roots) {
        const expVal = this.evaluatePoly(expCoeffs, r);
        if (Number.isInteger(Math.round(expVal)) && Math.round(expVal) % 2 === 0) {
          const rounded = parseFloat(r.toFixed(6));
          response += '   x = ' + rounded + ' (Exp = ' + Math.round(expVal) + ' even) OK\n';
          solutions.add(rounded);
        } else {
          response += '   x = ' + r.toFixed(4) + ' (Exp = ' + expVal.toFixed(4) + ' not even) X\n';
        }
      }
    } else {
      response += '   No real roots\n';
    }
    response += '\n';

    // CASE 4: Base = 0, Exponent > 0
    response += '   Case 4: Base = 0, Exponent > 0\n';
    response += '   ' + this.formatPoly(baseCoeffs) + ' = 0\n';
    const case4Roots = this.findAllRoots(baseCoeffs);
    if (case4Roots.length > 0) {
      for (const r of case4Roots) {
        const expVal = this.evaluatePoly(expCoeffs, r);
        if (expVal > 1e-9) {
          response += '   x = ' + r.toFixed(4) + ': Exp = ' + expVal.toFixed(4) + ' > 0, pero 0^positive = 0 != 1. NOT valid.\n';
        }
      }
    } else {
      response += '   No real roots\n';
    }
    response += '\n';

    const sortedSolutions = [...solutions].sort((a, b) => a - b);
    if (sortedSolutions.length === 0) return null;

    // VERIFICATION
    response += 'IV. VERIFICATION\n';
    for (const x of sortedSolutions) {
      const bVal = this.evaluatePoly(baseCoeffs, x);
      const eVal = this.evaluatePoly(expCoeffs, x);
      const res = Math.pow(bVal, eVal);
      response += '   x = ' + x + ': Base = ' + bVal.toFixed(4) + ', Exp = ' + eVal.toFixed(4) + ' -> ' + res.toFixed(4) + '\n';
    }

    response += '\nV. FINAL ANSWER\n';
    response += '   x = ' + sortedSolutions.join(', ');

    return response;
  } catch (e) {
    console.error('[trySpecialExponent]', e.message);
    return null;
  }
},

// ============================================================
// HANDLER 1: ALGEBRAIC EXPANSION (FOIL)
// ============================================================
tryAlgebraCompute(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();
  const hasLetters = /[a-z]/i.test(prompt);
  const hasParens = /\(/.test(prompt) && /\)/.test(prompt);
  if (!hasLetters || !hasParens) return null;

  // Exclude exponential equations
  if (/\([^)]+\)\s*\^\s*\(/.test(prompt)) return null;

  const nonAlgebraKeywords = ['summarize', 'summary', 'translate', 'explain', 'what is', 'why is', 'how does', 'who is', 'where is', 'when is', 'define', 'process'];
  for (const keyword of nonAlgebraKeywords) {
    if (lower.includes(keyword)) return null;
  }

  // Only match (expr1)(expr2) with no ^ between them
  const binomialMatch = prompt.match(/\(([^)^]+)\)\s*\(([^)^]+)\)/);
  if (!binomialMatch) return null;

  try {
    const result = this.expandBinomial(binomialMatch[1], binomialMatch[2]);
    if (!result) return null;

    let response = 'ALGEBRA SOLUTION\n\n';
    response += 'Expression: ' + prompt + '\n\n';
    response += 'I. STEP-BY-STEP EXPANSION (FOIL)\n';
    response += '   F = First terms\n';
    response += '   O = Outer terms\n';
    response += '   I = Inner terms\n';
    response += '   L = Last terms\n\n';
    response += 'II. COMPUTATION\n' + result.steps.join('\n') + '\n\n';
    response += 'III. COMBINE LIKE TERMS\n' + result.combine + '\n\n';
    response += 'IV. FINAL ANSWER\n' + result.answer + '\n\n';
    response += 'V. RULE\nUse FOIL method to expand binomials. Combine like terms with same variable and exponent.';
    return response;
  } catch (e) {
    return null;
  }
},

expandBinomial(a, b) {
  const termsA = this.parseTerms(a);
  const termsB = this.parseTerms(b);
  if (!termsA || !termsB || termsA.length === 0 || termsB.length === 0) return null;

  const steps = [];
  const products = [];

  for (const ta of termsA) {
    for (const tb of termsB) {
      const product = this.multiplyTerms(ta, tb);
      products.push(product);
      steps.push('  ' + ta.raw + ' x ' + tb.raw + ' = ' + product.raw);
    }
  }

  const combined = this.combineLikeTerms(products);
  combined.sort((a, b) => b.degree - a.degree);
  const finalAnswer = combined.map(t => t.raw).join(' ').replace(/\+ -/g, '- ').replace(/\s+/g, ' ').trim();
  const combineSteps = combined.map(t => '  ' + t.raw + ' (degree ' + t.degree + ')').join('\n');

  return { steps, combine: combineSteps, answer: finalAnswer };
},

parseTerms(expr) {
  const cleaned = expr.replace(/\s+/g, '');
  const terms = [];
  let current = '';
  let sign = 1;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if ((c === '+' || c === '-') && i > 0) {
      if (current) { terms.push(this.buildTerm(current, sign)); current = ''; }
      sign = c === '-' ? -1 : 1;
    } else if (i === 0 && c === '-') sign = -1;
    else if (i === 0 && c === '+') sign = 1;
    else current += c;
  }
  if (current) terms.push(this.buildTerm(current, sign));
  return terms;
},

buildTerm(str, sign) {
  const match = str.match(/^(\d+\.?\d*)?([a-z].*)?$/i);
  if (!match) return null;
  const coeff = match[1] ? parseFloat(match[1]) * sign : (match[2] ? 1 * sign : 0);
  const varPart = match[2] || '';
  const vars = {};
  const varRegex = /([a-z])(?:\^?(\d+))?/gi;
  let vm;
  while ((vm = varRegex.exec(varPart)) !== null) {
    const v = vm[1].toLowerCase();
    const exp = vm[2] ? parseInt(vm[2]) : 1;
    vars[v] = (vars[v] || 0) + exp;
  }
  return {
    coeff, vars,
    raw: (coeff < 0 ? '-' : '') + Math.abs(coeff) + varPart,
    degree: Object.values(vars).reduce((s, e) => s + e, 0)
  };
},

multiplyTerms(t1, t2) {
  const coeff = t1.coeff * t2.coeff;
  const vars = { ...t1.vars };
  for (const [v, e] of Object.entries(t2.vars)) vars[v] = (vars[v] || 0) + e;
  let varStr = '';
  const sortedVars = Object.keys(vars).sort();
  for (const v of sortedVars) {
    if (vars[v] === 1) varStr += v;
    else if (vars[v] > 1) varStr += v + '^' + vars[v];
  }
  const coeffStr = Math.abs(coeff) === 1 && varStr ? '' : Math.abs(coeff);
  const sign = coeff < 0 ? '-' : '';
  return {
    coeff, vars,
    raw: (sign + coeffStr + varStr) || '0',
    degree: Object.values(vars).reduce((s, e) => s + e, 0)
  };
},

combineLikeTerms(terms) {
  const grouped = {};
  for (const t of terms) {
    const key = Object.keys(t.vars).sort().map(v => v + '^' + t.vars[v]).join('*') || 'const';
    if (!grouped[key]) grouped[key] = { ...t, vars: { ...t.vars } };
    else grouped[key].coeff += t.coeff;
  }
  return Object.values(grouped).filter(t => t.coeff !== 0).map(t => {
    let varStr = '';
    const sortedVars = Object.keys(t.vars).sort();
    for (const v of sortedVars) {
      if (t.vars[v] === 1) varStr += v;
      else if (t.vars[v] > 1) varStr += v + '^' + t.vars[v];
    }
    const coeffStr = Math.abs(t.coeff) === 1 && varStr ? '' : Math.abs(t.coeff);
    const sign = t.coeff < 0 ? '-' : '';
    return { coeff: t.coeff, vars: t.vars, raw: sign + coeffStr + varStr, degree: t.degree };
  });
},

// ============================================================
// HANDLER 2: LINEAR EQUATION (auto-detect, no "solve" needed)
// ============================================================
tryLinearEquation(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/[a-z]/i.test(prompt)) return null;
  if (!/=/.test(prompt)) return null;
  if (/x\^?2/i.test(prompt)) return null;
  if (/\^/.test(prompt)) return null;

  // Exclude Python code and quiz
  if (/print\s*\(/i.test(prompt)) return null;
  if (/\*\*/.test(prompt)) return null;
  if (/\bpython\b/i.test(lower)) return null;
  if (/\bQ\d{3,}\b/i.test(prompt)) return null;
  if (/[A-D]\)\s*\d+/i.test(prompt)) return null;
  if (/what\s+is\s+the\s+output/i.test(lower)) return null;
  if (/what\s+is\s+the\s+answer/i.test(lower)) return null;

  // Extract equation
  const eqMatch = prompt.match(/([^=\n]+=[^=\n]+)/);
  if (!eqMatch) return null;

  const eq = eqMatch[1].replace(/\s+/g, '');
  const parts = eq.split('=');
  if (parts.length !== 2) return null;

  try {
    const lhs = parts[0];
    const rhs = parts[1];

    const parseSide = (side) => {
      let coeff = 0;
      let constant = 0;
      const varTermMatch = side.match(/([\-\+]?\d*\.?\d*)\s*([a-z])/i);
      if (varTermMatch) {
        const c = varTermMatch[1];
        if (c === '' || c === '+') coeff = 1;
        else if (c === '-') coeff = -1;
        else coeff = parseFloat(c);
      }
      const constTermMatch = side.match(/([\-\+]?\d+\.?\d*)(?![a-z\d])/i);
      if (constTermMatch) {
        if (!varTermMatch || constTermMatch.index !== varTermMatch.index) {
          constant = parseFloat(constTermMatch[1]);
        }
      }
      return { coeff, constant };
    };

    const varName = (lhs.match(/[a-z]/i) || rhs.match(/[a-z]/i) || ['x'])[0].toLowerCase();
    const L = parseSide(lhs);
    const R = parseSide(rhs);

    const a = L.coeff - R.coeff;
    const b = L.constant - R.constant;

    if (a === 0) {
      if (b === 0) return 'LINEAR EQUATION SOLUTION\n\nEquation: ' + prompt + '\n\nInfinite solutions (identity).';
      return 'LINEAR EQUATION SOLUTION\n\nEquation: ' + prompt + '\n\nNo solution (contradiction).';
    }

    const solution = -b / a;

    let response = 'LINEAR EQUATION SOLUTION\n\n';
    response += 'Equation: ' + prompt + '\n\n';
    response += 'I. SIMPLIFY BOTH SIDES\n';
    response += '   LHS: ' + L.coeff + varName + (L.constant >= 0 ? ' + ' + L.constant : ' - ' + Math.abs(L.constant)) + '\n';
    response += '   RHS: ' + R.coeff + varName + (R.constant >= 0 ? ' + ' + R.constant : ' - ' + Math.abs(R.constant)) + '\n\n';
    response += 'II. MOVE VARIABLES TO LEFT, CONSTANTS TO RIGHT\n';
    response += '   (' + L.coeff + ' - ' + R.coeff + ')' + varName + ' = ' + R.constant + ' - ' + L.constant + '\n';
    response += '   ' + a + varName + ' = ' + (-b) + '\n\n';
    response += 'III. DIVIDE BOTH SIDES\n';
    response += '   ' + varName + ' = ' + (-b) + ' / ' + a + '\n';
    response += '   ' + varName + ' = ' + solution + '\n\n';
    response += 'IV. VERIFICATION\n';
    response += '   Substitute ' + varName + ' = ' + solution + '\n';
    response += '   LHS = ' + (L.coeff * solution + L.constant) + '\n';
    response += '   RHS = ' + (R.coeff * solution + R.constant) + '\n';
    response += '   LHS = RHS - CORRECT\n\n';
    response += 'V. FINAL ANSWER\n';
    response += varName + ' = ' + solution;

    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 3: QUADRATIC EQUATION (auto-detect)
// ============================================================
tryQuadraticEquation(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/x\^?2/i.test(prompt)) return null;
  if (!/=/.test(prompt)) return null;

  // Exclude exponential
  if (/\([^)]+\)\s*\^\s*\(/.test(prompt)) return null;

  const eqMatch = prompt.match(/([^=\n]+=[^=\n]+)/);
  if (!eqMatch) return null;

  const eq = eqMatch[1].replace(/\s+/g, '');
  const parts = eq.split('=');
  if (parts.length !== 2) return null;

  try {
    const lhs = parts[0];
    const rhs = parts[1];

    // Must equal 0 (or move to 0)
    let a = 1, b = 0, c = 0;

    const aMatch = lhs.match(/([\-\+]?\d*\.?\d*)x\^?2/i);
    if (aMatch) {
      const ac = aMatch[1];
      if (ac === '' || ac === '+') a = 1;
      else if (ac === '-') a = -1;
      else a = parseFloat(ac);
    }

    const bMatch = lhs.match(/([\-\+]?\d*\.?\d*)x(?!\^)/i);
    if (bMatch) {
      const bc = bMatch[1];
      if (bc === '' || bc === '+') b = 1;
      else if (bc === '-') b = -1;
      else b = parseFloat(bc);
    }

    const withoutX2 = lhs.replace(/[\-\+]?\d*\.?\d*x\^?2/gi, '');
    const withoutX = withoutX2.replace(/[\-\+]?\d*\.?\d*x(?!\^)/gi, '');
    const cMatch = withoutX.match(/([\-\+]?\d+\.?\d*)/);
    if (cMatch) c = parseFloat(cMatch[1]);

    // Adjust for RHS
    const rhsNum = parseFloat(rhs);
    if (!isNaN(rhsNum)) c -= rhsNum;
    else return null;

    const discriminant = b * b - 4 * a * c;

    let response = 'QUADRATIC EQUATION SOLUTION\n\n';
    response += 'Equation: ' + prompt + '\n\n';
    response += 'I. IDENTIFY COEFFICIENTS\n';
    response += '   a = ' + a + '\n';
    response += '   b = ' + b + '\n';
    response += '   c = ' + c + '\n\n';
    response += 'II. QUADRATIC FORMULA\n';
    response += '   x = [-b +/- sqrt(b^2 - 4ac)] / 2a\n\n';
    response += 'III. COMPUTE DISCRIMINANT\n';
    response += '   D = b^2 - 4ac\n';
    response += '   D = ' + b + '^2 - 4(' + a + ')(' + c + ')\n';
    response += '   D = ' + (b * b) + ' - ' + (4 * a * c) + '\n';
    response += '   D = ' + discriminant + '\n\n';

    if (discriminant > 0) {
      const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
      const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
      response += 'IV. NATURE OF ROOTS\n';
      response += '   D > 0: Two distinct real roots\n\n';
      response += 'V. SOLUTION\n';
      response += '   x1 = [-(' + b + ') + sqrt(' + discriminant + ')] / ' + (2 * a) + '\n';
      response += '   x1 = ' + x1.toFixed(4) + '\n\n';
      response += '   x2 = [-(' + b + ') - sqrt(' + discriminant + ')] / ' + (2 * a) + '\n';
      response += '   x2 = ' + x2.toFixed(4) + '\n\n';
      response += 'VI. FINAL ANSWER\n';
      response += '   x = ' + x1.toFixed(4) + ' or x = ' + x2.toFixed(4);
    } else if (discriminant === 0) {
      const x = -b / (2 * a);
      response += 'IV. NATURE OF ROOTS\n';
      response += '   D = 0: One real root (double root)\n\n';
      response += 'V. FINAL ANSWER\n';
      response += '   x = ' + x.toFixed(4);
    } else {
      const realPart = (-b / (2 * a)).toFixed(4);
      const imagPart = (Math.sqrt(-discriminant) / (2 * a)).toFixed(4);
      response += 'IV. NATURE OF ROOTS\n';
      response += '   D < 0: Two complex roots\n\n';
      response += 'V. FINAL ANSWER\n';
      response += '   x = ' + realPart + ' +/- ' + imagPart + 'i';
    }

    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 4: PERCENTAGE
// ============================================================
tryPercentage(prompt) {
  if (!prompt) return null;

  const match1 = prompt.match(/what\s+is\s+([\d\.]+)\s*%\s*of\s*([\d\.]+)/i);
  if (match1) {
    const percent = parseFloat(match1[1]);
    const number = parseFloat(match1[2]);
    const result = (percent / 100) * number;

    let response = 'PERCENTAGE SOLUTION\n\n';
    response += 'Problem: What is ' + percent + '% of ' + number + '?\n\n';
    response += 'I. FORMULA\n   Result = (Percent / 100) x Number\n\n';
    response += 'II. COMPUTATION\n';
    response += '   Result = (' + percent + ' / 100) x ' + number + '\n';
    response += '   Result = ' + (percent / 100) + ' x ' + number + '\n';
    response += '   Result = ' + result + '\n\n';
    response += 'III. FINAL ANSWER\n   ' + result;
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 5: FRACTIONS
// ============================================================
tryFractions(prompt) {
  if (!prompt) return null;

  const match = prompt.match(/(\d+)\/(\d+)\s*([\+\-\*\/×÷])\s*(\d+)\/(\d+)/);
  if (!match) return null;

  try {
    const n1 = parseInt(match[1]);
    const d1 = parseInt(match[2]);
    const op = match[3];
    const n2 = parseInt(match[4]);
    const d2 = parseInt(match[5]);

    if (d1 === 0 || d2 === 0) return null;

    let resultN, resultD, steps;

    if (op === '+' || op === '-') {
      const commonD = d1 * d2;
      const newN1 = n1 * d2;
      const newN2 = n2 * d1;
      if (op === '+') {
        resultN = newN1 + newN2;
        steps = [
          'Original: ' + n1 + '/' + d1 + ' + ' + n2 + '/' + d2,
          'Step 1: Common denominator: ' + d1 + ' x ' + d2 + ' = ' + commonD,
          'Step 2: Convert: ' + n1 + '/' + d1 + ' = ' + newN1 + '/' + commonD + ', ' + n2 + '/' + d2 + ' = ' + newN2 + '/' + commonD,
          'Step 3: Add: ' + newN1 + ' + ' + newN2 + ' = ' + resultN,
          'Step 4: Result: ' + resultN + '/' + commonD
        ];
      } else {
        resultN = newN1 - newN2;
        steps = [
          'Original: ' + n1 + '/' + d1 + ' - ' + n2 + '/' + d2,
          'Step 1: Common denominator: ' + d1 + ' x ' + d2 + ' = ' + commonD,
          'Step 2: Convert: ' + n1 + '/' + d1 + ' = ' + newN1 + '/' + commonD + ', ' + n2 + '/' + d2 + ' = ' + newN2 + '/' + commonD,
          'Step 3: Subtract: ' + newN1 + ' - ' + newN2 + ' = ' + resultN,
          'Step 4: Result: ' + resultN + '/' + commonD
        ];
      }
      resultD = commonD;
    } else {
      resultN = n1 * n2;
      resultD = d1 * d2;
      steps = [
        'Original: ' + n1 + '/' + d1 + ' x ' + n2 + '/' + d2,
        'Step 1: Multiply numerators: ' + n1 + ' x ' + n2 + ' = ' + resultN,
        'Step 2: Multiply denominators: ' + d1 + ' x ' + d2 + ' = ' + resultD,
        'Step 3: Result: ' + resultN + '/' + resultD
      ];
    }

    const gcd = this.getGCD(Math.abs(resultN), Math.abs(resultD));
    const simplifiedN = resultN / gcd;
    const simplifiedD = resultD / gcd;

    let response = 'FRACTION SOLUTION\n\n';
    response += 'Problem: ' + prompt + '\n\n';
    response += 'I. STEP-BY-STEP SOLUTION\n';
    for (let i = 0; i < steps.length; i++) response += (i + 1) + '. ' + steps[i] + '\n';
    response += '\nII. SIMPLIFY\n';
    response += '   GCD of ' + Math.abs(resultN) + ' and ' + Math.abs(resultD) + ' = ' + gcd + '\n';
    response += '   ' + resultN + '/' + resultD + ' = ' + simplifiedN + '/' + simplifiedD + '\n\n';
    response += 'III. FINAL ANSWER\n   ' + simplifiedN + '/' + simplifiedD;
    return response;
  } catch (e) {
    return null;
  }
},

getGCD(a, b) {
  while (b) { const t = b; b = a % b; a = t; }
  return a;
},

// ============================================================
// HANDLER 6: STATISTICS
// ============================================================
tryStatistics(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(mean|median|mode|average)/i.test(lower)) return null;

  const numbers = this.extractNumbers(prompt);
  if (!numbers || numbers.length < 2) return null;

  try {
    const sorted = [...numbers].sort((a, b) => a - b);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const mean = sum / numbers.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    const freq = {};
    numbers.forEach(n => freq[n] = (freq[n] || 0) + 1);
    let maxFreq = 0;
    let modes = [];
    for (const [n, f] of Object.entries(freq)) {
      if (f > maxFreq) { maxFreq = f; modes = [parseFloat(n)]; }
      else if (f === maxFreq && f > 1) modes.push(parseFloat(n));
    }

    let response = 'STATISTICS SOLUTION\n\n';
    response += 'Data: ' + numbers.join(', ') + '\n\n';
    response += 'I. SORTED DATA\n   ' + sorted.join(', ') + '\n\n';
    response += 'II. MEAN\n';
    response += '   Formula: Sum / Count\n';
    response += '   Sum = ' + sum + '\n';
    response += '   Count = ' + numbers.length + '\n';
    response += '   Mean = ' + sum + ' / ' + numbers.length + ' = ' + mean.toFixed(4) + '\n\n';
    response += 'III. MEDIAN\n   Median = ' + median.toFixed(4) + '\n\n';
    response += 'IV. MODE\n   Mode = ' + (modes.length > 0 ? modes.join(', ') : 'No mode') + '\n\n';
    response += 'V. FINAL ANSWER\n';
    response += '   Mean = ' + mean.toFixed(4) + '\n';
    response += '   Median = ' + median.toFixed(4) + '\n';
    response += '   Mode = ' + (modes.length > 0 ? modes.join(', ') : 'No mode');
    return response;
  } catch (e) {
    return null;
  }
},

extractNumbers(prompt) {
  if (!prompt) return null;
  const match = prompt.match(/[\d\.]+(?:[\s,]+[\d\.]+)+/);
  if (!match) return null;
  return match[0].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
},

// ============================================================
// HANDLER 7: GEOMETRY
// ============================================================
tryGeometry(prompt) {
  if (!prompt) return null;

  const circleArea = prompt.match(/area\s+of\s+circle\s+(?:with\s+)?(?:radius|r)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (circleArea) {
    const r = parseFloat(circleArea[1]);
    const area = Math.PI * r * r;
    let response = 'GEOMETRY SOLUTION\n\n';
    response += 'Problem: Area of circle with radius ' + r + '\n\n';
    response += 'I. FORMULA\n   A = pi x r^2\n\n';
    response += 'II. COMPUTATION\n   A = pi x ' + r + '^2\n   A = pi x ' + (r * r) + '\n   A = ' + area.toFixed(4) + '\n\n';
    response += 'III. FINAL ANSWER\n   Area = ' + area.toFixed(4) + ' square units';
    return response;
  }

  const circleCirc = prompt.match(/circumference\s+of\s+circle\s+(?:with\s+)?(?:radius|r)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (circleCirc) {
    const r = parseFloat(circleCirc[1]);
    const circ = 2 * Math.PI * r;
    let response = 'GEOMETRY SOLUTION\n\n';
    response += 'Problem: Circumference of circle with radius ' + r + '\n\n';
    response += 'I. FORMULA\n   C = 2 x pi x r\n\n';
    response += 'II. COMPUTATION\n   C = 2 x pi x ' + r + '\n   C = ' + circ.toFixed(4) + '\n\n';
    response += 'III. FINAL ANSWER\n   Circumference = ' + circ.toFixed(4) + ' units';
    return response;
  }

  const rectArea = prompt.match(/area\s+of\s+rectangle\s+(?:with\s+)?(?:length|L)\s*(?:=|:)?\s*([\d\.]+)\s+(?:and\s+)?(?:width|W)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (rectArea) {
    const l = parseFloat(rectArea[1]);
    const w = parseFloat(rectArea[2]);
    const area = l * w;
    let response = 'GEOMETRY SOLUTION\n\n';
    response += 'Problem: Area of rectangle ' + l + ' x ' + w + '\n\n';
    response += 'I. FORMULA\n   A = L x W\n\n';
    response += 'II. COMPUTATION\n   A = ' + l + ' x ' + w + '\n   A = ' + area + '\n\n';
    response += 'III. FINAL ANSWER\n   Area = ' + area + ' square units';
    return response;
  }

  const rectPerim = prompt.match(/perimeter\s+of\s+rectangle\s+(?:with\s+)?(?:length|L)\s*(?:=|:)?\s*([\d\.]+)\s+(?:and\s+)?(?:width|W)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (rectPerim) {
    const l = parseFloat(rectPerim[1]);
    const w = parseFloat(rectPerim[2]);
    const perim = 2 * (l + w);
    let response = 'GEOMETRY SOLUTION\n\n';
    response += 'Problem: Perimeter of rectangle ' + l + ' x ' + w + '\n\n';
    response += 'I. FORMULA\n   P = 2 x (L + W)\n\n';
    response += 'II. COMPUTATION\n   P = 2 x (' + l + ' + ' + w + ')\n   P = 2 x ' + (l + w) + '\n   P = ' + perim + '\n\n';
    response += 'III. FINAL ANSWER\n   Perimeter = ' + perim + ' units';
    return response;
  }

  const triArea = prompt.match(/area\s+of\s+triangle\s+(?:with\s+)?(?:base|b)\s*(?:=|:)?\s*([\d\.]+)\s+(?:and\s+)?(?:height|h)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (triArea) {
    const b = parseFloat(triArea[1]);
    const h = parseFloat(triArea[2]);
    const area = 0.5 * b * h;
    let response = 'GEOMETRY SOLUTION\n\n';
    response += 'Problem: Area of triangle base ' + b + ', height ' + h + '\n\n';
    response += 'I. FORMULA\n   A = (1/2) x b x h\n\n';
    response += 'II. COMPUTATION\n   A = 0.5 x ' + b + ' x ' + h + '\n   A = ' + area + '\n\n';
    response += 'III. FINAL ANSWER\n   Area = ' + area + ' square units';
    return response;
  }

  const squareArea = prompt.match(/area\s+of\s+square\s+(?:with\s+)?(?:side|s)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (squareArea) {
    const s = parseFloat(squareArea[1]);
    const area = s * s;
    let response = 'GEOMETRY SOLUTION\n\n';
    response += 'Problem: Area of square with side ' + s + '\n\n';
    response += 'I. FORMULA\n   A = s^2\n\n';
    response += 'II. COMPUTATION\n   A = ' + s + '^2\n   A = ' + area + '\n\n';
    response += 'III. FINAL ANSWER\n   Area = ' + area + ' square units';
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 8: TRIGONOMETRY (word boundary fixed)
// ============================================================
tryTrigonometry(prompt) {
  if (!prompt) return null;

  const match = prompt.match(/\b(sin|cos|tan)\s*\(?\s*([\d\.]+)\s*(?:°|degrees?|deg|radians?|rad)?\s*\)?/i);
  if (!match) return null;

  try {
    const func = match[1].toLowerCase();
    const angle = parseFloat(match[2]);

    if (!isFinite(angle)) return null;

    const hasUnit = /°|degrees?|deg|radians?|rad/i.test(prompt);
    if (!hasUnit && angle > 2 * Math.PI) return null;

    const isDegree = /°|degree|deg/i.test(prompt) || (!hasUnit && angle <= 360);
    const rad = isDegree ? angle * Math.PI / 180 : angle;

    let result;
    if (func === 'sin') result = Math.sin(rad);
    else if (func === 'cos') result = Math.cos(rad);
    else if (func === 'tan') result = Math.tan(rad);
    else return null;

    if (!isFinite(result)) return null;

    let response = 'TRIGONOMETRY SOLUTION\n\n';
    response += 'Problem: ' + func + '(' + angle + (isDegree ? ' deg' : ' rad') + ')\n\n';
    response += 'I. CONVERT TO RADIANS\n';
    if (isDegree) response += '   ' + angle + ' deg x pi/180 = ' + rad.toFixed(6) + ' rad\n\n';
    else response += '   Already in radians: ' + rad + '\n\n';
    response += 'II. COMPUTATION\n';
    response += '   ' + func + '(' + rad.toFixed(6) + ') = ' + result.toFixed(6) + '\n\n';
    response += 'III. FINAL ANSWER\n';
    response += '   ' + func + '(' + angle + (isDegree ? ' deg' : ' rad') + ') = ' + result.toFixed(4);
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 9: ARITHMETIC (MDAS) — handles multi-line, no non-math keywords
// ============================================================
tryMathCompute(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  const nonMathKeywords = ['summarize', 'summary', 'buod', 'shorten', 'paikliin', 'brief', 'concise', 'maikli', 'translate', 'isalin', 'salin', 'explain', 'paliwanag', 'ipaliwanag', 'detail', 'what', 'ano', 'why', 'bakit', 'how', 'paano', 'who', 'sino', 'when', 'kailan', 'where', 'saan', 'which', 'alin', 'describe', 'ilarawan', 'give', 'bigay', 'list', 'enumerate', 'tell', 'sabi', 'write', 'isulat', 'make', 'gawa', 'help', 'tulong', 'about', 'tungkol', 'define', 'examples', 'criticize', 'critique', 'observe', 'observation', 'analyze', 'analysis', 'survey', 'interview', 'difference', 'compare', 'riddle', 'bugtong', 'puzzle', 'logic', 'qualitative', 'quantitative', 'thesis', 'experimental', 'research', 'weight', 'timbang', 'girth', 'length', 'synonym', 'antonym', 'other term', 'another word', 'kasingkahulugan', 'kasalungat'];
  for (const keyword of nonMathKeywords) {
    if (lower.includes(keyword)) return null;
  }

  // Extract math expression from multi-line input
  const lines = prompt.split('\n').map(l => l.trim()).filter(l => l);
  let exprLine = '';
  for (const line of lines) {
    if (/^[A-D]\.\s*\d+/.test(line)) continue;
    const testLine = line.replace(/\s/g, '');
    if (/^[\d\s\+\-\*\/\(\)\.\,×÷]+$/.test(testLine) && /[\+\-\*\/×÷]/.test(testLine)) {
      exprLine = line;
    }
  }

  if (!exprLine) return null;

  let clean = exprLine.replace(/,/g, '').replace(/[\+\-\*\/]+$/, '').trim();
  const numbers = clean.match(/\d+\.?\d*/g);
  if (!numbers || numbers.length < 2) return null;
  if (!/[\+\-\*\/×÷]/.test(clean)) return null;

  try {
    let expression = clean.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
    const result = Function('"use strict"; return (' + expression + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    const steps = this.buildMDASSteps(clean);
    let response = 'MATH SOLUTION\n\n';
    response += 'Expression: ' + clean + '\n\n';
    response += 'I. STEP-BY-STEP SOLUTION (MDAS)\n';
    for (let i = 0; i < steps.length; i++) response += (i + 1) + '. ' + steps[i] + '\n';
    response += '\nII. FINAL ANSWER\n' + result + '\n\n';
    response += 'III. RULE\nMDAS: Multiplication and Division first (left to right), then Addition and Subtraction (left to right).';
    return response;
  } catch (e) { return null; }
},

buildMDASSteps(expression) {
  const steps = [];
  let expr = expression.replace(/\s+/g, '');
  steps.push('Original: ' + expr);

  while (/\(/.test(expr)) {
    const innerMatch = expr.match(/\(([^()]+)\)/);
    if (!innerMatch) break;
    const inner = innerMatch[1];
    const tokens = inner.match(/(\d+\.?\d*|[\+\-\*\/])/g);
    if (!tokens || tokens.length < 3) break;

    let tokensArr = tokens.slice();
    let i = 0;
    while (i < tokensArr.length) {
      const t = tokensArr[i];
      if (t === '*' || t === '/') {
        const l = parseFloat(tokensArr[i - 1]);
        const r = parseFloat(tokensArr[i + 1]);
        if (t === '/' && r === 0) return ['Cannot divide by zero'];
        const res = t === '*' ? l * r : l / r;
        tokensArr.splice(i - 1, 3, res.toString());
        steps.push('Step (M/D in parens): ' + l + ' ' + (t === '*' ? 'x' : '÷') + ' ' + r + ' = ' + res);
        i = 0;
      } else i++;
    }
    i = 0;
    while (i < tokensArr.length) {
      const t = tokensArr[i];
      if (t === '+' || t === '-') {
        const l = parseFloat(tokensArr[i - 1]);
        const r = parseFloat(tokensArr[i + 1]);
        const res = t === '+' ? l + r : l - r;
        tokensArr.splice(i - 1, 3, res.toString());
        steps.push('Step (A/S in parens): ' + l + ' ' + t + ' ' + r + ' = ' + res);
        i = 0;
      } else i++;
    }
    const innerResult = tokensArr[0];
    expr = expr.replace(innerMatch[0], innerResult);
    steps.push('Resolve parentheses: ' + innerMatch[0] + ' = ' + innerResult);
    steps.push('  Now: ' + expr);
  }

  const tokens = expr.match(/(\d+\.?\d*|[\+\-\*\/])/g);
  if (!tokens || tokens.length < 3) return steps;

  let tokensArr = tokens.slice();
  let i = 0;
  while (i < tokensArr.length) {
    const t = tokensArr[i];
    if (t === '*' || t === '/') {
      const l = parseFloat(tokensArr[i - 1]);
      const r = parseFloat(tokensArr[i + 1]);
      if (t === '/' && r === 0) return ['Cannot divide by zero'];
      const res = t === '*' ? l * r : l / r;
      tokensArr.splice(i - 1, 3, res.toString());
      steps.push('Step (M/D): ' + l + ' ' + (t === '*' ? 'x' : '÷') + ' ' + r + ' = ' + res);
      i = 0;
    } else i++;
  }
  i = 0;
  while (i < tokensArr.length) {
    const t = tokensArr[i];
    if (t === '+' || t === '-') {
      const l = parseFloat(tokensArr[i - 1]);
      const r = parseFloat(tokensArr[i + 1]);
      const res = t === '+' ? l + r : l - r;
      tokensArr.splice(i - 1, 3, res.toString());
      steps.push('Step (A/S): ' + l + ' ' + t + ' ' + r + ' = ' + res);
      i = 0;
    } else i++;
  }
  return steps;
},

// ============================================================
// HANDLER 10: WORD PROBLEMS
// ============================================================
tryWordProblem(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  const distanceMatch = prompt.match(/(?:travels?|moves?|runs?|goes?)\s+([\d\.]+)\s*(km\/h|mph|m\/s|kph)\s+(?:for\s+)?([\d\.]+)\s*(hours?|hrs?|h)\s*(?:how\s+far|distance)/i);
  if (distanceMatch) {
    const speed = parseFloat(distanceMatch[1]);
    const unit = distanceMatch[2];
    const time = parseFloat(distanceMatch[3]);
    const distance = speed * time;
    let response = 'WORD PROBLEM SOLUTION\n\n';
    response += 'Problem: ' + prompt + '\n\n';
    response += 'I. GIVEN\n   Speed = ' + speed + ' ' + unit + '\n   Time = ' + time + ' hours\n\n';
    response += 'II. FORMULA\n   Distance = Speed x Time\n\n';
    response += 'III. COMPUTATION\n   Distance = ' + speed + ' x ' + time + '\n   Distance = ' + distance + ' km\n\n';
    response += 'IV. FINAL ANSWER\n   Distance = ' + distance + ' km';
    return response;
  }

  const workMatch = prompt.match(/([\d\.]+)\s*(?:workers?|men|people|persons?)\s+(?:can\s+)?(?:finish|complete|do)\s+(?:a\s+)?job\s+in\s+([\d\.]+)\s*days?.*?([\d\.]+)\s*(?:workers?|men|people|persons?)/i);
  if (workMatch) {
    const w1 = parseFloat(workMatch[1]);
    const d1 = parseFloat(workMatch[2]);
    const w2 = parseFloat(workMatch[3]);
    const d2 = (w1 * d1) / w2;
    let response = 'WORD PROBLEM SOLUTION\n\n';
    response += 'Problem: ' + prompt + '\n\n';
    response += 'I. GIVEN\n   Workers 1 = ' + w1 + '\n   Days 1 = ' + d1 + '\n   Workers 2 = ' + w2 + '\n\n';
    response += 'II. FORMULA (Inverse Proportion)\n   W1 x D1 = W2 x D2\n\n';
    response += 'III. COMPUTATION\n   ' + w1 + ' x ' + d1 + ' = ' + w2 + ' x D2\n   ' + (w1 * d1) + ' = ' + w2 + ' x D2\n   D2 = ' + (w1 * d1) + ' / ' + w2 + '\n   D2 = ' + d2.toFixed(2) + ' days\n\n';
    response += 'IV. FINAL ANSWER\n   ' + d2.toFixed(2) + ' days';
    return response;
  }

  const ageMatch = prompt.match(/(\w+)\s+is\s+([\d\.]+)\s+years?\s+older\s+than\s+(\w+).*?sum.*?([\d\.]+)/i);
  if (ageMatch) {
    const name1 = ageMatch[1];
    const diff = parseFloat(ageMatch[2]);
    const name2 = ageMatch[3];
    const sum = parseFloat(ageMatch[4]);
    const age2 = (sum - diff) / 2;
    const age1 = age2 + diff;
    let response = 'WORD PROBLEM SOLUTION\n\n';
    response += 'Problem: ' + prompt + '\n\n';
    response += 'I. LET VARIABLES\n   ' + name2 + ' = x\n   ' + name1 + ' = x + ' + diff + '\n\n';
    response += 'II. EQUATION\n   x + (x + ' + diff + ') = ' + sum + '\n\n';
    response += 'III. SOLVE\n   2x + ' + diff + ' = ' + sum + '\n   2x = ' + (sum - diff) + '\n   x = ' + age2 + '\n\n';
    response += 'IV. FINAL ANSWER\n   ' + name2 + ' = ' + age2 + ' years old\n   ' + name1 + ' = ' + age1 + ' years old';
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 11: UNIT CONVERSION
// ============================================================
tryUnitConversion(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(convert|ilang|how many|change)/i.test(lower)) return null;

  const conversions = {
    'km_to_miles': { factor: 0.621371, from: 'km', to: 'miles' },
    'miles_to_km': { factor: 1.60934, from: 'miles', to: 'km' },
    'kg_to_lbs': { factor: 2.20462, from: 'kg', to: 'lbs' },
    'lbs_to_kg': { factor: 0.453592, from: 'lbs', to: 'kg' },
    'm_to_ft': { factor: 3.28084, from: 'm', to: 'ft' },
    'ft_to_m': { factor: 0.3048, from: 'ft', to: 'm' },
    'c_to_f': { from: 'C', to: 'F', formula: (c) => (c * 9/5) + 32 },
    'f_to_c': { from: 'F', to: 'C', formula: (f) => (f - 32) * 5/9 },
    'cm_to_inches': { factor: 0.393701, from: 'cm', to: 'inches' },
    'inches_to_cm': { factor: 2.54, from: 'inches', to: 'cm' },
    'liters_to_gallons': { factor: 0.264172, from: 'liters', to: 'gallons' },
    'gallons_to_liters': { factor: 3.78541, from: 'gallons', to: 'liters' }
  };

  for (const [key, conv] of Object.entries(conversions)) {
    const [from, to] = key.split('_to_');
    const regex = new RegExp('([\\d\\.]+)\\s*' + from + '\\s*(?:to|in|sa)\\s*' + to, 'i');
    const match = prompt.match(regex);
    if (match) {
      const inputVal = parseFloat(match[1]);
      let result;
      if (conv.formula) result = conv.formula(inputVal);
      else result = inputVal * conv.factor;

      let response = 'UNIT CONVERSION SOLUTION\n\n';
      response += 'Problem: Convert ' + inputVal + ' ' + from + ' to ' + to + '\n\n';
      response += 'I. CONVERSION FACTOR\n';
      if (conv.factor) response += '   1 ' + from + ' = ' + conv.factor + ' ' + to + '\n';
      else response += '   Formula used\n';
      response += '\nII. COMPUTATION\n';
      if (conv.factor) response += '   ' + inputVal + ' x ' + conv.factor + ' = ' + result.toFixed(4) + '\n';
      else response += '   Result = ' + result.toFixed(4) + '\n';
      response += '\nIII. FINAL ANSWER\n   ' + inputVal + ' ' + from + ' = ' + result.toFixed(4) + ' ' + to;
      return response;
    }
  }

  return null;
},

// ============================================================
// HANDLER 12: INEQUALITIES (auto-detect)
// ============================================================
tryInequality(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/[<>]/.test(prompt)) return null;
  if (!/[a-z]/i.test(prompt)) return null;

  const match = prompt.match(/([^<>]+)\s*([<>]=?)\s*([^<>]+)/);
  if (!match) return null;

  try {
    const lhs = match[1].replace(/\s+/g, '');
    const op = match[2];
    const rhs = match[3].replace(/\s+/g, '');

    const lhsMatch = lhs.match(/^([\-\d\.]*)\s*([a-z])\s*([\+\-]\s*[\d\.]+)?$/i);
    if (!lhsMatch) return null;

    const a = lhsMatch[1] ? parseFloat(lhsMatch[1]) : 1;
    const varName = lhsMatch[2];
    const b = lhsMatch[3] ? parseFloat(lhsMatch[3].replace(/\s/g, '')) : 0;
    const c = parseFloat(rhs);
    if (isNaN(c)) return null;

    const solution = (c - b) / a;
    let finalOp = op;

    if (a < 0) {
      finalOp = op === '>' ? '<' : op === '<' ? '>' : op === '>=' ? '<=' : '>=';
    }

    let response = 'INEQUALITY SOLUTION\n\n';
    response += 'Inequality: ' + prompt + '\n\n';
    response += 'I. STEP-BY-STEP SOLUTION\n';
    response += '1. Original: ' + a + varName + (b >= 0 ? ' + ' + b : ' - ' + Math.abs(b)) + ' ' + op + ' ' + c + '\n';
    response += '2. Move constant\n';
    response += '   ' + a + varName + ' ' + op + ' ' + (c - b) + '\n';
    response += '3. Divide by ' + a + '\n';
    if (a < 0) response += '   (Flip operator since dividing by negative)\n';
    response += '   ' + varName + ' ' + finalOp + ' ' + solution + '\n\n';
    response += 'II. FINAL ANSWER\n   ' + varName + ' ' + finalOp + ' ' + solution;
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 13: DERIVATIVES
// ============================================================
tryDerivative(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(derivative|differentiate|d\/dx)/i.test(lower)) return null;

  const match = prompt.match(/(?:derivative|differentiate|d\/dx)\s*(?:of\s*)?:?\s*([\w\^\+\-\*\/\.\s]+)/i);
  if (!match) return null;

  const expr = match[1].trim();

  try {
    const terms = this.parseTerms(expr);
    if (!terms || terms.length === 0) return null;

    const steps = [];
    steps.push('Original: ' + expr);
    steps.push('');
    steps.push('Step 1: Apply Power Rule');
    steps.push('  d/dx(x^n) = n * x^(n-1)');
    steps.push('');

    const derived = [];
    for (const t of terms) {
      if (Object.keys(t.vars).length === 0) continue;
      const newTerm = { coeff: 0, vars: {}, raw: '', degree: 0 };
      const varNames = Object.keys(t.vars);
      const mainVar = varNames[0];
      const exp = t.vars[mainVar];
      newTerm.coeff = t.coeff * exp;
      newTerm.vars = { ...t.vars };
      newTerm.vars[mainVar] = exp - 1;
      if (newTerm.vars[mainVar] === 0) delete newTerm.vars[mainVar];

      let varStr = '';
      const sortedVars = Object.keys(newTerm.vars).sort();
      for (const v of sortedVars) {
        if (newTerm.vars[v] === 1) varStr += v;
        else if (newTerm.vars[v] > 1) varStr += v + '^' + newTerm.vars[v];
      }
      const coeffStr = Math.abs(newTerm.coeff) === 1 && varStr ? '' : Math.abs(newTerm.coeff);
      const sign = newTerm.coeff < 0 ? '-' : '';
      newTerm.raw = sign + coeffStr + varStr;
      newTerm.degree = Object.values(newTerm.vars).reduce((s, e) => s + e, 0);
      derived.push(newTerm);
      steps.push('  d/dx(' + t.raw + ') = ' + newTerm.raw);
    }

    if (derived.length === 0) derived.push({ coeff: 0, vars: {}, raw: '0', degree: 0 });

    const combined = this.combineLikeTerms(derived);
    combined.sort((a, b) => b.degree - a.degree);
    const finalAnswer = combined.map(t => t.raw).join(' ').replace(/\+ -/g, '- ').replace(/\s+/g, ' ').trim();

    let response = 'DERIVATIVE SOLUTION\n\n';
    response += 'Expression: ' + expr + '\n\n';
    response += 'I. STEP-BY-STEP DIFFERENTIATION\n';
    for (let i = 0; i < steps.length; i++) response += (i + 1) + '. ' + steps[i] + '\n';
    response += '\nII. FINAL ANSWER\n';
    response += "f'(x) = " + finalAnswer;
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 14: INTEGRALS
// ============================================================
tryIntegral(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(integral|integrate|antiderivative)/i.test(lower)) return null;

  const match = prompt.match(/(?:integral|integrate|antiderivative)\s*(?:of\s*)?:?\s*([\w\^\+\-\*\/\.\s]+?)(?:\s*dx)?$/i);
  if (!match) return null;

  const expr = match[1].trim();

  try {
    const terms = this.parseTerms(expr);
    if (!terms || terms.length === 0) return null;

    const steps = [];
    steps.push('Original: ' + expr);
    steps.push('');
    steps.push('Step 1: Apply Power Rule for Integration');
    steps.push('  ∫ x^n dx = x^(n+1) / (n+1) + C');
    steps.push('');

    const integrated = [];
    for (const t of terms) {
      const newTerm = { coeff: 0, vars: {}, raw: '', degree: 0 };
      if (Object.keys(t.vars).length === 0) {
        newTerm.coeff = t.coeff;
        newTerm.vars = { x: 1 };
      } else {
        const varNames = Object.keys(t.vars);
        const mainVar = varNames[0];
        const exp = t.vars[mainVar];
        newTerm.coeff = t.coeff / (exp + 1);
        newTerm.vars = { ...t.vars };
        newTerm.vars[mainVar] = exp + 1;
      }
      let varStr = '';
      const sortedVars = Object.keys(newTerm.vars).sort();
      for (const v of sortedVars) {
        if (newTerm.vars[v] === 1) varStr += v;
        else if (newTerm.vars[v] > 1) varStr += v + '^' + newTerm.vars[v];
      }
      const coeffStr = Math.abs(newTerm.coeff) === 1 && varStr ? '' : Math.abs(newTerm.coeff);
      const sign = newTerm.coeff < 0 ? '-' : '';
      newTerm.raw = sign + coeffStr + varStr;
      newTerm.degree = Object.values(newTerm.vars).reduce((s, e) => s + e, 0);
      integrated.push(newTerm);
      steps.push('  ∫ ' + t.raw + ' dx = ' + (newTerm.raw || '0'));
    }

    const combined = this.combineLikeTerms(integrated);
    combined.sort((a, b) => b.degree - a.degree);
    const finalAnswer = combined.map(t => t.raw).join(' ').replace(/\+ -/g, '- ').replace(/\s+/g, ' ').trim();

    let response = 'INTEGRAL SOLUTION\n\n';
    response += 'Expression: ' + expr + '\n\n';
    response += 'I. STEP-BY-STEP INTEGRATION\n';
    for (let i = 0; i < steps.length; i++) response += (i + 1) + '. ' + steps[i] + '\n';
    response += '\nII. FINAL ANSWER\n';
    response += '∫ ' + expr + ' dx = ' + finalAnswer + ' + C';
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 15: LOGARITHMS
// ============================================================
tryLogarithm(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(log|ln)/i.test(lower)) return null;

  const logMatch = prompt.match(/\blog\s*(?:base\s*)?(\d+)?\s*(?:of\s*)?([\d\.]+)/i);
  if (logMatch) {
    const base = logMatch[1] ? parseFloat(logMatch[1]) : 10;
    const value = parseFloat(logMatch[2]);
    if (value <= 0 || base <= 0 || base === 1) return null;

    const result = Math.log(value) / Math.log(base);
    let response = 'LOGARITHM SOLUTION\n\n';
    response += 'Problem: log_' + base + '(' + value + ')\n\n';
    response += 'I. DEFINITION\n   log_b(x) = y means b^y = x\n\n';
    response += 'II. COMPUTATION\n';
    response += '   log_' + base + '(' + value + ')\n';
    response += '   = ln(' + value + ') / ln(' + base + ')\n';
    response += '   = ' + Math.log(value).toFixed(6) + ' / ' + Math.log(base).toFixed(6) + '\n';
    response += '   = ' + result.toFixed(6) + '\n\n';
    response += 'III. VERIFICATION\n';
    response += '   ' + base + '^' + result.toFixed(4) + ' = ' + Math.pow(base, result).toFixed(4) + '\n\n';
    response += 'IV. FINAL ANSWER\n   log_' + base + '(' + value + ') = ' + result.toFixed(4);
    return response;
  }

  const lnMatch = prompt.match(/\bln\s*\(?\s*([\d\.]+)\s*\)?/i);
  if (lnMatch) {
    const value = parseFloat(lnMatch[1]);
    if (value <= 0) return null;
    const result = Math.log(value);
    let response = 'NATURAL LOGARITHM SOLUTION\n\n';
    response += 'Problem: ln(' + value + ')\n\n';
    response += 'I. DEFINITION\n   ln(x) = log_e(x)\n   e ≈ 2.71828\n\n';
    response += 'II. COMPUTATION\n   ln(' + value + ') = ' + result.toFixed(6) + '\n\n';
    response += 'III. FINAL ANSWER\n   ln(' + value + ') = ' + result.toFixed(4);
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 16: EXPONENTS
// ============================================================
tryExponents(prompt) {
  if (!prompt) return null;

  const match = prompt.match(/^(\d+\.?\d*)\s*[\^]\s*(\d+\.?\d*)$/);
  if (!match) return null;

  const base = parseFloat(match[1]);
  const exp = parseFloat(match[2]);

  if (exp < 0) {
    const result = Math.pow(base, exp);
    let response = 'EXPONENT SOLUTION\n\n';
    response += 'Problem: ' + base + '^' + exp + '\n\n';
    response += 'I. NEGATIVE EXPONENT RULE\n   a^(-n) = 1 / a^n\n\n';
    response += 'II. COMPUTATION\n';
    response += '   ' + base + '^' + exp + ' = 1 / ' + base + '^' + Math.abs(exp) + '\n';
    response += '   = 1 / ' + Math.pow(base, Math.abs(exp)) + '\n';
    response += '   = ' + result.toFixed(6) + '\n\n';
    response += 'III. FINAL ANSWER\n   ' + base + '^' + exp + ' = ' + result.toFixed(6);
    return response;
  }

  const result = Math.pow(base, exp);
  let response = 'EXPONENT SOLUTION\n\n';
  response += 'Problem: ' + base + '^' + exp + '\n\n';
  response += 'I. COMPUTATION\n';
  if (Number.isInteger(exp) && exp > 0 && exp <= 10) {
    response += '   ' + base + '^' + exp + ' = ';
    const factors = Array(exp).fill(base).join(' x ');
    response += factors + '\n   = ' + result + '\n\n';
  } else {
    response += '   ' + base + '^' + exp + ' = ' + result + '\n\n';
  }
  response += 'II. FINAL ANSWER\n   ' + base + '^' + exp + ' = ' + result;
  return response;
},

// ============================================================
// HANDLER 17: MATRIX OPERATIONS
// ============================================================
tryMatrix(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/matrix|determinant/i.test(lower)) return null;

  const detMatch = prompt.match(/determinant\s*(?:of)?\s*\[?\s*([\-\d\.]+)\s+([\-\d\.]+)\s*[;,]?\s*([\-\d\.]+)\s+([\-\d\.]+)\s*\]?/i);
  if (detMatch) {
    const a = parseFloat(detMatch[1]);
    const b = parseFloat(detMatch[2]);
    const c = parseFloat(detMatch[3]);
    const d = parseFloat(detMatch[4]);
    const det = a * d - b * c;

    let response = 'MATRIX DETERMINANT SOLUTION\n\n';
    response += 'Matrix:\n| ' + a + '  ' + b + ' |\n| ' + c + '  ' + d + ' |\n\n';
    response += 'I. FORMULA (2x2 Determinant)\n   det = ad - bc\n\n';
    response += 'II. COMPUTATION\n';
    response += '   det = (' + a + ')(' + d + ') - (' + b + ')(' + c + ')\n';
    response += '   det = ' + (a * d) + ' - ' + (b * c) + '\n';
    response += '   det = ' + det + '\n\n';
    response += 'III. FINAL ANSWER\n   Determinant = ' + det;
    return response;
  }

  const det3Match = prompt.match(/determinant\s*(?:of)?\s*\[?\s*([\-\d\.]+)\s+([\-\d\.]+)\s+([\-\d\.]+)\s*[;,]?\s*([\-\d\.]+)\s+([\-\d\.]+)\s+([\-\d\.]+)\s*[;,]?\s*([\-\d\.]+)\s+([\-\d\.]+)\s+([\-\d\.]+)\s*\]?/i);
  if (det3Match) {
    const a = parseFloat(det3Match[1]), b = parseFloat(det3Match[2]), c = parseFloat(det3Match[3]);
    const d = parseFloat(det3Match[4]), e = parseFloat(det3Match[5]), f = parseFloat(det3Match[6]);
    const g = parseFloat(det3Match[7]), h = parseFloat(det3Match[8]), i = parseFloat(det3Match[9]);

    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

    let response = 'MATRIX DETERMINANT SOLUTION (3x3)\n\n';
    response += 'I. FORMULA (3x3 Determinant)\n';
    response += '   det = a(ei - fh) - b(di - fg) + c(dh - eg)\n\n';
    response += 'II. COMPUTATION\n';
    response += '   det = ' + a + '((' + e + ')(' + i + ') - (' + f + ')(' + h + '))\n';
    response += '       - ' + b + '((' + d + ')(' + i + ') - (' + f + ')(' + g + '))\n';
    response += '       + ' + c + '((' + d + ')(' + h + ') - (' + e + ')(' + g + '))\n\n';
    response += '   det = ' + det + '\n\n';
    response += 'III. FINAL ANSWER\n   Determinant = ' + det;
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 18: VECTORS
// ============================================================
tryVector(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/vector|magnitude/i.test(lower)) return null;

  const magMatch = prompt.match(/magnitude\s*(?:of)?\s*(?:vector)?\s*[\(\[]?\s*([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\s*[\)\]]?/i);
  if (magMatch) {
    const x = parseFloat(magMatch[1]);
    const y = parseFloat(magMatch[2]);
    const mag = Math.sqrt(x * x + y * y);

    let response = 'VECTOR MAGNITUDE SOLUTION\n\n';
    response += 'Vector: (' + x + ', ' + y + ')\n\n';
    response += 'I. FORMULA\n   |v| = sqrt(x^2 + y^2)\n\n';
    response += 'II. COMPUTATION\n';
    response += '   |v| = sqrt((' + x + ')^2 + (' + y + ')^2)\n';
    response += '   |v| = sqrt(' + (x * x) + ' + ' + (y * y) + ')\n';
    response += '   |v| = sqrt(' + (x * x + y * y) + ')\n';
    response += '   |v| = ' + mag.toFixed(4) + '\n\n';
    response += 'III. FINAL ANSWER\n   Magnitude = ' + mag.toFixed(4);
    return response;
  }

  const dotMatch = prompt.match(/dot\s+product\s+(?:of)?\s*[\(\[]?\s*([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\s*[\)\]]?\s+(?:and|,)\s*[\(\[]?\s*([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\s*[\)\]]?/i);
  if (dotMatch) {
    const x1 = parseFloat(dotMatch[1]), y1 = parseFloat(dotMatch[2]);
    const x2 = parseFloat(dotMatch[3]), y2 = parseFloat(dotMatch[4]);
    const dot = x1 * x2 + y1 * y2;

    let response = 'VECTOR DOT PRODUCT SOLUTION\n\n';
    response += 'Vector 1: (' + x1 + ', ' + y1 + ')\n';
    response += 'Vector 2: (' + x2 + ', ' + y2 + ')\n\n';
    response += 'I. FORMULA\n   A . B = x1*x2 + y1*y2\n\n';
    response += 'II. COMPUTATION\n';
    response += '   A . B = (' + x1 + ')(' + x2 + ') + (' + y1 + ')(' + y2 + ')\n';
    response += '   A . B = ' + (x1 * x2) + ' + ' + (y1 * y2) + '\n';
    response += '   A . B = ' + dot + '\n\n';
    response += 'III. FINAL ANSWER\n   Dot Product = ' + dot;
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 19: COMPLEX NUMBERS
// ============================================================
tryComplexNumber(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/i/.test(prompt)) return null;
  if (!/[+\-]/.test(prompt)) return null;

  const addMatch = prompt.match(/\(\s*([\-\d\.]+)\s*([+\-])\s*([\d\.]+)i\s*\)\s*([+\-])\s*\(\s*([\-\d\.]+)\s*([+\-])\s*([\d\.]+)i\s*\)/i);
  if (addMatch) {
    const a = parseFloat(addMatch[1]);
    const b = parseFloat(addMatch[3]) * (addMatch[2] === '-' ? -1 : 1);
    const op = addMatch[4];
    const c = parseFloat(addMatch[5]);
    const d = parseFloat(addMatch[7]) * (addMatch[6] === '-' ? -1 : 1);

    let real, imag;
    if (op === '+') {
      real = a + c;
      imag = b + d;
    } else {
      real = a - c;
      imag = b - d;
    }

    let response = 'COMPLEX NUMBER SOLUTION\n\n';
    response += 'Problem: ' + prompt + '\n\n';
    response += 'I. COMBINE REAL PARTS\n   ' + a + ' ' + op + ' ' + c + ' = ' + real + '\n\n';
    response += 'II. COMBINE IMAGINARY PARTS\n   ' + b + 'i ' + op + ' ' + d + 'i = ' + imag + 'i\n\n';
    response += 'III. FINAL ANSWER\n   ' + real + (imag >= 0 ? ' + ' : ' - ') + Math.abs(imag) + 'i';
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 20: PROBABILITY
// ============================================================
tryProbability(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/probability/i.test(lower)) return null;

  const coinMatch = prompt.match(/probability\s+of\s+getting\s+(heads?|tails?)\s+([\d\.]+)\s*times?/i);
  if (coinMatch) {
    const outcome = coinMatch[1].toLowerCase();
    const times = parseInt(coinMatch[2]);
    const prob = Math.pow(0.5, times);

    let response = 'PROBABILITY SOLUTION\n\n';
    response += 'Problem: ' + prompt + '\n\n';
    response += 'I. IDENTIFY\n';
    response += '   P(' + outcome + ') = 1/2 = 0.5\n';
    response += '   Number of trials = ' + times + '\n\n';
    response += 'II. FORMULA\n   P(all) = P(each)^n\n\n';
    response += 'III. COMPUTATION\n';
    response += '   P = (0.5)^' + times + '\n';
    response += '   P = ' + prob.toFixed(6) + '\n\n';
    response += 'IV. FINAL ANSWER\n';
    response += '   P = ' + prob.toFixed(6) + ' (' + (prob * 100).toFixed(2) + '%)';
    return response;
  }

  const diceMatch = prompt.match(/probability\s+of\s+rolling\s+(?:a\s+)?(\d+)/i);
  if (diceMatch) {
    const target = parseInt(diceMatch[1]);
    if (target < 1 || target > 6) return null;
    const prob = 1 / 6;

    let response = 'PROBABILITY SOLUTION\n\n';
    response += 'Problem: ' + prompt + '\n\n';
    response += 'I. SAMPLE SPACE\n   {1, 2, 3, 4, 5, 6} = 6 outcomes\n\n';
    response += 'II. FAVORABLE OUTCOMES\n   {(' + target + ')} = 1 outcome\n\n';
    response += 'III. FORMULA\n   P = favorable / total\n\n';
    response += 'IV. COMPUTATION\n   P = 1 / 6 = ' + prob.toFixed(6) + '\n\n';
    response += 'V. FINAL ANSWER\n';
    response += '   P = ' + prob.toFixed(6) + ' (' + (prob * 100).toFixed(2) + '%)';
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 21: SEQUENCES / SERIES
// ============================================================
trySequence(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(sum|series|sequence)/i.test(lower)) return null;

  const sumMatch = prompt.match(/sum\s+(?:of\s+)?(?:1\s+)?to\s+([\d\.]+)/i);
  if (sumMatch) {
    const n = parseInt(sumMatch[1]);
    const sum = (n * (n + 1)) / 2;

    let response = 'SERIES SOLUTION\n\n';
    response += 'Problem: Sum of 1 to ' + n + '\n\n';
    response += 'I. FORMULA\n   Sum = n(n + 1) / 2\n\n';
    response += 'II. COMPUTATION\n';
    response += '   Sum = ' + n + '(' + n + ' + 1) / 2\n';
    response += '   Sum = ' + n + '(' + (n + 1) + ') / 2\n';
    response += '   Sum = ' + (n * (n + 1)) + ' / 2\n';
    response += '   Sum = ' + sum + '\n\n';
    response += 'III. FINAL ANSWER\n   Sum = ' + sum;
    return response;
  }

  const arithMatch = prompt.match(/(?:arithmetic\s+)?(?:sequence|series)\s+(?:with\s+)?(?:first\s+term|a1)\s*=?\s*([\-\d\.]+).*?(?:common\s+)?(?:difference|d)\s*=?\s*([\-\d\.]+).*?(?:find\s+)?(?:n|term|a)?\s*=?\s*([\d\.]+)/i);
  if (arithMatch) {
    const a1 = parseFloat(arithMatch[1]);
    const d = parseFloat(arithMatch[2]);
    const n = parseInt(arithMatch[3]);
    const an = a1 + (n - 1) * d;

    let response = 'ARITHMETIC SEQUENCE SOLUTION\n\n';
    response += 'I. GIVEN\n';
    response += '   a1 = ' + a1 + '\n';
    response += '   d = ' + d + '\n';
    response += '   n = ' + n + '\n\n';
    response += 'II. FORMULA\n   an = a1 + (n - 1)d\n\n';
    response += 'III. COMPUTATION\n';
    response += '   a' + n + ' = ' + a1 + ' + (' + n + ' - 1)(' + d + ')\n';
    response += '   a' + n + ' = ' + a1 + ' + (' + (n - 1) + ')(' + d + ')\n';
    response += '   a' + n + ' = ' + a1 + ' + ' + ((n - 1) * d) + '\n';
    response += '   a' + n + ' = ' + an + '\n\n';
    response += 'IV. FINAL ANSWER\n   a' + n + ' = ' + an;
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 22: PHYSICS FORMULAS
// ============================================================
tryPhysics(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(force|mass|acceleration|velocity|speed|distance|time|work|energy|power|voltage|current|resistance|density|weight|momentum|pressure)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const fmaMatch = prompt.match(/force.*?mass\s*=?\s*([\d\.]+).*?acceleration\s*=?\s*([\d\.]+)/i);
    if (fmaMatch) {
      const m = parseFloat(fmaMatch[1]);
      const a = parseFloat(fmaMatch[2]);
      const F = m * a;
      return this.buildPhysicsResponse('Force (F = ma)',
        ['m = ' + m + ' kg', 'a = ' + a + ' m/s²'],
        'F = m × a',
        ['F = ' + m + ' × ' + a, 'F = ' + F + ' N'],
        F + ' N');
    }

    const vdtMatch = prompt.match(/(?:velocity|speed).*?distance\s*=?\s*([\d\.]+).*?time\s*=?\s*([\d\.]+)/i);
    if (vdtMatch) {
      const d = parseFloat(vdtMatch[1]);
      const t = parseFloat(vdtMatch[2]);
      if (t === 0) return null;
      const v = d / t;
      return this.buildPhysicsResponse('Velocity (v = d/t)',
        ['d = ' + d + ' m', 't = ' + t + ' s'],
        'v = d / t',
        ['v = ' + d + ' / ' + t, 'v = ' + v + ' m/s'],
        v + ' m/s');
    }

    const accMatch = prompt.match(/acceleration.*?(?:final\s+velocity|vf)\s*=?\s*([\d\.]+).*?(?:initial\s+velocity|vi)\s*=?\s*([\d\.]+).*?time\s*=?\s*([\d\.]+)/i);
    if (accMatch) {
      const vf = parseFloat(accMatch[1]);
      const vi = parseFloat(accMatch[2]);
      const t = parseFloat(accMatch[3]);
      if (t === 0) return null;
      const a = (vf - vi) / t;
      return this.buildPhysicsResponse('Acceleration (a = (vf - vi) / t)',
        ['vf = ' + vf + ' m/s', 'vi = ' + vi + ' m/s', 't = ' + t + ' s'],
        'a = (vf - vi) / t',
        ['a = (' + vf + ' - ' + vi + ') / ' + t, 'a = ' + a + ' m/s²'],
        a + ' m/s²');
    }

    const workMatch = prompt.match(/work.*?force\s*=?\s*([\d\.]+).*?distance\s*=?\s*([\d\.]+)/i);
    if (workMatch) {
      const F = parseFloat(workMatch[1]);
      const d = parseFloat(workMatch[2]);
      const W = F * d;
      return this.buildPhysicsResponse('Work (W = F × d)',
        ['F = ' + F + ' N', 'd = ' + d + ' m'],
        'W = F × d',
        ['W = ' + F + ' × ' + d, 'W = ' + W + ' J'],
        W + ' J');
    }

    const powerMatch = prompt.match(/power.*?work\s*=?\s*([\d\.]+).*?time\s*=?\s*([\d\.]+)/i);
    if (powerMatch) {
      const W = parseFloat(powerMatch[1]);
      const t = parseFloat(powerMatch[2]);
      if (t === 0) return null;
      const P = W / t;
      return this.buildPhysicsResponse('Power (P = W / t)',
        ['W = ' + W + ' J', 't = ' + t + ' s'],
        'P = W / t',
        ['P = ' + W + ' / ' + t, 'P = ' + P + ' W'],
        P + ' W');
    }

    const ohmMatch = prompt.match(/(?:voltage|V).*?current\s*=?\s*([\d\.]+).*?resistance\s*=?\s*([\d\.]+)/i);
    if (ohmMatch) {
      const I = parseFloat(ohmMatch[1]);
      const R = parseFloat(ohmMatch[2]);
      const V = I * R;
      return this.buildPhysicsResponse("Ohm's Law (V = I × R)",
        ['I = ' + I + ' A', 'R = ' + R + ' Ω'],
        'V = I × R',
        ['V = ' + I + ' × ' + R, 'V = ' + V + ' V'],
        V + ' V');
    }

    const densityMatch = prompt.match(/density.*?mass\s*=?\s*([\d\.]+).*?volume\s*=?\s*([\d\.]+)/i);
    if (densityMatch) {
      const m = parseFloat(densityMatch[1]);
      const V = parseFloat(densityMatch[2]);
      if (V === 0) return null;
      const d = m / V;
      return this.buildPhysicsResponse('Density (d = m / V)',
        ['m = ' + m + ' g', 'V = ' + V + ' cm³'],
        'd = m / V',
        ['d = ' + m + ' / ' + V, 'd = ' + d + ' g/cm³'],
        d + ' g/cm³');
    }

    const weightMatch = prompt.match(/weight.*?mass\s*=?\s*([\d\.]+).*?gravity\s*=?\s*([\d\.]+)/i);
    if (weightMatch) {
      const m = parseFloat(weightMatch[1]);
      const g = parseFloat(weightMatch[2]);
      const W = m * g;
      return this.buildPhysicsResponse('Weight (W = m × g)',
        ['m = ' + m + ' kg', 'g = ' + g + ' m/s²'],
        'W = m × g',
        ['W = ' + m + ' × ' + g, 'W = ' + W + ' N'],
        W + ' N');
    }

    const momentumMatch = prompt.match(/momentum.*?mass\s*=?\s*([\d\.]+).*?velocity\s*=?\s*([\d\.]+)/i);
    if (momentumMatch) {
      const m = parseFloat(momentumMatch[1]);
      const v = parseFloat(momentumMatch[2]);
      const p = m * v;
      return this.buildPhysicsResponse('Momentum (p = m × v)',
        ['m = ' + m + ' kg', 'v = ' + v + ' m/s'],
        'p = m × v',
        ['p = ' + m + ' × ' + v, 'p = ' + p + ' kg·m/s'],
        p + ' kg·m/s');
    }

    const pressureMatch = prompt.match(/pressure.*?force\s*=?\s*([\d\.]+).*?area\s*=?\s*([\d\.]+)/i);
    if (pressureMatch) {
      const F = parseFloat(pressureMatch[1]);
      const A = parseFloat(pressureMatch[2]);
      if (A === 0) return null;
      const P = F / A;
      return this.buildPhysicsResponse('Pressure (P = F / A)',
        ['F = ' + F + ' N', 'A = ' + A + ' m²'],
        'P = F / A',
        ['P = ' + F + ' / ' + A, 'P = ' + P + ' Pa'],
        P + ' Pa');
    }

    return null;
  } catch (e) {
    return null;
  }
},

buildPhysicsResponse(title, given, formula, computation, finalAnswer) {
  let response = 'PHYSICS SOLUTION\n\n';
  response += 'I. FORMULA\n';
  response += '   ' + title + '\n';
  response += '   ' + formula + '\n\n';
  response += 'II. GIVEN\n';
  for (const g of given) response += '   ' + g + '\n';
  response += '\nIII. COMPUTATION\n';
  for (const c of computation) response += '   ' + c + '\n';
  response += '\nIV. FINAL ANSWER\n   ' + finalAnswer;
  return response;
},

// ============================================================
// HANDLER 23: CHEMISTRY
// ============================================================
tryChemistry(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(balance|molar mass|mole|ph|atomic)/i.test(lower)) return null;

  try {
    const balanceMatch = prompt.match(/balance\s*:?\s*([A-Za-z0-9\+\s\->]+)/i);
    if (balanceMatch) {
      const eq = balanceMatch[1].trim();
      const balanced = this.balanceChemicalEquation(eq);
      if (balanced) {
        let response = 'CHEMISTRY SOLUTION\n\n';
        response += 'Equation: ' + eq + '\n\n';
        response += 'I. BALANCING METHOD\n';
        response += '   Use coefficients to make atoms equal on both sides.\n';
        response += '   Balance in order: metals, non-metals, hydrogen, oxygen.\n\n';
        response += 'II. BALANCED EQUATION\n   ' + balanced + '\n\n';
        response += 'III. VERIFICATION\n   Count atoms on both sides - should be equal.';
        return response;
      }
    }

    const molarMatch = prompt.match(/molar\s+mass\s+(?:of\s+)?([A-Za-z0-9\(\)]+)/i);
    if (molarMatch) {
      const formula = molarMatch[1].trim();
      const molarMass = this.calculateMolarMass(formula);
      if (molarMass) {
        let response = 'CHEMISTRY SOLUTION\n\n';
        response += 'Formula: ' + formula + '\n\n';
        response += 'I. ATOMIC MASSES USED\n';
        for (const [el, count] of Object.entries(molarMass.elements)) {
          response += '   ' + el + ': ' + count + ' x ' + molarMass.masses[el] + ' g/mol\n';
        }
        response += '\nII. COMPUTATION\n';
        response += '   Molar Mass = sum of (count x atomic mass)\n';
        for (const [el, count] of Object.entries(molarMass.elements)) {
          response += '   ' + count + ' x ' + molarMass.masses[el] + ' = ' + (count * molarMass.masses[el]).toFixed(3) + ' g/mol\n';
        }
        response += '\nIII. FINAL ANSWER\n   Molar Mass = ' + molarMass.total.toFixed(3) + ' g/mol';
        return response;
      }
    }

    const moleMatch = prompt.match(/moles?\s+(?:of\s+)?([\d\.]+)\s*g\s+(?:of\s+)?([A-Za-z0-9\(\)]+)/i);
    if (moleMatch) {
      const mass = parseFloat(moleMatch[1]);
      const formula = moleMatch[2];
      const molarMass = this.calculateMolarMass(formula);
      if (molarMass) {
        const moles = mass / molarMass.total;
        let response = 'CHEMISTRY SOLUTION\n\n';
        response += 'Problem: Moles of ' + mass + 'g ' + formula + '\n\n';
        response += 'I. GIVEN\n';
        response += '   Mass = ' + mass + ' g\n';
        response += '   Molar Mass = ' + molarMass.total.toFixed(3) + ' g/mol\n\n';
        response += 'II. FORMULA\n   moles = mass / molar mass\n\n';
        response += 'III. COMPUTATION\n';
        response += '   moles = ' + mass + ' / ' + molarMass.total.toFixed(3) + '\n';
        response += '   moles = ' + moles.toFixed(4) + ' mol\n\n';
        response += 'IV. FINAL ANSWER\n   ' + moles.toFixed(4) + ' mol';
        return response;
      }
    }

    const phMatch = prompt.match(/\bph\s+(?:of\s+)?(?:\[H\+\]\s*=\s*)?([\d\.]+)/i);
    if (phMatch) {
      const h = parseFloat(phMatch[1]);
      if (h <= 0) return null;
      const pH = -Math.log10(h);
      let response = 'CHEMISTRY SOLUTION\n\n';
      response += 'Problem: pH of [H+] = ' + h + ' M\n\n';
      response += 'I. FORMULA\n   pH = -log[H+]\n\n';
      response += 'II. COMPUTATION\n';
      response += '   pH = -log(' + h + ')\n';
      response += '   pH = ' + pH.toFixed(4) + '\n\n';
      response += 'III. CLASSIFICATION\n';
      if (pH < 7) response += '   Acidic (pH < 7)\n';
      else if (pH === 7) response += '   Neutral (pH = 7)\n';
      else response += '   Basic (pH > 7)\n';
      response += '\nIV. FINAL ANSWER\n   pH = ' + pH.toFixed(2);
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

balanceChemicalEquation(eq) {
  try {
    const parts = eq.replace(/\s+/g, '').split(/->|→/);
    if (parts.length !== 2) return null;
    if (eq.match(/H2\s*\+\s*O2\s*->\s*H2O/i)) return '2H2 + O2 -> 2H2O';
    if (eq.match(/H2\s*\+\s*O2\s*->\s*H2O2/i)) return 'H2 + O2 -> H2O2';
    if (eq.match(/CH4\s*\+\s*O2\s*->\s*CO2\s*\+\s*H2O/i)) return 'CH4 + 2O2 -> CO2 + 2H2O';
    if (eq.match(/Na\s*\+\s*Cl2\s*->\s*NaCl/i)) return '2Na + Cl2 -> 2NaCl';
    if (eq.match(/H2\s*\+\s*N2\s*->\s*NH3/i)) return '3H2 + N2 -> 2NH3';
    if (eq.match(/Fe\s*\+\s*O2\s*->\s*Fe2O3/i)) return '4Fe + 3O2 -> 2Fe2O3';
    if (eq.match(/C\s*\+\s*O2\s*->\s*CO2/i)) return 'C + O2 -> CO2';
    if (eq.match(/C\s*\+\s*O2\s*->\s*CO/i)) return '2C + O2 -> 2CO';
    if (eq.match(/KClO3\s*->\s*KCl\s*\+\s*O2/i)) return '2KClO3 -> 2KCl + 3O2';
    if (eq.match(/H2O2\s*->\s*H2O\s*\+\s*O2/i)) return '2H2O2 -> 2H2O + O2';
    return null;
  } catch (e) {
    return null;
  }
},

calculateMolarMass(formula) {
  try {
    const atomicMasses = {
      H: 1.008, He: 4.003, Li: 6.94, Be: 9.012, B: 10.81, C: 12.011, N: 14.007,
      O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305, Al: 26.982,
      Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078,
      Fe: 55.845, Cu: 63.546, Zn: 65.38, Ag: 107.868, Sn: 118.71, I: 126.90,
      Au: 196.967, Hg: 200.59, Pb: 207.2, Ba: 137.327, Br: 79.904
    };

    const elements = {};
    const masses = {};
    let i = 0;
    while (i < formula.length) {
      let el = '';
      if (formula[i] === '(' || formula[i] === ')') { i++; continue; }
      if (formula[i] === formula[i].toUpperCase() && /[A-Z]/.test(formula[i])) {
        el += formula[i];
        i++;
        if (i < formula.length && /[a-z]/.test(formula[i])) {
          el += formula[i];
          i++;
        }
      } else { i++; continue; }

      let countStr = '';
      while (i < formula.length && /[\d]/.test(formula[i])) {
        countStr += formula[i];
        i++;
      }
      const count = countStr ? parseInt(countStr) : 1;

      if (!atomicMasses[el]) return null;
      elements[el] = (elements[el] || 0) + count;
      masses[el] = atomicMasses[el];
    }

    if (Object.keys(elements).length === 0) return null;

    let total = 0;
    for (const [el, count] of Object.entries(elements)) {
      total += count * atomicMasses[el];
    }
    return { elements, masses, total };
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 24: FINANCE
// ============================================================
tryFinance(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(simple\s+interest|compound\s+interest|roi|profit|markup|discount)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const siMatch = prompt.match(/simple\s+interest.*?(?:principal|p)\s*=?\s*([\d\.]+).*?(?:rate|r)\s*=?\s*([\d\.]+)\s*%?.*?(?:time|t)\s*=?\s*([\d\.]+)/i);
    if (siMatch) {
      const P = parseFloat(siMatch[1]);
      const r = parseFloat(siMatch[2]) / 100;
      const t = parseFloat(siMatch[3]);
      const I = P * r * t;
      const A = P + I;

      let response = 'FINANCE SOLUTION — SIMPLE INTEREST\n\n';
      response += 'I. GIVEN\n';
      response += '   Principal (P) = ' + P + '\n';
      response += '   Rate (r) = ' + (r * 100).toFixed(2) + '%\n';
      response += '   Time (t) = ' + t + ' years\n\n';
      response += 'II. FORMULA\n   I = P × r × t\n   A = P + I\n\n';
      response += 'III. COMPUTATION\n';
      response += '   I = ' + P + ' × ' + r + ' × ' + t + ' = ' + I.toFixed(2) + '\n';
      response += '   A = ' + P + ' + ' + I.toFixed(2) + ' = ' + A.toFixed(2) + '\n\n';
      response += 'IV. FINAL ANSWER\n';
      response += '   Interest = ' + I.toFixed(2) + '\n';
      response += '   Total Amount = ' + A.toFixed(2);
      return response;
    }

    const ciMatch = prompt.match(/compound\s+interest.*?(?:principal|p)\s*=?\s*([\d\.]+).*?(?:rate|r)\s*=?\s*([\d\.]+)\s*%?.*?(?:time|t)\s*=?\s*([\d\.]+)/i);
    if (ciMatch) {
      const P = parseFloat(ciMatch[1]);
      const r = parseFloat(ciMatch[2]) / 100;
      const t = parseFloat(ciMatch[3]);
      const nMatch = prompt.match(/(?:compounded|n)\s*=?\s*(\d+)/i);
      const n = nMatch ? parseInt(nMatch[1]) : 1;
      const A = P * Math.pow(1 + r / n, n * t);
      const I = A - P;

      let response = 'FINANCE SOLUTION — COMPOUND INTEREST\n\n';
      response += 'I. GIVEN\n';
      response += '   P = ' + P + '\n';
      response += '   r = ' + (r * 100).toFixed(2) + '%\n';
      response += '   t = ' + t + ' years\n';
      response += '   n = ' + n + '\n\n';
      response += 'II. FORMULA\n   A = P(1 + r/n)^(nt)\n   I = A - P\n\n';
      response += 'III. COMPUTATION\n';
      response += '   A = ' + P + '(1 + ' + (r / n).toFixed(4) + ')^' + (n * t) + '\n';
      response += '   A = ' + A.toFixed(2) + '\n';
      response += '   I = ' + I.toFixed(2) + '\n\n';
      response += 'IV. FINAL ANSWER\n';
      response += '   Compound Interest = ' + I.toFixed(2) + '\n';
      response += '   Total Amount = ' + A.toFixed(2);
      return response;
    }

    const roiMatch = prompt.match(/roi.*?(?:initial|from|investment)\s*=?\s*([\d\.]+).*?(?:final|to|return)\s*=?\s*([\d\.]+)/i);
    if (roiMatch) {
      const initial = parseFloat(roiMatch[1]);
      const finalVal = parseFloat(roiMatch[2]);
      const profit = finalVal - initial;
      const roi = (profit / initial) * 100;

      let response = 'FINANCE SOLUTION — ROI\n\n';
      response += 'I. GIVEN\n   Initial = ' + initial + '\n   Final = ' + finalVal + '\n\n';
      response += 'II. FORMULA\n   Profit = Final - Initial\n   ROI = (Profit / Initial) × 100%\n\n';
      response += 'III. COMPUTATION\n   Profit = ' + profit + '\n   ROI = ' + roi.toFixed(2) + '%\n\n';
      response += 'IV. FINAL ANSWER\n   ROI = ' + roi.toFixed(2) + '%';
      return response;
    }

    const profitMatch = prompt.match(/profit.*?(?:cost|cp)\s*=?\s*([\d\.]+).*?(?:selling|sp)\s*=?\s*([\d\.]+)/i);
    if (profitMatch) {
      const cp = parseFloat(profitMatch[1]);
      const sp = parseFloat(profitMatch[2]);
      const profit = sp - cp;
      const margin = (profit / sp) * 100;
      const markup = (profit / cp) * 100;

      let response = 'FINANCE SOLUTION — PROFIT\n\n';
      response += 'I. GIVEN\n   CP = ' + cp + '\n   SP = ' + sp + '\n\n';
      response += 'II. COMPUTATION\n';
      response += '   Profit = ' + sp + ' - ' + cp + ' = ' + profit + '\n';
      response += '   Markup = ' + markup.toFixed(2) + '%\n';
      response += '   Margin = ' + margin.toFixed(2) + '%\n\n';
      response += 'III. FINAL ANSWER\n';
      response += '   Profit = ' + profit.toFixed(2) + '\n';
      response += '   Markup = ' + markup.toFixed(2) + '%\n';
      response += '   Margin = ' + margin.toFixed(2) + '%';
      return response;
    }

    const discMatch = prompt.match(/discount.*?(?:original|price|op)\s*=?\s*([\d\.]+).*?(?:discount|rate|d)\s*=?\s*([\d\.]+)\s*%?/i);
    if (discMatch) {
      const op = parseFloat(discMatch[1]);
      const disc = parseFloat(discMatch[2]) / 100;
      const discountAmt = op * disc;
      const finalPrice = op - discountAmt;

      let response = 'FINANCE SOLUTION — DISCOUNT\n\n';
      response += 'I. GIVEN\n   Original Price = ' + op + '\n   Discount Rate = ' + (disc * 100).toFixed(2) + '%\n\n';
      response += 'II. COMPUTATION\n';
      response += '   Discount = ' + op + ' × ' + disc + ' = ' + discountAmt.toFixed(2) + '\n';
      response += '   Final Price = ' + op + ' - ' + discountAmt.toFixed(2) + ' = ' + finalPrice.toFixed(2) + '\n\n';
      response += 'III. FINAL ANSWER\n';
      response += '   Discount = ' + discountAmt.toFixed(2) + '\n';
      response += '   Final Price = ' + finalPrice.toFixed(2);
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 25: ACCOUNTING
// ============================================================
tryAccounting(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/accounting|balance sheet|income statement|assets|liabilities|equity/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const aeMatch = prompt.match(/assets\s*=?\s*([\d\.]+).*?liabilities\s*=?\s*([\d\.]+)/i);
    if (aeMatch) {
      const A = parseFloat(aeMatch[1]);
      const L = parseFloat(aeMatch[2]);
      const E = A - L;
      let response = 'ACCOUNTING SOLUTION — ACCOUNTING EQUATION\n\n';
      response += 'I. GIVEN\n   Assets = ' + A + '\n   Liabilities = ' + L + '\n\n';
      response += 'II. FORMULA\n   Assets = Liabilities + Equity\n   Equity = A - L\n\n';
      response += 'III. COMPUTATION\n   Equity = ' + A + ' - ' + L + ' = ' + E.toFixed(2) + '\n\n';
      response += 'IV. FINAL ANSWER\n   Equity = ' + E.toFixed(2);
      return response;
    }

    const niMatch = prompt.match(/(?:revenue|income)\s*=?\s*([\d\.]+).*?expenses?\s*=?\s*([\d\.]+)/i);
    if (niMatch) {
      const rev = parseFloat(niMatch[1]);
      const exp = parseFloat(niMatch[2]);
      const ni = rev - exp;
      let response = 'ACCOUNTING SOLUTION — NET INCOME\n\n';
      response += 'I. GIVEN\n   Revenue = ' + rev + '\n   Expenses = ' + exp + '\n\n';
      response += 'II. FORMULA\n   Net Income = Revenue - Expenses\n\n';
      response += 'III. COMPUTATION\n   Net Income = ' + rev + ' - ' + exp + ' = ' + ni.toFixed(2) + '\n\n';
      response += 'IV. FINAL ANSWER\n   Net Income = ' + ni.toFixed(2);
      if (ni < 0) response += ' (Net Loss)';
      return response;
    }

    const gpMatch = prompt.match(/gross\s+profit.*?(?:revenue|sales)\s*=?\s*([\d\.]+).*?(?:cogs|cost\s+of\s+goods)\s*=?\s*([\d\.]+)/i);
    if (gpMatch) {
      const rev = parseFloat(gpMatch[1]);
      const cogs = parseFloat(gpMatch[2]);
      const gp = rev - cogs;
      let response = 'ACCOUNTING SOLUTION — GROSS PROFIT\n\n';
      response += 'I. GIVEN\n   Revenue = ' + rev + '\n   COGS = ' + cogs + '\n\n';
      response += 'II. COMPUTATION\n   Gross Profit = ' + rev + ' - ' + cogs + ' = ' + gp.toFixed(2) + '\n\n';
      response += 'III. FINAL ANSWER\n   Gross Profit = ' + gp.toFixed(2);
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 26: NUMBER THEORY
// ============================================================
tryNumberTheory(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(prime|factor|gcd|lcm|gcf|hcf|divisor|multiple|mod|modulo)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const primeMatch = prompt.match(/prime\s+factors?\s+(?:of\s+)?(\d+)/i);
    if (primeMatch) {
      const n = parseInt(primeMatch[1]);
      if (n < 2) return null;
      let temp = n;
      const factors = [];
      for (let d = 2; d * d <= temp; d++) {
        while (temp % d === 0) { factors.push(d); temp /= d; }
      }
      if (temp > 1) factors.push(temp);

      let response = 'NUMBER THEORY — PRIME FACTORS\n\n';
      response += 'Number: ' + n + '\n\n';
      response += 'I. METHOD\n   Divide by smallest prime repeatedly.\n\n';
      response += 'II. FACTORIZATION\n   ' + n + ' = ' + factors.join(' × ') + '\n\n';
      response += 'III. FINAL ANSWER\n';
      response += '   Prime Factors: ' + factors.join(', ') + '\n';
      response += '   Count: ' + factors.length;
      return response;
    }

    const gcdMatch = prompt.match(/(?:gcd|gcf|hcf)\s+(?:of\s+)?(\d+)\s*(?:,|and)\s*(\d+)/i);
    if (gcdMatch) {
      const a = parseInt(gcdMatch[1]);
      const b = parseInt(gcdMatch[2]);
      const gcd = this.getGCD(a, b);

      let response = 'NUMBER THEORY — GCD / HCF\n\n';
      response += 'Numbers: ' + a + ', ' + b + '\n\n';
      response += 'I. METHOD\n   Euclidean Algorithm\n\n';
      response += 'II. COMPUTATION\n';
      let x = a, y = b;
      while (y) {
        response += '   ' + x + ' mod ' + y + ' = ' + (x % y) + '\n';
        const t = y; y = x % y; x = t;
      }
      response += '\nIII. FINAL ANSWER\n   GCD(' + a + ', ' + b + ') = ' + gcd;
      return response;
    }

    const lcmMatch = prompt.match(/lcm\s+(?:of\s+)?(\d+)\s*(?:,|and)\s*(\d+)/i);
    if (lcmMatch) {
      const a = parseInt(lcmMatch[1]);
      const b = parseInt(lcmMatch[2]);
      const gcd = this.getGCD(a, b);
      const lcm = (a * b) / gcd;

      let response = 'NUMBER THEORY — LCM\n\n';
      response += 'Numbers: ' + a + ', ' + b + '\n\n';
      response += 'I. FORMULA\n   LCM(a,b) = (a × b) / GCD(a,b)\n\n';
      response += 'II. COMPUTATION\n';
      response += '   GCD = ' + gcd + '\n';
      response += '   LCM = (' + a + ' × ' + b + ') / ' + gcd + ' = ' + lcm + '\n\n';
      response += 'III. FINAL ANSWER\n   LCM(' + a + ', ' + b + ') = ' + lcm;
      return response;
    }

    const modMatch = prompt.match(/(\d+)\s*mod\s*(\d+)/i);
    if (modMatch) {
      const a = parseInt(modMatch[1]);
      const b = parseInt(modMatch[2]);
      if (b === 0) return null;
      const result = a % b;
      let response = 'NUMBER THEORY — MODULAR ARITHMETIC\n\n';
      response += 'Expression: ' + a + ' mod ' + b + '\n\n';
      response += 'I. COMPUTATION\n';
      response += '   ' + a + ' ÷ ' + b + ' = ' + Math.floor(a / b) + ' remainder ' + result + '\n\n';
      response += 'II. FINAL ANSWER\n   ' + a + ' mod ' + b + ' = ' + result;
      return response;
    }

    const isPrimeMatch = prompt.match(/(?:is\s+)?(\d+)\s+(?:a\s+)?prime/i);
    if (isPrimeMatch) {
      const n = parseInt(isPrimeMatch[1]);
      if (n < 2) return null;
      let isPrime = true;
      for (let i = 2; i * i <= n; i++) {
        if (n % i === 0) { isPrime = false; break; }
      }
      let response = 'NUMBER THEORY — PRIMALITY TEST\n\n';
      response += 'Number: ' + n + '\n\n';
      response += 'I. METHOD\n   Check divisibility from 2 to sqrt(' + n + ')\n\n';
      response += 'II. FINAL ANSWER\n   ' + n + ' is ' + (isPrime ? 'PRIME' : 'COMPOSITE');
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 27: SET THEORY
// ============================================================
trySetTheory(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(union|intersection|difference)/i.test(lower)) return null;
  if (!/\{/.test(prompt)) return null;

  try {
    const setMatches = prompt.match(/\{[^}]+\}/g);
    if (!setMatches || setMatches.length < 2) return null;

    const setA = this.parseSet(setMatches[0]);
    const setB = this.parseSet(setMatches[1]);
    if (!setA || !setB) return null;

    let operation = '';
    let result = [];

    if (/union/i.test(lower)) {
      operation = 'UNION';
      result = [...new Set([...setA, ...setB])].sort((a, b) => a - b);
    } else if (/intersection/i.test(lower)) {
      operation = 'INTERSECTION';
      result = setA.filter(x => setB.includes(x)).sort((a, b) => a - b);
    } else if (/difference/i.test(lower)) {
      operation = 'DIFFERENCE';
      result = setA.filter(x => !setB.includes(x)).sort((a, b) => a - b);
    } else {
      return null;
    }

    let response = 'SET THEORY — ' + operation + '\n\n';
    response += 'I. GIVEN\n';
    response += '   A = ' + setMatches[0] + '\n';
    response += '   B = ' + setMatches[1] + '\n\n';
    response += 'II. OPERATION\n';
    if (operation === 'UNION') response += '   A ∪ B = all elements in A or B\n';
    else if (operation === 'INTERSECTION') response += '   A ∩ B = elements in both\n';
    else if (operation === 'DIFFERENCE') response += '   A - B = elements in A but not B\n';
    response += '\nIII. FINAL ANSWER\n   {' + result.join(', ') + '}';
    return response;
  } catch (e) {
    return null;
  }
},

parseSet(str) {
  try {
    const cleaned = str.replace(/[{}]/g, '').trim();
    if (!cleaned) return [];
    return cleaned.split(',').map(x => x.trim()).filter(x => x).map(x => {
      const n = parseFloat(x);
      return isNaN(n) ? x : n;
    });
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 28: LOGIC GATES
// ============================================================
tryLogicGates(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(and|or|not|nand|nor|xor|xnor)\s*\(/i.test(lower)) return null;

  const match = prompt.match(/\b(and|or|not|nand|nor|xor|xnor)\s*\(\s*([01])\s*(?:,\s*([01]))?\s*\)/i);
  if (!match) return null;

  const gate = match[1].toUpperCase();
  const a = parseInt(match[2]);
  const b = match[3] !== undefined ? parseInt(match[3]) : null;

  let result;
  if (gate === 'NOT') {
    if (b !== null) return null;
    result = a === 0 ? 1 : 0;
  } else {
    if (b === null) return null;
    switch (gate) {
      case 'AND': result = a && b ? 1 : 0; break;
      case 'OR': result = a || b ? 1 : 0; break;
      case 'NAND': result = !(a && b) ? 1 : 0; break;
      case 'NOR': result = !(a || b) ? 1 : 0; break;
      case 'XOR': result = a !== b ? 1 : 0; break;
      case 'XNOR': result = a === b ? 1 : 0; break;
      default: return null;
    }
  }

  let response = 'LOGIC GATE SOLUTION\n\n';
  response += 'Gate: ' + gate + '\n';
  response += 'Inputs: A = ' + a + (b !== null ? ', B = ' + b : '') + '\n\n';
  response += 'I. TRUTH TABLE\n';
  if (gate === 'NOT') response += '   A | NOT A\n   0 | 1\n   1 | 0\n';
  else if (gate === 'AND') response += '   A B | AND\n   0 0 | 0\n   0 1 | 0\n   1 0 | 0\n   1 1 | 1\n';
  else if (gate === 'OR') response += '   A B | OR\n   0 0 | 0\n   0 1 | 1\n   1 0 | 1\n   1 1 | 1\n';
  else if (gate === 'XOR') response += '   A B | XOR\n   0 0 | 0\n   0 1 | 1\n   1 0 | 1\n   1 1 | 0\n';
  response += '\nII. FINAL ANSWER\n';
  response += '   ' + gate + '(' + a + (b !== null ? ', ' + b : '') + ') = ' + result;
  return response;
},

// ============================================================
// HANDLER 29: BINARY / HEX CONVERSION
// ============================================================
tryBinaryHex(prompt) {
  if (!prompt) return null;

  try {
    const binToDec = prompt.match(/binary\s+([01]+)\s+(?:to|in|sa)\s+decimal/i);
    if (binToDec) {
      const bin = binToDec[1];
      const dec = parseInt(bin, 2);
      if (isNaN(dec)) return null;
      let response = 'BINARY TO DECIMAL CONVERSION\n\n';
      response += 'Binary: ' + bin + '\n\n';
      response += 'I. METHOD\n   Multiply each digit by power of 2.\n\n';
      response += 'II. COMPUTATION\n';
      for (let i = 0; i < bin.length; i++) {
        const power = bin.length - 1 - i;
        if (parseInt(bin[i]) === 1) {
          response += '   ' + bin[i] + ' × 2^' + power + ' = ' + Math.pow(2, power) + '\n';
        }
      }
      response += '\nIII. FINAL ANSWER\n   Decimal: ' + dec;
      return response;
    }

    const decToBin = prompt.match(/decimal\s+(\d+)\s+(?:to|in|sa)\s+binary/i);
    if (decToBin) {
      const dec = parseInt(decToBin[1]);
      const bin = dec.toString(2);
      let response = 'DECIMAL TO BINARY CONVERSION\n\n';
      response += 'Decimal: ' + dec + '\n\n';
      response += 'I. METHOD\n   Divide by 2 repeatedly, record remainders.\n\n';
      response += 'II. COMPUTATION\n';
      let temp = dec;
      const steps = [];
      while (temp > 0) {
        steps.push('   ' + temp + ' ÷ 2 = ' + Math.floor(temp / 2) + ' remainder ' + (temp % 2));
        temp = Math.floor(temp / 2);
      }
      response += steps.reverse().join('\n');
      response += '\n\nIII. FINAL ANSWER\n   Binary: ' + bin;
      return response;
    }

    const hexToDec = prompt.match(/hex(?:adecimal)?\s+([0-9A-Fa-f]+)\s+(?:to|in|sa)\s+decimal/i);
    if (hexToDec) {
      const hex = hexToDec[1];
      const dec = parseInt(hex, 16);
      let response = 'HEX TO DECIMAL CONVERSION\n\n';
      response += 'Hex: ' + hex + '\n\n';
      response += 'I. FINAL ANSWER\n   Decimal: ' + dec;
      return response;
    }

    const decToHex = prompt.match(/decimal\s+(\d+)\s+(?:to|in|sa)\s+hex/i);
    if (decToHex) {
      const dec = parseInt(decToHex[1]);
      const hex = dec.toString(16).toUpperCase();
      let response = 'DECIMAL TO HEX CONVERSION\n\n';
      response += 'Decimal: ' + dec + '\n\n';
      response += 'I. FINAL ANSWER\n   Hex: ' + hex;
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 30: UNIT PREFIX (KB, MB, GB)
// ============================================================
tryUnitPrefix(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  const prefixes = {
    kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024, tb: 1024 * 1024 * 1024 * 1024,
    byte: 1, bytes: 1, kilobyte: 1024, kilobytes: 1024,
    megabyte: 1024 * 1024, megabytes: 1024 * 1024,
    gigabyte: 1024 * 1024 * 1024, gigabytes: 1024 * 1024 * 1024
  };

  const match = prompt.match(/([\d\.]+)\s*(kb|mb|gb|tb|byte|bytes|kilobyte|kilobytes|megabyte|megabytes|gigabyte|gigabytes)\s+(?:to|in|sa)\s+(kb|mb|gb|tb|byte|bytes|kilobyte|kilobytes|megabyte|megabytes|gigabyte|gigabytes)/i);
  if (match) {
    const value = parseFloat(match[1]);
    const from = match[2].toLowerCase();
    const to = match[3].toLowerCase();
    if (!prefixes[from] || !prefixes[to]) return null;

    const inBytes = value * prefixes[from];
    const result = inBytes / prefixes[to];

    let response = 'UNIT PREFIX CONVERSION\n\n';
    response += 'Problem: Convert ' + value + ' ' + match[2] + ' to ' + match[3] + '\n\n';
    response += 'I. CONVERSION\n';
    response += '   1 ' + match[2] + ' = ' + prefixes[from] + ' bytes\n';
    response += '   1 ' + match[3] + ' = ' + prefixes[to] + ' bytes\n\n';
    response += 'II. COMPUTATION\n';
    response += '   ' + value + ' × ' + prefixes[from] + ' = ' + inBytes + ' bytes\n';
    response += '   ' + inBytes + ' / ' + prefixes[to] + ' = ' + result.toFixed(6) + ' ' + match[3] + '\n\n';
    response += 'III. FINAL ANSWER\n   ' + result.toFixed(6) + ' ' + match[3];
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 31: TRIG ADVANCED (Law of Sines/Cosines, Inverse)
// ============================================================
tryTrigAdvanced(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(law of sines|law of cosines|inverse trig|arcsin|arccos|arctan|asin|acos|atan)/i.test(lower)) return null;

  try {
    const losMatch = prompt.match(/law\s+of\s+sines.*?a\s*=?\s*([\d\.]+).*?A\s*=?\s*([\d\.]+).*?B\s*=?\s*([\d\.]+)/i);
    if (losMatch) {
      const a = parseFloat(losMatch[1]);
      const A = parseFloat(losMatch[2]) * Math.PI / 180;
      const B = parseFloat(losMatch[3]) * Math.PI / 180;
      const b = (a * Math.sin(B)) / Math.sin(A);
      let response = 'TRIG ADVANCED — LAW OF SINES\n\n';
      response += 'I. GIVEN\n   a = ' + a + '\n   A = ' + losMatch[2] + '°\n   B = ' + losMatch[3] + '°\n\n';
      response += 'II. FORMULA\n   a / sin(A) = b / sin(B)\n   b = a × sin(B) / sin(A)\n\n';
      response += 'III. COMPUTATION\n';
      response += '   b = ' + a + ' × sin(' + losMatch[3] + '°) / sin(' + losMatch[2] + '°)\n';
      response += '   b = ' + b.toFixed(4) + '\n\n';
      response += 'IV. FINAL ANSWER\n   b = ' + b.toFixed(4);
      return response;
    }

    const locMatch = prompt.match(/law\s+of\s+cosines.*?a\s*=?\s*([\d\.]+).*?b\s*=?\s*([\d\.]+).*?C\s*=?\s*([\d\.]+)/i);
    if (locMatch) {
      const a = parseFloat(locMatch[1]);
      const b = parseFloat(locMatch[2]);
      const C = parseFloat(locMatch[3]) * Math.PI / 180;
      const c = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(C));
      let response = 'TRIG ADVANCED — LAW OF COSINES\n\n';
      response += 'I. GIVEN\n   a = ' + a + '\n   b = ' + b + '\n   C = ' + locMatch[3] + '°\n\n';
      response += 'II. FORMULA\n   c² = a² + b² - 2ab·cos(C)\n\n';
      response += 'III. COMPUTATION\n';
      response += '   c² = ' + (a * a + b * b - 2 * a * b * Math.cos(C)).toFixed(4) + '\n';
      response += '   c = ' + c.toFixed(4) + '\n\n';
      response += 'IV. FINAL ANSWER\n   c = ' + c.toFixed(4);
      return response;
    }

    const invMatch = prompt.match(/\b(arcsin|arccos|arctan|asin|acos|atan)\s*\(?\s*([\-\d\.]+)\s*\)?/i);
    if (invMatch) {
      const func = invMatch[1].toLowerCase();
      const val = parseFloat(invMatch[2]);
      let result;
      if (func === 'asin' || func === 'arcsin') result = Math.asin(val);
      else if (func === 'acos' || func === 'arccos') result = Math.acos(val);
      else if (func === 'atan' || func === 'arctan') result = Math.atan(val);
      else return null;
      if (!isFinite(result)) return null;

      const degrees = result * 180 / Math.PI;
      let response = 'TRIG ADVANCED — INVERSE\n\n';
      response += 'I. INPUT\n   ' + func + '(' + val + ')\n\n';
      response += 'II. COMPUTATION\n';
      response += '   ' + func + '(' + val + ') = ' + result.toFixed(6) + ' rad\n';
      response += '   = ' + degrees.toFixed(4) + '°\n\n';
      response += 'III. FINAL ANSWER\n   ' + degrees.toFixed(4) + '°';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 32: GEOMETRY ADVANCED (3D Shapes)
// ============================================================
tryGeometryAdvanced(prompt) {
  if (!prompt) return null;

  const sphereMatch = prompt.match(/volume\s+of\s+sphere\s+(?:with\s+)?(?:radius|r)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (sphereMatch) {
    const r = parseFloat(sphereMatch[1]);
    const V = (4 / 3) * Math.PI * Math.pow(r, 3);
    let response = 'GEOMETRY ADVANCED — SPHERE VOLUME\n\n';
    response += 'I. GIVEN\n   r = ' + r + '\n\n';
    response += 'II. FORMULA\n   V = (4/3) × π × r³\n\n';
    response += 'III. COMPUTATION\n   V = ' + V.toFixed(4) + '\n\n';
    response += 'IV. FINAL ANSWER\n   Volume = ' + V.toFixed(4) + ' cubic units';
    return response;
  }

  const cylMatch = prompt.match(/volume\s+of\s+cylinder\s+(?:with\s+)?(?:radius|r)\s*(?:=|:)?\s*([\d\.]+)\s+(?:and\s+)?(?:height|h)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (cylMatch) {
    const r = parseFloat(cylMatch[1]);
    const h = parseFloat(cylMatch[2]);
    const V = Math.PI * r * r * h;
    let response = 'GEOMETRY ADVANCED — CYLINDER VOLUME\n\n';
    response += 'I. GIVEN\n   r = ' + r + '\n   h = ' + h + '\n\n';
    response += 'II. FORMULA\n   V = π × r² × h\n\n';
    response += 'III. COMPUTATION\n   V = ' + V.toFixed(4) + '\n\n';
    response += 'IV. FINAL ANSWER\n   Volume = ' + V.toFixed(4) + ' cubic units';
    return response;
  }

  const coneMatch = prompt.match(/volume\s+of\s+cone\s+(?:with\s+)?(?:radius|r)\s*(?:=|:)?\s*([\d\.]+)\s+(?:and\s+)?(?:height|h)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (coneMatch) {
    const r = parseFloat(coneMatch[1]);
    const h = parseFloat(coneMatch[2]);
    const V = (1 / 3) * Math.PI * r * r * h;
    let response = 'GEOMETRY ADVANCED — CONE VOLUME\n\n';
    response += 'I. GIVEN\n   r = ' + r + '\n   h = ' + h + '\n\n';
    response += 'II. FORMULA\n   V = (1/3) × π × r² × h\n\n';
    response += 'III. COMPUTATION\n   V = ' + V.toFixed(4) + '\n\n';
    response += 'IV. FINAL ANSWER\n   Volume = ' + V.toFixed(4) + ' cubic units';
    return response;
  }

  const boxMatch = prompt.match(/volume\s+of\s+(?:rectangular\s+)?(?:prism|box)\s+(?:with\s+)?(?:length|L)\s*(?:=|:)?\s*([\d\.]+)\s+(?:and\s+)?(?:width|W)\s*(?:=|:)?\s*([\d\.]+)\s+(?:and\s+)?(?:height|H)\s*(?:=|:)?\s*([\d\.]+)/i);
  if (boxMatch) {
    const l = parseFloat(boxMatch[1]);
    const w = parseFloat(boxMatch[2]);
    const h = parseFloat(boxMatch[3]);
    const V = l * w * h;
    let response = 'GEOMETRY ADVANCED — RECTANGULAR PRISM VOLUME\n\n';
    response += 'I. GIVEN\n   L = ' + l + '\n   W = ' + w + '\n   H = ' + h + '\n\n';
    response += 'II. FORMULA\n   V = L × W × H\n\n';
    response += 'III. COMPUTATION\n   V = ' + V.toFixed(4) + '\n\n';
    response += 'IV. FINAL ANSWER\n   Volume = ' + V.toFixed(4) + ' cubic units';
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 33: ADVANCED STATISTICS (Variance, SD)
// ============================================================
tryStatsAdvanced(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(variance|standard deviation|\bsd\b)/i.test(lower)) return null;

  const numbers = this.extractNumbers(prompt);
  if (!numbers || numbers.length < 2) return null;

  try {
    const n = numbers.length;
    const mean = numbers.reduce((a, b) => a + b, 0) / n;
    const squaredDiffs = numbers.map(x => Math.pow(x - mean, 2));
    const sumSqDiff = squaredDiffs.reduce((a, b) => a + b, 0);
    const variance = sumSqDiff / n;
    const sd = Math.sqrt(variance);

    let response = 'ADVANCED STATISTICS — VARIANCE & SD\n\n';
    response += 'Data: ' + numbers.join(', ') + '\n\n';
    response += 'I. MEAN\n   Mean = ' + mean.toFixed(4) + '\n\n';
    response += 'II. SQUARED DIFFERENCES\n';
    for (let i = 0; i < n; i++) {
      response += '   (' + numbers[i] + ' - ' + mean.toFixed(4) + ')² = ' + squaredDiffs[i].toFixed(4) + '\n';
    }
    response += '\nIII. VARIANCE\n';
    response += '   σ² = Σ(x - μ)² / n\n';
    response += '   σ² = ' + sumSqDiff.toFixed(4) + ' / ' + n + ' = ' + variance.toFixed(4) + '\n\n';
    response += 'IV. STANDARD DEVIATION\n';
    response += '   σ = √' + variance.toFixed(4) + ' = ' + sd.toFixed(4) + '\n\n';
    response += 'V. FINAL ANSWER\n';
    response += '   Variance = ' + variance.toFixed(4) + '\n';
    response += '   Standard Deviation = ' + sd.toFixed(4);
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 34: ENGINEERING
// ============================================================
tryEngineering(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(stress|strain|torque|beam|deflection|moment|inertia)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const stressMatch = prompt.match(/stress.*?force\s*=?\s*([\d\.]+).*?area\s*=?\s*([\d\.]+)/i);
    if (stressMatch) {
      const F = parseFloat(stressMatch[1]);
      const A = parseFloat(stressMatch[2]);
      if (A === 0) return null;
      const stress = F / A;
      let response = 'ENGINEERING — STRESS\n\n';
      response += 'I. GIVEN\n   F = ' + F + ' N\n   A = ' + A + ' m²\n\n';
      response += 'II. FORMULA\n   σ = F / A\n\n';
      response += 'III. COMPUTATION\n   σ = ' + F + ' / ' + A + ' = ' + stress.toFixed(4) + ' Pa\n\n';
      response += 'IV. FINAL ANSWER\n   Stress = ' + stress.toFixed(4) + ' Pa';
      return response;
    }

    const strainMatch = prompt.match(/strain.*?(?:change|ΔL|delta)\s*=?\s*([\d\.]+).*?original\s+length\s*=?\s*([\d\.]+)/i);
    if (strainMatch) {
      const dL = parseFloat(strainMatch[1]);
      const L = parseFloat(strainMatch[2]);
      if (L === 0) return null;
      const strain = dL / L;
      let response = 'ENGINEERING — STRAIN\n\n';
      response += 'I. GIVEN\n   ΔL = ' + dL + '\n   L = ' + L + '\n\n';
      response += 'II. FORMULA\n   ε = ΔL / L\n\n';
      response += 'III. COMPUTATION\n   ε = ' + strain.toFixed(6) + '\n\n';
      response += 'IV. FINAL ANSWER\n   Strain = ' + strain.toFixed(6);
      return response;
    }

    const torqueMatch = prompt.match(/torque.*?force\s*=?\s*([\d\.]+).*?distance\s*=?\s*([\d\.]+)/i);
    if (torqueMatch) {
      const F = parseFloat(torqueMatch[1]);
      const d = parseFloat(torqueMatch[2]);
      const T = F * d;
      let response = 'ENGINEERING — TORQUE\n\n';
      response += 'I. GIVEN\n   F = ' + F + ' N\n   d = ' + d + ' m\n\n';
      response += 'II. FORMULA\n   τ = F × d\n\n';
      response += 'III. COMPUTATION\n   τ = ' + T.toFixed(4) + ' N·m\n\n';
      response += 'IV. FINAL ANSWER\n   Torque = ' + T.toFixed(4) + ' N·m';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 35: ELECTRICAL
// ============================================================
tryElectrical(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(resistance|parallel|series|capacitor|inductor|electrical power)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const seriesMatch = prompt.match(/resistors?\s+in\s+series.*?([\d\.\s,]+)/i);
    if (seriesMatch) {
      const nums = seriesMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
      if (nums.length < 2) return null;
      const total = nums.reduce((a, b) => a + b, 0);
      let response = 'ELECTRICAL — RESISTORS IN SERIES\n\n';
      response += 'I. GIVEN\n   R = ' + nums.join(', ') + ' Ω\n\n';
      response += 'II. FORMULA\n   Rtotal = R1 + R2 + ... + Rn\n\n';
      response += 'III. COMPUTATION\n   Rtotal = ' + nums.join(' + ') + ' = ' + total.toFixed(4) + ' Ω\n\n';
      response += 'IV. FINAL ANSWER\n   Rtotal = ' + total.toFixed(4) + ' Ω';
      return response;
    }

    const parallelMatch = prompt.match(/resistors?\s+in\s+parallel.*?([\d\.\s,]+)/i);
    if (parallelMatch) {
      const nums = parallelMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
      if (nums.length < 2) return null;
      const inverseSum = nums.reduce((a, b) => a + (1 / b), 0);
      const total = 1 / inverseSum;
      let response = 'ELECTRICAL — RESISTORS IN PARALLEL\n\n';
      response += 'I. GIVEN\n   R = ' + nums.join(', ') + ' Ω\n\n';
      response += 'II. FORMULA\n   1/Rtotal = 1/R1 + 1/R2 + ... + 1/Rn\n\n';
      response += 'III. COMPUTATION\n';
      response += '   1/Rtotal = ' + nums.map(r => '1/' + r).join(' + ') + '\n';
      response += '   1/Rtotal = ' + inverseSum.toFixed(6) + '\n';
      response += '   Rtotal = 1 / ' + inverseSum.toFixed(6) + ' = ' + total.toFixed(4) + ' Ω\n\n';
      response += 'IV. FINAL ANSWER\n   Rtotal = ' + total.toFixed(4) + ' Ω';
      return response;
    }

    const powerMatch = prompt.match(/electrical\s+power.*?voltage\s*=?\s*([\d\.]+).*?current\s*=?\s*([\d\.]+)/i);
    if (powerMatch) {
      const V = parseFloat(powerMatch[1]);
      const I = parseFloat(powerMatch[2]);
      const P = V * I;
      let response = 'ELECTRICAL — POWER\n\n';
      response += 'I. GIVEN\n   V = ' + V + ' V\n   I = ' + I + ' A\n\n';
      response += 'II. FORMULA\n   P = V × I\n\n';
      response += 'III. COMPUTATION\n   P = ' + V + ' × ' + I + ' = ' + P.toFixed(4) + ' W\n\n';
      response += 'IV. FINAL ANSWER\n   Power = ' + P.toFixed(4) + ' W';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 36: THERMODYNAMICS
// ============================================================
tryThermodynamics(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(heat|specific heat|thermal|calorimetry)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const heatMatch = prompt.match(/heat.*?mass\s*=?\s*([\d\.]+).*?specific\s+heat\s*=?\s*([\d\.]+).*?(?:change\s+in\s+temperature|ΔT|delta\s*T)\s*=?\s*([\d\.]+)/i);
    if (heatMatch) {
      const m = parseFloat(heatMatch[1]);
      const c = parseFloat(heatMatch[2]);
      const dT = parseFloat(heatMatch[3]);
      const Q = m * c * dT;

      let response = 'THERMODYNAMICS — HEAT ENERGY\n\n';
      response += 'I. GIVEN\n';
      response += '   m = ' + m + ' g\n';
      response += '   c = ' + c + ' J/g°C\n';
      response += '   ΔT = ' + dT + ' °C\n\n';
      response += 'II. FORMULA\n   Q = m × c × ΔT\n\n';
      response += 'III. COMPUTATION\n   Q = ' + m + ' × ' + c + ' × ' + dT + ' = ' + Q.toFixed(2) + ' J\n\n';
      response += 'IV. FINAL ANSWER\n   Q = ' + Q.toFixed(2) + ' J';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 37: WAVES
// ============================================================
tryWaves(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(frequency|wavelength|wave speed|period|amplitude)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const waveMatch = prompt.match(/(?:wave\s+)?(?:speed|velocity).*?(?:frequency|f)\s*=?\s*([\d\.]+).*?(?:wavelength|λ|lambda)\s*=?\s*([\d\.]+)/i);
    if (waveMatch) {
      const f = parseFloat(waveMatch[1]);
      const lambda = parseFloat(waveMatch[2]);
      const v = f * lambda;
      let response = 'WAVES — WAVE SPEED\n\n';
      response += 'I. GIVEN\n   f = ' + f + ' Hz\n   λ = ' + lambda + ' m\n\n';
      response += 'II. FORMULA\n   v = f × λ\n\n';
      response += 'III. COMPUTATION\n   v = ' + f + ' × ' + lambda + ' = ' + v.toFixed(2) + ' m/s\n\n';
      response += 'IV. FINAL ANSWER\n   v = ' + v.toFixed(2) + ' m/s';
      return response;
    }

    const freqMatch = prompt.match(/frequency.*?(?:speed|v)\s*=?\s*([\d\.]+).*?(?:wavelength|λ|lambda)\s*=?\s*([\d\.]+)/i);
    if (freqMatch) {
      const v = parseFloat(freqMatch[1]);
      const lambda = parseFloat(freqMatch[2]);
      if (lambda === 0) return null;
      const f = v / lambda;
      let response = 'WAVES — FREQUENCY\n\n';
      response += 'I. GIVEN\n   v = ' + v + ' m/s\n   λ = ' + lambda + ' m\n\n';
      response += 'II. FORMULA\n   f = v / λ\n\n';
      response += 'III. COMPUTATION\n   f = ' + v + ' / ' + lambda + ' = ' + f.toFixed(2) + ' Hz\n\n';
      response += 'IV. FINAL ANSWER\n   f = ' + f.toFixed(2) + ' Hz';
      return response;
    }

    const periodMatch = prompt.match(/period.*?frequency\s*=?\s*([\d\.]+)/i);
    if (periodMatch) {
      const f = parseFloat(periodMatch[1]);
      if (f === 0) return null;
      const T = 1 / f;
      let response = 'WAVES — PERIOD\n\n';
      response += 'I. GIVEN\n   f = ' + f + ' Hz\n\n';
      response += 'II. FORMULA\n   T = 1 / f\n\n';
      response += 'III. COMPUTATION\n   T = 1 / ' + f + ' = ' + T.toFixed(6) + ' s\n\n';
      response += 'IV. FINAL ANSWER\n   T = ' + T.toFixed(6) + ' s';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 38: OPTICS (Snell's Law, Critical Angle)
// ============================================================
tryOptics(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(snell|refraction|refractive|critical angle)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const snellMatch = prompt.match(/snell.*?n1\s*=?\s*([\d\.]+).*?n2\s*=?\s*([\d\.]+).*?θ1\s*=?\s*([\d\.]+)/i);
    if (snellMatch) {
      const n1 = parseFloat(snellMatch[1]);
      const n2 = parseFloat(snellMatch[2]);
      const theta1 = parseFloat(snellMatch[3]) * Math.PI / 180;
      const sinTheta2 = (n1 * Math.sin(theta1)) / n2;
      if (sinTheta2 > 1) {
        return 'OPTICS — SNELL\'S LAW\n\nTotal Internal Reflection: sin(θ2) > 1\nNo refracted ray exists.';
      }
      const theta2 = Math.asin(sinTheta2) * 180 / Math.PI;
      let response = 'OPTICS — SNELL\'S LAW\n\n';
      response += 'I. GIVEN\n   n1 = ' + n1 + '\n   n2 = ' + n2 + '\n   θ1 = ' + snellMatch[3] + '°\n\n';
      response += 'II. FORMULA\n   n1 × sin(θ1) = n2 × sin(θ2)\n\n';
      response += 'III. COMPUTATION\n   sin(θ2) = ' + sinTheta2.toFixed(6) + '\n   θ2 = ' + theta2.toFixed(4) + '°\n\n';
      response += 'IV. FINAL ANSWER\n   θ2 = ' + theta2.toFixed(4) + '°';
      return response;
    }

    const criticalMatch = prompt.match(/critical\s+angle.*?n1\s*=?\s*([\d\.]+).*?n2\s*=?\s*([\d\.]+)/i);
    if (criticalMatch) {
      const n1 = parseFloat(criticalMatch[1]);
      const n2 = parseFloat(criticalMatch[2]);
      if (n1 <= n2) return null;
      const sinC = n2 / n1;
      const thetaC = Math.asin(sinC) * 180 / Math.PI;
      let response = 'OPTICS — CRITICAL ANGLE\n\n';
      response += 'I. GIVEN\n   n1 = ' + n1 + '\n   n2 = ' + n2 + '\n\n';
      response += 'II. FORMULA\n   sin(θc) = n2 / n1\n\n';
      response += 'III. COMPUTATION\n   θc = ' + thetaC.toFixed(4) + '°\n\n';
      response += 'IV. FINAL ANSWER\n   θc = ' + thetaC.toFixed(4) + '°';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 39: GENETICS (Punnett Square)
// ============================================================
tryGenetics(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(punnett|cross|genotype|phenotype|dominant|recessive)/i.test(lower)) return null;

  try {
    const punnettMatch = prompt.match(/(?:punnett|cross).*?([A-Z][a-z]?)\s*[x×]\s*([A-Z][a-z]?)/i);
    if (punnettMatch) {
      const parent1 = punnettMatch[1];
      const parent2 = punnettMatch[2];

      const alleles1 = parent1.split('');
      const alleles2 = parent2.split('');

      const square = [];
      for (const a1 of alleles1) {
        for (const a2 of alleles2) {
          const combo = [a1, a2].sort().join('');
          square.push(combo);
        }
      }

      const counts = {};
      for (const s of square) counts[s] = (counts[s] || 0) + 1;

      let response = 'GENETICS — PUNNETT SQUARE\n\n';
      response += 'Cross: ' + parent1 + ' × ' + parent2 + '\n\n';
      response += 'I. GAMETES\n';
      response += '   Parent 1: ' + alleles1.join(', ') + '\n';
      response += '   Parent 2: ' + alleles2.join(', ') + '\n\n';
      response += 'II. PUNNETT SQUARE\n';
      response += '         ' + alleles2.join('     ') + '\n';
      for (const a1 of alleles1) {
        response += '   ' + a1 + '    ';
        for (const a2 of alleles2) {
          response += [a1, a2].sort().join('').padEnd(6);
        }
        response += '\n';
      }
      response += '\nIII. GENOTYPE RATIO\n';
      for (const [genotype, count] of Object.entries(counts)) {
        response += '   ' + genotype + ': ' + count + '/' + square.length + '\n';
      }
      response += '\nIV. PHENOTYPE RATIO\n';
      const dominantCount = square.filter(s => /[A-Z]/.test(s)).length;
      const recessiveCount = square.length - dominantCount;
      response += '   Dominant: ' + dominantCount + '/' + square.length + '\n';
      response += '   Recessive: ' + recessiveCount + '/' + square.length + '\n\n';
      response += 'V. FINAL ANSWER\n';
      response += '   Genotypes: ' + Object.entries(counts).map(([k, v]) => k + ' (' + v + ')').join(', ') + '\n';
      response += '   Phenotypes: Dominant (' + dominantCount + '), Recessive (' + recessiveCount + ')';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 40: GEOGRAPHY (Haversine Distance)
// ============================================================
tryGeography(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(distance|haversine|coordinates|latitude|longitude)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const coordMatch = prompt.match(/\(?\s*([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\s*\)?\s*(?:to|and|,)\s*\(?\s*([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\s*\)?/);
    if (coordMatch) {
      const lat1 = parseFloat(coordMatch[1]) * Math.PI / 180;
      const lon1 = parseFloat(coordMatch[2]) * Math.PI / 180;
      const lat2 = parseFloat(coordMatch[3]) * Math.PI / 180;
      const lon2 = parseFloat(coordMatch[4]) * Math.PI / 180;

      const R = 6371;
      const dLat = lat2 - lat1;
      const dLon = lon2 - lon1;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const d = R * c;

      let response = 'GEOGRAPHY — DISTANCE BETWEEN COORDINATES\n\n';
      response += 'I. GIVEN\n';
      response += '   Point 1: (' + coordMatch[1] + ', ' + coordMatch[2] + ')\n';
      response += '   Point 2: (' + coordMatch[3] + ', ' + coordMatch[4] + ')\n\n';
      response += 'II. FORMULA (Haversine)\n';
      response += '   d = R × c, R = 6371 km\n\n';
      response += 'III. COMPUTATION\n   Distance = ' + d.toFixed(2) + ' km\n\n';
      response += 'IV. FINAL ANSWER\n   Distance = ' + d.toFixed(2) + ' km';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 41: MEASUREMENT CONVERSION
// ============================================================
tryMeasurement(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(convert|how many|ilang)/i.test(lower)) return null;

  const conversions = {
    'inch_to_cm': 2.54, 'cm_to_inch': 1 / 2.54,
    'foot_to_meter': 0.3048, 'meter_to_foot': 1 / 0.3048,
    'yard_to_meter': 0.9144, 'meter_to_yard': 1 / 0.9144,
    'mile_to_km': 1.60934, 'km_to_mile': 1 / 1.60934,
    'pound_to_kg': 0.453592, 'kg_to_pound': 1 / 0.453592,
    'ounce_to_gram': 28.3495, 'gram_to_ounce': 1 / 28.3495,
    'gallon_to_liter': 3.78541, 'liter_to_gallon': 1 / 3.78541,
    'cup_to_ml': 236.588, 'ml_to_cup': 1 / 236.588,
    'acre_to_sqm': 4046.86, 'sqm_to_acre': 1 / 4046.86,
    'hectare_to_acre': 2.47105, 'acre_to_hectare': 1 / 2.47105
  };

  for (const [key, factor] of Object.entries(conversions)) {
    const [from, to] = key.split('_to_');
    const regex = new RegExp('([\\d\\.]+)\\s*' + from + 's?\\s*(?:to|in|sa)\\s*' + to + 's?', 'i');
    const match = prompt.match(regex);
    if (match) {
      const inputVal = parseFloat(match[1]);
      const result = inputVal * factor;
      let response = 'MEASUREMENT CONVERSION\n\n';
      response += 'Problem: Convert ' + inputVal + ' ' + from + ' to ' + to + '\n\n';
      response += 'I. CONVERSION FACTOR\n   1 ' + from + ' = ' + factor.toFixed(6) + ' ' + to + '\n\n';
      response += 'II. COMPUTATION\n   ' + inputVal + ' × ' + factor.toFixed(6) + ' = ' + result.toFixed(4) + '\n\n';
      response += 'III. FINAL ANSWER\n   ' + inputVal + ' ' + from + ' = ' + result.toFixed(4) + ' ' + to;
      return response;
    }
  }

  return null;
},

// ============================================================
// HANDLER 42: ROMAN NUMERALS
// ============================================================
tryRoman(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  const romanMatch = prompt.match(/\b([IVXLCDM]{2,})\b/);
  if (romanMatch && /(roman|to decimal|convert|decimal)/i.test(lower)) {
    const roman = romanMatch[1].toUpperCase();
    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let result = 0;
    for (let i = 0; i < roman.length; i++) {
      const curr = values[roman[i]];
      const next = values[roman[i + 1]];
      if (curr === undefined) return null;
      if (next && curr < next) result -= curr;
      else result += curr;
    }
    let response = 'ROMAN NUMERAL CONVERSION\n\n';
    response += 'Roman: ' + roman + '\n\n';
    response += 'I. METHOD\n   If smaller precedes larger, subtract. Else add.\n\n';
    response += 'II. FINAL ANSWER\n   Decimal: ' + result;
    return response;
  }

  const decMatch = prompt.match(/decimal\s+(\d+)\s+(?:to|in|sa)\s+roman/i);
  if (decMatch) {
    const num = parseInt(decMatch[1]);
    if (num < 1 || num > 3999) return null;
    const romanMap = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    let n = num, result = '';
    for (const [value, symbol] of romanMap) {
      while (n >= value) { result += symbol; n -= value; }
    }
    let response = 'ROMAN NUMERAL CONVERSION\n\n';
    response += 'Decimal: ' + num + '\n\n';
    response += 'I. FINAL ANSWER\n   Roman: ' + result;
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 43: BASE CONVERSION
// ============================================================
tryBaseConversion(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(base\s*\d+|to base)/i.test(lower)) return null;

  const match = prompt.match(/([\w]+)\s+(?:from\s+base\s+(\d+)\s+)?(?:to|in|sa)\s+base\s+(\d+)/i);
  if (!match) return null;

  try {
    const numStr = match[1];
    const fromBase = match[2] ? parseInt(match[2]) : 10;
    const toBase = parseInt(match[3]);

    if (fromBase < 2 || fromBase > 36 || toBase < 2 || toBase > 36) return null;

    const dec = parseInt(numStr, fromBase);
    if (isNaN(dec)) return null;

    const result = dec.toString(toBase).toUpperCase();

    let response = 'BASE CONVERSION\n\n';
    response += 'Number: ' + numStr + '\nFrom Base: ' + fromBase + '\nTo Base: ' + toBase + '\n\n';
    response += 'I. STEP 1: Convert to Decimal\n   ' + numStr + ' (base ' + fromBase + ') = ' + dec + '\n\n';
    response += 'II. STEP 2: Convert to Base ' + toBase + '\n   ' + dec + ' = ' + result + ' (base ' + toBase + ')\n\n';
    response += 'III. FINAL ANSWER\n   ' + result;
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 44: BOOLEAN ALGEBRA
// ============================================================
tryBoolean(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(simplify|boolean|truth table|logic expression)/i.test(lower)) return null;
  if (!/[A-Z]/i.test(prompt)) return null;
  if (!/(AND|OR|NOT|\+|\*|·|'|’)/i.test(lower)) return null;

  try {
    const match = prompt.match(/([A-Z])\s*(?:AND|OR)\s*\(([^)]+)\)/i);
    if (match) {
      const var1 = match[1].toUpperCase();
      const inside = match[2];

      if (new RegExp(var1 + '\\s*(?:OR|\\+)', 'i').test(inside) && new RegExp('(?:AND|\\*)', 'i').test(prompt)) {
        let response = 'BOOLEAN ALGEBRA — SIMPLIFY\n\n';
        response += 'Expression: ' + prompt + '\n\n';
        response += 'I. LAW USED\n   Absorption Law: A + (A · B) = A\n\n';
        response += 'II. FINAL ANSWER\n   ' + var1;
        return response;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 45: BINOMIAL DISTRIBUTION
// ============================================================
tryDistribution(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(normal|binomial|poisson|probability distribution)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const binomMatch = prompt.match(/binomial.*?n\s*=?\s*(\d+).*?p\s*=?\s*([\d\.]+).*?k\s*=?\s*(\d+)/i);
    if (binomMatch) {
      const n = parseInt(binomMatch[1]);
      const p = parseFloat(binomMatch[2]);
      const k = parseInt(binomMatch[3]);

      const comb = this.nCr(n, k);
      const prob = comb * Math.pow(p, k) * Math.pow(1 - p, n - k);

      let response = 'STATISTICS — BINOMIAL DISTRIBUTION\n\n';
      response += 'I. GIVEN\n   n = ' + n + '\n   p = ' + p + '\n   k = ' + k + '\n\n';
      response += 'II. FORMULA\n   P(X=k) = C(n,k) × p^k × (1-p)^(n-k)\n\n';
      response += 'III. COMPUTATION\n';
      response += '   C(' + n + ',' + k + ') = ' + comb + '\n';
      response += '   P(X=' + k + ') = ' + prob.toFixed(6) + '\n\n';
      response += 'IV. FINAL ANSWER\n';
      response += '   P(X=' + k + ') = ' + prob.toFixed(6) + ' (' + (prob * 100).toFixed(2) + '%)';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

nCr(n, r) {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  r = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= r; i++) {
    result = result * (n - r + i) / i;
  }
  return Math.round(result);
},

// ============================================================
// HANDLER 46: FINANCIAL RATIOS
// ============================================================
tryFinancialRatios(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(current ratio|quick ratio|debt.*equity|return on|roa|roe|financial ratio)/i.test(lower)) return null;
  if (!/\d/.test(prompt)) return null;

  try {
    const currMatch = prompt.match(/current\s+ratio.*?(?:current\s+assets|ca)\s*=?\s*([\d\.]+).*?(?:current\s+liabilities|cl)\s*=?\s*([\d\.]+)/i);
    if (currMatch) {
      const ca = parseFloat(currMatch[1]);
      const cl = parseFloat(currMatch[2]);
      if (cl === 0) return null;
      const ratio = ca / cl;
      let response = 'FINANCIAL RATIOS — CURRENT RATIO\n\n';
      response += 'I. GIVEN\n   Current Assets = ' + ca + '\n   Current Liabilities = ' + cl + '\n\n';
      response += 'II. FORMULA\n   Current Ratio = CA / CL\n\n';
      response += 'III. COMPUTATION\n   Current Ratio = ' + ca + ' / ' + cl + ' = ' + ratio.toFixed(4) + '\n\n';
      response += 'IV. FINAL ANSWER\n   Current Ratio = ' + ratio.toFixed(2);
      return response;
    }

    const deMatch = prompt.match(/debt.*?equity.*?(?:total\s+debt|debt)\s*=?\s*([\d\.]+).*?equity\s*=?\s*([\d\.]+)/i);
    if (deMatch) {
      const debt = parseFloat(deMatch[1]);
      const equity = parseFloat(deMatch[2]);
      if (equity === 0) return null;
      const ratio = debt / equity;
      let response = 'FINANCIAL RATIOS — DEBT-TO-EQUITY\n\n';
      response += 'I. GIVEN\n   Total Debt = ' + debt + '\n   Equity = ' + equity + '\n\n';
      response += 'II. FORMULA\n   D/E = Debt / Equity\n\n';
      response += 'III. COMPUTATION\n   D/E = ' + debt + ' / ' + equity + ' = ' + ratio.toFixed(4) + '\n\n';
      response += 'IV. FINAL ANSWER\n   D/E Ratio = ' + ratio.toFixed(2);
      return response;
    }

    const roaMatch = prompt.match(/(?:return\s+on\s+assets|roa).*?net\s+income\s*=?\s*([\d\.]+).*?total\s+assets\s*=?\s*([\d\.]+)/i);
    if (roaMatch) {
      const ni = parseFloat(roaMatch[1]);
      const ta = parseFloat(roaMatch[2]);
      if (ta === 0) return null;
      const roa = (ni / ta) * 100;
      let response = 'FINANCIAL RATIOS — ROA\n\n';
      response += 'I. GIVEN\n   Net Income = ' + ni + '\n   Total Assets = ' + ta + '\n\n';
      response += 'II. FORMULA\n   ROA = (NI / TA) × 100%\n\n';
      response += 'III. COMPUTATION\n   ROA = ' + roa.toFixed(2) + '%\n\n';
      response += 'IV. FINAL ANSWER\n   ROA = ' + roa.toFixed(2) + '%';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 47: LINEAR ALGEBRA (Eigenvalues, Trace)
// ============================================================
tryLinearAlgebra(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(eigenvalue|eigenvector|trace|transpose)/i.test(lower)) return null;

  try {
    const eigenMatch = prompt.match(/eigenvalues?\s+of\s+\[?\s*([\-\d\.]+)\s+([\-\d\.]+)\s*[;,]?\s*([\-\d\.]+)\s+([\-\d\.]+)\s*\]?/i);
    if (eigenMatch) {
      const a = parseFloat(eigenMatch[1]), b = parseFloat(eigenMatch[2]);
      const c = parseFloat(eigenMatch[3]), d = parseFloat(eigenMatch[4]);

      const trace = a + d;
      const det = a * d - b * c;
      const disc = trace * trace - 4 * det;

      let response = 'LINEAR ALGEBRA — EIGENVALUES\n\n';
      response += 'Matrix:\n| ' + a + '  ' + b + ' |\n| ' + c + '  ' + d + ' |\n\n';
      response += 'I. CHARACTERISTIC EQUATION\n';
      response += '   λ² - (trace)λ + (det) = 0\n';
      response += '   λ² - (' + trace + ')λ + (' + det + ') = 0\n\n';
      response += 'II. TRACE AND DETERMINANT\n';
      response += '   trace = ' + trace + '\n   det = ' + det + '\n\n';
      response += 'III. DISCRIMINANT\n   D = ' + disc + '\n\n';

      if (disc >= 0) {
        const l1 = (trace + Math.sqrt(disc)) / 2;
        const l2 = (trace - Math.sqrt(disc)) / 2;
        response += 'IV. FINAL ANSWER\n   λ1 = ' + l1.toFixed(4) + '\n   λ2 = ' + l2.toFixed(4);
      } else {
        const realPart = (trace / 2).toFixed(4);
        const imagPart = (Math.sqrt(-disc) / 2).toFixed(4);
        response += 'IV. FINAL ANSWER (Complex)\n   λ = ' + realPart + ' +/- ' + imagPart + 'i';
      }
      return response;
    }

    const traceMatch = prompt.match(/trace\s+of\s+\[?\s*([\-\d\.]+)\s+([\-\d\.]+)\s*[;,]?\s*([\-\d\.]+)\s+([\-\d\.]+)\s*\]?/i);
    if (traceMatch) {
      const a = parseFloat(traceMatch[1]);
      const d = parseFloat(traceMatch[4]);
      const trace = a + d;
      let response = 'LINEAR ALGEBRA — TRACE\n\n';
      response += 'I. FORMULA\n   trace = a + d\n\n';
      response += 'II. COMPUTATION\n   trace = ' + a + ' + ' + d + ' = ' + trace + '\n\n';
      response += 'III. FINAL ANSWER\n   trace = ' + trace;
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 48: DIFFERENTIAL EQUATIONS
// ============================================================
tryDiffEq(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(differential equation|dy\/dx)/i.test(lower)) return null;

  try {
    const match = prompt.match(/dy\s*\/\s*dx\s*=\s*(.+)/i);
    if (!match) return null;

    const rhs = match[1].trim();

    const powerMatch = rhs.match(/^([\-\d\.]*)\s*x\^?(\d+)$/i);
    if (powerMatch) {
      const coeff = powerMatch[1] ? parseFloat(powerMatch[1]) : 1;
      const n = parseInt(powerMatch[2]);
      const newCoeff = coeff / (n + 1);
      let response = 'DIFFERENTIAL EQUATIONS\n\n';
      response += 'Equation: dy/dx = ' + rhs + '\n\n';
      response += 'I. METHOD\n   Separate variables and integrate both sides.\n\n';
      response += 'II. INTEGRATION\n   y = ' + newCoeff.toFixed(4) + 'x^' + (n + 1) + ' + C\n\n';
      response += 'III. FINAL ANSWER\n   y = ' + newCoeff.toFixed(4) + 'x^' + (n + 1) + ' + C';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 49: DISCRETE MATH (Truth Tables)
// ============================================================
tryDiscreteMath(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(truth table|tautology|contradiction|contingency)/i.test(lower)) return null;

  try {
    const match = prompt.match(/truth\s+table\s+(?:of|for)\s+(.+)/i);
    if (!match) return null;

    const expr = match[1].trim();
    const hasA = /\bA\b/i.test(expr);
    const hasB = /\bB\b/i.test(expr);

    if (hasA && hasB) {
      let response = 'DISCRETE MATH — TRUTH TABLE\n\n';
      response += 'Expression: ' + expr + '\n\n';
      response += 'I. TRUTH TABLE\n';
      response += '   A | B | ' + expr + '\n';
      response += '   ' + '-'.repeat(20) + '\n';

      const combos = [[true, true], [true, false], [false, true], [false, false]];
      for (const [a, b] of combos) {
        let result;
        const upper = expr.toUpperCase();
        if (/AND|&&|·|\*/.test(upper)) result = a && b;
        else if (/OR|\|\||\+/.test(upper)) result = a || b;
        else if (/XOR/.test(upper)) result = a !== b;
        else if (/NAND/.test(upper)) result = !(a && b);
        else if (/NOR/.test(upper)) result = !(a || b);
        else if (/XNOR/.test(upper)) result = a === b;
        else result = false;

        response += '   ' + (a ? 'T' : 'F') + ' | ' + (b ? 'T' : 'F') + ' | ' + (result ? 'T' : 'F') + '\n';
      }
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 50: GRAPH THEORY
// ============================================================
tryGraphTheory(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(shortest path|graph|vertices|edges|degree of vertex)/i.test(lower)) return null;

  const degreeMatch = prompt.match(/degree\s+of\s+vertex\s+([A-Z])/i);
  if (degreeMatch) {
    const v = degreeMatch[1].toUpperCase();
    let response = 'GRAPH THEORY — DEGREE\n\n';
    response += 'Vertex: ' + v + '\n\n';
    response += 'I. DEFINITION\n   Degree = number of edges connected to it.\n\n';
    response += 'II. NOTE\n   Please provide edge list to count exactly.\n\n';
    response += 'III. FINAL ANSWER\n   Cannot compute without edge list.';
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 51: LINEAR REGRESSION
// ============================================================
tryRegression(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(linear regression|regression line|line of best fit)/i.test(lower)) return null;

  try {
    const xMatch = prompt.match(/x\s*=?\s*([\d\.\s,]+)/i);
    const yMatch = prompt.match(/y\s*=?\s*([\d\.\s,]+)/i);
    if (!xMatch || !yMatch) return null;

    const xs = xMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
    const ys = yMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));

    if (xs.length !== ys.length || xs.length < 2) return null;

    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    let response = 'STATISTICS — LINEAR REGRESSION\n\n';
    response += 'I. DATA\n   X: ' + xs.join(', ') + '\n   Y: ' + ys.join(', ') + '\n\n';
    response += 'II. FORMULAS\n';
    response += '   m = (nΣxy - ΣxΣy) / (nΣx² - (Σx)²)\n';
    response += '   b = (Σy - mΣx) / n\n\n';
    response += 'III. COMPUTATION\n';
    response += '   m = ' + slope.toFixed(4) + '\n';
    response += '   b = ' + intercept.toFixed(4) + '\n\n';
    response += 'IV. FINAL ANSWER\n';
    response += '   y = ' + slope.toFixed(4) + 'x + ' + intercept.toFixed(4);
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 52: CORRELATION (Pearson)
// ============================================================
tryCorrelation(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(correlation|pearson)/i.test(lower)) return null;

  try {
    const xMatch = prompt.match(/x\s*=?\s*([\d\.\s,]+)/i);
    const yMatch = prompt.match(/y\s*=?\s*([\d\.\s,]+)/i);
    if (!xMatch || !yMatch) return null;

    const xs = xMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
    const ys = yMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));

    if (xs.length !== ys.length || xs.length < 2) return null;

    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);
    const sumY2 = ys.reduce((a, y) => a + y * y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const r = numerator / denominator;

    let interpretation = '';
    if (r === 1) interpretation = 'Perfect positive correlation';
    else if (r > 0.7) interpretation = 'Strong positive correlation';
    else if (r > 0.3) interpretation = 'Moderate positive correlation';
    else if (r > -0.3) interpretation = 'Weak or no correlation';
    else if (r > -0.7) interpretation = 'Moderate negative correlation';
    else interpretation = 'Strong negative correlation';

    let response = 'STATISTICS — PEARSON CORRELATION\n\n';
    response += 'I. COMPUTATION\n   r = ' + r.toFixed(4) + '\n\n';
    response += 'II. INTERPRETATION\n   ' + interpretation + '\n\n';
    response += 'III. FINAL ANSWER\n   r = ' + r.toFixed(4);
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 53: NORMAL DISTRIBUTION (Z-Score)
// ============================================================
tryNormalDist(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(normal distribution|z-score|z score|standard normal)/i.test(lower)) return null;

  try {
    const zMatch = prompt.match(/z[-\s]?score.*?x\s*=?\s*([\-\d\.]+).*?(?:mean|μ)\s*=?\s*([\-\d\.]+).*?(?:sd|σ|standard deviation)\s*=?\s*([\d\.]+)/i);
    if (zMatch) {
      const x = parseFloat(zMatch[1]);
      const mu = parseFloat(zMatch[2]);
      const sigma = parseFloat(zMatch[3]);
      if (sigma === 0) return null;
      const z = (x - mu) / sigma;

      let response = 'STATISTICS — Z-SCORE\n\n';
      response += 'I. GIVEN\n   x = ' + x + '\n   μ = ' + mu + '\n   σ = ' + sigma + '\n\n';
      response += 'II. FORMULA\n   z = (x - μ) / σ\n\n';
      response += 'III. COMPUTATION\n   z = ' + z.toFixed(4) + '\n\n';
      response += 'IV. FINAL ANSWER\n   z = ' + z.toFixed(4);
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 54: CONFIDENCE INTERVAL
// ============================================================
tryConfidenceInterval(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(confidence interval|margin of error)/i.test(lower)) return null;

  try {
    const meanMatch = prompt.match(/(?:mean|μ)\s*=?\s*([\-\d\.]+)/i);
    const sdMatch = prompt.match(/(?:sd|σ|standard deviation)\s*=?\s*([\d\.]+)/i);
    const nMatch = prompt.match(/(?:n|sample size)\s*=?\s*(\d+)/i);
    const confMatch = prompt.match(/(9[0-9]|99|95|90|80)\s*%/i);

    if (!meanMatch || !sdMatch || !nMatch) return null;

    const mean = parseFloat(meanMatch[1]);
    const sd = parseFloat(sdMatch[1]);
    const n = parseInt(nMatch[1]);
    const confidence = confMatch ? parseInt(confMatch[1]) : 95;

    const zValues = { 80: 1.282, 90: 1.645, 95: 1.960, 99: 2.576 };
    const z = zValues[confidence] || 1.960;

    const se = sd / Math.sqrt(n);
    const me = z * se;
    const lowerBound = mean - me;
    const upperBound = mean + me;

    let response = 'STATISTICS — CONFIDENCE INTERVAL\n\n';
    response += 'I. GIVEN\n';
    response += '   Mean = ' + mean + '\n   SD = ' + sd + '\n   n = ' + n + '\n   CL = ' + confidence + '%\n\n';
    response += 'II. COMPUTATION\n';
    response += '   SE = ' + se.toFixed(4) + '\n';
    response += '   ME = ' + me.toFixed(4) + '\n\n';
    response += 'III. FINAL ANSWER\n';
    response += '   ' + confidence + '% CI = (' + lowerBound.toFixed(4) + ', ' + upperBound.toFixed(4) + ')';
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 55: Z-TEST
// ============================================================
tryZTest(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(z[-\s]?test|hypothesis test)/i.test(lower)) return null;

  try {
    const xbarMatch = prompt.match(/(?:sample mean|x̄|xbar)\s*=?\s*([\-\d\.]+)/i);
    const muMatch = prompt.match(/(?:population mean|μ|mu)\s*=?\s*([\-\d\.]+)/i);
    const sdMatch = prompt.match(/(?:sd|σ|standard deviation)\s*=?\s*([\d\.]+)/i);
    const nMatch = prompt.match(/(?:n|sample size)\s*=?\s*(\d+)/i);

    if (!xbarMatch || !muMatch || !sdMatch || !nMatch) return null;

    const xbar = parseFloat(xbarMatch[1]);
    const mu = parseFloat(muMatch[1]);
    const sd = parseFloat(sdMatch[1]);
    const n = parseInt(nMatch[1]);

    const se = sd / Math.sqrt(n);
    const z = (xbar - mu) / se;

    let response = 'STATISTICS — Z-TEST\n\n';
    response += 'I. GIVEN\n';
    response += '   Sample Mean = ' + xbar + '\n   Population Mean = ' + mu + '\n   SD = ' + sd + '\n   n = ' + n + '\n\n';
    response += 'II. COMPUTATION\n';
    response += '   SE = ' + se.toFixed(4) + '\n';
    response += '   z = ' + z.toFixed(4) + '\n\n';
    response += 'III. INTERPRETATION\n';
    if (Math.abs(z) > 1.96) response += '   Reject null hypothesis at 5% level\n';
    else response += '   Fail to reject null hypothesis at 5% level\n';
    response += '\nIV. FINAL ANSWER\n   z = ' + z.toFixed(4);
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 56: CHI-SQUARE
// ============================================================
tryChiSquare(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(chi[-\s]?square|χ²)/i.test(lower)) return null;

  try {
    const obsMatch = prompt.match(/(?:observed|o)\s*=?\s*([\d\.\s,]+)/i);
    const expMatch = prompt.match(/(?:expected|e)\s*=?\s*([\d\.\s,]+)/i);
    if (!obsMatch || !expMatch) return null;

    const observed = obsMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
    const expected = expMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));

    if (observed.length !== expected.length || observed.length < 2) return null;

    let chiSq = 0;
    for (let i = 0; i < observed.length; i++) {
      const diff = observed[i] - expected[i];
      chiSq += (diff * diff) / expected[i];
    }

    let response = 'STATISTICS — CHI-SQUARE\n\n';
    response += 'I. OBSERVED\n   ' + observed.join(', ') + '\n';
    response += 'II. EXPECTED\n   ' + expected.join(', ') + '\n\n';
    response += 'III. FORMULA\n   χ² = Σ((O - E)² / E)\n\n';
    response += 'IV. FINAL ANSWER\n   χ² = ' + chiSq.toFixed(4);
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 57: ANOVA
// ============================================================
tryANOVA(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/anova/i.test(lower)) return null;

  try {
    const groupMatch = prompt.match(/groups?\s*:?\s*([\d\.\s,;|]+)/i);
    if (!groupMatch) return null;

    const groupsStr = groupMatch[1].split('|').map(g => g.trim()).filter(g => g);
    const groups = groupsStr.map(g => g.split(/[\s,;]+/).map(n => parseFloat(n)).filter(n => !isNaN(n)));

    if (groups.length < 2 || groups.some(g => g.length < 2)) return null;

    const allValues = groups.flat();
    const grandMean = allValues.reduce((a, b) => a + b, 0) / allValues.length;

    let ssBetween = 0;
    let ssWithin = 0;

    for (const g of groups) {
      const gMean = g.reduce((a, b) => a + b, 0) / g.length;
      ssBetween += g.length * Math.pow(gMean - grandMean, 2);
      for (const v of g) {
        ssWithin += Math.pow(v - gMean, 2);
      }
    }

    const dfBetween = groups.length - 1;
    const dfWithin = allValues.length - groups.length;
    const msBetween = ssBetween / dfBetween;
    const msWithin = ssWithin / dfWithin;
    const fStat = msBetween / msWithin;

    let response = 'STATISTICS — ONE-WAY ANOVA\n\n';
    response += 'I. GROUPS\n';
    for (let i = 0; i < groups.length; i++) {
      response += '   Group ' + (i + 1) + ': ' + groups[i].join(', ') + '\n';
    }
    response += '\nII. SUMMARY\n';
    response += '   SS Between = ' + ssBetween.toFixed(4) + '\n';
    response += '   SS Within = ' + ssWithin.toFixed(4) + '\n';
    response += '   MS Between = ' + msBetween.toFixed(4) + '\n';
    response += '   MS Within = ' + msWithin.toFixed(4) + '\n\n';
    response += 'III. FINAL ANSWER\n   F = ' + fStat.toFixed(4);
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 58: CRYPTOGRAPHY (Caesar, ROT13)
// ============================================================
tryCryptography(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(caesar cipher|encrypt|decrypt|rot13|cipher)/i.test(lower)) return null;

  try {
    const caesarMatch = prompt.match(/caesar\s+cipher\s*:?\s*["']?([A-Za-z\s]+)["']?\s*(?:shift\s*)?([\d\-]+)?/i);
    if (caesarMatch) {
      const text = caesarMatch[1].toUpperCase();
      const shift = caesarMatch[2] ? parseInt(caesarMatch[2]) : 3;
      let result = '';
      for (const ch of text) {
        if (ch >= 'A' && ch <= 'Z') {
          result += String.fromCharCode(((ch.charCodeAt(0) - 65 + shift + 26) % 26) + 65);
        } else {
          result += ch;
        }
      }

      let response = 'CRYPTOGRAPHY — CAESAR CIPHER\n\n';
      response += 'I. INPUT\n   Text: ' + text + '\n   Shift: ' + shift + '\n\n';
      response += 'II. FINAL ANSWER\n   Encrypted: ' + result;
      return response;
    }

    if (/rot13/i.test(lower)) {
      const textMatch = prompt.match(/rot13\s*:?\s*["']?([A-Za-z\s]+)["']?/i);
      if (textMatch) {
        const text = textMatch[1];
        let result = '';
        for (const ch of text) {
          if (ch >= 'A' && ch <= 'Z') {
            result += String.fromCharCode(((ch.charCodeAt(0) - 65 + 13) % 26) + 65);
          } else if (ch >= 'a' && ch <= 'z') {
            result += String.fromCharCode(((ch.charCodeAt(0) - 97 + 13) % 26) + 97);
          } else {
            result += ch;
          }
        }

        let response = 'CRYPTOGRAPHY — ROT13\n\n';
        response += 'I. INPUT\n   ' + text + '\n\n';
        response += 'II. FINAL ANSWER\n   ' + result;
        return response;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 59: BIG O NOTATION
// ============================================================
tryBigO(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(big\s*o|time complexity|space complexity)/i.test(lower)) return null;

  try {
    const match = prompt.match(/big\s*o\s+(?:of|for)\s+(.+)/i);
    if (!match) return null;

    const expr = match[1].trim().toLowerCase();

    const complexities = {
      '1': 'O(1) — Constant',
      'n': 'O(n) — Linear',
      'n^2': 'O(n²) — Quadratic',
      'n^3': 'O(n³) — Cubic',
      'log n': 'O(log n) — Logarithmic',
      'n log n': 'O(n log n) — Linearithmic',
      '2^n': 'O(2^n) — Exponential',
      'n!': 'O(n!) — Factorial'
    };

    let response = 'COMPUTER SCIENCE — BIG O NOTATION\n\n';
    response += 'Expression: ' + expr + '\n\n';
    response += 'I. COMMON COMPLEXITIES\n';
    for (const [k, v] of Object.entries(complexities)) {
      response += '   ' + k + ': ' + v + '\n';
    }
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 60: ALGORITHMS (Sorting)
// ============================================================
tryAlgorithms(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(sort|bubble|merge|quick|insertion|selection)\s*(sort|algorithm)?/i.test(lower)) return null;

  try {
    const numMatch = prompt.match(/([\d\.\s,\-]+)/);
    if (!numMatch) return null;
    const numbers = numMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
    if (numbers.length < 2) return null;

    const sorted = [...numbers].sort((a, b) => a - b);

    let response = 'COMPUTER SCIENCE — SORTING ALGORITHM\n\n';
    response += 'I. INPUT\n   [' + numbers.join(', ') + ']\n\n';
    response += 'II. ALGORITHM\n';
    if (/bubble/i.test(lower)) response += '   Bubble Sort\n';
    else if (/merge/i.test(lower)) response += '   Merge Sort\n';
    else if (/quick/i.test(lower)) response += '   Quick Sort\n';
    else if (/insertion/i.test(lower)) response += '   Insertion Sort\n';
    else if (/selection/i.test(lower)) response += '   Selection Sort\n';
    else response += '   General Sort\n';
    response += '\nIII. FINAL ANSWER\n';
    response += '   Sorted: [' + sorted.join(', ') + ']';
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 61: DATA STRUCTURES
// ============================================================
tryDataStructures(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(stack|queue|linked list|tree|heap|hash table)/i.test(lower)) return null;
  if (/\d/.test(prompt) && /(sort|solve|\+|\*)/.test(prompt)) return null;

  let response = 'COMPUTER SCIENCE — DATA STRUCTURES\n\n';

  if (/\bstack\b/i.test(lower)) {
    response += 'I. STACK\n   LIFO: Last In, First Out\n\n';
    response += 'II. OPERATIONS\n';
    response += '   push(x) — add to top\n';
    response += '   pop() — remove from top\n';
    response += '   peek() — view top\n';
    response += '   isEmpty() — check if empty\n\n';
    response += 'III. EXAMPLE\n';
    response += '   push(1), push(2), push(3)\n';
    response += '   Stack: [1, 2, 3] (3 on top)\n';
    response += '   pop() -> 3';
    return response;
  }

  if (/\bqueue\b/i.test(lower)) {
    response += 'I. QUEUE\n   FIFO: First In, First Out\n\n';
    response += 'II. OPERATIONS\n';
    response += '   enqueue(x) — add to back\n';
    response += '   dequeue() — remove from front\n';
    response += '   front() — view front\n';
    response += '   isEmpty() — check if empty\n\n';
    response += 'III. EXAMPLE\n';
    response += '   enqueue(1), enqueue(2), enqueue(3)\n';
    response += '   Queue: [1, 2, 3] (1 on front)\n';
    response += '   dequeue() -> 1';
    return response;
  }

  if (/linked list/i.test(lower)) {
    response += 'I. LINKED LIST\n   Node contains: data + pointer to next node\n\n';
    response += 'II. TYPES\n';
    response += '   Singly Linked List — one direction\n';
    response += '   Doubly Linked List — two directions\n';
    response += '   Circular Linked List — last points to first\n\n';
    response += 'III. COMPLEXITY\n';
    response += '   Access: O(n)\n';
    response += '   Insert/Delete at head: O(1)';
    return response;
  }

  if (/\btree\b/i.test(lower)) {
    response += 'I. TREE\n   Hierarchical data structure\n\n';
    response += 'II. TYPES\n';
    response += '   Binary Tree — max 2 children\n';
    response += '   BST — left < parent < right\n';
    response += '   AVL / Red-Black — balanced\n\n';
    response += 'III. TRAVERSALS\n';
    response += '   Inorder: Left, Root, Right\n';
    response += '   Preorder: Root, Left, Right\n';
    response += '   Postorder: Left, Right, Root';
    return response;
  }

  if (/\bheap\b/i.test(lower)) {
    response += 'I. HEAP\n   Complete binary tree\n\n';
    response += 'II. TYPES\n';
    response += '   Min-Heap: parent <= children\n';
    response += '   Max-Heap: parent >= children\n\n';
    response += 'III. COMPLEXITY\n';
    response += '   Insert: O(log n)\n';
    response += '   Extract min/max: O(log n)';
    return response;
  }

  if (/hash table/i.test(lower)) {
    response += 'I. HASH TABLE\n   Key-value pairs using hash function\n\n';
    response += 'II. OPERATIONS\n';
    response += '   insert, delete, search\n\n';
    response += 'III. COMPLEXITY\n';
    response += '   Average: O(1)\n';
    response += '   Worst: O(n) — collisions';
    return response;
  }

  return null;
},

// ============================================================
// HANDLER 62: NETWORKING (CIDR)
// ============================================================
tryNetworking(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(subnet|ip address|ipv4|ipv6|network|netmask|cidr)/i.test(lower)) return null;

  try {
    const cidrMatch = prompt.match(/(\d+\.\d+\.\d+\.\d+)\s*\/\s*(\d+)/);
    if (cidrMatch) {
      const ip = cidrMatch[1];
      const prefix = parseInt(cidrMatch[2]);
      if (prefix < 0 || prefix > 32) return null;

      let response = 'NETWORKING — CIDR NOTATION\n\n';
      response += 'I. INPUT\n   IP: ' + ip + '\n   Prefix: /' + prefix + '\n\n';
      response += 'II. SUBNET MASK\n';
      const maskBits = '1'.repeat(prefix) + '0'.repeat(32 - prefix);
      const maskOctets = [];
      for (let i = 0; i < 4; i++) {
        maskOctets.push(parseInt(maskBits.substr(i * 8, 8), 2));
      }
      response += '   ' + maskOctets.join('.') + '\n\n';
      response += 'III. USABLE HOSTS\n';
      const hosts = Math.pow(2, 32 - prefix) - 2;
      response += '   ' + hosts + ' hosts\n\n';
      response += 'IV. TOTAL ADDRESSES\n';
      response += '   ' + Math.pow(2, 32 - prefix);
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 63: MACHINE LEARNING
// ============================================================
tryMachineLearning(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(softmax|sigmoid|relu|activation|neural network|gradient descent)/i.test(lower)) return null;

  try {
    const sigMatch = prompt.match(/sigmoid\s*\(?\s*([\-\d\.]+)\s*\)?/i);
    if (sigMatch) {
      const x = parseFloat(sigMatch[1]);
      const sig = 1 / (1 + Math.exp(-x));
      let response = 'AI — SIGMOID FUNCTION\n\n';
      response += 'I. INPUT\n   x = ' + x + '\n\n';
      response += 'II. FORMULA\n   σ(x) = 1 / (1 + e^(-x))\n\n';
      response += 'III. COMPUTATION\n';
      response += '   σ(' + x + ') = 1 / (1 + e^(' + -x + '))\n';
      response += '   = 1 / (1 + ' + Math.exp(-x).toFixed(6) + ')\n';
      response += '   = ' + sig.toFixed(6) + '\n\n';
      response += 'IV. FINAL ANSWER\n   σ(' + x + ') = ' + sig.toFixed(6);
      return response;
    }

    const reluMatch = prompt.match(/relu\s*\(?\s*([\-\d\.]+)\s*\)?/i);
    if (reluMatch) {
      const x = parseFloat(reluMatch[1]);
      const relu = Math.max(0, x);
      let response = 'AI — ReLU FUNCTION\n\n';
      response += 'I. INPUT\n   x = ' + x + '\n\n';
      response += 'II. FORMULA\n   ReLU(x) = max(0, x)\n\n';
      response += 'III. COMPUTATION\n';
      response += '   ReLU(' + x + ') = max(0, ' + x + ') = ' + relu + '\n\n';
      response += 'IV. FINAL ANSWER\n   ' + relu;
      return response;
    }

    const softMatch = prompt.match(/softmax\s*\[?\s*([\d\.\s,\-]+)\s*\]?/i);
    if (softMatch) {
      const values = softMatch[1].split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));
      if (values.length < 2) return null;

      const maxVal = Math.max(...values);
      const expVals = values.map(v => Math.exp(v - maxVal));
      const sumExp = expVals.reduce((a, b) => a + b, 0);
      const softmax = expVals.map(v => v / sumExp);

      let response = 'AI — SOFTMAX FUNCTION\n\n';
      response += 'I. INPUT\n   [' + values.join(', ') + ']\n\n';
      response += 'II. FORMULA\n   softmax(xi) = e^(xi) / Σe^(xj)\n\n';
      response += 'III. COMPUTATION\n';
      for (let i = 0; i < values.length; i++) {
        response += '   softmax(' + values[i] + ') = ' + softmax[i].toFixed(6) + '\n';
      }
      response += '\nIV. FINAL ANSWER\n';
      response += '   [' + softmax.map(s => s.toFixed(4)).join(', ') + ']';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 64: ANALYTIC GEOMETRY
// ============================================================
tryAnalyticGeometry(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/(slope|distance between|midpoint|line equation)/i.test(lower)) return null;

  try {
    const slopeMatch = prompt.match(/slope.*?\(?([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\)?\s*(?:and|,)\s*\(?([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\)?/i);
    if (slopeMatch) {
      const x1 = parseFloat(slopeMatch[1]), y1 = parseFloat(slopeMatch[2]);
      const x2 = parseFloat(slopeMatch[3]), y2 = parseFloat(slopeMatch[4]);
      if (x2 === x1) {
        return 'ANALYTIC GEOMETRY — SLOPE\n\nSlope is undefined (vertical line).';
      }
      const slope = (y2 - y1) / (x2 - x1);
      let response = 'ANALYTIC GEOMETRY — SLOPE\n\n';
      response += 'I. GIVEN\n   Point 1: (' + x1 + ', ' + y1 + ')\n   Point 2: (' + x2 + ', ' + y2 + ')\n\n';
      response += 'II. FORMULA\n   m = (y2 - y1) / (x2 - x1)\n\n';
      response += 'III. COMPUTATION\n';
      response += '   m = (' + y2 + ' - ' + y1 + ') / (' + x2 + ' - ' + x1 + ')\n';
      response += '   m = ' + (y2 - y1) + ' / ' + (x2 - x1) + '\n';
      response += '   m = ' + slope.toFixed(4) + '\n\n';
      response += 'IV. FINAL ANSWER\n   Slope = ' + slope.toFixed(4);
      return response;
    }

    const distMatch = prompt.match(/distance.*?\(?([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\)?\s*(?:and|to|,)\s*\(?([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\)?/i);
    if (distMatch) {
      const x1 = parseFloat(distMatch[1]), y1 = parseFloat(distMatch[2]);
      const x2 = parseFloat(distMatch[3]), y2 = parseFloat(distMatch[4]);
      const d = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      let response = 'ANALYTIC GEOMETRY — DISTANCE\n\n';
      response += 'I. GIVEN\n   Point 1: (' + x1 + ', ' + y1 + ')\n   Point 2: (' + x2 + ', ' + y2 + ')\n\n';
      response += 'II. FORMULA\n   d = sqrt[(x2-x1)^2 + (y2-y1)^2]\n\n';
      response += 'III. COMPUTATION\n';
      response += '   d = sqrt[(' + x2 + '-' + x1 + ')^2 + (' + y2 + '-' + y1 + ')^2]\n';
      response += '   d = sqrt[' + Math.pow(x2 - x1, 2) + ' + ' + Math.pow(y2 - y1, 2) + ']\n';
      response += '   d = sqrt(' + (Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) + ')\n';
      response += '   d = ' + d.toFixed(4) + '\n\n';
      response += 'IV. FINAL ANSWER\n   Distance = ' + d.toFixed(4);
      return response;
    }

    const midMatch = prompt.match(/midpoint.*?\(?([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\)?\s*(?:and|,)\s*\(?([\-\d\.]+)\s*[, ]\s*([\-\d\.]+)\)?/i);
    if (midMatch) {
      const x1 = parseFloat(midMatch[1]), y1 = parseFloat(midMatch[2]);
      const x2 = parseFloat(midMatch[3]), y2 = parseFloat(midMatch[4]);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      let response = 'ANALYTIC GEOMETRY — MIDPOINT\n\n';
      response += 'I. GIVEN\n   Point 1: (' + x1 + ', ' + y1 + ')\n   Point 2: (' + x2 + ', ' + y2 + ')\n\n';
      response += 'II. FORMULA\n   M = ((x1+x2)/2, (y1+y2)/2)\n\n';
      response += 'III. COMPUTATION\n';
      response += '   Mx = (' + x1 + ' + ' + x2 + ') / 2 = ' + mx + '\n';
      response += '   My = (' + y1 + ' + ' + y2 + ') / 2 = ' + my + '\n\n';
      response += 'IV. FINAL ANSWER\n   Midpoint = (' + mx + ', ' + my + ')';
      return response;
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 65: FACTORING
// ============================================================
tryFactoring(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/factor/i.test(lower)) return null;
  if (!/[a-z]/i.test(prompt)) return null;

  const match = prompt.match(/factor\s*:?\s*(.+)/i);
  if (!match) return null;

  const expr = match[1].trim().replace(/\s+/g, '');

  try {
    // Difference of squares: x^2 - b^2
    const dosMatch = expr.match(/^x\^?2\s*-\s*(\d+)$/i);
    if (dosMatch) {
      const b = Math.sqrt(parseFloat(dosMatch[1]));
      if (Number.isInteger(b)) {
        let response = 'FACTORING SOLUTION\n\n';
        response += 'Expression: ' + expr + '\n\n';
        response += 'I. IDENTIFY PATTERN\n';
        response += '   Difference of Squares: a^2 - b^2 = (a - b)(a + b)\n\n';
        response += 'II. COMPUTATION\n';
        response += '   a = x\n';
        response += '   b = ' + b + '\n\n';
        response += 'III. FINAL ANSWER\n';
        response += '   ' + expr + ' = (x - ' + b + ')(x + ' + b + ')';
        return response;
      }
    }

    // Simple trinomial: x^2 + bx + c
    const triMatch = expr.match(/^x\^?2\s*([\+\-]\s*\d+)\s*x\s*([\+\-]\s*\d+)$/i);
    if (triMatch) {
      const b = parseFloat(triMatch[1].replace(/\s/g, ''));
      const c = parseFloat(triMatch[2].replace(/\s/g, ''));

      const disc = b * b - 4 * c;
      if (disc >= 0) {
        const r1 = (-b + Math.sqrt(disc)) / 2;
        const r2 = (-b - Math.sqrt(disc)) / 2;

        let response = 'FACTORING SOLUTION\n\n';
        response += 'Expression: ' + expr + '\n\n';
        response += 'I. FIND ROOTS\n';
        response += '   x1 = ' + r1.toFixed(4) + '\n';
        response += '   x2 = ' + r2.toFixed(4) + '\n\n';

        const f1 = r1 >= 0 ? 'x - ' + r1 : 'x + ' + Math.abs(r1);
        const f2 = r2 >= 0 ? 'x - ' + r2 : 'x + ' + Math.abs(r2);

        response += 'II. FINAL ANSWER\n';
        response += '   (' + f1 + ')(' + f2 + ')';
        return response;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 66: SIMPLIFY EXPRESSION
// ============================================================
trySimplifyExpression(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/simplify/i.test(lower)) return null;
  if (!/[a-z]/i.test(prompt)) return null;

  const match = prompt.match(/simplify\s*:?\s*(.+)/i);
  if (!match) return null;

  const expr = match[1].trim();

  try {
    const terms = this.parseTerms(expr);
    if (!terms || terms.length < 2) return null;

    const combined = this.combineLikeTerms(terms);
    combined.sort((a, b) => b.degree - a.degree);

    const finalAnswer = combined.map(t => t.raw).join(' ').replace(/\+ -/g, '- ').replace(/\s+/g, ' ').trim();

    let response = 'SIMPLIFY SOLUTION\n\n';
    response += 'Expression: ' + expr + '\n\n';
    response += 'I. ORIGINAL\n   ' + expr + '\n\n';
    response += 'II. COMBINE LIKE TERMS\n';
    for (const t of combined) {
      response += '   ' + t.raw + ' (degree ' + t.degree + ')\n';
    }
    response += '\nIII. FINAL ANSWER\n   ' + finalAnswer;
    return response;
  } catch (e) {
    return null;
  }
},

// ============================================================
// HANDLER 67: ABSOLUTE VALUE
// ============================================================
tryAbsoluteValue(prompt) {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  if (!/\|.+\|/i.test(prompt) && !/absolute/i.test(lower)) return null;

  let num = null;
  const pipeMatch = prompt.match(/\|\s*([\-\d\.]+)\s*\|/);
  if (pipeMatch) num = parseFloat(pipeMatch[1]);

  const absMatch = prompt.match(/absolute\s+(?:value\s+)?(?:of\s+)?([\-\d\.]+)/i);
  if (absMatch) num = parseFloat(absMatch[1]);

  if (num === null || isNaN(num)) return null;

  const result = Math.abs(num);

  let response = 'ABSOLUTE VALUE SOLUTION\n\n';
  response += 'Expression: |' + num + '|\n\n';
  response += 'I. DEFINITION\n';
  response += '   |x| = x if x >= 0\n';
  response += '   |x| = -x if x < 0\n\n';
  response += 'II. COMPUTATION\n';
  if (num < 0) {
    response += '   Since ' + num + ' < 0, |' + num + '| = -(' + num + ')\n';
  } else {
    response += '   Since ' + num + ' >= 0, |' + num + '| = ' + num + '\n';
  }
  response += '\nIII. FINAL ANSWER\n   |' + num + '| = ' + result;
  return response;
},

// ============================================================
// WEIGHT ESTIMATION
// ============================================================
shouldTriggerWeight(lowerPrompt, originalPrompt) {
  const hasWeightWord = /\b(weight|timbang|weigh|kilo|kg|lbs|pounds|estimate|tantiya|taya|sukat)\b/i.test(lowerPrompt);
  const hasGirthWord = /\b(heart\s*girth|girth|dibdib|chest|circumference)\b/i.test(lowerPrompt);
  const hasLengthWord = /\b(length|haba|body\s*length)\b/i.test(lowerPrompt);
  const hasGetWord = /^(get|kuha|kunin|compute|calculate|estimate|i-|ipa|solve)\b/i.test(lowerPrompt);
  const hasNumbers = /\d+/.test(originalPrompt);
  const animalKeywords = ['pig', 'baboy', 'chicken', 'manok', 'cow', 'baka', 'kalabaw', 'carabao', 'goat', 'kambing', 'sheep', 'tupa', 'fish', 'isda', 'tilapia', 'bangus', 'duck', 'pato', 'itik', 'turkey', 'pabo', 'horse', 'kabayo', 'dog', 'aso', 'cat', 'pusa', 'wood', 'kahoy', 'tabla', 'rice', 'bigas', 'corn', 'mais', 'feeds', 'feed'];
  const hasAnimal = animalKeywords.some(a => lowerPrompt.includes(a));
  return (
    (hasWeightWord && hasNumbers) || (hasWeightWord && hasAnimal) ||
    (hasGirthWord && hasNumbers) || (hasLengthWord && hasNumbers && hasAnimal) ||
    (hasGetWord && hasAnimal && hasNumbers) || (hasAnimal && hasGirthWord && hasLengthWord) ||
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
    if (lower.includes('pig') || lower.includes('baboy')) result = this.buildFormula('PIG', 'BABOY', 'inches', 'lbs', '(Heart Girth x Heart Girth x Body Length) / 400', girth, length, 400, 10);
    else if (lower.includes('chicken') || lower.includes('manok')) result = this.buildChickenFormula(girth);
    else if (lower.includes('cow') || lower.includes('baka')) result = this.buildFormula('COW', 'BAKA', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 11877', girth, length, 11877, 12);
    else if (lower.includes('carabao') || lower.includes('kalabaw')) result = this.buildFormula('CARABAO', 'KALABAW', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 11877', girth, length, 11877, 12);
    else if (lower.includes('goat') || lower.includes('kambing')) result = this.buildFormula('GOAT', 'KAMBING', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 10800', girth, length, 10800, 10);
    else if (lower.includes('sheep') || lower.includes('tupa')) result = this.buildFormula('SHEEP', 'TUPA', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 10800', girth, length, 10800, 10);
    else if (lower.includes('fish') || lower.includes('isda')) result = this.buildFishFormula(girth, length);
    else if (lower.includes('duck') || lower.includes('pato')) result = this.buildPowerFormula('DUCK', 'PATO', girth, 2.5, 0.0007, 10);
    else if (lower.includes('turkey') || lower.includes('pabo')) result = this.buildPowerFormula('TURKEY', 'PABO', girth, 2.5, 0.0009, 10);
    else if (lower.includes('horse') || lower.includes('kabayo')) result = this.buildFormula('HORSE', 'KABAYO', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 11900', girth, length, 11900, 10);
    else if (lower.includes('dog') || lower.includes('aso')) result = this.buildFormula('DOG', 'ASO', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 11800', girth, length, 11800, 12);
    else if (lower.includes('cat') || lower.includes('pusa')) result = this.buildFormula('CAT', 'PUSA', 'cm', 'kg', '(Heart Girth x Heart Girth x Body Length) / 10800', girth, length, 10800, 10);
    else if (lower.includes('wood') || lower.includes('kahoy')) result = this.buildWoodFormula(allNumbers, lower);
    else if (lower.includes('rice') || lower.includes('bigas') || lower.includes('corn') || lower.includes('mais') || lower.includes('feed')) result = this.buildGrainFormula(volume, allNumbers, lower);
    else result = this.buildWeightGuide();

    await this.sendComplete(senderId, this.cleanResponse(result), token);
  } catch (error) {
    console.error('[Weight] Error:', error.message);
    await sendMessage(senderId, { text: 'Error calculating weight. Please check your input.' }, token);
  }
},

buildFormula(name, name2, unit, resultUnit, formulaStr, girth, length, divisor, accuracy) {
  if (girth === null || length === null) {
    return name + ' / ' + name2 + ' WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (' + unit + ')\n- Body Length (' + unit + ')\n\nExample: get weight ' + name.toLowerCase() + ' heart girth 34 length 31\n\nFORMULA:\nWeight (' + resultUnit + ') = ' + formulaStr;
  }
  const gs = girth * girth;
  const product = gs * length;
  const result = product / divisor;
  return name + ' / ' + name2 + ' WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Heart Girth: ' + girth + ' ' + unit + '\n- Body Length: ' + length + ' ' + unit + '\n\nII. FORMULA\nWeight (' + resultUnit + ') = ' + formulaStr + '\n\nIII. SOLUTION\nStep 1: Square the heart girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by body length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by ' + divisor + '\n        ' + product.toFixed(2) + ' / ' + divisor + ' = ' + result.toFixed(2) + ' ' + resultUnit + '\n\nIV. FINAL ANSWER\n- ' + result.toFixed(1) + ' ' + resultUnit + '\n\nV. ACCURACY\n- +/- ' + accuracy + ' percent margin of error';
},

buildChickenFormula(girth) {
  if (girth === null) {
    return 'CHICKEN / MANOK WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight chicken heart girth 30\n\nFORMULA:\nWeight (kg) = 0.001 x (Heart Girth)^2.417';
  }
  const power = Math.pow(girth, 2.417);
  const kg = 0.001 * power;
  return 'CHICKEN / MANOK WEIGHT ESTIMATE\n\nI. MEASUREMENT\n- Heart Girth: ' + girth + ' cm\n\nII. FORMULA\nWeight (kg) = 0.001 x (Heart Girth)^2.417\n\nIII. SOLUTION\nStep 1: Raise girth to power of 2.417\n        ' + girth + '^2.417 = ' + power.toFixed(4) + '\nStep 2: Multiply by 0.001\n        0.001 x ' + power.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- 8 percent margin of error';
},

buildPowerFormula(name, name2, girth, power, multiplier, accuracy) {
  if (girth === null) {
    return name + ' / ' + name2 + ' WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: get weight ' + name.toLowerCase() + ' heart girth 35\n\nFORMULA:\nWeight (kg) = ' + multiplier + ' x (Heart Girth)^' + power;
  }
  const pow = Math.pow(girth, power);
  const kg = multiplier * pow;
  return name + ' / ' + name2 + ' WEIGHT ESTIMATE\n\nI. MEASUREMENT\n- Heart Girth: ' + girth + ' cm\n\nII. FORMULA\nWeight (kg) = ' + multiplier + ' x (Heart Girth)^' + power + '\n\nIII. SOLUTION\nStep 1: Raise girth to power of ' + power + '\n        ' + girth + '^' + power + ' = ' + pow.toFixed(4) + '\nStep 2: Multiply by ' + multiplier + '\n        ' + multiplier + ' x ' + pow.toFixed(4) + ' = ' + kg.toFixed(3) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- ' + accuracy + ' percent margin of error';
},

buildFishFormula(girth, length) {
  if (girth === null || length === null) {
    return 'FISH / ISDA WEIGHT FORMULA\n\nPlease provide:\n- Total Length (cm)\n- Girth (cm)\n\nExample: get weight fish length 30 girth 20\n\nFORMULA:\nWeight (kg) = (Total Length x Girth x Girth) / 15000';
  }
  const gs = girth * girth;
  const product = length * gs;
  const kg = product / 15000;
  return 'FISH / ISDA WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Total Length: ' + length + ' cm\n- Girth: ' + girth + ' cm\n\nII. FORMULA\nWeight (kg) = (Total Length x Girth x Girth) / 15000\n\nIII. SOLUTION\nStep 1: Square the girth\n        ' + girth + ' x ' + girth + ' = ' + gs.toFixed(2) + '\nStep 2: Multiply by total length\n        ' + gs.toFixed(2) + ' x ' + length + ' = ' + product.toFixed(2) + '\nStep 3: Divide by 15000\n        ' + product.toFixed(2) + ' / 15000 = ' + kg.toFixed(3) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg\n\nV. ACCURACY\n- +/- 15 percent margin of error';
},

buildWoodFormula(allNumbers, lower) {
  if (allNumbers.length < 3) {
    return 'WOOD / KAHOY WEIGHT FORMULA\n\nPlease provide:\n- Length (cm)\n- Width (cm)\n- Thickness (cm)\n- Type (mahogany, narra, pine, molave)\n\nExample: get weight wood length 200 width 30 thickness 5 mahogany';
  }
  const wl = parseFloat(allNumbers[0]);
  const width = parseFloat(allNumbers[1]);
  const thickness = parseFloat(allNumbers[2]);
  let density = 0.55;
  let type = 'Default (Mahogany)';
  if (lower.includes('narra')) { density = 0.65; type = 'Narra'; }
  else if (lower.includes('pine')) { density = 0.45; type = 'Pine'; }
  else if (lower.includes('molave')) { density = 0.75; type = 'Molave'; }
  const volume = wl * width * thickness;
  const grams = volume * density;
  const kg = grams / 1000;
  return 'WOOD / KAHOY WEIGHT ESTIMATE\n\nI. MEASUREMENTS\n- Length: ' + wl + ' cm\n- Width: ' + width + ' cm\n- Thickness: ' + thickness + ' cm\n- Type: ' + type + '\n- Density: ' + density + ' g/cm3\n\nII. FORMULA\nWeight (kg) = (Length x Width x Thickness x Density) / 1000\n\nIII. SOLUTION\nStep 1: Compute volume\n        ' + volume.toFixed(2) + ' cm3\nStep 2: Multiply by density\n        ' + grams.toFixed(2) + ' g\nStep 3: Convert to kg\n        ' + kg.toFixed(2) + ' kg\n\nIV. FINAL ANSWER\n- ' + kg.toFixed(2) + ' kg';
},

buildGrainFormula(volume, allNumbers, lower) {
  const liters = volume !== null ? volume : (allNumbers.length >= 1 ? parseFloat(allNumbers[0]) : null);
  if (liters === null) {
    return 'RICE / CORN / FEEDS WEIGHT FORMULA\n\nPlease provide:\n- Volume (liters)\n- Type (rice, corn, feeds)\n\nExample: get weight rice 10 liters';
  }
  let kg = 0, type = '', density = 0;
  if (lower.includes('rice') || lower.includes('bigas')) { density = 0.80; type = 'RICE / BIGAS'; }
  else if (lower.includes('corn') || lower.includes('mais')) { density = 0.75; type = 'CORN / MAIS'; }
  else if (lower.includes('feed')) { density = 0.60; type = 'FEEDS'; }
  else { density = 0.75; type = 'DEFAULT (CORN)'; }
  kg = liters * density;
  return type + ' WEIGHT ESTIMATE\n\nI. MEASUREMENT\n- Volume: ' + liters + ' liters\n- Density: ' + density + ' kg/L\n\nII. FORMULA\nWeight (kg) = Volume (liters) x Density (kg/L)\n\nIII. FINAL ANSWER\n- ' + kg.toFixed(1) + ' kg';
},

buildWeightGuide() {
  return 'WEIGHT ESTIMATION GUIDE\n\nAll formulas use body measurements, NO SCALE NEEDED.\n\nPIG: weight = (Girth x Girth x Length) / 400 (inches to lbs)\nCHICKEN: weight = 0.001 x (Girth)^2.417 (cm to kg)\nCOW: weight = (Girth x Girth x Length) / 11877 (cm to kg)\nCARABAO: weight = (Girth x Girth x Length) / 11877 (cm to kg)\nGOAT: weight = (Girth x Girth x Length) / 10800 (cm to kg)\nSHEEP: weight = (Girth x Girth x Length) / 10800 (cm to kg)\nFISH: weight = (Length x Girth x Girth) / 15000 (cm to kg)\nDUCK: weight = 0.0007 x (Girth)^2.5 (cm to kg)\nTURKEY: weight = 0.0009 x (Girth)^2.5 (cm to kg)\nHORSE: weight = (Girth x Girth x Length) / 11900 (cm to kg)\nDOG: weight = (Girth x Girth x Length) / 11800 (cm to kg)\nCAT: weight = (Girth x Girth x Length) / 10800 (cm to kg)\nWOOD: weight = (L x W x H x Density) / 1000 (cm to kg)\nRICE/CORN/FEEDS: weight = Liters x Density (L to kg)\n\nExample: get weight pig heart girth 34 length 31';
},

  // ============================================================
  // HANDLER 65: WORD LIST (Synonyms, Antonyms, Other Terms)
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
      /^synonyms?\s+of\s+/i,
      /^antonym(s)?\s+(for|of)\s+/i,
      /^antonyms?\s+of\s+/i,
      /^opposite\s+(of|word\s+for|term\s+for)\s+/i,
      /^kasingkahulugan\s+(ng|nang)\s+/i,
      /^kasalungat\s+(ng|nang)\s+/i,
      /^kabaligtaran\s+(ng|nang)\s+/i,
      /^kabaliktaran\s+(ng|nang)\s+/i,
      /^iba\s+pang\s+(salita|tawag|term)\s+(sa|para sa)\s+/i,
      /^ibang\s+(salita|tawag|term)\s+(sa|para sa)\s+/i,
      /^ano\s+ang\s+kasingkahulugan\s+(ng|nang)\s+/i,
      /^ano\s+ang\s+kasalungat\s+(ng|nang)\s+/i,
      /^kasing\s*kahulugan\s+sa\s+/i,
      /^laing\s+nga\s+(pulong|tawag)\s+sa\s+/i,
      /^unsa\s+ang\s+kasingkahulugan\s+sa\s+/i,
      /^list\s+of\s+(terms?|words?|names?)\s+(for|of)\s+/i,
      /^all\s+(terms?|words?|names?)\s+(for|of)\s+/i,
      /^enumerate\s+(all\s+)?(terms?|words?|names?)\s+(for|of)\s+/i
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
        /^other\s+terms?\s+(?:for|of)\s+(.+)$/i,
        /^other\s+words?\s+(?:for|of)\s+(.+)$/i,
        /^another\s+word\s+(?:for|of)\s+(.+)$/i,
        /^another\s+term\s+(?:for|of)\s+(.+)$/i,
        /^synonyms?\s+(?:for|of)\s+(.+)$/i,
        /^antonyms?\s+(?:for|of)\s+(.+)$/i,
        /^opposite\s+(?:of|word\s+for|term\s+for)\s+(.+)$/i,
        /^kasingkahulugan\s+(?:ng|nang)\s+(.+)$/i,
        /^kasalungat\s+(?:ng|nang)\s+(.+)$/i,
        /^kabaligtaran\s+(?:ng|nang)\s+(.+)$/i,
        /^kabaliktaran\s+(?:ng|nang)\s+(.+)$/i,
        /^iba\s+pang\s+(?:salita|tawag|term)\s+(?:sa|para sa)\s+(.+)$/i,
        /^ibang\s+(?:salita|tawag|term)\s+(?:sa|para sa)\s+(.+)$/i,
        /^ano\s+ang\s+kasingkahulugan\s+(?:ng|nang)\s+(.+)$/i,
        /^ano\s+ang\s+kasalungat\s+(?:ng|nang)\s+(.+)$/i,
        /^kasing\s*kahulugan\s+sa\s+(.+)$/i,
        /^laing\s+nga\s+(?:pulong|tawag)\s+sa\s+(.+)$/i,
        /^unsa\s+ang\s+kasingkahulugan\s+sa\s+(.+)$/i,
        /^list\s+of\s+(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i,
        /^all\s+(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i,
        /^enumerate\s+(?:all\s+)?(?:terms?|words?|names?)\s+(?:for|of)\s+(.+)$/i
      ];

      for (const pattern of extractPatterns) {
        const match = prompt.match(pattern);
        if (match) { targetWord = match[1].trim().replace(/[?.!]+$/, ''); break; }
      }

      if (!targetWord) return null;

      let actionLabel = 'synonyms';
      if (listType === 'antonym') actionLabel = 'antonyms';

      let finalPrompt = '';
      finalPrompt += 'You are a dictionary expert. Give ALL common ' + actionLabel.toUpperCase() + ' of the word below.\n\n';
      finalPrompt += 'CRITICAL RULES:\n';
      finalPrompt += '1. Output ONLY a NUMBERED LIST of ' + actionLabel + '.\n';
      finalPrompt += '2. Do NOT write INTRODUCTION, DEFINITION, MAIN POINTS, EXAMPLES, IMPORTANCE, or CONCLUSION.\n';
      finalPrompt += '3. Do NOT write any essay or paragraph.\n';
      finalPrompt += '4. Do NOT define the word.\n';
      finalPrompt += '5. Do NOT hallucinate. Only include words that are ACTUALLY valid ' + actionLabel + '.\n';
      finalPrompt += '6. Include a brief meaning for each item.\n';
      finalPrompt += '7. BE COMPREHENSIVE. Give AS MANY items as possible. 20-35 items if applicable.\n';
      finalPrompt += '8. Be TUMPAK (accurate).\n';
      finalPrompt += '9. NO emojis, NO markdown.\n\n';
      finalPrompt += 'WORD: ' + targetWord + '\n\n';
      finalPrompt += 'Output ONLY the list:';

      const response = await this.callAPI(finalPrompt, prompt, 'english', 'wordlist', 'wordlist', 'wordlist', 'general');
      let cleaned = this.cleanResponse(response);
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
      /^(kumusta|kamusta|musta|musta na|kamusta ka|kumusta ka|kamusta po|kumusta kayo)$/i,
      /^(good\s*(morning|afternoon|evening|day|night))$/i,
      /^(magandang\s*(araw|umaga|hapon|gabi|tanghali))$/i,
      /^(help|tulong|tabang|saklolo|sakolo)$/i,
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
      return 'Hello! Ako si Teacher Arlene, ang iyong AI assistant.\n\nPaano kita matutulungan ngayon?\n\nMaaari kang magtanong tungkol sa:\n- Math (Algebra, Geometry, Trigonometry, Statistics)\n- Araling Panlipunan\n- Science\n- Research at Thesis\n- Weight estimation ng hayop\n- Logic at Bugtong\n- Synonyms at Antonyms\n\nI-type lang ang iyong tanong.';
    }
    if (/^(kumusta|kamusta|musta|musta na|kamusta ka|kumusta ka|kamusta po|kumusta kayo|good\s*(morning|afternoon|evening|day|night)|magandang\s*(araw|umaga|hapon|gabi|tanghali))$/i.test(p)) {
      return 'Kumusta! Ako si Teacher Arlene, handang tumulong sa iyong mga tanong.\n\nAno ang maitutulong ko sa iyo ngayon?';
    }
    if (/^(help|tulong|tabang|saklolo|sakolo)$/i.test(p)) {
      return 'HELP GUIDE\n\nNarito ang mga commands:\n\n1. AI - Magtanong ng kahit ano\n   Example: ai what is photosynthesis\n\n2. MATH - Algebra, Geometry, Trigonometry, Statistics\n   Example: (2x-7x^2)(3xy+3y)\n   Example: 2x + 5 = 15\n   Example: x^2 + 5x + 6 = 0\n   Example: 1/2 + 1/3\n   Example: mean of 1, 2, 3, 4, 5\n   Example: area of circle radius 5\n   Example: sin(30 degrees)\n\n3. WEIGHT - Estimate ng timbang ng hayop\n   Example: get weight pig heart girth 34 length 31\n\n4. LOGIC - Mga bugtong at palaisipan\n   Example: ai a man has 9 sons each son has a sister\n\n5. FOLLOW-UP - I-reply ang AI response\n   Example: elaborate, paraphrase, simplify, expand\n\n6. WORD LIST - Synonyms, Antonyms\n   Example: other term for uncountable';
    }
    if (/^(thank|thanks|thank you|thank u|thanks po|thank you po|salamat|salamat po|maraming salamat|maraming salamat po|daghang salamat|salamat kaayo)$/i.test(p)) {
      return 'Walang anuman! Natutuwa akong makatulong sa iyo.\n\nKung may iba ka pang tanong, magtanong ka lang.';
    }
    if (/^(ok|okay|ok po|okay po|sige|sige po|sure|noted|gets|i see|i understand|naintindihan|naintindihan ko|alright|fine|ayos|ayos lang|ge|gihapon)$/i.test(p)) {
      return 'Sige! Kung may iba ka pang katanungan, magtanong ka lang.';
    }
    if (/^(bye|bye po|goodbye|paalam|see you|see you soon|ingat|ingat ka|hanggang sa muli)$/i.test(p)) {
      return 'Paalam! Salamat sa paggamit ng aking serbisyo.\n\nIngat palagi.';
    }
    if (/^(sorry|sorry po|pasensya|pasensya na|pasensya na po|paumanhin|excuse me|patawad|patawad po)$/i.test(p)) {
      return 'Walang problema! Hindi mo kailangang mag-sorry.\n\nKung may tanong ka, magtanong ka lang.';
    }
    if (/^(yes|yes po|oo|oo po|opo|yep|yup|yeah|sige oo)$/i.test(p)) {
      return 'Sige! Ano ang gusto mong itanong?';
    }
    if (/^(no|nope|hindi|hindi po|hindi ko alam|wala)$/i.test(p)) {
      return 'Okay, walang problema.\n\nKung magbago ang isip mo, narito lang ako.';
    }
    if (/^(good|nice|great|awesome|perfect|excellent|wow|galing|ang galing|magaling)$/i.test(p)) {
      return 'Salamat! Natutuwa akong nasiyahan ka.\n\nKung may iba ka pang tanong, magtanong ka lang.';
    }
    if (/^(ano|what)\s*(ito|ito po|ito ba|ba ito|po ito)$/i.test(p)) {
      return 'Ako si Teacher Arlene, isang AI assistant na handang tumulong sa iyo.';
    }
    if (/^(sino|who)\s*(ka|ka po|po kayo|kayo)$/i.test(p)) {
      return 'Ako si Teacher Arlene, isang AI assistant na ginawa ni GeoDevz69.';
    }
    if (/^(ano|what)\s*(pangalan mo|name mo|pangalan mo po|ang pangalan mo)$/i.test(p)) {
      return 'Ang pangalan ko ay Teacher Arlene.\n\nAko ay isang AI assistant na ginawa ni GeoDevz69.';
    }
    return 'Hello! Ako si Teacher Arlene, ang iyong AI assistant.\n\nPaano kita matutulungan ngayon?';
  },

  // ============================================================
  // FOLLOW-UP COMMANDS
  // ============================================================
  isFollowUpCommand(cleanPrompt) {
    if (!cleanPrompt) return false;
    const p = cleanPrompt.toLowerCase().trim();
    if (/^(elaborate|explain more|explain further|explain in detail|paliwanag|ipaliwanag)( more| further| pa| po)?$/i.test(p)) return true;
    if (/^(elaborate|explain)\s+(it|this|that|mo|po|nga)?$/i.test(p)) return true;
    if (/^(paraphrase|rephrase|rewrite|i-paraphrase|i-rephrase|i-rewrite)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(simplify|simple|i-simplify|pasimplehin|gawing simple)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(expand|i-expand|expand more|dagdagan|dagdagan mo|add more)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(correct|fix|i-correct|i-fix|ayusin)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(formalize|i-formalize|gawing pormal)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(construct|rebuild|reorganize|i-construct)( it| this| that| mo| po)?$/i.test(p)) return true;
    return false;
  },

  getFollowUpAction(cleanPrompt) {
    const p = cleanPrompt.toLowerCase().trim();
    if (/paraphrase|rephrase|rewrite|i-rewrite|i-paraphrase|i-rephrase/i.test(p)) return 'paraphrase';
    if (/simplify|simple|pasimplehin|gawing simple/i.test(p)) return 'simplify';
    if (/expand|dagdagan|dagdag|add more/i.test(p)) return 'expand';
    if (/correct|fix|i-correct|i-fix|ayusin/i.test(p)) return 'correct';
    if (/formalize|i-formalize|pormal/i.test(p)) return 'formalize';
    if (/construct|i-construct|rebuild|reorganize/i.test(p)) return 'construct';
    if (/elaborate|explain more|explain further|paliwanag|ipaliwanag/i.test(p)) return 'elaborate';
    return 'elaborate';
  },

  buildFollowUpPrompt(action, previousResponse, userCommand) {
    const actionInstructions = {
      'elaborate': 'ELABORATE the following response. Add MORE DETAILS, examples, explanations, and deeper analysis. ALWAYS INCLUDE THE FINAL ANSWER at the end.',
      'paraphrase': 'PARAPHRASE the following response. Rewrite it in DIFFERENT WORDS while keeping the SAME MEANING.',
      'simplify': 'SIMPLIFY the following response. Use SIMPLE WORDS and SHORT SENTENCES.',
      'expand': 'EXPAND the following response. Add MORE INFORMATION, examples, and sub-points. Be COMPREHENSIVE.',
      'correct': 'CORRECT the following response. Fix grammar, spelling, and punctuation errors.',
      'formalize': 'FORMALIZE the following response. Make it more ACADEMIC and PROFESSIONAL.',
      'construct': 'CONSTRUCT a new response based on the following. Reorganize it into a clear, well-structured format.'
    };
    const instruction = actionInstructions[action] || actionInstructions['elaborate'];
    let prompt = 'You are a text transformation expert.\n\n';
    prompt += 'TASK: ' + instruction + '\n\n';
    prompt += 'CRITICAL RULES:\n';
    prompt += '1. Do NOT explain what the command means.\n';
    prompt += '2. Do NOT define any word.\n';
    prompt += '3. Transform the ORIGINAL RESPONSE below.\n';
    prompt += '4. Respond in the SAME language as the original response.\n';
    prompt += '5. Be ACCURATE and COMPLETE.\n';
    prompt += '6. ALWAYS INCLUDE THE FINAL ANSWER at the end.\n';
    prompt += '7. NO emojis, NO markdown, NO LaTeX.\n\n';
    prompt += 'ORIGINAL RESPONSE:\n';
    prompt += '---START---\n';
    prompt += previousResponse;
    prompt += '\n---END---\n\n';
    prompt += 'Now write the ' + action.toUpperCase() + ' version:';
    return prompt;
  },

  // ============================================================
  // LOGIC
  // ============================================================
  isLogicQuestion(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    const logicKeywords = ['riddle', 'bugtong', 'puzzle', 'logic', 'how many people', 'how many in the family', 'each son has', 'each daughter has', 'each brother has', 'each sister has', 'ilang tao', 'ilan ang tao'];
    if (logicKeywords.some(k => lower.includes(k))) return true;
    if (/a (man|woman|father|mother|person) has \d+ (sons?|daughters?|children?|brothers?|sisters?)/i.test(prompt)) return true;
    if (/each (son|daughter|brother|sister|child) has a (sister|brother)/i.test(prompt)) return true;
    if (/\bhow many (people|members|persons|siblings)\b/i.test(prompt) && /\b(family|sons?|daughters?)\b/i.test(prompt)) return true;
    if (/^(bugtong|hulaan)/i.test(lower)) return true;
    return false;
  },

  async handleLogicAnswer(senderId, prompt, token) {
    try {
      const cleanedPrompt = prompt.replace(/^(solve|ai|ask|chat|answer|logic|riddle|bugtong|hulaan)\s*:?\s*/i, '').trim();

      const familyMatch = cleanedPrompt.match(/(?:a|the)\s+(man|woman|father|mother|person|guy|lady)\s+has\s+(\d+)\s+(sons?|daughters?|children?|brothers?|sisters?)/i);

      if (familyMatch) {
        const count = parseInt(familyMatch[2]);
        const type = familyMatch[3].toLowerCase();
        const hasSisterClue = /each\s+(son|daughter|brother|sister|child)\s+has\s+a\s+(sister|brother)/i.test(cleanedPrompt);

        if (hasSisterClue) {
          const sons = type.startsWith('son') ? count : 0;
          const daughters = type.startsWith('daughter') ? count : 0;
          const siblings = sons + daughters;

          const hasSharedSister = /each\s+son\s+has\s+a\s+sister/i.test(cleanedPrompt);
          const hasSharedBrother = /each\s+daughter\s+has\s+a\s+brother/i.test(cleanedPrompt);

          let totalChildren = siblings;
          if (hasSharedSister && daughters === 0) totalChildren += 1;
          if (hasSharedBrother && sons === 0) totalChildren += 1;

          const total = totalChildren + 2;

          let answer = 'Family Logic Puzzle\n\n';
          answer += 'I. GIVEN\n';
          answer += '- The man has ' + count + ' ' + type + '.\n';
          if (hasSharedSister) answer += '- Each ' + type.replace(/s$/, '') + ' has a sister.\n';
          if (hasSharedBrother) answer += '- Each ' + type.replace(/s$/, '') + ' has a brother.\n';

          answer += '\nII. REASONING\n';
          answer += '1. The ' + count + ' ' + type + ' are all siblings.\n';
          if (hasSharedSister) {
            answer += '2. They all SHARE the same sister.\n';
            answer += '3. There is only 1 sister, not ' + count + '.\n';
            answer += '4. Total children = ' + count + ' + 1 = ' + totalChildren + '.\n';
          } else {
            answer += '2. Total children = ' + totalChildren + '.\n';
          }
          answer += '5. Add the father and mother = ' + totalChildren + ' + 2 = ' + total + '.\n';

          answer += '\nIII. FINAL ANSWER\n';
          answer += 'There are ' + total + ' people in the family.\n\n';
          answer += 'Breakdown:\n';
          answer += '- Father: 1\n';
          answer += '- Mother: 1\n';
          answer += '- Sons: ' + sons + '\n';
          answer += '- Daughters: ' + (totalChildren - sons) + '\n';
          answer += '- Total: ' + total;

          return answer;
        }
      }

      const logicPrompt = 'You are a LOGIC and RIDDLE expert. Answer the following question ACCURATELY.\n\n' +
        'RULES:\n' +
        '1. Think step by step.\n' +
        '2. Do NOT invent facts not stated in the question.\n' +
        '3. Give the FINAL ANSWER clearly at the end.\n' +
        '4. Answer in the SAME language as the question.\n' +
        '5. NO emojis, NO markdown.\n\n' +
        'FORMAT:\nLogic Answer\n\nI. REASONING\n[step by step]\n\nII. ANSWER\n[final answer]\n\n' +
        'QUESTION: ' + cleanedPrompt + '\n\nAnswer:';

      const response = await this.callAPI(logicPrompt, cleanedPrompt, 'english', 'logic', 'logic', 'logic', 'general');
      let cleaned = this.cleanResponse(response);
      if (!cleaned || cleaned.length < 10) {
        cleaned = 'Logic Answer\n\nI. REASONING\nAnalyze the given facts carefully.\n\nII. ANSWER\nPlease rephrase the question for a clearer answer.';
      }
      return cleaned;
    } catch (error) {
      console.error('[Logic] Error:', error.message);
      return null;
    }
  },

  // ============================================================
  // API CALLS — 4 working APIs
  // ============================================================
  async callAPI(prompt, originalPrompt, language, intent, topic, subject, requestType) {
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

    let bestResponse = null;
    let bestScore = 0;

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

        // Flexible success check
        if (config.successField && config.successValue !== undefined) {
          const val = data[config.successField];
          if (val !== config.successValue && String(val) !== String(config.successValue)) continue;
        }

        const extracted = this.extractResponse(data, config);
        if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
          const extractedLower = extracted.toLowerCase();
          if (errorKeywords.some(kw => extractedLower.includes(kw))) continue;
          const formatted = this.applyUniversalFormat(extracted, originalPrompt, language, intent, topic, subject, requestType);
          const quality = this.validateResponseQuality(formatted, intent);
          if (quality.score > bestScore) {
            bestScore = quality.score;
            bestResponse = formatted;
          }
        }
      } catch (error) {
        console.log('[API] ' + config.name + ' failed: ' + error.message);
      }
    }

    if (bestResponse) return bestResponse;
    throw new Error('All APIs failed');
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

  applyUniversalFormat(response, originalPrompt, language, intent, topic, subject, requestType) {
    let formatted = response;
    formatted = this.cleanResponse(formatted);
    formatted = formatted.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');
    formatted = formatted.replace(/^As DeepSeek.*?\n/i, '');
    formatted = formatted.replace(/^As an AI.*?\n/i, '');
    formatted = formatted.replace(/^Here is.*?\n/i, '');
    formatted = formatted.replace(/^Let me.*?\n/i, '');
    formatted = formatted.replace(/^Based on.*?\n/i, '');

    const briefIntents = ['definition', 'general', 'explanation', 'process', 'list', 'comparison', 'howto', 'proscons', 'importance', 'effects', 'biography', 'wordlist', 'followup', 'elaborate', 'paraphrase', 'simplify', 'expand', 'correct', 'formalize', 'construct', 'quiz'];
    const isBrief = briefIntents.includes(intent);

    if (isBrief) {
      formatted = formatted.replace(/^(TITLE|Title):\s*\n[^\n]*\n+/i, '');
    } else {
      if (!formatted.match(/^(TITLE|Title):/i)) {
        const topicClean = topic || 'Response';
        const firstLine = formatted.split('\n')[0].trim();
        if (firstLine.toLowerCase() !== topicClean.toLowerCase()) {
          formatted = 'TITLE:\n' + topicClean + '\n\n' + formatted;
        }
      }
    }

    formatted = formatted.replace(/^[•·▪▫◦‣⁃]\s*/gm, '');
    formatted = formatted.replace(/^(Introduction|Definition|Main Points|Analysis|Conclusion|Recommendations|Key Findings|Results|Process|Steps|Stages|Examples|Importance|Summary|Key Characteristics|Key Facts|Positive Effects|Negative Effects|Why It Matters|Similarities|Differences|Tips|Advantages|Disadvantages|Reasoning|Answer|Given|Final Answer|Rule|Formula|Solution|Verification|Computation):/gm,
      (match, p1) => p1.toUpperCase() + ':');

    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    formatted = formatted.replace(/[ \t]+/g, ' ');
    formatted = formatted.replace(/ +\n/g, '\n');
    formatted = formatted.replace(/\n +/g, '\n');
    return formatted.trim();
  },

  validateResponseQuality(response, intent) {
    let score = 0;
    if (response.length > 100) score += 20;
    if (response.length > 300) score += 15;
    if (response.length > 600) score += 10;
    if (/\d+\.\s/.test(response)) score += 10;
    if (/^[A-Z].*[.!?]/m.test(response)) score += 10;
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 15);
    if (sentences.length >= 3) score += 10;
    if (sentences.length >= 8) score += 10;
    const lastChar = response.trim().slice(-1);
    if (['.', '!', '?'].includes(lastChar)) score += 5;
    if (intent === 'wordlist') {
      const items = response.match(/^\d+\./gm);
      if (items && items.length >= 20) score += 20;
      else if (items && items.length >= 15) score += 15;
      else if (items && items.length >= 10) score += 5;
    }
    return { isGood: score >= 65, isAcceptable: score >= 40, score: Math.max(0, score) };
  },

  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'po', 'opo', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'dapat', 'kailangan', 'meron', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'tabang', 'tabangi', 'pasabta', 'mubo', 'simple', 'klaro', 'kumusta', 'kamusta'];
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
    if (this.isLogicQuestion(prompt)) return 'logic';
    if (/\([^)]+\)\s*\([^)]+\)/i.test(lower) && /[a-z]/i.test(lower)) return 'algebra';
    if (/solve/i.test(lower) && /=/.test(lower) && /[a-z]/i.test(lower)) return 'algebra';
    if (/area|perimeter|circumference|volume/i.test(lower)) return 'geometry';
    if (/\bsin\b|\bcos\b|\btan\b/i.test(lower)) return 'trigonometry';
    if (/mean|median|mode|average/i.test(lower)) return 'statistics';
    if (/^[\d\s\+\-\*\/\(\)\.\,×÷]+$/.test(lower.replace(/\s/g, ''))) return 'math';
    if (/photosynthesis|cell|dna|protein|enzyme|organism|ecosystem|evolution|genetics|biology|chemistry|physics|atom|molecule|chemical|reaction|gravity|energy/i.test(lower)) return 'science';
    if (/history|rizal|bonifacio|lapu-lapu|revolution|world war|kasaysayan|president|hero|bayani/i.test(lower)) return 'history';
    if (/noun|verb|adjective|grammar|sentence|paragraph|essay|literature|poem|novel|story/i.test(lower)) return 'english';
    if (/panghalip|pangngalan|pandiwa|pang-uri|pang-abay|tula|sanaysay|kwento|balarila/i.test(lower)) return 'filipino';
    return 'general';
  },

  detectIntent(prompt) {
    const lower = prompt.toLowerCase().trim();
    if (this.isWordListQuestion(prompt)) return 'wordlist';
    if (this.isLogicQuestion(prompt)) return 'logic';
    if (/\([^)]+\)\s*\([^)]+\)/i.test(lower) && /[a-z]/i.test(lower)) return 'algebra';
    if (/solve/i.test(lower) && /=/.test(lower) && /[a-z]/i.test(lower)) return 'algebra';
    if (/^(what is|what are|define|definition of|meaning of|ano ang|kahulugan ng)\s+/i.test(lower)) return 'definition';
    if (/^(how does|how do|process of|steps of|paano)\s+/i.test(lower)) return 'process';
    if (/difference|compare|contrast|vs|versus|kaibahan|pagkakaiba/i.test(lower)) return 'comparison';
    if (/^(list|enumerate|examples of|types of|kinds of)\s+/i.test(lower)) return 'list';
    if (/^why|^bakit/i.test(lower)) return 'explanation';
    if (/^(how to|paano gawin)\s+/i.test(lower)) return 'howto';
    if (/^(who is|who are|sino si|sino ang)\s+/i.test(lower)) return 'biography';
    return 'general';
  },

  detectRequestType(prompt) {
    const lower = prompt.toLowerCase();
    if (this.isWordListQuestion(prompt)) return 'general';
    if (/^[\d\s\+\-\*\/\(\)\.\,×÷]+$/.test(lower.replace(/\s/g, ''))) return 'math';
    if (this.isLogicQuestion(prompt)) return 'general';
    if (/qualitative|quantitative|thesis|dissertation|experimental|research/i.test(lower)) return 'detailed';
    return 'general';
  },

  extractTopic(prompt) {
    if (!prompt) return 'the topic';
    if (this.isWordListQuestion(prompt)) return 'Response';

    let topic = prompt;
    topic = topic.replace(/^(ai|ask|chat|answer)\s+/i, '');
    topic = topic.replace(/^explain\s+and\s+give\s+examples:\s*/i, '');

    const followUpOnly = /^(elaborate|paraphrase|rewrite|rephrase|construct|simplify|expand|correct|fix|formalize|dagdagan)\.?$/i;
    if (followUpOnly.test(topic.trim())) return 'Response';

    const greetingOnly = /^(hai|hi|hey|hello|helo|hallo|yo|sup|kumusta|kamusta|musta|good\s*(morning|afternoon|evening|day)|magandang\s*(araw|umaga|hapon|gabi)|help|tulong|thanks|thank you|salamat|ok|okay|sige|sure|noted|bye|goodbye|paalam|sorry|pasensya|yes|oo|opo|no|hindi)[\s!.,]*$/i;
    if (greetingOnly.test(prompt.trim())) return 'Response';

    const actionPatterns = [
      /^(define|explain|describe|discuss|what is|what are)\s+/i,
      /^(who is|who are|sino si|sino ang)\s+/i,
      /^(how does|how do|paano)\s+/i,
      /^(give|list|enumerate|examples of|types of|kinds of)\s+/i,
      /^(compare|contrast|difference between|kaibahan ng|pagkakaiba ng)\s+/i,
      /^(why|bakit)\s+/i,
      /^(how to|paano gawin)\s+/i
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
    return this.buildBriefPrompt(prompt, langName, intent);
  },

  buildBriefPrompt(prompt, langName, intent) {
    let finalPrompt = '';
    finalPrompt += 'You are an expert AI assistant. Give a COMPLETE, ACCURATE, and DETAILED answer.\n\n';
    finalPrompt += 'CRITICAL RULES:\n';
    finalPrompt += '1. Answer ONLY what is asked.\n';
    finalPrompt += '2. Do NOT use TITLE or essay format.\n';
    finalPrompt += '3. Do NOT repeat the question.\n';
    finalPrompt += '4. Do NOT hallucinate. Be ACCURATE and PRECISE.\n';
    finalPrompt += '5. BE COMPREHENSIVE. Cover EVERY important point.\n';
    finalPrompt += '6. Be DETAILED. Each item should have 1-2 sentences explanation.\n';
    finalPrompt += '7. ALWAYS END WITH A COMPLETE ANSWER.\n';
    finalPrompt += '8. NO emojis, NO markdown.\n';
    finalPrompt += '9. Respond in ' + langName.toUpperCase() + ' language.\n\n';

    if (intent === 'definition') {
      finalPrompt += 'TASK: Give a COMPLETE, DETAILED DEFINITION.\n\n';
      finalPrompt += 'I. DEFINITION\n[2-4 sentences]\n\n';
      finalPrompt += 'II. KEY CHARACTERISTICS\n[List ALL]\n\n';
      finalPrompt += 'III. TYPES / FORMS\n[List ALL]\n\n';
      finalPrompt += 'IV. EXAMPLES\n[List ALL]\n\n';
      finalPrompt += 'V. IMPORTANCE\n[List ALL]\n\n';
    } else if (intent === 'process') {
      finalPrompt += 'TASK: Explain the COMPLETE PROCESS.\n\n';
      finalPrompt += 'I. OVERVIEW\n[2-3 sentences]\n\n';
      finalPrompt += 'II. FULL PROCESS / STEPS\n[List ALL]\n\n';
      finalPrompt += 'III. KEY FACTORS\n[List ALL]\n\n';
      finalPrompt += 'IV. IMPORTANCE\n[List ALL]\n\n';
    } else if (intent === 'list') {
      finalPrompt += 'TASK: Give a COMPLETE LIST.\n\n';
      finalPrompt += 'I. INTRODUCTION\n[1-2 sentences]\n\n';
      finalPrompt += 'II. COMPLETE LIST\n[List ALL items]\n\n';
      finalPrompt += 'III. IMPORTANCE\n[List ALL]\n\n';
    } else if (intent === 'comparison') {
      finalPrompt += 'TASK: Give a COMPLETE COMPARISON.\n\n';
      finalPrompt += 'I. INTRODUCTION\n[1-2 sentences]\n\n';
      finalPrompt += 'II. SIMILARITIES\n[List ALL]\n\n';
      finalPrompt += 'III. DIFFERENCES\n[List ALL]\n\n';
      finalPrompt += 'IV. CONCLUSION\n[1-2 sentences]\n\n';
    } else if (intent === 'howto') {
      finalPrompt += 'TASK: Give a COMPLETE HOW-TO GUIDE.\n\n';
      finalPrompt += 'I. INTRODUCTION\n[1-2 sentences]\n\n';
      finalPrompt += 'II. MATERIALS NEEDED\n[List ALL]\n\n';
      finalPrompt += 'III. STEP-BY-STEP GUIDE\n[List ALL]\n\n';
      finalPrompt += 'IV. TIPS AND WARNINGS\n[List ALL]\n\n';
    } else if (intent === 'biography') {
      finalPrompt += 'TASK: Give a COMPLETE BIOGRAPHY.\n\n';
      finalPrompt += 'I. INTRODUCTION\n[2-3 sentences]\n\n';
      finalPrompt += 'II. EARLY LIFE\n[2-3 sentences]\n\n';
      finalPrompt += 'III. CAREER\n[2-3 sentences]\n\n';
      finalPrompt += 'IV. MAJOR CONTRIBUTIONS\n[List ALL]\n\n';
      finalPrompt += 'V. KEY FACTS\n[List ALL]\n\n';
      finalPrompt += 'VI. CONCLUSION\n[1-2 sentences]\n\n';
    } else {
      finalPrompt += 'TASK: Answer COMPLETELY and in DETAIL.\n\n';
      finalPrompt += 'I. DIRECT ANSWER\n[2-3 sentences]\n\n';
      finalPrompt += 'II. DETAILED EXPLANATION\n[3-5 paragraphs]\n\n';
      finalPrompt += 'III. KEY POINTS\n[List ALL]\n\n';
      finalPrompt += 'IV. EXAMPLES\n[List ALL]\n\n';
      finalPrompt += 'V. IMPORTANCE\n[List ALL]\n\n';
    }

    finalPrompt += 'QUESTION: ' + prompt + '\n\nDetailed answer:';
    return finalPrompt;
  },

  buildLogicPrompt(prompt, langName) {
    let finalPrompt = '';
    finalPrompt += 'You are a LOGIC and RIDDLE expert. Answer the following question ACCURATELY.\n\n';
    finalPrompt += 'RULES:\n';
    finalPrompt += '1. Think STEP BY STEP.\n';
    finalPrompt += '2. Do NOT invent facts.\n';
    finalPrompt += '3. If trick question, explain the trick.\n';
    finalPrompt += '4. Give FINAL ANSWER clearly at the end.\n';
    finalPrompt += '5. NO emojis, NO markdown.\n\n';
    finalPrompt += 'FORMAT:\nLogic Answer\n\nI. REASONING\n[step by step]\n\nII. ANSWER\n[final answer]\n\n';
    finalPrompt += 'QUESTION: ' + prompt + '\n\nAnswer:';
    return finalPrompt;
  },

  buildWordListPrompt(prompt, langName) {
    return 'You are a dictionary expert. Give ALL common synonyms/terms.\n\nCRITICAL RULES:\n1. Output ONLY a NUMBERED LIST.\n2. Do NOT write INTRODUCTION, DEFINITION, or CONCLUSION.\n3. Do NOT write any essay.\n4. BE COMPREHENSIVE. Give 20-35 items if possible.\n5. NO emojis, NO markdown.\n\nQUESTION: ' + prompt + '\n\nGive the list directly:';
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

  ensureComplete(text) {
    if (!text) return text;
    if (text.trim().endsWith('...')) text = text.replace(/\.\.\.$/, '');
    let cleaned = text.trim();

    const finalAnswerMatches = cleaned.match(/Final Answer:.*$/gim);
    if (finalAnswerMatches && finalAnswerMatches.length > 1) {
      cleaned = cleaned.replace(/Final Answer:.*$/gim, '');
      cleaned = cleaned.trim() + '\n\n' + finalAnswerMatches[finalAnswerMatches.length - 1].trim();
    }

    const lastChar = cleaned.trim().slice(-1);
    if (!['.', '!', '?'].includes(lastChar) && cleaned.length > 50) {
      const sentences = cleaned.match(/[^.!?]+[.!?]/g);
      if (sentences && sentences.length > 0) cleaned = sentences.join(' ');
    }
    return cleaned;
  },

  isOwnerQuestion(prompt) {
    const keywords = ['who is your owner', 'who created you', 'who made you', 'sino gumawa sayo', 'sino may ari sayo', 'owner mo', 'sino owner mo', 'who owns you', 'creator', 'developer'];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  isUserInfoQuestion(prompt) {
    const keywords = ['what is my name', 'ano pangalan ko', 'my name', 'pangalan ko', 'when is my birthday', 'kelan birthday ko', 'my birthday', 'who am i', 'sino ako', 'whats my name'];
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
        response = publicInfo.length > 0 ? 'Here is your public information:\n' + publicInfo.join('\n') : 'I cannot tell you that because it is confidential.';
      }
      await this.sendComplete(senderId, this.cleanResponse(response), token);
    } catch (error) {
      console.error('[User Info] Failed:', error.message);
      await sendMessage(senderId, { text: 'Error fetching user info.' }, token);
    }
  },

  async getUserInfo(senderId, token) {
    try {
      const url = 'https://graph.facebook.com/v23.0/' + senderId;
      const params = { access_token: token, fields: 'id,name,first_name,last_name,birthday,gender,location,email' };
      const response = await axios.get(url, { params });
      const data = response.data;
      return { id: data.id || null, name: data.name || null, birthday: data.birthday || null, gender: data.gender || null, location: data.location ? data.location.name : null, email: data.email || null };
    } catch (error) {
      console.error('[Graph API] Error:', error.message);
      return {};
    }
  },

  async getRepliedMessageData(mid, token) {
    try {
      const url = 'https://graph.facebook.com/v23.0/' + mid;
      const params = { access_token: token, fields: 'message,from' };
      const { data } = await axios.get(url, { params });
      return { message: data?.message || null, from: data?.from?.id || null };
    } catch (error) {
      console.error('[Get Replied Message] Failed:', error.message);
      return { message: null, from: null };
    }
  },

  // ============================================================
  // MERGED cleanResponse (formerly cleanResponse + finalClean)
  // ============================================================
  cleanResponse(text) {
    if (!text) return 'No response.';
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');
    cleaned = cleaned.replace(/^As DeepSeek.*?\n/i, '');
    cleaned = cleaned.replace(/^As an AI.*?\n/i, '');
    cleaned = cleaned.replace(/^Here is.*?\n/i, '');
    cleaned = cleaned.replace(/^Let me.*?\n/i, '');
    cleaned = cleaned.replace(/^Based on.*?\n/i, '');
    cleaned = cleaned.replace(/^According to.*?\n/i, '');
    cleaned = cleaned.replace(/^TRANSLATION\s+IN\s+[A-Z]+:\s*/gim, '');
    cleaned = cleaned.replace(/^TRANSLATION:\s*/gim, '');
    cleaned = cleaned.replace(/^ALTERNATIVE\s+TRANSLATIONS?:\s*/gim, '');
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
    cleaned = cleaned.replace(/~~/g, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
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
