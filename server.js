const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURATION ---
// Credentials will be pulled automatically from environment variables (e.g., Render Dashboard)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8903748536:AAErCtEbpaDrV5kSiLQU-nh9aZ6T1DMG2uA';
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || '8588753899';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Serve static frontend files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory data store for initial gallery items
let tattoos = [
  { id: 1, title: 'Neon Cyber Skull', category: 'futuristic', img: 'https://images.unsplash.com/photo-1598371839696-5c5bb00bd472?auto=format&fit=crop&w=600&q=80' },
  { id: 2, title: 'Pink Cyber Lotus', category: 'pink', img: 'https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?auto=format&fit=crop&w=600&q=80' },
  { id: 3, title: 'Holographic Dragon', category: 'futuristic', img: 'https://images.unsplash.com/photo-1562962230-16e4623d36e6?auto=format&fit=crop&w=600&q=80' },
  { id: 4, title: 'Pink Synthwave Viper', category: 'pink', img: 'https://images.unsplash.com/photo-1542224566-6e85f2e6772f?auto=format&fit=crop&w=600&q=80' }
];

// --- TELEGRAM BOT LOGIC ---

// 1. Handle incoming photos from Telegram to update website gallery
bot.on('photo', async (msg) => {
  if (msg.chat.id.toString() !== OWNER_CHAT_ID.toString()) return;

  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileUrl = await bot.getFileLink(photo.file_id);
    const caption = msg.caption || 'Futuristic Tattoo';

    // Categorize based on #pink tag in caption
    const isPink = caption.toLowerCase().includes('#pink');
    const category = isPink ? 'pink' : 'futuristic';
    const cleanTitle = caption.replace(/#pink/gi, '').trim() || 'New Design';

    const newTattoo = {
      id: Date.now(),
      title: cleanTitle,
      category: category,
      img: fileUrl
    };

    tattoos.unshift(newTattoo);
    io.emit('new-tattoo', newTattoo);

    bot.sendMessage(OWNER_CHAT_ID, `✅ Uploaded "${cleanTitle}" to ${category.toUpperCase()} gallery!`);
  } catch (err) {
    console.error('Error handling Telegram photo:', err);
    bot.sendMessage(OWNER_CHAT_ID, '❌ Failed to process uploaded image.');
  }
});

// 2. Handle reply messages from Owner in Telegram back to Website Client
bot.on('message', (msg) => {
  if (msg.chat.id.toString() !== OWNER_CHAT_ID.toString() || msg.photo) return;

  if (msg.reply_to_message && msg.reply_to_message.text) {
    const originalText = msg.reply_to_message.text;
    const socketIdMatch = originalText.match(/Client ID: ([a-zA-Z0-9_-]+)/);

    if (socketIdMatch && socketIdMatch[1]) {
      const socketId = socketIdMatch[1];
      io.to(socketId).emit('chat-message', {
        sender: 'Owner',
        text: msg.text
      });
      return;
    }
  }
});

// --- WEBSOCKET LOGIC ---
io.on('connection', (socket) => {
  // Send current tattoo array to newly connected user
  socket.emit('init-tattoos', tattoos);

  // Client sends message on website live chat
  socket.on('send-message', (data) => {
    const userMessage = data.text;
    
    // Forward message to Telegram Owner Chat
    bot.sendMessage(
      OWNER_CHAT_ID,
      `💬 *New Client Message*\nClient ID: \`${socket.id}\`\n\n"${userMessage}"\n\n*(Reply directly to this message to chat back)*`,
      { parse_mode: 'Markdown' }
    );
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Cyberpunk Tattoo Server running on port ${PORT}`);
});
