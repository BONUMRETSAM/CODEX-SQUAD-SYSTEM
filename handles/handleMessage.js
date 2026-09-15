const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const imageCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

const loadCommands = () => {
  const commandsDir = path.join(__dirname, '../commands');
  
  for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
    delete require.cache[require.resolve(`../commands/${file}`)];
    const command = require(`../commands/${file}`);
    
    const names = Array.isArray(command.name) ? command.name : [command.name];
    names.forEach(name => {
      if (typeof name === 'string') {
        commands.set(name.toLowerCase(), command);
      }
    });
  }
};

loadCommands();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of imageCache) {
    if (now - value.timestamp > CACHE_TTL) {
      imageCache.delete(key);
    }
  }
}, CACHE_TTL);

// ========== MATH DETECTION ==========
const isMathQuery = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  
  const mathKeywords = [
    'solve', 'equation', 'derivative', 'integral', 'limit', 'area', 'volume',
    'sin', 'cos', 'tan', 'mean', 'median', 'mode', 'probability', 'matrix',
    'algebra', 'calculus', 'geometry', 'trigonometry', 'statistics',
    'add', 'subtract', 'multiply', 'divide', 'fraction', 'decimal', 'percent',
    'square', 'cube', 'root', 'power', 'exponent', 'factor', 'polynomial',
    'triangle', 'circle', 'rectangle', 'perimeter', 'circumference',
    'pythagorean', 'hypotenuse', 'angle', 'degree', 'radian',
    'samples', 'examples', 'sample', 'example'
  ];
  
  if (mathKeywords.some(k => lower.includes(k))) return true;
  
  const patterns = [
    /[\d\+\-\*\/\^\(\)\=]/,
    /\d+\s*[+\-*/]\s*\d+/,
    /x\s*[+\-*/=]/,
    /y\s*[+\-*/=]/,
    /[=]\s*[\d]+/
  ];
  
  return patterns.some(p => p.test(text));
};

// ========== CHECK IF SCAN COMMAND ==========
const isScanCommand = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const scanKeywords = ['scan', 'identify', 'detect', 'whatisthis', 'scanimage', 'scan this', 'scan this image'];
  return scanKeywords.some(k => lower === k || lower.startsWith(k + ' '));
};

// ========== GET IMAGE URL FROM REPLY ==========
const getImageUrlFromReply = async (replyToMid, pageAccessToken) => {
  try {
    const url = `https://graph.facebook.com/v21.0/${replyToMid}`;
    const params = {
      access_token: pageAccessToken,
      fields: 'message,from,attachments{image_data,url,type},created_time'
    };
    
    console.log('[getImageUrlFromReply] Fetching message:', replyToMid);
    
    const response = await axios.get(url, { params });
    const data = response.data;
    
    let imageUrl = null;
    
    if (data?.attachments?.data) {
      for (const attachment of data.attachments.data) {
        if (attachment.type === 'image' || attachment.type === 'photo') {
          imageUrl = attachment?.image_data?.url || 
                    attachment?.payload?.url || 
                    attachment?.url || 
                    null;
          if (imageUrl) {
            console.log('[getImageUrlFromReply] Found image URL');
            break;
          }
        }
      }
    }
    
    return imageUrl;
  } catch (error) {
    console.error('[getImageUrlFromReply] Error:', error.message);
    return null;
  }
};

// ========== AUTO SCAN + ANALYZE FLOW ==========
const autoScanAndAnalyze = async (senderId, args, token, event) => {
  try {
    const extractCommand = commands.get('extract');
    const geminiCommand = commands.get('gemini');
    
    if (!extractCommand || !geminiCommand) {
      // Fallback: use gemini directly
      if (geminiCommand) {
        await geminiCommand.execute(senderId, args, token, event);
      }
      return;
    }
    
    // ===== STEP 1: Extract image URL =====
    let imageUrl = null;
    
    // Try from attachments
    if (event?.message?.attachments) {
      for (const attachment of event.message.attachments) {
        if (attachment.type === 'image' || attachment.type === 'photo') {
          imageUrl = attachment.payload?.url || attachment.url || null;
          if (imageUrl) break;
        }
      }
    }
    
    // Try from reply
    if (!imageUrl && event?.message?.reply_to?.mid) {
      imageUrl = await getImageUrlFromReply(event.message.reply_to.mid, token);
    }
    
    if (!imageUrl) {
      await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
      return;
    }
    
    // ===== STEP 2: Scan image via extract =====
    console.log('[autoScan] Scanning image...');
    const scanResult = await extractCommand.scanImage(imageUrl, token);
    
    // ===== STEP 3: Check scan result =====
    if (!scanResult.valid) {
      await sendMessage(senderId, {
        text: `Image scan failed.\n\nReason: ${scanResult.reason}\n\nPlease send a clearer image with:\n- Better lighting\n- Higher resolution\n- Less blur\n- Straight angle`
      }, token);
      return;
    }
    
    // ===== STEP 4: Scan OK - proceed to gemini =====
    console.log('[autoScan] Scan OK! Proceeding to gemini...');
    await geminiCommand.execute(senderId, args, token, event);
    
  } catch (error) {
    console.error('[autoScan] Error:', error.message);
    // Fallback to gemini directly
    const geminiCommand = commands.get('gemini');
    if (geminiCommand) {
      await geminiCommand.execute(senderId, args, token, event);
    }
  }
};

// ========== MAIN HANDLER ==========
const handleMessage = async (event, pageAccessToken) => {
  const senderId = event?.sender?.id;
  if (!senderId) return;
  
  const messageText = event?.message?.text?.trim();
  const attachments = event?.message?.attachments || [];
  const isReply = !!event?.message?.reply_to?.mid;
  const replyToMid = event?.message?.reply_to?.mid;
  
  let imageUrl = null;
  let hasImage = false;
  
  for (const attachment of attachments) {
    if (attachment.type === 'image' || attachment.type === 'photo') {
      imageUrl = attachment.payload?.url || attachment.url || null;
      hasImage = true;
      if (imageUrl) {
        imageCache.set(senderId, {
          url: imageUrl,
          timestamp: Date.now()
        });
        break;
      }
    }
  }

  // ============================================
  // SCENARIO 1: REPLY TO IMAGE WITH SCAN COMMAND
  // ============================================
  if (isReply && messageText && isScanCommand(messageText)) {
    console.log('[handleMessage] Scan command detected on reply');
    
    let replyImageUrl = null;
    if (replyToMid) {
      replyImageUrl = await getImageUrlFromReply(replyToMid, pageAccessToken);
    }
    
    if (replyImageUrl) {
      const modifiedEvent = {
        ...event,
        message: {
          ...event.message,
          attachments: [
            { type: 'image', payload: { url: replyImageUrl } }
          ]
        },
        _scanImageUrl: replyImageUrl
      };
      
      const scanCommand = commands.get('scan');
      if (scanCommand) {
        const words = messageText.split(' ');
        const args = words.slice(1);
        await scanCommand.execute(senderId, args, pageAccessToken, modifiedEvent);
        return;
      }
    } else {
      const cachedImage = imageCache.get(senderId);
      if (cachedImage && cachedImage.url) {
        const modifiedEvent = {
          ...event,
          message: {
            ...event.message,
            attachments: [
              { type: 'image', payload: { url: cachedImage.url } }
            ]
          },
          _scanImageUrl: cachedImage.url
        };
        
        const scanCommand = commands.get('scan');
        if (scanCommand) {
          const words = messageText.split(' ');
          const args = words.slice(1);
          await scanCommand.execute(senderId, args, pageAccessToken, modifiedEvent);
          return;
        }
      }
      
      const scanCommand = commands.get('scan');
      if (scanCommand) {
        const words = messageText.split(' ');
        const args = words.slice(1);
        await scanCommand.execute(senderId, args, pageAccessToken, event);
        return;
      }
    }
  }

  // ============================================
  // SCENARIO 2: REPLY TO IMAGE WITH "EXTRACT"
  // ============================================
  if (isReply && messageText && messageText.toLowerCase().trim() === 'extract') {
    console.log('[handleMessage] Extract command detected on reply');
    
    let replyImageUrl = null;
    if (replyToMid) {
      replyImageUrl = await getImageUrlFromReply(replyToMid, pageAccessToken);
    }
    
    if (!replyImageUrl) {
      const cachedImage = imageCache.get(senderId);
      if (cachedImage && cachedImage.url) {
        replyImageUrl = cachedImage.url;
      }
    }
    
    if (replyImageUrl) {
      const modifiedEvent = {
        ...event,
        message: {
          ...event.message,
          attachments: [
            { type: 'image', payload: { url: replyImageUrl } }
          ]
        },
        _scanImageUrl: replyImageUrl
      };
      
      const extractCommand = commands.get('extract');
      if (extractCommand) {
        await extractCommand.execute(senderId, [], pageAccessToken, modifiedEvent);
        return;
      }
    } else {
      await sendMessage(senderId, { text: 'No image found in the replied message.' }, pageAccessToken);
      return;
    }
  }

  // ============================================
  // SCENARIO 3: HAS IMAGE WITH TEXT
  // ============================================
  if (hasImage && imageUrl && messageText) {
    const words = messageText.split(' ');
    const firstWord = words[0].toLowerCase();
    const command = commands.get(firstWord);
    
    // Direct command
    if (command) {
      const args = words.slice(1);
      await command.execute(senderId, args, pageAccessToken, event);
      return;
    }
    
    // Scan command
    if (isScanCommand(messageText)) {
      const scanCommand = commands.get('scan');
      if (scanCommand) {
        await scanCommand.execute(senderId, [], pageAccessToken, event);
        return;
      }
    }
    
    // Auto scan + analyze
    console.log('[handleMessage] Auto scan + analyze image with caption...');
    const args = words.slice(1);
    await autoScanAndAnalyze(senderId, args, pageAccessToken, event);
    return;
  }

  // ============================================
  // SCENARIO 4: HAS IMAGE BUT NO TEXT (AUTO)
  // ============================================
  if (hasImage && imageUrl && !messageText) {
    console.log('[handleMessage] Auto scan + analyze image without caption...');
    await autoScanAndAnalyze(senderId, [], pageAccessToken, event);
    return;
  }

  // ============================================
  // SCENARIO 5: REPLY TO IMAGE (NO COMMAND)
  // ============================================
  if (isReply && !messageText) {
    const replyImageUrl = await getImageUrlFromReply(replyToMid, pageAccessToken);
    
    if (replyImageUrl) {
      console.log('[handleMessage] Auto scan + analyze replied image...');
      const modifiedEvent = {
        ...event,
        message: {
          ...event.message,
          attachments: [
            { type: 'image', payload: { url: replyImageUrl } }
          ]
        },
        _scanImageUrl: replyImageUrl
      };
      
      await autoScanAndAnalyze(senderId, [], pageAccessToken, modifiedEvent);
      return;
    }
  }

  // ============================================
  // SCENARIO 6: NO IMAGE, TEXT ONLY
  // ============================================
  if (!messageText) return;
  
  const words = messageText.split(' ');
  const firstWord = words[0].toLowerCase();
  const args = words.slice(1);
  
  try {
    const command = commands.get(firstWord);
    
    if (command) {
      await command.execute(senderId, args, pageAccessToken, event);
      return;
    }
    
    if (isMathQuery(messageText)) {
      const mathCommand = commands.get('math');
      if (mathCommand) {
        await mathCommand.execute(senderId, [messageText], pageAccessToken, event);
        return;
      }
    }
    
    if (commands.has('ai')) {
      await commands.get('ai').execute(senderId, [messageText], pageAccessToken, event);
      return;
    }
    
    await sendMessage(senderId, {
      text: 'Unknown command. Available commands: ' + Array.from(commands.keys()).join(', ')
    }, pageAccessToken);
    
  } catch (error) {
    console.error('Command execution error:', error.message);
    await sendMessage(senderId, { text: 'Command execution failed.' }, pageAccessToken);
  }
};

module.exports = { handleMessage };
