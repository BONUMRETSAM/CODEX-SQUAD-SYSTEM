// gemini.js — v3.1 VERIFIED ACCURACY
// Multi-pass verification + confidence scoring
// Pure prompt engineering — NO hardcoded answers ever.
const axios = require('axios');

module.exports = {
  // ================================================================
  // MAIN ENTRY
  // ================================================================
  async callGeminiAPI(prompt, imageUrl, detectedLanguage = 'english') {
    try {
      const imageLang = await this.detectImageLanguage(imageUrl, detectedLanguage);
      const imageType = await this.detectImageType(imageUrl, prompt);
      console.log('[Gemini] Lang:', imageLang, '| Type:', imageType);

      if (['worksheet', 'quiz', 'exam'].includes(imageType)) {
        return await this.analyzeWorksheet(imageUrl, imageLang, prompt);
      }
      if (imageType === 'math') {
        return await this.analyzeMath(imageUrl, imageLang, prompt);
      }
      if (imageType === 'puzzle') {
        return await this.analyzePuzzle(imageUrl, imageLang, prompt);
      }

      const geminiPrompt = this.buildAdaptivePrompt(prompt, imageType, imageLang);
      const response = await this.callGeminiRaw(geminiPrompt, imageUrl);
      return this.processGeminiResponse(response);
    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      throw error;
    }
  },

  // ================================================================
  // RAW CALL (with retry)
  // ================================================================
  async callGeminiRaw(prompt, imageUrl, retries = 3) {
    const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(prompt)}&imageurl=${encodeURIComponent(imageUrl)}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios.get(apiUrl, {
          timeout: 90000,
          headers: { 'Accept': 'application/json' },
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024
        });
        if (res.status === 200 && res.data?.response) return res.data.response;
      } catch (err) {
        console.log(`[Gemini] Attempt ${attempt}/${retries} failed:`, err.message);
        if (attempt >= retries) throw err;
        const delay = err.response?.status === 429 ? 10000 : err.response?.status >= 500 ? 5000 : 2000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error('Gemini API failed after retries');
  },

  // ================================================================
  // LANGUAGE DETECT
  // ================================================================
  async detectImageLanguage(imageUrl, fallback = 'english') {
    try {
      const p = `What language is the text in this image written in? Reply with ONLY one word: Tagalog, Bisaya, English, or Spanish.`;
      const res = await this.callGeminiRaw(p, imageUrl, 2);
      const r = (res || '').toLowerCase().trim();
      if (r.includes('tagalog') || r.includes('filipino')) return 'tagalog';
      if (r.includes('bisaya') || r.includes('cebuano')) return 'bisaya';
      if (r.includes('spanish')) return 'spanish';
      return 'english';
    } catch { return fallback; }
  },

  // ================================================================
  // TYPE DETECT
  // ================================================================
  async detectImageType(imageUrl, userPrompt = '') {
    try {
      const p = `Classify this image into ONE category. Reply with ONLY the category word.

Categories:
- worksheet (activity sheet, quiz, exam, homework)
- math (equation, algebra, calculus, geometry)
- puzzle (logic puzzle, brain teaser, IQ test)
- diagram (labeled parts, science diagram)
- essay (reading passage, article)
- translation (foreign text)
- meme (joke, funny)
- photo (person, place, object)
- screenshot (app, website, chat)
- chart (graph, table)
- receipt (invoice, bill)

Reply with ONLY one word.`;
      const res = await this.callGeminiRaw(p, imageUrl, 2);
      const raw = (res || '').toLowerCase();
      const cats = ['worksheet','quiz','exam','math','puzzle','diagram','essay','translation','meme','photo','screenshot','chart','receipt'];
      for (const c of cats) {
        if (raw.includes(c)) {
          if (c === 'quiz' || c === 'exam') return 'worksheet';
          return c;
        }
      }
      return 'photo';
    } catch { return 'photo'; }
  },

  // ================================================================
  // 🆕 MATH ANALYSIS — 3-PASS VERIFIED
  // Pass 1: Solve
  // Pass 2: Independent verification
  // Pass 3: Clean format + confidence
  // ================================================================
  async analyzeMath(imageUrl, language, userPrompt = '') {
    const langName = this.getLanguageName(language);

    // ===== PASS 1: SOLVE =====
    const solvePrompt = `You are an EXPERT MATH TUTOR. Solve the math problem in this image COMPLETELY.

CRITICAL RULES:
- Show EVERY step. Do not skip.
- Identify the problem type FIRST (system, exponential, quadratic, geometry, etc.).
- Use correct formulas and identities.
- Verify the answer at the end by plugging back.
- Respond in ${langName.toUpperCase()}.

IDENTITY REFERENCE (use when relevant):
- x² + y² = (x + y)² − 2xy
- x³ + y³ = (x + y)³ − 3xy(x + y)
- x³ − y³ = (x − y)³ + 3xy(x − y)
- (x + y)² = x² + 2xy + y²
- For A^B = 1: check Base=1, Base=−1 & Even Exp, Exp=0 & Base≠0 (ALL 3 cases!)
- Quadratic formula: x = (−b ± √(b²−4ac)) / 2a

OUTPUT FORMAT (follow EXACTLY):

PROBLEM:
[restate the problem exactly as shown in the image]

GIVEN:
- [given 1]
- [given 2]

FORMULA:
[the key formula or identity used]

SOLUTION:
Step 1: [computation]
Step 2: [computation]
Step 3: [computation]

VERIFICATION:
[substitute the answer back into the original equation]

ANSWER:
[final answer]

CONFIDENCE:
[HIGH / MEDIUM / LOW]

${userPrompt ? `USER ASKED: ${userPrompt}` : ''}`;

    const solved = await this.callGeminiRaw(solvePrompt, imageUrl);

    // ===== PASS 2: INDEPENDENT VERIFICATION =====
    const verifyPrompt = `You are a STRICT MATH VERIFIER. Another AI solved a math problem. Your job is to CHECK if the answer is CORRECT.

The problem is shown in the image.
The other AI's solution:
${solved}

YOUR TASK:
1. Independently solve the problem yourself, WITHOUT looking at the other AI's steps first.
2. Then COMPARE your answer with theirs.
3. If answers MATCH → confirm with "MATCH".
4. If answers DIFFER → show BOTH, identify which is correct, and explain the error.
5. Check for:
   - Arithmetic mistakes
   - Wrong formula/identity
   - Missed cases (e.g., A^B = 1 has 3 cases)
   - Incorrect signs
   - Skipped steps

OUTPUT FORMAT:

MY INDEPENDENT SOLUTION:
[your own solve, step by step]

COMPARISON:
[MATCH / MISMATCH]
[If mismatch: explain whose answer is correct and why]

FINAL VERIFIED ANSWER:
[the confirmed correct answer]

VERIFIED CONFIDENCE:
[HIGH / MEDIUM / LOW]

REASON FOR CONFIDENCE:
[1-2 sentences why you gave this confidence level]`;

    const verified = await this.callGeminiRaw(verifyPrompt, imageUrl);

    // ===== PASS 3: CLEAN OUTPUT =====
    const cleanPrompt = `Format this verified math solution into a clean final output.

RULES:
- Use EXACTLY this structure:

PROBLEM:
[restate]

GIVEN:
- [given 1]
- [given 2]

FORMULA:
[key formula]

SOLUTION:
Step 1: ...
Step 2: ...
Step 3: ...

VERIFICATION:
[check]

ANSWER:
[final answer]

${userPrompt ? `CHOICE:\n[if multiple choice was in original image, add correct letter here]\n` : ''}
CONFIDENCE:
[HIGH / MEDIUM / LOW]

- Remove ALL AI preamble ("Here is", "Sure", "Of course", "Let me").
- Remove meta-commentary about your process.
- Do NOT change the math.
- Keep the FINAL VERIFIED answer (from the verifier).
- If CONFIDENCE is LOW, ADD this warning line at the very end:
  "⚠️ Hindi sigurado ang sagot na ito — paki-verify manually."

Return ONLY the clean output.

VERIFIED SOLUTION:
${verified}`;

    const cleaned = await this.callGeminiRaw(cleanPrompt, imageUrl);
    return this.processGeminiResponse(cleaned);
  },

  // ================================================================
  // WORKSHEET ANALYSIS — 3-PASS VERIFIED
  // ================================================================
  async analyzeWorksheet(imageUrl, language, userPrompt = '') {
    const langName = this.getLanguageName(language);

    // PASS 1: Extract structure
    const extractPrompt = `Read this worksheet carefully. Extract the EXACT structure and ALL questions.

OUTPUT FORMAT:

TITLE: [worksheet title exactly as written]
INSTRUCTIONS: [directions at the top, if any]

PART [X]: [part title]
  Direction: [if any]
  Item 1: [full question text]
  Item 2: [full question text]
  ...

PART [Y]: [part title]
  ...

List EVERY part and EVERY item. Do not answer yet.`;

    const extracted = await this.callGeminiRaw(extractPrompt, imageUrl);

    // PASS 2: Answer everything
    const answerPrompt = `You are answering a student's worksheet. Follow the EXACT structure below.

WORKSHEET STRUCTURE:
${extracted}

ANSWER RULES:
1. Match the EXACT structure above — same parts, same numbering.
2. Answer EACH item — NEVER skip.
3. For SEQUENCE: give numbered order (1, 2, 3...).
4. For TRUE/FALSE or PROPER/IMPROPER: give answer + brief reason.
5. For MULTIPLE CHOICE: give letter + full answer.
6. For FILL-IN-BLANK: give the exact word/phrase.
7. For ESSAY/EXPLAIN: 2-3 clear sentences.
8. For MATH: show step-by-step.
9. If unsure about an item, mark it with "⚠️ (uncertain)".
10. Respond in ${langName.toUpperCase()}.

OUTPUT FORMAT (MUST FOLLOW EXACTLY):

[Title]

PART [X] — [Part Title]
[Direction if any]

1. [Answer]
2. [Answer]
3. [Answer]
...

PART [Y] — [Part Title]

1. [Answer]
2. [Answer]
...

Now produce the COMPLETE answered worksheet.`;

    const answered = await this.callGeminiRaw(answerPrompt, imageUrl);

    // PASS 3: Verify and clean
    const verifyPrompt = `Review this answered worksheet and verify + clean it.

CHECK:
1. Is every item answered? (No skips)
2. Are answers accurate? Review each carefully.
3. Fix any errors you find.
4. Is the format consistent with the structure?
5. Remove any AI preamble, meta-text, or commentary.

Return ONLY the clean, verified, final answered worksheet.

ANSWERED WORKSHEET:
${answered}`;

    const verified = await this.callGeminiRaw(verifyPrompt, imageUrl);
    return this.processGeminiResponse(verified);
  },

  // ================================================================
  // PUZZLE ANALYSIS
  // ================================================================
  async analyzePuzzle(imageUrl, language, userPrompt = '') {
    const langName = this.getLanguageName(language);

    const prompt = `You are a PUZZLE EXPERT. Analyze this puzzle CAREFULLY.

STEPS:
1. Read the QUESTION in the image.
2. Identify puzzle type: visual, logic, math-sequence, word, trick.
3. For VISUAL: compare EACH choice's shape/orientation against the target.
4. For LOGIC: find the pattern.
5. For TRICK: state the real logic.
6. VERIFY your answer before finalizing — double-check your reasoning.

OUTPUT FORMAT (follow EXACTLY):

ANSWER:
[exact answer]

REASON:
[1-2 sentences why]

CONFIDENCE:
[HIGH / MEDIUM / LOW]

${userPrompt ? `USER QUESTION: ${userPrompt}` : ''}`;

    const response = await this.callGeminiRaw(prompt, imageUrl);
    return this.processGeminiResponse(response);
  },

  // ================================================================
  // ADAPTIVE PROMPT (for other types)
  // ================================================================
  buildAdaptivePrompt(userPrompt, imageType, language = 'english') {
    const langName = this.getLanguageName(language);
    const q = userPrompt || 'Analyze this image';

    const promptsByType = {
      diagram: `Identify ALL parts and functions.
OUTPUT:
Part 1: [name] — [function]
Part 2: [name] — [function]
Process: [brief explanation]`,
      essay: `Summarize main idea and key points.
OUTPUT:
Summary: [summary]
Key Points:
- [point 1]
- [point 2]`,
      translation: `Translate the foreign text.
OUTPUT:
Original: [text]
Translation: [text]`,
      meme: `Explain briefly (1-2 sentences).`,
      chart: `Read the data.
OUTPUT:
Type: [bar/line/pie]
Main Trend: [trend]
Key Data:
- [data point 1]`,
      receipt: `Extract info.
OUTPUT:
Items:
- [item] — [price]
Total: [total]
Date: [date]`,
      screenshot: `Describe what's shown (2-3 sentences).`,
      photo: `Describe what you see (2-3 sentences).`
    };

    const selected = promptsByType[imageType] || promptsByType.photo;

    return `You are an EXPERT image analyzer. Follow the format EXACTLY.

${selected}

USER QUESTION: ${q}

RULES:
- Respond in ${langName.toUpperCase()}
- Plain text only
- Be ACCURATE and DIRECT
- Do NOT add preamble like "Here is my analysis"`;
  },

  // ================================================================
  // RESPONSE PROCESSOR — strips AI preamble
  // ================================================================
  processGeminiResponse(response) {
    let p = response || '';
    p = p
      .replace(/^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i, '')
      .replace(/^Here is my analysis.*?\n/i, '')
      .replace(/^Let me analyze.*?\n/i, '')
      .replace(/^Based on my analysis.*?\n/i, '')
      .replace(/^I can see that.*?\n/i, '')
      .replace(/^Ako ay si Gemini.*?\n/i, '')
      .replace(/^Narito ang aking analysis.*?\n/i, '')
      .replace(/^Hayaan mong i-analyze ko.*?\n/i, '')
      .replace(/^Batay sa aking analysis.*?\n/i, '')
      .replace(/^Nakikita ko na.*?\n/i, '')
      .replace(/^Here is the.*?\n/i, '')
      .replace(/^Sure[,!]?\s*/i, '')
      .replace(/^Of course[,!]?\s*/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return this.cleanResponse(p);
  },

  // ================================================================
  // CLEAN RESPONSE
  // ================================================================
  cleanResponse(text) {
    if (!text) return 'Walang tugon.';
    let cleaned = text.trim();
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/~~/g, '');
    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    return cleaned.trim() || 'Walang tugon.';
  },

  // ================================================================
  // LANGUAGE NAME
  // ================================================================
  getLanguageName(code) {
    return {
      english: 'English', tagalog: 'Tagalog', bisaya: 'Bisaya',
      cebuano: 'Cebuano', spanish: 'Spanish'
    }[code] || 'English';
  }
};
