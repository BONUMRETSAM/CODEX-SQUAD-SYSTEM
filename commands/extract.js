const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['extract'],
  description: 'Scan image text before sending to gemini',
  usage: 'Reply to an image with "extract"',
  version: '4.0.0',
  author: 'codex',
  category: 'Utility',
  cooldown: 10,

  // ===== BAGONG API KEY =====
  OCR_API_KEY: 'K81011572188957',

  async execute(senderId, args, token, event) {
    try {
      const imageUrl = await this.extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
        return;
      }

      console.log('[extract] Scanning image...');
      const scanResult = await this.scanImage(imageUrl, token);

      if (!scanResult.valid) {
        await sendMessage(senderId, {
          text: `Image scan failed.\n\nReason: ${scanResult.reason}\n\nPlease send a clearer image.`
        }, token);
        return;
      }

      await sendMessage(senderId, { text: scanResult.text.substring(0, 4000) }, token);

    } catch (error) {
      console.error('[extract] Error:', error.message);
      await sendMessage(senderId, { text: 'Error scanning image. Please try again.' }, token);
    }
  },

  // ============================================================
  // SCAN IMAGE - MULTIPLE OCR APIs
  // ============================================================
  async scanImage(imageUrl, token) {
    let ocrText = '';
    let lastError = '';

    // ===== TRY OCR.SPACE (NEW KEY) =====
    try {
      console.log('[scan] Trying OCR.space with new key...');
      ocrText = await this.extractTextFromOCRspace(imageUrl);
      if (ocrText && ocrText.trim().length > 5) {
        console.log('[scan] OCR.space success! Length:', ocrText.length);
      }
    } catch (error) {
      lastError = error.message;
      console.log('[scan] OCR.space failed:', error.message);
    }

    // ===== TRY ALTERNATIVE IF FAILED =====
    if (!ocrText || ocrText.trim().length < 5) {
      try {
        console.log('[scan] Trying alternative OCR...');
        ocrText = await this.extractTextFromAlternative(imageUrl);
        if (ocrText && ocrText.trim().length > 5) {
          console.log('[scan] Alternative OCR success! Length:', ocrText.length);
        }
      } catch (error) {
        lastError = error.message;
        console.log('[scan] Alternative OCR failed:', error.message);
      }
    }

    // ===== TRY GEMINI VISION AS LAST RESORT =====
    if (!ocrText || ocrText.trim().length < 5) {
      try {
        console.log('[scan] Trying Gemini vision...');
        ocrText = await this.extractTextFromGemini(imageUrl);
        if (ocrText && ocrText.trim().length > 5) {
          console.log('[scan] Gemini vision success! Length:', ocrText.length);
        }
      } catch (error) {
        lastError = error.message;
        console.log('[scan] Gemini vision failed:', error.message);
      }
    }

    // ===== VALIDATE =====
    const validation = this.validateScan(ocrText);
    return {
      valid: validation.valid,
      reason: validation.reason + (lastError ? ` (${lastError})` : ''),
      text: ocrText
    };
  },

  // ============================================================
  // VALIDATE SCAN - RELAXED
  // ============================================================
  validateScan(ocrText) {
    if (!ocrText || ocrText.trim().length === 0) {
      return { valid: false, reason: 'No text detected in the image.' };
    }

    if (ocrText.trim().length < 3) {
      return { valid: false, reason: 'Text is too short.' };
    }

    const lettersAndNumbers = ocrText.replace(/[^a-zA-Z0-9]/g, '');
    if (lettersAndNumbers.length < 2) {
      return { valid: false, reason: 'No readable text detected.' };
    }

    const totalChars = ocrText.length;
    const specialChars = ocrText.replace(/[a-zA-Z0-9\s.,!?;:'"()\-]/g, '').length;
    const specialRatio = specialChars / totalChars;

    if (specialRatio > 0.6) {
      return { valid: false, reason: 'Too many unrecognized characters.' };
    }

    return { valid: true, reason: 'Scan OK' };
  },

  // ============================================================
  // OCR VIA OCR.SPACE (NEW KEY)
  // ============================================================
  async extractTextFromOCRspace(imageUrl) {
    const apiKey = this.OCR_API_KEY;
    const url = `https://api.ocr.space/parse/imageurl?apikey=${apiKey}&url=${encodeURIComponent(imageUrl)}&language=eng,tgl&isOverlayRequired=false&OCREngine=2&scale=true&isTable=true`;

    const response = await axios.get(url, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });

    const data = response.data;

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage?.[0] || 'OCR.space error');
    }

    return data?.ParsedResults?.[0]?.ParsedText || '';
  },

  // ============================================================
  // OCR VIA ALTERNATIVE
  // ============================================================
  async extractTextFromAlternative(imageUrl) {
    const apiKey = 'helloworld';
    const url = `https://api.ocr.space/parse/imageurl?apikey=${apiKey}&url=${encodeURIComponent(imageUrl)}&language=eng&isOverlayRequired=false&OCREngine=1`;

    const response = await axios.get(url, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });

    const data = response.data;

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage?.[0] || 'Alternative OCR error');
    }

    return data?.ParsedResults?.[0]?.ParsedText || '';
  },

  // ============================================================
  // OCR VIA GEMINI VISION (LAST RESORT)
  // ============================================================
  async extractTextFromGemini(imageUrl) {
    const prompt = 'Extract ALL text from this image. Return only the text, no descriptions, no explanations.';
    const url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(prompt)}&imageurl=${encodeURIComponent(imageUrl)}`;

    const response = await axios.get(url, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });

    if (response.data && (response.data.response || response.data.message)) {
      return response.data.response || response.data.message;
    }

    const chippUrl = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(prompt)}&url=${encodeURIComponent(imageUrl)}`;
    const chippResponse = await axios.get(chippUrl, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });

    if (chippResponse.data?.status === true && chippResponse.data?.response) {
      return chippResponse.data.response;
    }

    throw new Error('Gemini vision failed');
  },

  // ============================================================
  // EXTRACT IMAGE URL
  // ============================================================
  async extractImageUrl(event, token) {
    try {
      if (event?._scanImageUrl) {
        return event._scanImageUrl;
      }
      if (event?.message?.reply_to?.mid) {
        return await this.getRepliedImage(event.message.reply_to.mid, token);
      }
      if (event?.message?.attachments && event.message.attachments.length > 0) {
        for (const attachment of event.message.attachments) {
          if (attachment.type === 'image' || attachment.type === 'photo') {
            const url = attachment.payload?.url || attachment.url || null;
            if (url) {
              const urlObj = new URL(url);
              urlObj.searchParams.set('access_token', token);
              return urlObj.toString();
            }
          }
        }
      }
    } catch (err) {
      console.error('[extract] Image Extraction Failed:', err);
    }
    return null;
  },

  // ============================================================
  // GET REPLIED IMAGE
  // ============================================================
  async getRepliedImage(mid, token) {
    try {
      const url = `https://graph.facebook.com/v21.0/${mid}/attachments`;
      const params = { access_token: token };
      const response = await axios.get(url, { params, timeout: 30000 });
      if (response?.data?.data && response.data.data.length > 0) {
        const attachment = response.data.data[0];
        const imageUrl = attachment?.image_data?.url || attachment?.url || null;
        if (imageUrl) {
          const urlObj = new URL(imageUrl);
          urlObj.searchParams.set('access_token', token);
          return urlObj.toString();
        }
      }
      return null;
    } catch (err) {
      console.error('[extract] Replied Image Failed:', err.message);
      return null;
    }
  }
};
