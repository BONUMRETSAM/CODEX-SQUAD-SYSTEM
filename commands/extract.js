const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['extract'],
  description: 'Scan image text before sending to gemini',
  usage: 'Reply to an image with "extract"',
  version: '2.0.0',
  author: 'codex',
  category: 'Utility',
  cooldown: 10,

  async execute(senderId, args, token, event) {
    try {
      const imageUrl = await this.extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
        return;
      }

      // ===== SCAN THE IMAGE =====
      console.log('[extract] Scanning image...');
      const scanResult = await this.scanImage(imageUrl, token);

      if (!scanResult.valid) {
        await sendMessage(senderId, {
          text: `Image scan failed.\n\nReason: ${scanResult.reason}\n\nPlease send a clearer image with:\n- Better lighting\n- Higher resolution\n- Less blur\n- Straight angle`
        }, token);
        return;
      }

      // ===== SCAN IS CLEAR - SEND TEXT =====
      await sendMessage(senderId, { text: scanResult.text.substring(0, 4000) }, token);

    } catch (error) {
      console.error('[extract] Error:', error.message);
      await sendMessage(senderId, { text: 'Error scanning image. Please try again.' }, token);
    }
  },

  // ============================================================
  // SCAN IMAGE - RETURNS { valid, reason, text }
  // ============================================================
  async scanImage(imageUrl, token) {
    const ocrText = await this.extractTextFromImage(imageUrl);
    const validation = this.validateScan(ocrText);
    return {
      valid: validation.valid,
      reason: validation.reason,
      text: ocrText
    };
  },

  // ============================================================
  // VALIDATE SCAN
  // ============================================================
  validateScan(ocrText) {
    if (!ocrText || ocrText.trim().length === 0) {
      return { valid: false, reason: 'No text detected in the image.' };
    }

    if (ocrText.trim().length < 10) {
      return { valid: false, reason: 'Text is too short. Image may be too small or blurry.' };
    }

    const lettersOnly = ocrText.replace(/[^a-zA-Z]/g, '');
    if (lettersOnly.length < 5) {
      return { valid: false, reason: 'No readable words detected. Text may be unclear.' };
    }

    const totalChars = ocrText.length;
    const specialChars = ocrText.replace(/[a-zA-Z0-9\s.,!?;:'"()\-]/g, '').length;
    const specialRatio = specialChars / totalChars;
    
    if (specialRatio > 0.3) {
      return { valid: false, reason: 'Too many unrecognized characters. Image may be blurry.' };
    }

    const words = ocrText.split(/\s+/).filter(w => w.length > 1);
    const validWords = words.filter(w => /^[a-zA-Z0-9.,!?;:'"()\-]+$/.test(w));
    
    if (words.length > 0 && (validWords.length / words.length) < 0.5) {
      return { valid: false, reason: 'Text is garbled or unclear.' };
    }

    return { valid: true, reason: 'Scan OK' };
  },

  // ============================================================
  // OCR: EXTRACT TEXT FROM IMAGE
  // ============================================================
  async extractTextFromImage(imageUrl) {
    try {
      const apiKey = 'K85096363488957';
      const url = `https://api.ocr.space/parse/imageurl?apikey=${apiKey}&url=${encodeURIComponent(imageUrl)}&language=eng,tgl&isOverlayRequired=false&OCREngine=2&scale=true&isTable=true`;

      const response = await axios.get(url, {
        timeout: 60000,
        headers: { 'Accept': 'application/json' }
      });

      const data = response.data;

      if (data.IsErroredOnProcessing) {
        return '';
      }

      return data?.ParsedResults?.[0]?.ParsedText || '';

    } catch (error) {
      console.error('[extract] OCR Error:', error.message);
      return '';
    }
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
